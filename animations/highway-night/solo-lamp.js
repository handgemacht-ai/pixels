"use strict";

// A line of lamps and the road they lay pools on, with nothing else in shot.
//
// Four things come out of every cobra head, and in the assembled picture they
// arrive together and are impossible to tell apart: the cone proper, a short
// wide spill around its own foot, the haze in the air beneath it, and the
// bloom on the head itself. Each is here on a control of its own. Turn the
// cone off and what is left is the skirt that stops a pool ending in a
// vertical edge; turn the spill off and the pool goes back to being a lit
// rectangle; turn the bloom off and the head stops being the brightest thing
// on the mast. The haze is the one of the four on a dial rather than a switch:
// a cone either is or is not being cast, whereas haze is how much air there is
// to catch it, and how much is the whole of what there is to look at.
//
// The road is here because a pool is not a shape, it is something that happens
// to a surface — a cone with nothing under it is a cone drawn in the air — and
// the near carriageway with its dashes and its shoulder is the surface the
// falloff was tuned against. With every cone turned down this is also the road
// on its own, which is why there is no separate stage for it.

import { defineAnimation, knob } from "../../platform/api.js";
import { C, AIR } from "./palette.js";
import {
  P, SPACING, LOOP, useParams, setStage, latchWorld
} from "./state.js";
import { frac } from "./maths.js";
import { makeBackdrop } from "./backdrop.js";
import {
  paintGround, paintRail, paintMedian, paintDashes, paintEdgeLine, paintSpeckle
} from "./road.js";
import { poleCount, poleAt, paintPole, poleHit } from "./pole.js";
import { flareOf, poleCone, poleSpill, poleHaze, poleBloom } from "./lightcone.js";
import { clearLight, addCone, addHaze, addBloom } from "./light.js";
import {
  fade, latticeCount, WAKE_STEPS, STRUCK_NOTHING, STRUCK_LAMP, STRUCK_LINE
} from "./world.js";
import { mat, put, slab, clearFrame, resolve, makeBackend } from "./render/buffers.js";

var NEEDS = [
  "stageWidth", "stageShape", "stepsPerSec",
  "poleSteps", "poleSpacing", "poleHeight",
  "coneReach", "coneSpread", "coneHaze", "coneTexture", "lampWarmth", "mottle",
  "cone", "spill", "bloom",
  "replay"
];

// ---------------------------- the drawing path -----------------------

function materials(poles, step) {
  var i;
  paintGround(slab);
  paintRail(slab, step);
  paintMedian(slab, step);
  for (i = 0; i < poles.length; i++) paintPole(slab, poles[i]);
  paintDashes(slab, step);
  paintEdgeLine(slab);
  paintSpeckle(slab, step);
}

// The four sources, each behind its own switch. They all land in the same two
// accumulators and none of them asks what it is lighting, which is what makes
// the place two pools overlap brighter than either — and what makes turning
// one of the four off a subtraction rather than a redraw.
function lights(state, poles) {
  var i, p, flare;
  for (i = 0; i < poles.length; i++) {
    p = poles[i];
    flare = flareOf(state, p, i);
    if (P.cone) addCone(mat, poleCone(p, flare));
    if (P.spill) addCone(mat, poleSpill(p, flare));
    addHaze(mat, poleHaze(p, flare));
    if (P.bloom) addBloom(poleBloom(p, flare));
  }
}

function emitters(poles) {
  var i, k, p;
  for (i = 0; i < poles.length; i++) {
    p = poles[i];
    for (k = 0; k < p.mast; k++) put(p.x + p.arm + k, p.lampY, C.hot);
  }
}

function drawFrame(scene) {
  var state = scene.state;
  var step = state.step;
  var poles = [];
  var count = poleCount();
  var j;
  for (j = 0; j < count; j++) poles.push(poleAt(j, step));

  clearFrame();
  mat.fill(AIR);
  clearLight();

  materials(poles, step);
  lights(state, poles);
  resolve(step, P.coneTexture, Math.round(P.lampWarmth), P.mottle);
  emitters(poles);
}

// ------------------------------ the scene ----------------------------

function createLamps() {
  var state = { step: 0, wake: 0, struck: -1, kind: STRUCK_NOTHING };
  var count = { lamps: 0, loop: 0 };

  function recount() {
    count.lamps = latticeCount(SPACING) - 2;
    count.loop = Math.round(frac(state.step / LOOP) * 100);
  }

  function reset() {
    state.step = 0;
    state.wake = 0;
    state.struck = -1;
    state.kind = STRUCK_NOTHING;
    latchWorld();
    recount();
  }

  reset();

  return {
    state: state,
    phase: function () { return frac(state.step / LOOP); },

    // A mast is a two-pixel silhouette and it is what a visitor aims at,
    // because the head is the part that is lit. Ask the lamps for their own
    // shapes first; anything that is not one of them is taken as a strike on
    // the circuit rather than on a fitting, and the whole line comes up one
    // lamp at a time, which is what a line of lamps does when the circuit
    // closes at one end.
    detonate: function (spot) {
      var lamp = spot ? poleHit(spot.x, spot.y, state.step) : -1;
      state.wake = 1;
      if (lamp >= 0) {
        state.kind = STRUCK_LAMP;
        state.struck = lamp;
        return;
      }
      state.kind = STRUCK_LINE;
      state.struck = -1;
    },

    reset: reset,

    advance: function () {
      state.step += 1;
      if (state.step % LOOP === 0) latchWorld();
      state.wake = fade(state.wake, WAKE_STEPS);
      if (state.wake === 0) {
        state.struck = -1;
        state.kind = STRUCK_NOTHING;
      }
      recount();
    },

    stats: function () { return count; }
  };
}

export default defineAnimation({
  id: "highway-lamp",
  title: "One lamp, and the pool it lays",
  tagline: "cone, spill, haze and bloom, each on a control of its own",
  base: new URL(".", import.meta.url).href,
  action: { verb: "Strike", noun: "strike" },

  // Taller than the car's stage and for the opposite reason: a mast at its
  // tallest setting stands eleven rows above the horizon, and the bloom on its
  // head wants sky above that to be seen in.
  stage: {
    width: knob("stageWidth"),
    aspect: knob("stageShape"),
    background: C.skyDeep,
    hint: "click a mast and that lamp flares · click anywhere else and the flare " +
      "runs down the line",
    legend: "sky · rail · far carriageway · median · masts · haze · pools · road"
  },
  cadence: knob("stepsPerSec"),
  replay: knob("replay"),

  poster: {
    step: 6,
    backend: "javascript",
    film: { steps: knob("poleSteps"), cycles: 4, scale: 2 }
  },

  knobs: [
    { group: "stage", key: "stageWidth", label: "resolution", default: 224,
      min: 160, max: 384, step: 32, unit: "px wide", applies: "live" },
    { group: "stage", key: "stageShape", label: "shape", type: "choice", default: 10 / 16,
      options: [
        { value: 0.5, label: "2:1 letterbox" },
        { value: 10 / 16, label: "16:10" },
        { value: 1, label: "1:1 square" }
      ], applies: "live" },
    { group: "stage", key: "stepsPerSec", label: "cadence", default: 12,
      min: 6, max: 24, step: 1, unit: "steps/s", applies: "live" },

    { group: "drive", key: "poleSteps", label: "steps per lamp", default: 12,
      min: 6, max: 24, step: 1, unit: "steps", applies: "next" },
    { group: "drive", key: "poleSpacing", label: "lamp spacing", default: 48,
      min: 32, max: 64, step: 8, unit: "px", applies: "next" },
    { group: "drive", key: "poleHeight", label: "mast height", default: 26,
      min: 18, max: 34, step: 1, unit: "px", applies: "live" },

    { group: "light", key: "cone", label: "cone", type: "toggle",
      default: true, applies: "live" },
    { group: "light", key: "spill", label: "spill", type: "toggle",
      default: true, applies: "live" },
    { group: "light", key: "bloom", label: "bloom on the head", type: "toggle",
      default: true, applies: "live" },
    { group: "light", key: "coneReach", label: "cone reach", default: 1,
      min: 0.4, max: 1.6, step: 0.05, unit: "x", applies: "live" },
    { group: "light", key: "coneSpread", label: "cone spread", default: 26,
      min: 14, max: 40, step: 1, unit: "deg", applies: "live" },
    { group: "light", key: "coneHaze", label: "haze", default: 1,
      min: 0, max: 1.5, step: 0.05, unit: "x", applies: "live" },
    { group: "light", key: "coneTexture", label: "cone texture", type: "choice", default: 0,
      options: [
        { value: 0, label: "ordered dither" },
        { value: 1, label: "scanline" },
        { value: 2, label: "hard bands" }
      ], applies: "live" },
    { group: "light", key: "lampWarmth", label: "lamp warmth", default: 0,
      min: -2, max: 2, step: 1, unit: "bands", applies: "live" },
    { group: "light", key: "mottle", label: "patched asphalt", type: "toggle",
      default: true, applies: "live" },

    { group: "scene", key: "replay", label: "auto-replay", default: 4,
      min: 1, max: 12, step: 0.1, unit: "s", applies: "live" }
  ],

  palette: {
    colours: C,
    title: "four steps of asphalt, and the dither that carries what falls between them"
  },

  stats: [
    { key: "lamps", label: "lamps" },
    { key: "loop", label: "loop %" }
  ],

  files: [
    { path: "solo-lamp.js", open: true, sub: "the whole of this stage",
      meta: "one registration and one drawing path, in one file" },
    { path: "README.md", sub: "the animation all six stages come out of",
      meta: "shared with the assembled highway and the other three solos" },
    { path: "pole.js", sub: "mast, arm and cobra head",
      meta: "the one silhouette in the animation with no reference behind it" },
    { path: "lightcone.js", sub: "where each cone points and how far it carries",
      meta: "four sources per lamp, and what each of them is for" },
    { path: "light.js", sub: "the light field",
      meta: "sources are added, never compared · ground in world units, air in screen ones" }
  ],

  backends: [
    {
      id: "javascript",
      label: "JavaScript",
      note: "one pass writes what every pixel is made of, one adds up the light " +
        "landing on it, and one turns the two into a colour",
      stats: [{ key: "pixels", label: "px / step" }],
      create: function (ctx) { return makeBackend(ctx, drawFrame); }
    }
  ],

  create: function (ctx) {
    useParams(ctx.params, NEEDS);
    setStage(ctx.width, ctx.height);
    var scene = createLamps();
    scene.resize = setStage;
    scene.backdrop = function () { return makeBackdrop({ city: false, glow: false }); };
    return scene;
  }
});

"use strict";

// The car on its own, on an empty road.
//
// The assembled highway is a scene: lamps, a skyline, neon, a far carriageway,
// and the car somewhere inside all of it. That is the right picture and it is
// the wrong place to look at a car, because everything else in it is either
// standing in front of the shell or throwing light across it. This stage takes
// the lot away — no masts, no traffic, no city, no glow — and leaves the road,
// the paint on it, and the one thing driving down it.
//
// What replaces the lamps is a cast with no fitting: light coming down from a
// point above the stage, with no mast, no head and no bloom, because a bloom
// is what a fitting looks like and there is no fitting. It exists so the shell
// can be inspected lit — a car in the dark is a silhouette, and a silhouette
// is exactly the thing this stage is not about.
//
// The springs are gone from the whole animation, and this is the stage that
// settled it: with nothing else moving, a body riding a road profile reads as
// a car crossing a kerb every second rather than as a car at speed.

import { defineAnimation, knob } from "../../platform/api.js";
import { C, AIR } from "./palette.js";
import {
  P, S, CAR_X, LOOP, useParams, setStage, latchWorld, kmh
} from "./state.js";
import { frac } from "./maths.js";
import { makeBackdrop } from "./backdrop.js";
import { paintGround, paintDashes, paintEdgeLine, paintSpeckle } from "./road.js";
import { carPose, paintCar, lampAt } from "./car.js";
import {
  poleCone, poleSpill, poleHaze, headCones, headBloom, tailCone, tailBloom
} from "./lightcone.js";
import { clearLight, addCone, addHaze, addBloom } from "./light.js";
import { fade, FLASH_STEPS, SURGE_STEPS } from "./world.js";
import { mat, put, slab, clearFrame, resolve, makeBackend } from "./render/buffers.js";

var NEEDS = [
  "stageWidth", "stageShape", "stepsPerSec",
  "poleSteps", "poleSpacing",
  "coneReach", "coneSpread", "coneHaze", "coneTexture", "lampWarmth", "mottle",
  "overhead", "beamReach", "beamSpread", "headlamps", "wheelSpin",
  "replay"
];

// Where the light with no lamp on it hangs: over the car's resting place, and
// above the top edge of the frame. Both parts matter. Over the middle of the
// stage it would light the road ahead of the car rather than the car, and the
// car is the subject; inside the frame, the haze in the air draws a wedge with
// a bright point at its apex — which is exactly what a lamp looks like, and a
// lamp is the thing this stage is supposed to be without. Put the source off
// the top, and what comes into the picture is light rather than a fitting.
function overhead() {
  return { lampX: CAR_X, lampY: -6 * S };
}

// ---------------------------- the drawing path -----------------------

function materials(pose, step) {
  paintGround(slab);
  paintDashes(slab, step);
  paintCar(slab, pose, step, P.wheelSpin);
  paintEdgeLine(slab);
  paintSpeckle(slab, step);
}

function lights(state, pose) {
  var p = overhead();
  var cone = poleCone(p, 0);
  var spill = poleSpill(p, 0);
  var haze = poleHaze(p, 0);
  var lamp, cones, i;

  // the whole stand-in turns down together, so the slider is one lamp being
  // dimmed rather than three sources drifting out of proportion with each
  // other
  cone.gain *= P.overhead;
  spill.gain *= P.overhead;
  // except the haze, which is quoted lower here than a lamp would quote it. A
  // shaft is normally seen from its apex down; this one has its apex off the
  // top of the frame, so the frame cuts it across the brightest part, and at a
  // lamp's gain the first rows of sky come out solid — a flat-topped block
  // hanging over the car, which reads as a thing rather than as light. Held
  // down to where the dither is still carrying it, the same shaft is a density
  // in the air that thins as it falls, which is all it was ever for.
  haze.gain *= P.overhead * 0.62;
  addCone(mat, cone);
  addCone(mat, spill);
  addHaze(mat, haze);

  lamp = lampAt(pose, false);
  addBloom(tailBloom(lamp.x, lamp.y, 1.2));
  addCone(mat, tailCone(lamp.x, lamp.y, -1, 1.2));

  if (!P.headlamps) return;
  lamp = lampAt(pose, true);
  cones = headCones(lamp, state.flash);
  for (i = 0; i < cones.length; i++) addCone(mat, cones[i]);
  addBloom(headBloom(lamp, state.flash));
}

function emitters(state, pose) {
  var lamp = lampAt(pose, false);
  put(lamp.x + S, lamp.y, C.tail);
  put(lamp.x + S, lamp.y + S, C.tail);

  if (!P.headlamps) return;
  lamp = lampAt(pose, true);
  put(lamp.x - S, lamp.y, C.hot);
  put(lamp.x - S, lamp.y + S, C.hot);
  if (state.flash > 0) put(lamp.x, lamp.y, C.hot);
}

function drawFrame(scene) {
  var state = scene.state;
  var step = state.step;
  var pose = carPose(state);

  clearFrame();
  mat.fill(AIR);
  clearLight();

  materials(pose, step);
  lights(state, pose);
  resolve(step, P.coneTexture, Math.round(P.lampWarmth), P.mottle);
  emitters(state, pose);
}

// ------------------------------ the scene ----------------------------

function createCar() {
  var state = { step: 0, flash: 0, surge: 0 };
  var count = { kmh: 0, loop: 0 };

  function recount() {
    count.kmh = Math.round(kmh());
    count.loop = Math.round(frac(state.step / LOOP) * 100);
  }

  function reset() {
    state.step = 0;
    state.flash = 0;
    state.surge = 0;
    latchWorld();
    recount();
  }

  reset();

  return {
    state: state,
    phase: function () { return frac(state.step / LOOP); },

    // Where the click landed is not asked. There is one thing on this stage
    // and a strike is always about it: the high beams go on and the car pulls
    // forward out of its resting place, which between them are the only two
    // things left that the shell itself does.
    detonate: function () {
      state.flash = 1;
      state.surge = 1;
    },

    reset: reset,

    advance: function () {
      state.step += 1;
      if (state.step % LOOP === 0) latchWorld();
      state.flash = fade(state.flash, FLASH_STEPS);
      state.surge = fade(state.surge, SURGE_STEPS);
      recount();
    },

    stats: function () { return count; }
  };
}

export default defineAnimation({
  id: "highway-car",
  title: "The car, and nothing else on the road",
  tagline: "one shell, two lamps, no springs",
  base: new URL(".", import.meta.url).href,
  action: { verb: "Strike", noun: "strike" },

  // Wider and flatter than the assembled stage. Nothing here stands up out of
  // the road — no mast, no skyline — so height would be sky, and the car is
  // thirty-five pixels long and wants the width instead.
  stage: {
    width: knob("stageWidth"),
    aspect: knob("stageShape"),
    background: C.skyDeep,
    hint: "click anywhere — the high beams flash and the car pulls forward",
    legend: "road · lane paint · shadow · wheels · shell · glass · lamps"
  },
  cadence: knob("stepsPerSec"),
  replay: knob("replay"),

  poster: {
    step: 8,
    backend: "javascript",
    film: { steps: knob("poleSteps"), cycles: 4, scale: 2 }
  },

  knobs: [
    { group: "stage", key: "stageWidth", label: "resolution", default: 224,
      min: 160, max: 384, step: 32, unit: "px wide", applies: "live" },
    { group: "stage", key: "stageShape", label: "shape", type: "choice", default: 0.5,
      options: [
        { value: 0.5, label: "2:1 letterbox" },
        { value: 10 / 16, label: "16:10" },
        { value: 1, label: "1:1 square" }
      ], applies: "live" },
    { group: "stage", key: "stepsPerSec", label: "cadence", default: 12,
      min: 6, max: 24, step: 1, unit: "steps/s", applies: "live" },

    // There are no lamps on this stage, but the road still has to scroll at a
    // rate that closes a loop — so the two knobs that were the lamp lattice
    // are still the two knobs that are the speed, under the names the road
    // rather than the lamps would give them.
    { group: "drive", key: "poleSteps", label: "steps per spacing", default: 12,
      min: 6, max: 24, step: 1, unit: "steps", applies: "next" },
    { group: "drive", key: "poleSpacing", label: "scroll period", default: 48,
      min: 32, max: 64, step: 8, unit: "px", applies: "next" },

    { group: "light", key: "overhead", label: "overhead lamp", default: 0.8,
      min: 0, max: 1.5, step: 0.05, unit: "x", applies: "live" },
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

    { group: "car", key: "beamReach", label: "beam reach", default: 1.2,
      min: 0.5, max: 2.5, step: 0.05, unit: "x", applies: "live" },
    { group: "car", key: "beamSpread", label: "beam spread", default: 18,
      min: 8, max: 40, step: 1, unit: "deg", applies: "live" },
    { group: "car", key: "headlamps", label: "headlamps", type: "toggle",
      default: true, applies: "live" },
    { group: "car", key: "wheelSpin", label: "wheels turning", type: "toggle",
      default: true, applies: "live" },

    { group: "scene", key: "replay", label: "auto-replay", default: 4,
      min: 1, max: 12, step: 0.1, unit: "s", applies: "live" }
  ],

  palette: {
    colours: C,
    title: "the same forty colours · the shell climbs its own four"
  },

  stats: [
    { key: "kmh", label: "km/h" },
    { key: "loop", label: "loop %" }
  ],

  files: [
    { path: "solo-car.js", open: true, sub: "the whole of this stage",
      meta: "one registration and one drawing path, in one file" },
    { path: "README.md", sub: "the animation all six stages come out of",
      meta: "shared with the assembled highway and the other three solos" },
    { path: "car.js", sub: "the shell, the wheels and the shade under them",
      meta: "level, and it reads no knob at all" },
    { path: "lightcone.js", sub: "where a cone points and how far it carries",
      meta: "a pool and a headlamp beam are the same object with different numbers" }
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
    var scene = createCar();
    scene.resize = setStage;
    // no city and no glow: a skyline behind a car being looked at is
    // decoration, and taking the decoration away is what a solo is for. The
    // stars stay, because an empty sky at this palette is a flat rectangle.
    scene.backdrop = function () { return makeBackdrop({ city: false, glow: false }); };
    return scene;
  }
});

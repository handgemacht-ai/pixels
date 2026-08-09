"use strict";

// The city above the road, with the road taken away.
//
// Nothing on this stage scrolls, and that is the point of it. In the assembled
// picture the skyline is the one thing standing still while everything below
// it slides past, so it is read as background and never looked at; here there
// is nothing else to look at, and what is left is a question about twenty-four
// boxes: which of them are lit tonight, in which of four tube colours, how
// hard they flicker, and how many of them are big enough to be worth a cross
// flare rather than a coloured rectangle.
//
// There is still a loop, because the flicker needs one — it is allowed to
// change its mind eight times a lap, and a lap that never closed would leave
// the pattern running on for ever and never coming back. So the loop is
// declared outright rather than derived from a scroll speed, which is what
// latchStill() in state.js is for.

import { defineAnimation, knob } from "../../platform/api.js";
import { C, AIR } from "./palette.js";
import { P, VIEW_W, LOOP, useParams, setStage, latchStill } from "./state.js";
import { clamp, frac } from "./maths.js";
import { makeBackdrop } from "./backdrop.js";
import { paintGround, paintDashes, paintEdgeLine } from "./road.js";
import { litSigns, paintNeon, latchSigns, biggestSigns } from "./neon.js";
import { clearLight } from "./light.js";
import {
  fade, SIGN_CELLS, WAKE_STEPS, STRUCK_NOTHING, STRUCK_SIGN
} from "./world.js";
import { mat, put, slab, clearFrame, resolve, makeBackend } from "./render/buffers.js";

var NEEDS = [
  "stageWidth", "stageShape", "stepsPerSec", "loopSteps",
  "signs", "neonIntensity", "flicker", "hueLock", "flares",
  "replay"
];

// How many of the largest housings a strike with nowhere to land wakes.
var WAKE_BIGGEST = 3;

// ---------------------------- the drawing path -----------------------
//
// The ground ladder, no light at all, and the signs.
//
// The road is here because the stage would be half a black rectangle without
// it: the band ladder is pinned to the stage width, so whatever shape this
// stage takes there are sixty-odd rows of ground under the skyline. Drawn
// unlit it is the honest picture — the carriageways and the paint on them are
// there, and the lamps that would show them are on another stage. It is also
// the only ground in the animation that is allowed to stand still, because
// with the scroll speed at zero the lattices resolve to one fixed position and
// stay there.

function drawFrame(scene) {
  var state = scene.state;

  clearFrame();
  mat.fill(AIR);
  clearLight();

  paintGround(slab);
  paintDashes(slab, state.step);
  paintEdgeLine(slab);
  resolve(state.step, 0, 0, false);
  paintNeon(put, litSigns(state, P.hueLock, P.flares));
}

// ------------------------------ the scene ----------------------------

function createCity() {
  var state = { step: 0, wake: 0, struck: -1, kind: STRUCK_NOTHING };
  var count = { lit: 0, loop: 0 };

  function recount() {
    count.lit = litSigns(state, P.hueLock, P.flares).length;
    count.loop = Math.round(frac(state.step / LOOP) * 100);
  }

  function latchAll() {
    latchStill(P.loopSteps);
    latchSigns();
  }

  function reset() {
    state.step = 0;
    state.wake = 0;
    state.struck = -1;
    state.kind = STRUCK_NOTHING;
    latchAll();
    recount();
  }

  reset();

  return {
    state: state,
    phase: function () { return frac(state.step / LOOP); },

    // The sign lattice is the stage width cut into twenty-four, so a click
    // anywhere names a cell whether or not there is a housing standing in it —
    // and a housing that is dark tonight stays dark, because a strike wakes a
    // tube rather than installing one. With no spot at all the three largest
    // come up together: one sign coming on somewhere along a skyline is a
    // thing nobody notices, and three is a skyline changing.
    detonate: function (spot) {
      state.kind = STRUCK_SIGN;
      state.wake = 1;
      state.struck = spot
        ? clamp(Math.floor(spot.x / (VIEW_W / SIGN_CELLS)), 0, SIGN_CELLS - 1)
        : biggestSigns(WAKE_BIGGEST);
    },

    reset: reset,

    advance: function () {
      state.step += 1;
      if (state.step % LOOP === 0) latchAll();
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
  id: "highway-city",
  title: "The skyline, and which signs are on",
  tagline: "twenty-four housings, and nothing that scrolls",
  base: new URL(".", import.meta.url).href,
  action: { verb: "Strike", noun: "strike" },

  stage: {
    width: knob("stageWidth"),
    aspect: knob("stageShape"),
    background: C.skyDeep,
    hint: "click a sign and that tube stutters on · click nothing in particular " +
      "and the three biggest come up together",
    legend: "sky · stars · city glow · far towers · near block · housings · neon"
  },
  cadence: knob("stepsPerSec"),
  replay: knob("replay"),

  poster: {
    step: 12,
    backend: "javascript",
    film: { steps: knob("loopSteps"), cycles: 1, scale: 2 }
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
    // The loop is declared here rather than worked out from a scroll speed,
    // because there is no scroll. It re-cuts the flicker's eight phases, so it
    // takes hold at the top of the next lap like every other lattice.
    { group: "stage", key: "loopSteps", label: "loop length", default: 48,
      min: 12, max: 96, step: 12, unit: "steps", applies: "next" },

    { group: "neon", key: "signs", label: "signs lit", default: 18,
      min: 0, max: 24, step: 1, applies: "next" },
    // How much glow is around a tube: none, one ring, or a second and thinner
    // one outside it. It is not how many signs are lit and it is not how many
    // of them flare — those are the two knobs either side of it — so all three
    // still say something wherever the other two are standing.
    { group: "neon", key: "neonIntensity", label: "neon", default: 2,
      min: 0, max: 3, step: 1, unit: "bands", applies: "live" },
    { group: "neon", key: "flicker", label: "flicker", default: 0.3,
      min: 0, max: 1, step: 0.05, applies: "live" },
    { group: "neon", key: "hueLock", label: "tube colour", type: "choice", default: 0,
      options: [
        { value: 0, label: "all four" },
        { value: 1, label: "pink only" },
        { value: 2, label: "cyan only" },
        { value: 3, label: "amber only" },
        { value: 4, label: "violet only" }
      ], applies: "live" },
    { group: "neon", key: "flares", label: "cross flares", default: 3,
      min: 0, max: 6, step: 1, unit: "signs", applies: "live" },

    { group: "scene", key: "replay", label: "auto-replay", default: 4,
      min: 1, max: 12, step: 0.1, unit: "s", applies: "live" }
  ],

  palette: {
    colours: C,
    title: "four tube colours, and one white that separates bright from pale"
  },

  stats: [
    { key: "lit", label: "signs on" },
    { key: "loop", label: "loop %" }
  ],

  files: [
    { path: "solo-city.js", open: true, sub: "the whole of this stage",
      meta: "one registration and one drawing path, in one file" },
    { path: "README.md", sub: "the animation all six stages come out of",
      meta: "shared with the assembled highway and the other three solos" },
    { path: "neon.js", sub: "which signs are lit, and which are flickering",
      meta: "emitters · drawn after the light is resolved and never re-lit" },
    { path: "skyline.js", sub: "towers, windows and sign housings",
      meta: "the static half of the picture, and where neon.js finds its signs" },
    { path: "backdrop.js", sub: "sky, stars, glow and city",
      meta: "drawn once per stage size · every housing is in it, dark" }
  ],

  backends: [
    {
      id: "javascript",
      label: "JavaScript",
      note: "one slab of material, no light at all, and the signs laid straight " +
        "on top as the sources they are",
      stats: [{ key: "pixels", label: "px / step" }],
      create: function (ctx) { return makeBackend(ctx, drawFrame); }
    }
  ],

  create: function (ctx) {
    useParams(ctx.params, NEEDS);
    setStage(ctx.width, ctx.height);
    var scene = createCity();
    scene.resize = setStage;
    scene.backdrop = function () { return makeBackdrop(); };
    return scene;
  }
});

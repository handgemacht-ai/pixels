"use strict";

// The far carriageway on its own: two rows of small cars going the other way,
// and the red they drag behind them.
//
// In the assembled picture these are four pixels tall behind a guard rail,
// under a line of lamps, with the hero car in front of them — which is where
// they belong and the worst possible place to work on them. Every decision
// about them is a decision about very few pixels: how many steps a silhouette
// needs before it reads as a car rather than as a brick, how far a tail lamp
// may throw before the whole band turns red, how long a streak can be before
// it stops being motion and starts being a line.
//
// So the stage is the band, magnified by being alone in the frame. The lamps
// are on a switch because a lit carriageway and an unlit one are two different
// problems: unlit, the cars are silhouettes with lamps on them; lit, they have
// to survive being crossed by an amber pool without their red going amber too.

import { defineAnimation, knob } from "../../platform/api.js";
import { C, AIR } from "./palette.js";
import { P, S, LOOP, useParams, setStage, latchWorld } from "./state.js";
import { frac, bayer4 } from "./maths.js";
import { makeBackdrop } from "./backdrop.js";
import {
  paintGround, paintRail, paintMedian, paintDashes, paintEdgeLine, paintSpeckle
} from "./road.js";
import { poleCount, poleAt, paintPole } from "./pole.js";
import { oncoming, paintTraffic, tailOf, onStage, latchTraffic } from "./traffic.js";
import {
  flareOf, poleCone, poleSpill, poleHaze, poleBloom, tailCone, tailBloom
} from "./lightcone.js";
import { clearLight, addCone, addHaze, addBloom } from "./light.js";
import { fade } from "./world.js";
import { mat, put, slab, clearFrame, resolve, makeBackend } from "./render/buffers.js";

var NEEDS = [
  "stageWidth", "stageShape", "stepsPerSec",
  "poleSteps", "poleSpacing", "poleHeight",
  "coneReach", "coneSpread", "coneHaze", "coneTexture", "lampWarmth", "mottle",
  "density", "trail", "carLength", "tailGain", "rows", "lamps",
  "replay"
];

// How long the brake transient takes to die. Eight steps is two thirds of a
// second at the default cadence, which is about how long a line of brake
// lights stays on when the traffic in front of it lifts.
var BRAKE_STEPS = 8;

// What the brake does to every tail lamp at once: two and a half times the
// gain at the instant of the strike, back to nothing eight steps later. It is
// the one moment where the red is allowed to win the whole band, and it is
// worth having because it shows what the tail gain is holding back.
function brakeGain(state) {
  return P.tailGain * (1 + 1.5 * state.brake);
}

// ---------------------------- the drawing path -----------------------

function materials(poles, cars, step) {
  var i;
  paintGround(slab);
  paintRail(slab, step);
  paintTraffic(slab, cars);
  paintMedian(slab, step);
  for (i = 0; i < poles.length; i++) paintPole(slab, poles[i]);
  paintDashes(slab, step);
  paintEdgeLine(slab);
  paintSpeckle(slab, step);
}

function lights(state, poles, cars) {
  var gain = brakeGain(state);
  var i, p, c, flare, tail;

  for (i = 0; i < poles.length; i++) {
    p = poles[i];
    flare = flareOf(state, p, i);
    addCone(mat, poleCone(p, flare));
    addCone(mat, poleSpill(p, flare));
    addHaze(mat, poleHaze(p, flare));
    addBloom(poleBloom(p, flare));
  }

  for (i = 0; i < cars.length; i++) {
    c = cars[i];
    tail = tailOf(c);
    addBloom(tailBloom(tail.x, tail.y, gain));
    addCone(mat, tailCone(tail.x, tail.y, 1, gain));
    // the far headlamp, seen end on rather than as a beam: a car coming the
    // other way shows a white point and no wedge, because its beam is pointing
    // away down its own carriageway
    addBloom({ x: c.x - 1, y: tail.y, span: 2 * S, gain: 0.20, red: false });
  }
}

function emitters(poles, cars) {
  var trail = Math.round(P.trail * S);
  var i, k, p, c, tail, colour;

  for (i = 0; i < poles.length; i++) {
    p = poles[i];
    for (k = 0; k < p.mast; k++) put(p.x + p.arm + k, p.lampY, C.hot);
  }

  for (i = 0; i < cars.length; i++) {
    c = cars[i];
    tail = tailOf(c);
    put(tail.x - 1, tail.y, C.tail);
    put(tail.x - 1, tail.y - 1, C.tail);
    for (k = 0; k < trail; k++) {
      // the streak thins as it goes, carried by the dither rather than by a
      // colour between the two reds, because there is no such colour
      colour = k < 1 ? C.tail : C.tailFaint;
      if (k >= 2 && bayer4(tail.x + k, tail.y) > 1 - k / trail) continue;
      put(tail.x + k, tail.y, colour);
    }
    put(c.x - 1, tail.y, C.hot);
    put(c.x - 1, tail.y - 1, C.hot);
  }
}

function drawFrame(scene) {
  var state = scene.state;
  var step = state.step;
  var poles = [];
  var count = P.lamps ? poleCount() : 0;
  var j;
  for (j = 0; j < count; j++) poles.push(poleAt(j, step));
  var cars = oncoming(step);

  clearFrame();
  mat.fill(AIR);
  clearLight();

  materials(poles, cars, step);
  lights(state, poles, cars);
  resolve(step, P.coneTexture, Math.round(P.lampWarmth), P.mottle);
  emitters(poles, cars);
}

// ------------------------------ the scene ----------------------------

function createTraffic() {
  // `kind` and `struck` are never set: this stage has no lamp to strike, and
  // flareOf() is asked for a flare on every pole all the same, because a pole
  // that answers zero costs one comparison and one branch fewer here.
  var state = { step: 0, brake: 0, struck: -1, kind: 0 };
  var count = { cars: 0, loop: 0 };

  function recount() {
    count.cars = onStage(state.step);
    count.loop = Math.round(frac(state.step / LOOP) * 100);
  }

  function latchAll() {
    latchWorld();
    latchTraffic(P.carLength, P.rows);
  }

  function reset() {
    state.step = 0;
    state.brake = 0;
    latchAll();
    recount();
  }

  reset();

  return {
    state: state,
    phase: function () { return frac(state.step / LOOP); },

    // Where the click landed is not asked, because the subject is the row
    // rather than any one car in it: everything on the far carriageway brakes
    // at once, which is what traffic actually does.
    detonate: function () { state.brake = 1; },

    reset: reset,

    advance: function () {
      state.step += 1;
      if (state.step % LOOP === 0) latchAll();
      state.brake = fade(state.brake, BRAKE_STEPS);
      recount();
    },

    stats: function () { return count; }
  };
}

export default defineAnimation({
  id: "highway-traffic",
  title: "The far carriageway",
  tagline: "two rows of small cars and the red they drag",
  base: new URL(".", import.meta.url).href,
  action: { verb: "Brake", noun: "brake" },

  stage: {
    width: knob("stageWidth"),
    aspect: knob("stageShape"),
    background: C.skyDeep,
    hint: "click anywhere — every car on the far carriageway brakes at once",
    legend: "rail · oncoming rows · tail lamps and their streaks · median · road"
  },
  cadence: knob("stepsPerSec"),
  replay: knob("replay"),

  poster: {
    // eight steps in the rows have filled up and the leading cars are standing
    // inside a pool, which is the one moment where both halves of the subject
    // are visible at once: the silhouette and the red it drags
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

    { group: "drive", key: "poleSteps", label: "steps per lamp", default: 12,
      min: 6, max: 24, step: 1, unit: "steps", applies: "next" },
    { group: "drive", key: "poleSpacing", label: "lamp spacing", default: 48,
      min: 32, max: 64, step: 8, unit: "px", applies: "next" },
    { group: "drive", key: "poleHeight", label: "mast height", default: 26,
      min: 18, max: 34, step: 1, unit: "px", applies: "live" },

    { group: "traffic", key: "density", label: "oncoming cars", default: 4,
      min: 0, max: 8, step: 1, applies: "next" },
    { group: "traffic", key: "rows", label: "rows running", type: "choice", default: 2,
      options: [{ value: 1, label: "one" }, { value: 2, label: "two" }],
      applies: "next" },
    { group: "traffic", key: "carLength", label: "shortest car", default: 7,
      min: 5, max: 16, step: 1, unit: "px", applies: "next" },
    { group: "traffic", key: "trail", label: "trail length", default: 5,
      min: 0, max: 12, step: 1, unit: "px", applies: "live" },
    { group: "traffic", key: "tailGain", label: "tail lamps", default: 1,
      min: 0, max: 3, step: 0.05, unit: "x", applies: "live" },

    { group: "light", key: "lamps", label: "street lamps", type: "toggle",
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
    title: "two reds and one white · everything a car eighty pixels away is allowed"
  },

  stats: [
    { key: "cars", label: "cars" },
    { key: "loop", label: "loop %" }
  ],

  files: [
    { path: "solo-traffic.js", open: true, sub: "the whole of this stage",
      meta: "one registration and one drawing path, in one file" },
    { path: "README.md", sub: "the animation all six stages come out of",
      meta: "shared with the assembled highway and the other three solos" },
    { path: "traffic.js", sub: "the other carriageway",
      meta: "two rows on their own lattice, at whole quarters of the scroll speed" },
    { path: "lightcone.js", sub: "where each cone points and how far it carries",
      meta: "the tail lamp is the same object as a street lamp, turned down and turned round" }
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
    var scene = createTraffic();
    scene.resize = setStage;
    // the glow stays: it is the only thing in the backdrop that says the band
    // being looked at has a city on the other side of it
    scene.backdrop = function () { return makeBackdrop({ city: false }); };
    return scene;
  }
});

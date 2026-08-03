"use strict";

import { P } from "./state.js";
import { frac } from "./maths.js";
import { groundStep, stance, latchGait, isTrotting } from "./gait.js";
import { buildPose, emptyPose } from "./skeleton.js";

// ---------------------------------------------------------------------
// The animation itself. It holds two numbers between steps — where the dog is
// in its stride, and how far the ground has slid — and rebuilds the whole
// skeleton from them every step. Nothing is remembered from one pose to the
// next, so the same phase always gives the same dog, and the same run always
// gives the same walk.
//
// The one exception is the trail of prints, which is a short list of places
// a paw has been. It is the only thing on the stage that says how far the
// animal has actually travelled, so it is worth the memory.
// ---------------------------------------------------------------------

var TRAIL = 10;

export function createDog() {
  var pose = emptyPose();
  var state = { phase: 0, scroll: 0 };
  var prints = [];
  var down = {};
  var count = { feet: 0, stride: 0, bones: 0 };

  function pick() {
    buildPose(state.phase, pose);
  }

  // A print is left where a paw first touches down, at the place on the ground
  // it touched rather than at the place on the screen.
  function trail() {
    for (var i = 0; i < pose.feet.length; i++) {
      var f = pose.feet[i];
      if (f.far) continue;
      var was = down[i];
      down[i] = f.planted;
      if (!f.planted || was) continue;
      prints.push({ x: f.x + state.scroll, age: 0 });
      if (prints.length > TRAIL) prints.shift();
    }
    for (var k = 0; k < prints.length; k++) prints[k].age += 1;
  }

  function reset() {
    state.phase = 0;
    state.scroll = 0;
    prints.length = 0;
    down = {};
    latchGait();
    pick();
  }

  reset();

  return {
    pose: pose,
    state: state,
    prints: prints,

    // The dog walks on the spot: clicking does not move it anywhere, it puts
    // the stride back to its first frame, which is also where the reference
    // plate restarts. That is what makes the two comparable.
    detonate: reset,
    reset: reset,

    // Where the dog is in its stride, 0 to 1. The reference player reads this
    // rather than counting frames off a clock of its own, so a stride made
    // longer or shorter still lines up with the plate beside it.
    phase: function () { return state.phase; },

    advance: function () {
      var next = state.phase + 1 / P.strideSteps;
      // a stride has come round: this is where a change of gait takes hold
      if (next >= 1) latchGait();
      state.phase = frac(next);
      state.scroll += groundStep();
      pick();
      trail();
    },

    stats: function () {
      count.feet = pose.planted;
      count.stride = Math.round(state.phase * 100);
      count.bones = pose.bones.length;
      return count;
    },

    // how much of the stride each foot spends on the ground, for the legend
    duty: stance,
    trotting: isTrotting
  };
}

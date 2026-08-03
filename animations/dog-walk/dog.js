"use strict";

import { P } from "./state.js";
import { frac } from "./maths.js";
import { groundStep, stance, latchGait } from "./gait.js";
import { buildPose, emptyPose } from "./skeleton.js";

// ---------------------------------------------------------------------
// The animation itself. It holds two numbers between steps — where the dog is
// in its stride, and how far the ground has slid — and rebuilds the whole
// skeleton from them every step. Nothing is remembered from one pose to the
// next, so the same phase always gives the same dog, and the same run always
// gives the same walk.
// ---------------------------------------------------------------------

export function createDog() {
  var pose = emptyPose();
  var state = { phase: 0, scroll: 0 };
  var count = { feet: 0, stride: 0, bones: 0 };

  function pick() {
    buildPose(state.phase, pose);
  }

  function reset() {
    state.phase = 0;
    state.scroll = 0;
    latchGait();
    pick();
  }

  reset();

  return {
    pose: pose,
    state: state,

    // The dog walks on the spot: clicking does not move it anywhere, it puts
    // the stride back to its first frame, which is also where the reference
    // plate restarts. That is what makes the two comparable.
    detonate: reset,
    reset: reset,

    advance: function () {
      var next = state.phase + 1 / P.strideSteps;
      // a stride has come round: this is where a change of gait takes hold
      if (next >= 1) latchGait();
      state.phase = frac(next);
      state.scroll += groundStep();
      pick();
    },

    stats: function () {
      count.feet = pose.planted;
      count.stride = Math.round(state.phase * 100);
      count.bones = pose.bones.length;
      return count;
    },

    // how much of the stride each foot spends on the ground, for the legend
    duty: stance
  };
}

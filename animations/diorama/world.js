"use strict";

// The clock. Between one step and the next this animation remembers a single
// integer — the step number — and two transients a strike sets and that decay
// back to exactly zero. The tower does not move. The lamp's bearing, its height,
// its flicker, every mote in the air: all of it is worked out from that one
// integer again from scratch on every step, so nothing accumulates and nothing
// can drift.

import { LOOP, latchWorld, ORIGIN_X, ORIGIN_Y, PX_Z, TOP_Z } from "./state.js";
import { frac, TAU } from "./maths.js";
import { lightAim } from "./orbit.js";

// Subtracting a twenty-fourth twenty-four times does not land on zero in binary
// floating point, it lands a few times ten to the minus sixteen above it. That
// residue is invisible, but it is not nothing: it would leave a strike flagged
// as still running for the rest of the run, and the film would carry it.
export var EPS = 1e-9;

// One step of a transient, and the last step of it lands on zero rather than
// near it.
function fade(v, steps) {
  v -= 1 / steps;
  return v > EPS ? v : 0;
}

export function createWorld() {
  // The one integer, and the two transients.
  var state = {
    step: 0,
    flare: 0,   // the strike itself, a hard glare
    puff: 0,    // the dust it lifts, which outlasts it
    spotX: 0,
    spotY: 0
  };

  var count = { angle: 0, shadow: 0, lit: 0, loop: 0 };
  // what the drawing path measured while it was drawing the last frame
  var seen = { shadow: 0, lit: 0 };

  // Both transients are gone well inside half a lap, whatever the lap has been
  // set to. That is what lets a film start from a reset and still close: a
  // strike is always over before the lap it began in comes round again, so the
  // last frame of the export meets the first.
  function flareSteps() { return Math.max(2, Math.round(LOOP / 4)); }
  function puffSteps() { return Math.max(3, Math.round(LOOP / 2)); }

  // The stats strip is read on its own timer rather than after every step, and a
  // poster is posed without one, so the counts are worked out wherever the step
  // number changes rather than only inside advance().
  function recount() {
    var lamp = lightAim(state, null);
    var deg = Math.round(lamp.angle / TAU * 360);
    count.angle = ((deg % 360) + 360) % 360;
    count.shadow = seen.shadow;
    count.lit = seen.lit;
    count.loop = Math.round(frac(state.step / LOOP) * 100);
  }

  // A clean start, and deliberately a boring one: step zero, the lamp due east,
  // no transient running. The poster and the GIF are both posed from a reset, so
  // a warm-up here would sit inside every copy of the file.
  function reset() {
    state.step = 0;
    state.flare = 0;
    state.puff = 0;
    state.spotX = 0;
    state.spotY = 0;
    seen.shadow = 0;
    seen.lit = 0;
    latchWorld();
    recount();
  }

  reset();

  return {
    state: state,

    // Where the animation is in its own lap, 0 to 1.
    phase: function () { return frac(state.step / LOOP); },

    // A strike lands where it was aimed. Left to itself — the button, or the
    // auto-replay — it strikes the tower about two thirds of the way up, which
    // is the part of it that is standing in the dark most of the time.
    detonate: function (spot) {
      state.flare = 1;
      state.puff = 1;
      if (spot) {
        state.spotX = spot.x;
        state.spotY = spot.y;
      } else {
        state.spotX = ORIGIN_X;
        state.spotY = ORIGIN_Y - PX_Z * Math.round(TOP_Z * 0.62);
      }
    },

    reset: reset,

    // One step, and nothing else. The step number goes up, the world constants
    // take hold if a lap has just closed, the transients come down, and the
    // stats are recounted.
    advance: function () {
      state.step += 1;
      if (state.step % LOOP === 0) latchWorld();
      state.flare = fade(state.flare, flareSteps());
      state.puff = fade(state.puff, puffSteps());
      recount();
    },

    // What the drawing path found while it was resolving the frame. The light
    // field belongs to the drawing path, so the two numbers that describe it
    // come back this way rather than being counted twice.
    report: function (shadow, lit) {
      seen.shadow = shadow;
      seen.lit = lit;
    },

    stats: function () { return count; }
  };
}

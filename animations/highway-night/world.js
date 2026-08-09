"use strict";

// The scroll clock and the lattice everything on the road is hung from. This
// is where the loop is guaranteed.
//
// Between one step and the next the animation remembers a single integer — the
// step number — and three transients that a strike sets and that decay back to
// exactly zero. Everything else on the stage is a function of that integer:
// where the lamps are, where the dashes are, which sign is flickering, which
// oncoming car is in shot. Nothing accumulates, so nothing can drift, and the
// frame at step 48 is the frame at step 0 to the pixel.

import {
  VIEW_W, S, HORIZON, Y_NEAR, SPACING, SPEED, LOOP, loopStep, latchWorld, kmh
} from "./state.js";
import { clamp, frac } from "./maths.js";
import { onStage, latchTraffic } from "./traffic.js";
import { latchSigns } from "./neon.js";
import { poleHit } from "./pole.js";

// The lamp lattice is anchored 46 pixels in rather than at zero, so that at the
// steps the poster is cut from a lamp stands over the car instead of behind
// it. Everything hung on a finer lattice — dashes, rail posts, gravel — shares
// the anchor, which is what keeps a post from sitting under every lamp.
export var ANCHOR = 46;

// How many cells the sign lattice is cut into. The signs do not scroll: they
// sit on the near block, which is part of the backdrop, so their lattice is
// the stage width rather than the spacing.
export var SIGN_CELLS = 24;

// Where the j-th member of a lattice stands at this step. The modulo is taken
// on the spacing, never on the stage width, so the train is seamless whatever
// shape the stage is; the result is a float and stays one until put() rounds
// it, because a rounded intermediate is exactly what makes a seam pop.
export function latticeX(j, spacing, step) {
  var anchor = ANCHOR * S;
  step = loopStep(step);
  var drift = ((anchor - SPEED * step) % spacing + spacing) % spacing;
  return drift + j * spacing;
}

// How many members of a lattice have to be drawn to cover the stage: one off
// each edge, so nothing appears or vanishes inside the frame.
export function latticeCount(spacing) {
  return Math.ceil(VIEW_W / spacing) + 2;
}

// How many cells of a lattice go past in one loop. Every hash is taken on the
// cell index modulo this number, which is what makes the detail on the lamp
// arriving at the right edge the detail that has just left on the left.
export function loopCells(spacing) {
  return Math.max(1, Math.round(SPEED * LOOP / spacing));
}

// Which cell of the loop the j-th member currently is. It counts up as the
// train scrolls and comes back to itself after LOOP steps.
export function latticeCell(j, spacing, step) {
  var base = Math.floor((SPEED * loopStep(step) - ANCHOR * S) / spacing);
  var n = loopCells(spacing);
  return ((base + j) % n + n) % n;
}

// Subtracting a twenty-fourth twenty-four times does not land on zero in binary
// floating point, it lands a few times ten to the minus sixteen above it. That
// residue is invisible on the stage but it is not nothing: it would leave the
// strike flagged as still running for the rest of the run, so anything below
// this is taken as arrived.
export var EPS = 1e-9;

// How long each transient takes to die. All three are inside half a loop at
// the defaults, so a strike is always over before the loop it began in comes
// round again — which is what lets the film start from a reset and still close.
export var FLASH_STEPS = 10;
export var SURGE_STEPS = 24;
export var WAKE_STEPS = 12;

// What a click on the stage struck.
export var STRUCK_NOTHING = 0;
export var STRUCK_SIGN = 1;
export var STRUCK_LAMP = 2;
export var STRUCK_LINE = 3;

// One step of a transient, and the last step of it lands on zero rather than
// near it. Exported because every stage here has transients and none of them
// may be allowed to keep a residue: the solos borrow this rather than each
// carrying three lines of their own that could drift apart from it.
export function fade(v, steps) {
  v -= 1 / steps;
  return v > EPS ? v : 0;
}

export function createWorld() {
  // The one integer, and the three transients.
  var state = {
    step: 0,
    flash: 0,   // high beams, 1 the instant they are struck
    surge: 0,   // the car pulling forward out of its resting place
    wake: 0,    // a lamp or a sign coming up to full
    struck: -1, // which cell of the lamp or sign lattice was struck
    kind: STRUCK_NOTHING
  };

  var count = { kmh: 0, cars: 0, lamps: 0, loop: 0 };

  // A clean start, and deliberately a boring one: step zero, no transient
  // running, every lamp already lit. The GIF and the poster are both taken
  // from a reset, so a warm-up here would sit inside every copy of the file
  // and the loop would visibly fail to close.
  // The stats strip is read on its own timer rather than after every step, and
  // a poster is posed without one, so the counts are worked out wherever the
  // step number changes rather than only inside advance().
  function recount() {
    count.kmh = Math.round(kmh());
    count.cars = onStage(state.step);
    count.lamps = latticeCount(SPACING) - 2;
    count.loop = Math.round(frac(state.step / LOOP) * 100);
  }

  // The assembled highway draws everything, so it latches everything. A solo
  // calls only the latches for the parts it has on stage, which is the whole
  // reason the three of them live in three files rather than in one.
  function latchAll() {
    latchWorld();
    latchTraffic();
    latchSigns();
  }

  function reset() {
    state.step = 0;
    state.flash = 0;
    state.surge = 0;
    state.wake = 0;
    state.struck = -1;
    state.kind = STRUCK_NOTHING;
    latchAll();
    recount();
  }

  // Which cell of the lamp lattice a click landed nearest to. The lamps are
  // drawn one spacing left of where the lattice puts them — one off the edge,
  // so none of them arrives inside the frame — and this has to agree with that
  // or a click would name the lamp next door.
  function nearestLamp(x) {
    var j = Math.round((x - (latticeX(0, SPACING, state.step) - SPACING)) / SPACING);
    return latticeCell(clamp(j, 0, latticeCount(SPACING) - 1), SPACING, state.step);
  }

  reset();

  return {
    state: state,

    // Where the animation is in its own loop, 0 to 1. The reference panel
    // reads this rather than counting frames off a clock of its own.
    phase: function () { return frac(state.step / LOOP); },

    // A strike reads the band that was clicked, because in a side elevation the
    // bands are the only depth there is: the sky belongs to the signs, the far
    // half of the ground to the lamps, and the near carriageway to the car.
    //
    // The lamps are asked first and on their own, because they are the one
    // thing on the stage that stands out of its own band. The arm and the head
    // are up in the sky — at the tallest setting of the mast knob, eleven rows
    // above the horizon — and the head is what a visitor aims at, because the
    // head is what is lit. Read by band alone, the click that most looks like
    // striking a lamp would strike a sign on the block behind it.
    detonate: function (spot) {
      var lamp;
      if (!spot) {
        // left to itself — the auto-replay, or the button — a strike runs down
        // the whole lamp line and the headlights answer it
        state.kind = STRUCK_LINE;
        state.struck = -1;
        state.wake = 1;
        state.flash = 1;
        return;
      }
      lamp = poleHit(spot.x, spot.y, state.step);
      if (lamp >= 0) {
        state.kind = STRUCK_LAMP;
        state.struck = lamp;
        state.wake = 1;
        return;
      }
      if (spot.y < HORIZON) {
        state.kind = STRUCK_SIGN;
        state.struck = clamp(Math.floor(spot.x / (VIEW_W / SIGN_CELLS)), 0, SIGN_CELLS - 1);
        state.wake = 1;
        return;
      }
      if (spot.y < Y_NEAR) {
        state.kind = STRUCK_LAMP;
        state.struck = nearestLamp(spot.x);
        state.wake = 1;
        return;
      }
      state.kind = STRUCK_NOTHING;
      state.struck = -1;
      state.flash = 1;
      state.surge = 1;
    },

    reset: reset,

    // One step, and nothing else. The step number goes up, the world constants
    // take hold if a loop has just closed, the transients come down, and the
    // stats are recounted. Every position on the stage is derived from the step
    // number when it is drawn, so there is nothing here to move.
    advance: function () {
      state.step += 1;
      if (state.step % LOOP === 0) latchAll();

      state.flash = fade(state.flash, FLASH_STEPS);
      state.surge = fade(state.surge, SURGE_STEPS);
      state.wake = fade(state.wake, WAKE_STEPS);
      if (state.wake === 0 && state.flash === 0 && state.surge === 0) {
        state.struck = -1;
        state.kind = STRUCK_NOTHING;
      }

      recount();
    },

    stats: function () { return count; }
  };
}

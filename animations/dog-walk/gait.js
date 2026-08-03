"use strict";

import { P } from "./state.js";
import { clamp, frac, smooth } from "./maths.js";

// ---------------------------------------------------------------------
// The gait. One number runs the whole animation: where the dog is in its
// stride, from 0 to 1. Every foot reads that number through its own offset,
// and everything else — the rise and fall of the body, the nod of the head,
// the ground sliding past — is worked out from the same place.
// ---------------------------------------------------------------------

// A four-beat lateral walk: left hind, left fore, right hind, right fore, a
// quarter of a stride apart. It is the sequence a dog actually walks in, and
// the reason three feet are on the ground at almost every moment.
export var WALK = { hindFar: 0, foreFar: 0.25, hindNear: 0.5, foreNear: 0.75 };

// A trot pairs them diagonally instead, and puts half a stride between the
// pairs — two beats rather than four.
export var TROT = { hindFar: 0, foreNear: 0, hindNear: 0.5, foreFar: 0.5 };

export var LEGS = ["hindFar", "foreFar", "hindNear", "foreNear"];

// The gait is read once at the top of each stride rather than every step, so
// switching between the two cannot drop a paw through the ground halfway
// through a step it had already started.
var pattern = WALK;
var trotting = false;

export function latchGait() {
  trotting = !!P.trot;
  pattern = trotting ? TROT : WALK;
}

export function offsets() { return pattern; }

// How much of the stride a foot spends on the ground. A walk keeps each foot
// down for well over half the cycle; a trot cannot, or the diagonal pairs
// would never leave the ground together.
export function stance() {
  return trotting ? Math.min(P.stance, 0.48) : P.stance;
}

// Where one foot is, relative to the joint it hangs from and the ground.
// During stance it is planted and the body travels over it; during swing it
// is picked up, carried forward and set down again.
export function foot(offset, phase, out) {
  var t = frac(phase + offset);
  var down = stance();
  var reach = P.strideLength;
  if (t < down) {
    var u = t / down;
    out.x = reach * (0.5 - u);
    out.y = 0;
    out.planted = true;
    // the last moment of stance is a push-off, not a drag
    out.push = u;
  } else {
    var v = (t - down) / (1 - down);
    out.x = reach * (smooth(v) - 0.5);
    out.y = -P.stepHeight * Math.sin(Math.PI * v);
    out.planted = false;
    out.push = 0;
  }
  return out;
}

// How far the ground has to slide for a planted paw to stay where it was put.
// The foot travels a whole stride backwards over the stance, so the ground
// must travel exactly as far in the same time.
export function groundStep() {
  return P.strideLength / (stance() * P.strideSteps);
}

// The trunk rises and falls twice a stride, once for each diagonal pair
// taking the weight, and rolls forward and back a little as it does.
export function bodyRise(phase) {
  return -Math.abs(Math.sin(Math.PI * (phase * 2 + 0.25))) * P.bodyBob;
}

export function bodyPitch(phase) {
  return Math.sin(2 * Math.PI * (phase * 2 + 0.1)) * P.bodyBob * 0.35;
}

// A dog nods once a stride, with the shoulder it is loading.
export function headDip(phase) {
  return Math.sin(2 * Math.PI * (phase + 0.12)) * P.headBob;
}

// The tail swings on its own clock, slower than the legs, and each joint
// along it arrives a little after the one before.
export function tailSwing(phase, along) {
  return Math.sin(2 * Math.PI * (phase * 0.75 - along * 0.22)) *
    P.tailWag * clamp(0.4 + along, 0, 1.4);
}

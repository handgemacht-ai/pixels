"use strict";

import { P } from "./state.js";
import { clamp, frac, smooth } from "./maths.js";

// ---------------------------------------------------------------------
// The gait. One number runs the whole animation: where the dog is in its
// stride, from 0 to 1. Every foot reads that number through its own offset,
// and everything else — the rise and fall of the body, the nod of the head,
// the ground sliding past — is worked out from the same place.
// ---------------------------------------------------------------------

// A walking dog does not put its feet down at four even quarters. Each hind
// foot is followed closely by the fore foot on the same side, and the two
// pairs are half a stride apart — which is why a walking dog looks like it is
// moving in diagonal couplets rather than marking time.
export var WALK = { hindFar: 0, foreFar: 0.32, hindNear: 0.5, foreNear: 0.82 };

// A trot pairs them diagonally instead, and puts half a stride between the
// pairs — two beats rather than four, with a moment in the air between them.
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

export function isTrotting() { return trotting; }

// How much of the stride a foot spends on the ground. A walk keeps each foot
// down for well over half the cycle, which is what puts three feet on the
// ground at almost every moment. A trot has to be under a half or the two
// diagonal pairs would never both be off the ground, and the airborne moment
// between them is the whole difference between the two gaits.
export function stance() {
  return trotting ? 0.40 : P.stance;
}

// A trot is not a fast walk. It takes shorter steps, picks the feet up higher
// and throws the body about more, and the whole animal is in the air twice a
// stride — so every one of those has its own number rather than sharing the
// walk's.
export function reach() {
  return trotting ? P.strideLength * 0.82 : P.strideLength;
}

export function lift() {
  return trotting ? P.stepHeight * 1.75 : P.stepHeight;
}

export function bounce() {
  return trotting ? P.bodyBob * 2.1 : P.bodyBob;
}

// Where one foot is, relative to the joint it hangs from and the ground.
// During stance it is planted and the body travels over it; during swing it
// is picked up, carried forward and set down again.
export function foot(offset, phase, out) {
  var t = frac(phase + offset);
  var down = stance();
  var span = reach();
  if (t < down) {
    var u = t / down;
    out.x = span * (0.5 - u);
    out.y = 0;
    out.planted = true;
    out.push = u;
    // how much weight this paw is carrying: none at the moment it touches,
    // all of it in the middle of the stance, none again as it leaves
    out.load = Math.sin(Math.PI * u);
  } else {
    var v = (t - down) / (1 - down);
    out.x = span * (smooth(v) - 0.5);
    out.y = -lift() * Math.sin(Math.PI * v);
    out.planted = false;
    out.push = 0;
    out.load = 0;
  }
  return out;
}

// How far the ground has to slide for a planted paw to stay where it was put.
// The foot travels a whole stride backwards over the stance, so the ground
// must travel exactly as far in the same time.
export function groundStep() {
  return reach() / (stance() * P.strideSteps);
}

// The trunk rises and falls twice a stride, once for each diagonal pair taking
// the weight, and rolls forward and back a little as it does. It rises as far
// above where it stands as it drops below, so turning the knob up lifts the
// dog as much as it drops it.
export function bodyRise(phase) {
  return (0.5 - Math.abs(Math.sin(Math.PI * (phase * 2 + 0.25)))) * bounce() * 2;
}

export function bodyPitch(phase) {
  return Math.sin(2 * Math.PI * (phase * 2 + 0.1)) * bounce() * 0.35;
}

// A dog nods once a stride, with the shoulder it is loading. The nod carries
// the whole head down and forward, not just the tip of the nose.
export function headDip(phase) {
  return Math.sin(2 * Math.PI * (phase + 0.12));
}

// The tail swings on its own clock, slower than the legs, and each joint
// along it arrives a little after the one before.
export function tailSwing(phase, along) {
  return Math.sin(2 * Math.PI * (phase * 0.75 - along * 0.22)) *
    P.tailWag * clamp(0.4 + along, 0, 1.4);
}

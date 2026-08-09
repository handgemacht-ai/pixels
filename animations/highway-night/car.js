"use strict";

// The hero car, which never goes anywhere. It sits at a fixed place on the
// stage and the road is dragged past it, which is what lets the whole scene
// live inside one stage width and one loop.
//
// What it does do is ride. The road under it has a profile — three harmonics
// laid down at three, seven and eleven cycles to the loop — and the body
// answers that profile through its springs. The answer is a closed form rather
// than a spring integrated step by step: a quarter-car at 1.2 Hz with dampers
// near a third of critical has a known gain at any frequency, and reading that
// curve at three fixed frequencies gives the same body height at step 0 and at
// step 48. A spring stepped forward would not, and the loop would creep open a
// fraction of a pixel a lap until the seam showed.
//
// Pitch comes free out of the same profile: the front wheels meet a bump a
// wheelbase before the rear ones do, so the pitch is the profile now minus the
// profile a wheelbase ago. Body, glass and both lamps ride it together, which
// is why the beams nod and the pools breathe rather than sitting still while
// the shell moves.

import { P, S, LOOP, CAR_X, Y_SHOULDER } from "./state.js";
import { CAR, GLASS, WHEEL } from "./palette.js";
import { frac, springGain } from "./maths.js";

// The shell, in the pixels of a 192-wide stage, measured out from the middle
// of the car and up from where the tyres meet the road.
var HALF = 17;      // half the length
var SILL = 5;       // where the body stops and the shadow under it starts
var WAIST = 12;     // the top of the body, either side of the cabin
var ROOF = 17;      // the top of the cabin
var CAB0 = -7;      // the cabin, from the B pillar forward
var CAB1 = 6;
var LAMP_UP = 9;    // how high the lamps sit off the road
var WHEELS = [-10, 9];

// The road's three harmonics: how many cycles each fits into a loop, and how
// much of the bump each carries. Odd numbers with no common factor, so the
// three never line up twice in the same lap and the ride never falls into a
// pattern short enough to count.
var HARMONIC = [3, 7, 11];
var WEIGHT = [1, 0.5, 0.3];
var PHASE = [0, 0.37, 0.71];

// A wheelbase, as a fraction of the distance covered in one loop: 28 pixels of
// car against 192 pixels of travel.
var WHEELBASE = 28 / 192;

// How far the car is allowed to pull forward out of its resting place when the
// near carriageway is struck.
var SURGE = 28;

// The height of the road under the wheels at this point of the loop, already
// answered by the springs. Normalised so the `bob` knob is honest in pixels at
// any cadence: the gains change with the clock, and dividing by their sum
// keeps the number on the slider the number on the screen.
function profile(u, seconds) {
  var sum = 0, norm = 0;
  var n, hz, gain;
  for (n = 0; n < HARMONIC.length; n++) {
    hz = HARMONIC[n] / seconds;
    gain = springGain(hz);
    norm += WEIGHT[n] * gain;
    sum += WEIGHT[n] * gain * Math.sin(2 * Math.PI * (HARMONIC[n] * u + PHASE[n]));
  }
  return norm > 0 ? sum / norm : 0;
}

export function carPose(state) {
  var u = frac(state.step / LOOP);
  var seconds = LOOP / Math.max(1, P.stepsPerSec);
  var amp = P.bob * P.roughness * S;
  var here = profile(u, seconds);
  var back = profile(frac(u - WHEELBASE), seconds);
  // out and back rather than a jump and a decay: at the instant of the strike
  // the car has not moved yet, halfway through the transient it is as far
  // forward as it goes, and at the end it is home
  var ease = state.surge > 0 ? Math.sin(Math.PI * (1 - state.surge)) : 0;
  return {
    x: CAR_X + ease * SURGE * S,
    wheelY: Y_SHOULDER - 2 * S,
    bob: here * amp,
    // halved, so that the nose of the car never travels further than the knob
    // says the body does: the difference of two samples of the profile can
    // reach twice the profile's own swing, and a slider marked in pixels has
    // to mean the pixels it says
    pitch: (here - back) * amp * 0.5,
    surge: ease
  };
}

// How far a given column of the shell has been carried by the springs. The
// pitch is applied as a shear across the length of the car rather than as a
// rotation, because a rotation at this size is a rounding argument and a shear
// is a column of pixels moved one pixel up.
export function ride(pose, d) {
  return pose.bob + pose.pitch * (d / HALF);
}

// Where the lamps are, once the shell has ridden. The cones are cast from just
// outside the nose so that the body is never inside its own beam.
export function lampAt(pose, front) {
  var d = front ? HALF : -HALF;
  return {
    x: pose.x + (front ? HALF + 1 : -HALF - 1) * S,
    y: pose.wheelY - LAMP_UP * S + ride(pose, d)
  };
}

function roofTop(d) {
  if (d === CAB0 || d === CAB1) return ROOF - 2;
  if (d === CAB0 + 1 || d === CAB1 - 1) return ROOF - 1;
  return ROOF;
}

// One column of the shell, from one height above the road to another.
function column(slab, id, pose, d, low, high) {
  if (high <= low) return;
  var lift = ride(pose, d);
  slab(id, pose.x + d * S, pose.wheelY - high * S + lift, S, (high - low) * S);
}

export function paintCar(slab, pose) {
  var d, k, top, w;

  // the shadow the body throws on its own underside, drawn first and only
  // between the wheels so it cannot swallow them
  for (d = -6; d <= 5; d++) column(slab, WHEEL, pose, d, 2, SILL);

  // the wheels, which do not ride: they are the one part of the car that is
  // still on the road
  for (k = 0; k < WHEELS.length; k++) {
    for (d = -3; d <= 3; d++) {
      w = Math.abs(d) === 3 ? 4 : 6;
      slab(WHEEL, pose.x + (WHEELS[k] + d) * S, pose.wheelY - w * S, S, w * S);
    }
  }

  // the body, with the nose and the tail losing a pixel apiece off the top so
  // the shell has ends rather than corners
  for (d = -HALF; d <= HALF; d++) {
    top = WAIST;
    if (d >= CAB0 && d <= CAB1) top = roofTop(d);
    else if (d === -HALF || d === HALF) top = WAIST - 2;
    else if (d === -HALF + 1 || d === HALF - 1) top = WAIST - 1;
    column(slab, CAR, pose, d, SILL, top);
  }

  // the glass, inset a pixel from the roof on every side, which leaves the
  // roof line and the pillars standing in body colour — and glass takes the
  // sky rather than the lamps, so it stays cold inside every pool it crosses
  for (d = CAB0 + 1; d <= CAB1 - 1; d++) {
    column(slab, GLASS, pose, d, WAIST + 1, roofTop(d) - 1);
  }
}

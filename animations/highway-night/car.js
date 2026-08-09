"use strict";

// The hero car, which never goes anywhere. It sits at a fixed place on the
// stage and the road is dragged past it, which is what lets the whole scene
// live inside one stage width and one loop.
//
// It used to ride. There was a road profile of three harmonics and a
// closed-form quarter-car answering it, and body, glass and both lamps rode it
// together so the beams nodded. It was correct and it was wrong: a car at
// motorway speed on a laid carriageway is level, and a shell two pixels of
// travel high reads as a car going over a kerb every second. The springs are
// gone, the beams are level, and the one thing left of the ride is the surge —
// the car pulling forward along the road when the near carriageway is struck,
// which is a change of speed rather than a bump.
//
// Nothing in this file reads a knob. Where the car stands, how long it is and
// how it is put together are the scene's own numbers; everything a stage is
// allowed to argue with — how far its beams throw, whether its wheels are
// marked — arrives as an argument.

import { S, LOOP, CAR_X, Y_SHOULDER, loopStep } from "./state.js";
import { CAR, GLASS, WHEEL, SHADOW } from "./palette.js";

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

// How far the car is allowed to pull forward out of its resting place when the
// near carriageway is struck.
var SURGE = 28;

// Ten turns of a wheel to one loop of the road. A whole number is the whole
// point: the hub mark is back where it started when the lattice is, so the one
// piece of the car that spins cannot be the thing that tears the seam. Ten is
// fast enough at twelve steps a second to read as rotation rather than as a
// pixel wandering round a circle.
var TURNS = 10;
var HUB = 2;        // how far off the axle the mark sits

export function carPose(state) {
  // out and back rather than a jump and a decay: at the instant of the strike
  // the car has not moved yet, halfway through the transient it is as far
  // forward as it goes, and at the end it is home
  var ease = state.surge > 0 ? Math.sin(Math.PI * (1 - state.surge)) : 0;
  return {
    x: CAR_X + ease * SURGE * S,
    wheelY: Y_SHOULDER - 2 * S,
    surge: ease
  };
}

// Where the lamps are. The cones are cast from just outside the nose so that
// the body is never inside its own beam.
export function lampAt(pose, front) {
  return {
    x: pose.x + (front ? HALF + 1 : -HALF - 1) * S,
    y: pose.wheelY - LAMP_UP * S
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
  slab(id, pose.x + d * S, pose.wheelY - high * S, S, (high - low) * S);
}

// One pixel of body colour inside each black wheel, carried round the axle.
// A wheel this size has no room for spokes and no colour to draw them in, but
// a single mark going round is enough: what the eye reads is that the thing is
// turning, not how many spokes it has.
function hubs(slab, pose, step) {
  var angle = 2 * Math.PI * TURNS * loopStep(step) / LOOP;
  var dx = Math.cos(angle) * HUB;
  var dy = Math.sin(angle) * HUB;
  var k;
  for (k = 0; k < WHEELS.length; k++) {
    slab(CAR, pose.x + (WHEELS[k] + dx) * S, pose.wheelY - (3 - dy) * S, S, S);
  }
}

export function paintCar(slab, pose, step, spin) {
  var d, k, top, w;

  // What the car takes away from the road it is standing on, drawn first and
  // wide enough to show either side of the wheels. It is not a colour laid
  // over the asphalt: SHADOW is the same asphalt with the top of its ramp out
  // of reach, so the patch stays a band behind the road however bright the
  // road under it becomes — which is what makes the car sit on the carriageway
  // when it drives through a pool instead of hovering over it.
  slab(SHADOW, pose.x - (HALF - 1) * S, pose.wheelY - S, (2 * HALF - 2) * S, S);

  // the shadow the body throws on its own underside, only between the wheels
  // so it cannot swallow them
  for (d = -6; d <= 5; d++) column(slab, SHADOW, pose, d, 2, SILL - 1);

  // the wheels, which are the one part of the car that is on the road
  for (k = 0; k < WHEELS.length; k++) {
    for (d = -3; d <= 3; d++) {
      w = Math.abs(d) === 3 ? 4 : 6;
      slab(WHEEL, pose.x + (WHEELS[k] + d) * S, pose.wheelY - w * S, S, w * S);
    }
  }
  if (spin) hubs(slab, pose, step);

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

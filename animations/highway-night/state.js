"use strict";

// What the platform hands this animation — the live values of its knobs and
// the size of the stage — and the two things everything else here is measured
// against: the ladder of ground bands, and the handful of world constants that
// are only allowed to change on a loop boundary.

import { clamp } from "./maths.js";

// The knob values. The same object the control panel writes into, so a knob
// moved on screen is read on the next step without anything being copied.
export var P = {};

export var VIEW_W = 0, VIEW_H = 0;

// Every length in the scene is written for a stage 192 pixels wide and
// multiplied by this. A wider stage therefore shows the same road drawn
// bigger, rather than the same road with more of it visible — the lamps would
// otherwise thin out and the car would shrink as the resolution knob moved.
export var S = 1;

// ---------------------------------------------------------------------
// The ground ladder.
//
// This is a side elevation, not a perspective shot. There is no vanishing
// point and no per-pixel depth: distance is carried by which horizontal band a
// thing is drawn in, and by nothing else. The bands are therefore fixed
// proportions of a fixed ground height and never move — a horizon that could
// be dragged up and down, times a stage that can change shape, would sooner or
// later squeeze the near carriageway thinner than the car standing on it.
//
// The ground is 63 units of a 192-wide stage, split 6 / 4 / 12 / 5 / 24 / 12.
// The near carriageway takes up the rounding, because it is the widest band
// and a pixel either way is invisible there, whereas the rail band is four
// pixels and cannot spare one.
// ---------------------------------------------------------------------
var GROUND_UNITS = 63;
var SKIRT_UNITS = 6;      // ground the city stands on, behind the rail
var RAIL_UNITS = 4;       // the guard rail and its posts
var FAR_UNITS = 12;       // the oncoming carriageway
var MEDIAN_UNITS = 5;     // the barrier between the two
var SHOULDER_UNITS = 12;  // gravel and speckle in front of the car

export var GROUND_H = 0;  // how many pixels of the stage are ground
export var HORIZON = 0;   // the top of the ground, where the far city stands
export var Y_RAIL = 0;    // top of the rail band
export var Y_FAR = 0;     // top of the oncoming carriageway
export var Y_MEDIAN = 0;  // top of the median
export var Y_NEAR = 0;    // top of the near carriageway
export var Y_SHOULDER = 0; // top of the shoulder

// Where the hero car stands. It never moves along the road; the road moves
// past it, which is what lets the whole scene live in one stage width.
export var CAR_X = 0;

// ---------------------------------------------------------------------
// The world constants. These come off knobs marked `applies: "next"`, and
// they are copied here once per loop rather than read live, because every one
// of them decides how far the scene scrolls in a loop. Reading them live would
// let a slider dragged mid-loop leave the lattice half a spacing out of step
// with itself, and the seam would tear open.
// ---------------------------------------------------------------------
export var STEPS_PER_POLE = 12;  // steps between one lamp and the next
export var DESIGN_SPACING = 48;  // pixels between lamps, at a 192-wide stage
export var SPACING = 48;         // the same, in the pixels actually being drawn
export var SPEED = 4;            // pixels of scroll per step
export var LOOP = 48;            // steps in one loop: four lamps, one stage width
export var CARS = 4;             // oncoming cars per lattice
export var SIGNS = 18;           // how many of the sign housings are lit

// Metres per pixel at the design scale. Lamps on an urban expressway stand
// about 33 metres apart and the plan puts them 48 pixels apart, which fixes
// the scale of everything else — and makes the defaults come out at 120 km/h
// exactly rather than at a number chosen to look good in the stats strip.
export var MPP = 33.3 / 48;

// Every position on the road is worked out from the step number, and the step
// number counts up for ever. The scroll speed is one lamp spacing divided by
// however many steps the knob asks it to take, which for most settings of that
// knob is not an exact binary fraction — so multiplying it by a large step
// number leaves a residue, and the residue grows with the run. It is far too
// small to see. It is not too small to tip a coordinate sitting exactly on a
// half-pixel over to the other side of it, and one pixel moving at the seam is
// the whole thing this file exists to prevent. Reducing the step to its place
// in the loop first costs one modulo and makes step 120 the same number as
// step 0 rather than almost the same.
export function loopStep(step) {
  return ((step % LOOP) + LOOP) % LOOP;
}

export function useParams(params) { P = params; }

export function setStage(width, height) {
  VIEW_W = width;
  VIEW_H = height;
  S = width / 192;

  GROUND_H = Math.round(GROUND_UNITS * S);
  HORIZON = VIEW_H - GROUND_H;

  var k = GROUND_H / GROUND_UNITS;
  var skirt = Math.round(SKIRT_UNITS * k);
  var rail = Math.round(RAIL_UNITS * k);
  var far = Math.round(FAR_UNITS * k);
  var median = Math.round(MEDIAN_UNITS * k);
  var shoulder = Math.round(SHOULDER_UNITS * k);

  Y_RAIL = HORIZON + skirt;
  Y_FAR = Y_RAIL + rail;
  Y_MEDIAN = Y_FAR + far;
  Y_NEAR = Y_MEDIAN + median;
  Y_SHOULDER = VIEW_H - shoulder;

  CAR_X = Math.round(82 * S);
}

// Called at every reset and at every loop boundary, and nowhere else.
export function latchWorld() {
  STEPS_PER_POLE = Math.max(1, Math.round(P.poleSteps));
  DESIGN_SPACING = Math.max(8, Math.round(P.poleSpacing));
  SPACING = DESIGN_SPACING * S;
  SPEED = SPACING / STEPS_PER_POLE;
  // Four lamps to a loop. That is the whole reason the loop closes: the scroll
  // over LOOP steps is SPEED * LOOP = 4 * SPACING however either knob is set,
  // so the lattice comes back onto itself exactly, and every hash taken on a
  // cell counted modulo its cells-per-loop comes back with it.
  LOOP = STEPS_PER_POLE * 4;
  CARS = Math.round(clamp(P.density, 0, 8));
  SIGNS = Math.round(clamp(P.signs, 0, 24));
}

// The speed the picture is running at, in km/h, worked out from the scale
// rather than declared: pixels per step, times steps per second, times metres
// per pixel. At the defaults this is 120.
export function kmh() {
  return DESIGN_SPACING / STEPS_PER_POLE * P.stepsPerSec * MPP * 3.6;
}

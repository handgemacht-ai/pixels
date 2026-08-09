"use strict";

// The camera, and the one thing this picture has that the elevation has not: a
// depth per row.
//
// A shot down the road is a pinhole looking along the carriageway from a fixed
// height above it. Two numbers settle the whole geometry. The horizon is where
// the ground plane goes to infinity, and it is a row rather than a thing —
// state.js puts it 0.3125 of a stage width up from the bottom. Everything
// below it is ground, and a row `d` pixels below it is showing the ground at
//
//     z = DEPTH / d          metres ahead of the camera
//
// where DEPTH is the focal length times the camera height, in pixels times
// metres, and is therefore a property of the lens rather than of anything in
// the scene. Across the same row, one metre off the axis is `d / height`
// pixels wide. That is the entire projection: one division each way.
//
// Writing it as a table of z per row rather than as a matrix is not thrift, it
// is the point. Every surface in this picture lies on the ground plane, so a
// sweep down the rows already knows how far away it is looking, and a lamp
// pool measured in metres on that plane foreshortens correctly without anybody
// having to say so. The elevation had to divide its vertical by 1.8 to fake
// exactly this; here it falls out.
//
// Raising the camera with DEPTH held still is a wider lens, not a longer one:
// the rows keep the depths they had and the corridor narrows across them,
// which is what looking down at a road from higher up actually does. At about
// seven and a half metres the corridor comes out the width the reference plate
// shows, which is a bridge over the Ayalon and not a car in it.

import {
  VIEW_W, VIEW_H, S, HORIZON, P, MPP, DESIGN_SPACING, STEPS_PER_POLE, LOOP, loopStep
} from "./state.js";
import { clamp } from "./maths.js";

// Focal length times camera height, at a 192-wide stage, measured off the
// plate: the corridor's own vanishing lines fix it, and 516 is what they came
// to. It is scaled with the stage width like every other length here, so a
// wider stage shows the same road drawn bigger rather than more of it.
var DEPTH_ROWS = 516;

// Where the road runs to. Not the middle: the camera is in the lane beside the
// median, so the corridor opens to the left and the vanishing point sits about
// three fifths of the way across — the same offset the plate has.
var VP_FRACTION = 0.619;

// Where the pole lattice is pinned, in metres ahead of the camera. Nothing is
// hung off the number itself; it exists so the trains in this picture and the
// trains in the elevation are the same construction with the same joint.
var ANCHOR = 0;

export var VP_X = 0;
export var DEPTH = 0;

// The depth of every row of the stage, worked out once per stage size. Rows at
// or above the horizon are sky and carry no depth at all, which is said as
// infinity rather than as a zero so that a mistaken read is obviously wrong
// instead of quietly meaning "under the camera".
var ROW_Z = null;

export function layCamera() {
  VP_X = Math.round(VP_FRACTION * VIEW_W);
  DEPTH = DEPTH_ROWS * S;
  ROW_Z = new Float32Array(VIEW_H);
  var y, d;
  for (y = 0; y < VIEW_H; y++) {
    d = y - HORIZON;
    ROW_Z[y] = d > 0 ? DEPTH / d : Infinity;
  }
}

// ------------------------- the projection, both ways ------------------------

export function zAt(y) { return ROW_Z[y]; }

export function zOf(d) { return d > 0 ? DEPTH / d : Infinity; }

export function dOf(z) { return DEPTH / z; }

export function rowOf(z) { return HORIZON + DEPTH / z; }

// How high the camera is riding. Clamped rather than trusted because it
// divides: the knob cannot reach zero, and a stage that forgot to declare it
// would arrive here as undefined and take the whole frame with it.
export function camHeight() { return clamp(P.camHeight, 1, 20); }

// Screen pixels to the metre, across a row that is `d` pixels below the
// horizon. This is the only place the camera height is used, which is why
// raising it narrows the road instead of moving the horizon.
export function ppm(d) { return d / camHeight(); }

export function xOf(u, d) { return VP_X + u * ppm(d); }

export function uOf(x, d) { return (x - VP_X) / ppm(d); }

// ------------------------------ the lattice, in z ---------------------------
//
// The twins of latticeX and latticeCell in world.js, with metres ahead of the
// camera where those have pixels across the stage. The algebra is the same
// because the situation is the same: a train of identical things pinned to an
// anchor, sliding past at a fixed rate, wrapping on its own spacing rather
// than on the frame. The only difference is which way the eye is looking down
// it, and that difference is entirely in the projection above.

export function spacingMetres() { return DESIGN_SPACING * MPP; }

// How far the camera travels in one step. At the defaults this is 2.775 metres
// — a lamp spacing every twelve steps, twelve steps a second, 120 km/h.
export function stepMetres() { return spacingMetres() / STEPS_PER_POLE; }

// How far into this loop the camera has come. Reduced to its place in the loop
// first, for the reason state.js gives: the residue of a long multiplication is
// far too small to see and not too small to move a coordinate sitting on a
// half-pixel across it.
export function travelled(step) { return stepMetres() * loopStep(step); }

// Where the j-th member of a train stands, in metres ahead. The modulo is
// taken on the spacing and the result stays a float: a rounded intermediate is
// what makes a seam pop, here as much as anywhere.
export function latticeZ(j, spacing, step) {
  var drift = ((ANCHOR - travelled(step)) % spacing + spacing) % spacing;
  return drift + j * spacing;
}

// How many cells of a train go past in one loop. Every hash is taken on the
// cell index modulo this, which is what makes the detail on the mast arriving
// at the horizon the detail that has just swept past the eye.
export function loopCellsZ(spacing) {
  return Math.max(1, Math.round(stepMetres() * LOOP / spacing));
}

export function latticeCellZ(j, spacing, step) {
  var base = Math.floor((travelled(step) - ANCHOR) / spacing);
  var n = loopCellsZ(spacing);
  return ((base + j) % n + n) % n;
}

// How many members of a train have to be walked to cover the road as far as it
// is worth drawing it. Beyond a couple of hundred metres the spacing between
// two of anything is under a row and the train stops being a train, which is
// what the light does about it rather than the geometry — see groundlight.js.
export function latticeCountZ(spacing, metres) {
  return Math.ceil(metres / spacing) + 1;
}

// The stage's own edges, in metres off the axis, at a given row. Used to throw
// away whatever has swung out of frame: near the eye the masts are further to
// the side than the frame is wide, and a mast that is off the edge is not a
// mast that has to be drawn as a stripe down the whole picture.
export function halfWidthMetres(d) {
  return VIEW_W / Math.max(0.0001, ppm(d));
}

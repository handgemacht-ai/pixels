"use strict";

// What the platform hands this animation — the live values of its knobs, where
// the mouse is, the size of the stage — and the two things everything else here
// is measured against: the projection, and the handful of model constants that
// are only allowed to change on a loop boundary.

import { clamp } from "./maths.js";

// The knob values. The same object the control panel writes into, so a knob
// moved on screen is read on the next step without anything being copied.
export var P = {};

// Where the mouse is, in stage pixels, or `inside: false` if it is not over the
// stage at all. Also the same live object for the whole run — and the platform
// forces `inside` false while a poster or a film is being made, which is the
// only reason a scene that follows the mouse can still be filmed.
export var POINTER = { x: 0, y: 0, inside: false };

export var VIEW_W = 0, VIEW_H = 0;

// Every length in the model is written for a stage 160 pixels wide and 128 tall
// and multiplied by this. The height is in it because the subject is tall: a
// 16:10 stage has to draw a smaller tower, not the same tower with its crest cut
// off by the top edge.
export var S = 1;

// ---------------------------------------------------------------------
// The projection.
//
// A raised three-quarter view, and deliberately one with whole numbers in it. A
// voxel is a VS x VS block of stage pixels, and the three axes move it by:
//
//   X   two pixels right
//   Y   one pixel right and one pixel up   (into the picture)
//   Z   two pixels up
//
// which is the half-angle axonometric every isometric tile set is drawn on, and
// the reason there is not a single rounding anywhere between a voxel and its
// block. Nothing here interpolates, nothing lands on a half pixel, and the same
// model rebuilt at another size is the same model rather than a resampled one.
//
// The camera that implies stands east of the tower, in front of it and above
// it, so the faces facing +X, -Y and +Z are the ones being looked at.
// ---------------------------------------------------------------------
export var VS = 2;
export var PX_X = 2;    // stage pixels right, per voxel of X
export var PX_YX = 1;   // stage pixels right, per voxel of Y
export var PX_YY = 1;   // stage pixels up, per voxel of Y
export var PX_Z = 2;    // stage pixels up, per voxel of Z

// Where a voxel stands along the light module's depth axis. The module measures
// height and screen distance in stage pixels, so depth is quoted in them too:
// one voxel of Y is as far as two pixels of X, and this is what says so.
export var DEP_Y = 2;

export var ORIGIN_X = 0, ORIGIN_Y = 0;

// Which of two voxels landing on the same block is nearer the eye. Smaller is
// nearer: going one voxel further into the picture also drops it half a voxel
// in X and half a voxel in Z, and this is that walk written down.
export function viewDepth(X, Y, Z) { return 2 * Y - X - Z; }

// ---------------------------------------------------------------------
// The model, in voxels. Everything here is a whole number, because a model
// measured in fractions of a voxel would move by a pixel at one stage size and
// not at the next.
// ---------------------------------------------------------------------
export var GROUND_R = 22;   // how far the ground disc reaches
export var PLINTH_R = 16;   // where the rock has fallen away to nothing
export var PLINTH_H = 5;    // the shelf the tower stands on
export var WALL_OUT = 11;   // the outside of the wall
export var WALL_IN = 8;     // the inside of it
export var TOWER_H = 26;    // wall above the shelf, before the ruin takes any
export var TOP_Z = 31;      // the crest, if nothing had fallen
export var MERLON = 2;      // how far a merlon stands above the crest
export var DOOR_W = 3;      // half the doorway, along the wall
export var DOOR_H = 9;      // to the top of its arch
export var STAIR_H = 15;    // how much of the stair is left
export var JOIST_Z = 14;    // the floor whose joists are still in the wall

// ---------------------------------------------------------------------
// The world constants. These come off knobs marked `applies: "next"` and are
// copied here once per loop rather than read live. The loop length is one of
// them, and a loop that changed length halfway through would leave the lamp
// somewhere other than where it started; the model is the rest of them, and a
// tower rebuilt mid-lap would tear the seam of the film open.
// ---------------------------------------------------------------------
export var LOOP = 48;
export var RUIN = 0.55;
export var RUBBLE = 0.6;

// The raw knob readings the shape is worked out from, held separately so a
// resize can redo the shape at the new scale without waiting for a loop.
var LATCHED = { tower: 26 };

// Every position of the lamp is worked out from the step number, and the step
// number counts up for ever. Reducing it to its place in the loop first is what
// makes step 48 the same number as step 0 rather than almost the same — and
// "almost" is a pixel at the seam.
export function loopStep(step) {
  return ((step % LOOP) + LOOP) % LOOP;
}

export function useParams(params) { P = params; }

export function usePointer(pointer) { POINTER = pointer; }

// The model's own dimensions, and where it sits on the stage. Redone whenever
// the stage changes size or a model knob is latched, and never per step.
function shape() {
  GROUND_R = Math.max(6, Math.round(20 * S));
  PLINTH_R = Math.max(5, Math.round(19 * S));
  PLINTH_H = Math.max(2, Math.round(5 * S));
  WALL_OUT = Math.max(4, Math.round(11 * S));
  // the wall is quoted by its thickness rather than by its bore, because at the
  // smallest stage a bore rounded on its own leaves a wall one voxel thick and
  // the broken crest stops reading as masonry
  WALL_IN = Math.max(2, WALL_OUT - Math.max(2, Math.round(3 * S)));
  TOWER_H = Math.max(6, Math.round(LATCHED.tower * S));
  TOP_Z = PLINTH_H + TOWER_H;
  MERLON = Math.max(1, Math.round(2 * S));
  DOOR_W = Math.max(2, Math.round(3 * S));
  DOOR_H = Math.max(4, Math.round(9 * S));
  STAIR_H = Math.max(3, Math.round(TOWER_H * 0.6));
  JOIST_Z = Math.max(2, Math.round(TOWER_H * 0.55));

  ORIGIN_X = Math.round(VIEW_W / 2);
  // The highest thing drawn is the far side of the crest and the lowest is the
  // near rim of the ground disc, so the model is centred between those two
  // rather than on the tower's foot — which would hang the crest off the top.
  var above = PX_Z * (TOP_Z + MERLON) + PX_YY * WALL_OUT;
  var below = PX_YY * GROUND_R;
  ORIGIN_Y = Math.round((VIEW_H + above - below) / 2);
}

export function setStage(width, height) {
  VIEW_W = width;
  VIEW_H = height;
  S = Math.min(width / 160, height / 128);
  shape();
}

// Called at every reset and at every loop boundary, and nowhere else.
export function latchWorld() {
  LOOP = Math.max(6, Math.round(P.orbitSteps));
  LATCHED.tower = clamp(P.towerHeight, 16, 34);
  RUIN = clamp(P.ruin, 0, 1);
  RUBBLE = clamp(P.rubble, 0, 1);
  shape();
}

// What the drawing path watches to know the tower has to be built again. It is
// the latched shape and the stage size and nothing else: the lamp is not in it,
// because the lamp is the only thing in this animation that moves and rebuilding
// the model for it would be rebuilding it sixty times a second.
export function shapeStamp() {
  return VIEW_W + "x" + VIEW_H + "|" + TOWER_H + "|" + RUIN + "|" + RUBBLE;
}

"use strict";

// The lane to the right, going the same way — and from behind, a car in it is
// nothing but two red points and the line they left.
//
// This is approach.js seen from the other end, and it is a separate module for
// one reason: everything about a car in front is the opposite of a car coming
// the other way. It shows its tail lamps rather than its headlamps, so it is
// red rather than white and it is dim rather than the brightest thing on the
// stage. It closes slowly rather than quickly, so its exposure is short in
// metres however long the shutter is. And it throws no pool: a tail lamp lights
// the road behind the car it is on, and the road behind a car in front of the
// camera is the road the camera is already looking at, lit by the hero's own
// lamps. Giving it one put a red stain on the tarmac with nothing casting it.
//
// The lattice slides at three quarters of the camera's speed, which is one
// spacing less than the scroll and therefore three of its own cells to a lap.
// What that says about the world is that the lane to the right is doing a
// quarter of what the hero is doing — slower than a motorway lane really runs,
// and the honest reason is arithmetic rather than observation: the cell count
// has to come out whole, the scroll is four spacings a lap, and one, two and
// three are the only counts left. Three is the one that puts enough cars on the
// road to read as a lane without the same car arriving twice a second.

import { VIEW_W, S, HORIZON, loopStep } from "./state.js";
import { C } from "./palette.js";
import { clamp, hash01, bayer4 } from "./maths.js";
import { dOf, ppm, xOf, spacingMetres, stepMetres, loopCellsZ } from "./camera.js";
import { CARS } from "./approach.js";

// The middle of the right-hand lane of the hero's own carriageway. At this
// offset a car leaves the right edge of the frame at about five and three
// quarter metres, and passes the hero's own depth at column 153 while the hero
// stands across columns 110 to 129 — so the two never occupy the same pixels
// and nothing has to be sorted between them.
var LANE_U = 3.6;

// One spacing under the scroll. The sign is the whole difference between this
// module and approach.js: over is added to the scroll there and taken off it
// here, and the cell count follows it either way.
var OVER = -1;

var SEED = 139;

// Where this lattice is pinned, and the depths worth drawing between. The near
// cut is closer than the oncoming one because a car in this lane leaves the
// frame sideways rather than passing the camera; the far cut is nearer because
// a tail lamp is a fifth of a headlamp and two hundred and twenty metres is
// where the pair stops being visible at all rather than where it stops being a
// pair.
var ANCHOR = 30;
var NEAR = 5;
var FAR = 220;

// The lamps on it: three quarters of a metre up, and the same track the
// oncoming cars have, because it is the same width of car.
var TAIL_UP = 0.75;
var TRACK = 0.75;

// How much of the density knob this lane gets. A third, rounded — so the lane
// fills as the knob comes up and empties when it goes to zero, and at the
// declared setting two of the three cells are occupied.
var SHARE = 1 / 3;

function speed() { return stepMetres() * (1 + OVER / 4); }

function cellCount() { return Math.max(1, loopCellsZ(spacingMetres()) + OVER); }

// Which cells of the lattice have a car in them. With only three cells to a lap
// a threshold on the hash is too coarse a test — a seed that happened to put
// all three under it would fill the lane and one that put none would empty it —
// so the cells are ranked against each other and the first few are taken, which
// is the same trick neon.js uses to decide which housings are lit.
function taken(cell, cells, wanted) {
  var rank = 0;
  var j;
  for (j = 0; j < cells; j++) {
    if (hash01(j, 1, SEED) < hash01(cell, 1, SEED)) rank += 1;
  }
  return rank < wanted;
}

export function leading(step) {
  var turn = loopStep(step);
  var spacing = spacingMetres();
  var count = Math.ceil(FAR / spacing) + 2;
  var cells = cellCount();
  var wanted = clamp(Math.round(CARS * SHARE), 0, cells);
  var v = speed();
  var drift = ((ANCHOR - v * turn) % spacing + spacing) % spacing;
  var base = Math.floor((v * turn - ANCHOR) / spacing);
  var list = [];
  var j, cell, z;
  for (j = 0; j < count; j++) {
    cell = ((base + j) % cells + cells) % cells;
    if (!taken(cell, cells, wanted)) continue;
    z = drift + j * spacing;
    if (z < NEAR || z > FAR) continue;
    list.push({
      // half a lane of wander, so a lane of them is not a rail
      u: LANE_U + (hash01(cell, 7, SEED) - 0.5) * 1.8,
      z: z,
      v: v,
      cell: cell
    });
  }
  return list;
}

export function tailsAt(car, z) {
  var d = dOf(z);
  var m = ppm(d);
  var y = HORIZON + d - TAIL_UP * m;
  return [
    { x: xOf(car.u - TRACK, d), y: y, m: m },
    { x: xOf(car.u + TRACK, d), y: y, m: m }
  ];
}

function inFrame(l) { return l.x >= -2 && l.x < VIEW_W + 2; }

export function onLead(step) {
  var cars = leading(step);
  var n = 0, i, lamps;
  for (i = 0; i < cars.length; i++) {
    lamps = tailsAt(cars[i], cars[i].z);
    if (inFrame(lamps[0]) || inFrame(lamps[1])) n += 1;
  }
  return n;
}

// The red around each lamp, and it is small. A tail lamp is a lens the size of
// a hand seen from behind, not a beam pointed at the camera, so it gets the
// core and no skirt — the two things in this picture with a skirt on them are
// the street lamps and the headlamps coming the other way, which are the two
// that are actually throwing light at the lens.
export function leadBlooms(cars) {
  var out = [];
  var i, k, lamps, l;
  for (i = 0; i < cars.length; i++) {
    lamps = tailsAt(cars[i], cars[i].z);
    for (k = 0; k < lamps.length; k++) {
      l = lamps[k];
      if (!inFrame(l)) continue;
      out.push({
        x: l.x,
        y: l.y,
        span: clamp(0.4 * l.m, 1 * S, 2.5 * S),
        gain: 0.22,
        red: true
      });
    }
  }
  return out;
}

// The lamps and their exposure, straight to the frame. Same construction as the
// oncoming trail and the same reason for it — the streak is the same geometry
// evaluated at earlier depths — but it runs in the fainter of the two reds and
// it is short, because at three quarters of a spacing a step the car has barely
// moved relative to the camera while the shutter was open.
export function paintLead(put, cars, exposure) {
  var steps = Math.round(clamp(exposure, 0, 24));
  var i, k, lamps, l, z, wide, dx, dy;
  for (i = 0; i < cars.length; i++) {
    for (k = steps; k >= 1; k--) {
      z = cars[i].z + k * cars[i].v;
      if (z > FAR) continue;
      lamps = tailsAt(cars[i], z);
      for (l = 0; l < lamps.length; l++) {
        if (!inFrame(lamps[l])) continue;
        if (bayer4(lamps[l].x, lamps[l].y) > 1 - k / (steps + 1)) continue;
        put(lamps[l].x, lamps[l].y, C.tailFaint);
      }
    }
    lamps = tailsAt(cars[i], cars[i].z);
    for (l = 0; l < lamps.length; l++) {
      if (!inFrame(lamps[l])) continue;
      wide = clamp(Math.round(0.18 * lamps[l].m), 1, 3);
      for (dy = 0; dy < wide; dy++) {
        for (dx = 0; dx < wide; dx++) put(lamps[l].x + dx, lamps[l].y + dy, C.tail);
      }
    }
  }
}

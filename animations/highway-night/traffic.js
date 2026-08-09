"use strict";

// The other carriageway: two rows of small cars going the other way, and the
// red they drag behind them.
//
// They are never detailed. At this size a car eighty pixels away is a shape
// four pixels tall, and the honest thing to draw is a shape four pixels tall
// with a light on the back of it — which is also what the plate the scene was
// measured against shows, because a long exposure turns the far carriageway
// into a red line and keeps nothing of the cars that drew it.
//
// The lattice is this module's own rather than the one in world.js, because
// these cars do not travel at the scroll speed: they travel at the scroll plus
// their own, which puts them on a lattice of their own length. Their speeds
// are whole quarters of the scroll speed for one reason — a row must cover a
// whole number of its own spacings in one loop, or the row would not come back
// onto itself and the seam would show as a car appearing out of nothing.

import {
  VIEW_W, S, Y_FAR, Y_MEDIAN, SPACING, SPEED, LOOP, loopStep, CARS
} from "./state.js";
import { TRAFFIC } from "./palette.js";
import { hash01 } from "./maths.js";

// Three quarters and five quarters over the scroll speed. Over a loop the
// scroll covers four spacings, so these two cover seven and nine — both whole,
// both odd, and different enough that the two rows never pair up.
var ROWS = [
  { over: 3, lane: 0.10, seed: 61 },
  { over: 5, lane: 0.55, seed: 83 }
];

// Where this lattice is pinned. Different from the lamp lattice's anchor, so a
// car is never launched from directly under a lamp on the first step.
var ANCHOR = 20;

function rowSpeed(row) { return SPEED * (1 + row.over / 4); }

// How many cells of this row go past in one loop — four for the scroll plus
// the row's own. Every hash below is taken on the cell index modulo this, so
// the car arriving at the right edge is the car that has just left on the
// left, carrying the same length and the same lane.
function rowCells(row) { return 4 + row.over; }

export function oncoming(step) {
  // the same reduction the lamp lattice makes, and for the same reason
  var turn = loopStep(step);
  var band = Math.max(3, Y_MEDIAN - Y_FAR);
  var spacing = SPACING;
  var count = Math.ceil(VIEW_W / spacing) + 2;
  var anchor = ANCHOR * S;
  // how likely a slot is to be carrying a car, set so that the number on the
  // knob is the number in shot: two rows, one slot per spacing, and as many
  // spacings across the stage as the spacing knob leaves room for
  var threshold = spacing * CARS / (2 * VIEW_W);
  // A list of its own on every call. Holding one array between calls would
  // save an allocation of a dozen objects a step and cost the guarantee that
  // two callers a step apart cannot empty each other's cars — and the counting
  // in world.js and the drawing in render/cpu.js are exactly two such callers.
  var list = [];
  var r, row, speed, cells, drift, base, j, cell, x, w, h;
  for (r = 0; r < ROWS.length; r++) {
    row = ROWS[r];
    speed = rowSpeed(row);
    cells = rowCells(row);
    drift = ((anchor - speed * turn) % spacing + spacing) % spacing;
    base = Math.floor((speed * turn - anchor) / spacing);
    for (j = 0; j < count; j++) {
      cell = ((base + j) % cells + cells) % cells;
      if (hash01(cell, r + 1, row.seed) >= threshold) continue;
      w = Math.max(5, Math.round((7 + hash01(cell, 7, row.seed) * 5) * S));
      h = Math.max(3, Math.round((3 + hash01(cell, 9, row.seed) * 2) * S));
      x = drift + j * spacing - spacing;
      list.push({
        x: x,
        y: Y_FAR + band * row.lane,
        w: w,
        h: h,
        row: r,
        cell: cell
      });
    }
  }
  return list;
}

// What the stats strip counts: cars actually standing on the stage, not the
// number the knob asked for. The knob sets how thick the traffic is; how much
// of it is in shot at any moment is the picture's business.
export function onStage(step) {
  var cars = oncoming(step);
  var n = 0, i;
  for (i = 0; i < cars.length; i++) {
    if (cars[i].x + cars[i].w > 0 && cars[i].x < VIEW_W) n += 1;
  }
  return n;
}

export function paintTraffic(slab, cars) {
  var i, c;
  for (i = 0; i < cars.length; i++) {
    c = cars[i];
    // the body, and a roof set two pixels in at each end. Two rectangles is
    // the whole car, and the second one is what stops it reading as a brick.
    slab(TRAFFIC, c.x, c.y, c.w, c.h);
    slab(TRAFFIC, c.x + Math.max(1, Math.round(2 * S)), c.y - Math.max(1, Math.round(S)),
      c.w - Math.max(2, Math.round(4 * S)), Math.max(1, Math.round(S)));
  }
}

// Where the tail lamp of a car sits: on the back of it, which is the end
// facing the way it came from. These cars are going left, so their backs are
// on the right and their red is dragged out to the right behind them.
export function tailOf(c) {
  return { x: c.x + c.w, y: c.y + c.h * 0.5 };
}

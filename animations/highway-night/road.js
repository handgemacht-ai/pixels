"use strict";

// The road itself: five flat bands, the furniture standing on them, and the
// paint. Nothing here holds any state — every train is the same lattice from
// world.js read at a different spacing, and every speck of grit is a hash of
// the cell it belongs to rather than a number somebody rolled once and kept.
//
// The bands themselves never move. What moves is everything standing on them,
// which is the whole trick of a side elevation: the picture is a fixed
// horizontal ladder with trains sliding along it, and depth is which rung a
// thing is on.
//
// Every train derives its spacing from the lamp spacing by halving — a quarter
// for the dashes and the grit, an eighth for the rail posts and the speckle.
// That is why the lamp-spacing knob steps by eight: at the width the scene is
// written for, every setting of it leaves all four derived lattices a whole
// number of pixels. At the other resolutions the spacing is scaled and the
// derived ones come out fractional, which costs nothing, because a lattice is
// carried as a float until put() rounds it — the eight is there so that the
// picture the animation was designed at is the exact one.

import {
  VIEW_W, VIEW_H, S, Y_RAIL, Y_FAR, Y_MEDIAN, Y_NEAR, Y_SHOULDER, SPACING
} from "./state.js";
import { ROAD, LANE, EDGE, RAIL, FARROAD } from "./palette.js";
import { hash01 } from "./maths.js";
import { latticeX, latticeCount, latticeCell, loopCells } from "./world.js";

var GRIT_SEED = 29;
var DUST_SEED = 53;

function px(v) { return Math.max(1, Math.round(v * S)); }

// The ground, back to front. Both carriageways are ROAD and everything between
// and beside them is EDGE, which is the same asphalt one band darker — a
// median and a shoulder are made of the same stuff as the road and simply do
// not have a lamp aimed at them.
export function paintGround(slab) {
  slab(EDGE, 0, Y_RAIL, VIEW_W, Y_FAR - Y_RAIL);
  // the oncoming carriageway is the same asphalt one band further off: the
  // lamps reach it, but they reach it less well, and saying so with a ramp
  // rather than with a colour is what separates the two carriageways without
  // spending a forty-first colour on the separation
  slab(FARROAD, 0, Y_FAR, VIEW_W, Y_MEDIAN - Y_FAR);
  slab(EDGE, 0, Y_MEDIAN, VIEW_W, Y_NEAR - Y_MEDIAN);
  slab(ROAD, 0, Y_NEAR, VIEW_W, Y_SHOULDER - Y_NEAR);
  slab(EDGE, 0, Y_SHOULDER, VIEW_W, VIEW_H - Y_SHOULDER);
}

// The guard rail: one continuous beam with posts under it, on the finest of
// the four lattices. At the defaults that is a post every six pixels and two
// pixels of post, so the rail reads as a picket rather than as a fence with
// countable planks — which is what a rail does at speed.
export function paintRail(slab, step) {
  var spacing = SPACING / 8;
  var count = latticeCount(spacing);
  var beam = px(1);
  var wide = Math.max(2, Math.round(2 * S));
  var j;
  slab(RAIL, 0, Y_RAIL, VIEW_W, beam);
  for (j = 0; j < count; j++) {
    slab(RAIL, latticeX(j, spacing, step) - spacing, Y_RAIL + beam, wide, Y_FAR - Y_RAIL - beam);
  }
}

// The median: a low barrier along its far edge with grit scattered in front of
// it. The grit is ROAD on an EDGE band, so it is one band lighter than what it
// sits on and comes up as a sparkle whenever a lamp is overhead — which is the
// cheapest way to say a surface is loose rather than laid.
export function paintMedian(slab, step) {
  var top = Math.max(1, Math.round(2 * S));
  var band = Math.max(1, Y_NEAR - Y_MEDIAN - top);
  var spacing = SPACING / 4;
  var count = latticeCount(spacing);
  var one = px(1);
  var j, cell, x, y;
  slab(RAIL, 0, Y_MEDIAN, VIEW_W, top);
  for (j = 0; j < count; j++) {
    cell = latticeCell(j, spacing, step);
    x = latticeX(j, spacing, step) - spacing + hash01(cell, 1, GRIT_SEED) * spacing;
    y = Y_MEDIAN + top + hash01(cell, 2, GRIT_SEED) * band;
    slab(ROAD, x, y, one, one);
  }
}

// The lane paint, on the quarter lattice, half a cell of paint to half a cell
// of gap. It sits at the top of the near carriageway rather than down its
// middle because in an oblique view the centre line is the far line: put it
// halfway down the band and the hero car drives through it.
export function paintDashes(slab, step) {
  var spacing = SPACING / 4;
  var count = latticeCount(spacing);
  var len = spacing * 0.5;
  var thick = Math.max(1, Math.round(2 * S));
  var y = Y_NEAR + px(1);
  var j;
  for (j = 0; j < count; j++) {
    slab(LANE, latticeX(j, spacing, step) - spacing, y, len, thick);
  }
}

// The near edge line, unbroken, and the only piece of road drawn after the car
// — because it is the line between the visitor and the car rather than the one
// behind it, and a solid line in front is what tells you the car is on the
// road and not floating over it.
export function paintEdgeLine(slab) {
  slab(LANE, 0, Y_SHOULDER - px(1), VIEW_W, px(1));
}

// The shoulder, and the one thing on the stage drawn thickly enough to smear:
// two specks per cell of the eighth lattice, which is four times the grit on
// the median and sixteen times the lamps. Everything on the road travels at the
// one scroll speed, so nothing here is faster than anything else — what reads
// as speed is density, four pixels of travel a step against specks a few pixels
// apart. It is put nearest the eye because that is where the eye expects to be
// told how fast it is going.
export function paintSpeckle(slab, step) {
  var spacing = SPACING / 8;
  var count = latticeCount(spacing);
  var cells = loopCells(spacing);
  var band = Math.max(1, VIEW_H - Y_SHOULDER - 1);
  var one = px(1);
  var j, k, cell, x, y;
  for (j = 0; j < count; j++) {
    cell = latticeCell(j, spacing, step) % cells;
    for (k = 0; k < 2; k++) {
      x = latticeX(j, spacing, step) - spacing + hash01(cell, k + 1, DUST_SEED) * spacing;
      y = Y_SHOULDER + 1 + hash01(cell, k + 3, DUST_SEED) * band;
      // grit or gravel, never rail: a speck of guard-rail material on the
      // shoulder stays ink until a lamp is almost on top of it, so two thirds
      // of the speckle used to be invisible and the shoulder read as bare
      slab(hash01(cell, k + 5, DUST_SEED) > 0.6 ? ROAD : EDGE, x, y, one, one);
    }
  }
}

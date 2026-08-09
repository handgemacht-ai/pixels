"use strict";

// One lamp: a mast standing on the median, an arm reaching out over the road,
// and a cobra head hanging off the end of it.
//
// This is the one shape in the animation with no reference behind it. There is
// no CC0 photograph of a mast-arm lamp in the set and none was found, so the
// silhouette is invented from published proportions — a mast about ten metres
// tall carrying an arm about a quarter of that — and drawn under the same 2-1
// stepped chamfer the tower tops and the car roof use. Three unrelated shapes
// built with one rule is what keeps a scene assembled out of boxes from
// reading as a scene assembled out of boxes.
//
// The arm reaches in the direction the car is facing, so the head hangs over
// the road ahead of it rather than behind, and the mast is never the thing
// standing between the visitor and the lit pool.

import { S, Y_MEDIAN, SPACING, P } from "./state.js";
import { POLE } from "./palette.js";
import { latticeX, latticeCount, latticeCell } from "./world.js";

export function poleCount() { return latticeCount(SPACING); }

// Where the j-th lamp of the train stands at this step, and everything hung
// off that: the head, and the point the light is cast from. All of it stays
// fractional — only the slab that draws it rounds.
export function poleAt(j, step) {
  var unit = Math.max(1, Math.round(S));
  var base = Y_MEDIAN + unit;
  var height = Math.max(8 * unit, P.poleHeight * S);
  var head = base - height;
  var arm = Math.max(3 * unit, Math.round(height * 0.28));
  var mast = Math.max(2, Math.round(2 * S));
  return {
    cell: latticeCell(j, SPACING, step),
    unit: unit,
    x: latticeX(j, SPACING, step) - SPACING,
    base: base,
    head: head,
    arm: arm,
    mast: mast,
    // the filament, a little under the head, which is where the light is cast
    // from and where the two hot pixels of the emitter pass are put
    lampX: latticeX(j, SPACING, step) - SPACING + arm + mast * 0.5,
    lampY: head + 3 * unit
  };
}

// Four rectangles. The chamfer is the first of them: the top of the arm starts
// two pixels in from the mast and runs one pixel short of the head, so the
// junction steps 2-1 instead of meeting at a corner.
export function paintPole(slab, p) {
  var u = p.unit;
  slab(POLE, p.x + 2 * u, p.head, p.arm - u, u);
  slab(POLE, p.x, p.head + u, p.arm + p.mast + u, u);
  slab(POLE, p.x, p.head + 2 * u, p.mast, p.base - p.head - 2 * u);
  slab(POLE, p.x + p.arm, p.head + 2 * u, p.mast + u, u);
}

// Which lamp of the train a click landed on, or -1 for none. A lamp answers
// only for its own silhouette, widened by a pixel: a two-pixel mast is a hard
// thing to hit, and nothing else is standing where it stands to be hit by
// mistake. Why the question is asked at all, rather than left to the bands, is
// in world.js, where the strike is read.
export function poleHit(x, y, step) {
  var count = poleCount();
  var pad = Math.max(1, Math.round(S));
  var j, p;
  for (j = 0; j < count; j++) {
    p = poleAt(j, step);
    if (y < p.head - pad || y > p.base) continue;
    if (x < p.x - pad || x > p.x + p.arm + p.mast + pad) continue;
    return p.cell;
  }
  return -1;
}

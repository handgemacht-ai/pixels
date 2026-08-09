"use strict";

// The lamps, marching away from the eye: a mast on each shoulder, an arm
// reaching in over its own carriageway, and a cobra head on the end of it.
//
// The elevation drew one lamp and slid copies of it sideways, all the same
// size. Here every copy is a different size, because a lamp thirty metres away
// and a lamp three hundred metres away are the same nine metres of steel seen
// from two distances — so the train is a lattice in z and the projection does
// the rest. What comes out of that is the thing the picture is for: the first
// four spacings resolve as separate masts, and past them the row gaps fall
// under a pixel and the line closes into a smear at the vanishing point,
// exactly as it does on the plate.
//
// The masts are never staggered. Opposite each other they read as a rhythm the
// road is passing through; offset they read as two unrelated lines of poles,
// and at this resolution the eye cannot tell which of the two it is looking
// down.

import { VIEW_W, S, HORIZON, P } from "./state.js";
import { POLE } from "./palette.js";
import { clamp } from "./maths.js";
import { STRUCK_LAMP, STRUCK_LINE, WAKE_STEPS } from "./world.js";
import {
  dOf, ppm, xOf, latticeZ, latticeCellZ, latticeCountZ, spacingMetres
} from "./camera.js";
import { U } from "./carriageway.js";

// How far down the road masts are drawn as masts. Two hundred and fifty metres
// is between seven and eight spacings at the declared settings, by which point
// a mast is three pixels of dark against the horizon; beyond it the lamps are
// carried by the smear in groundlight.js rather than by geometry, because a
// train of point sources under a pixel apart is aliasing rather than a road.
var DRAWN_METRES = 250;

// The near limit. A mast this close has swung off the side of the frame
// anyway, and asking the projection for a row two thousand pixels down the
// screen is a waste of the arithmetic.
var NEAR_METRES = 4;

// The strike, running down the line. How long one lamp's flare lasts is fixed;
// the gap between one lamp taking it up and the next is not, because how many
// lamps there are depends on the spacing knob — so the ripple is stretched to
// whatever the line is and always arrives at the far end before the transient
// that started it has run out.
var RIPPLE_LIFE = 6;

// Which side of the road a mast is on, kept in the cell number so that a
// strike on one of a facing pair does not light the other. Four cells to a
// loop, two sides, eight in all.
var SIDES = [
  { mast: U.leftMast, head: U.leftHead },
  { mast: U.rightMast, head: U.rightHead }
];

export function mastHeight() { return clamp(P.mastHeight, 3, 20); }

// Every mast in shot, far end first — which is also back to front, so drawing
// them in order is drawing them in depth.
export function masts(step) {
  var spacing = spacingMetres();
  var count = latticeCountZ(spacing, DRAWN_METRES);
  var height = mastHeight();
  var list = [];
  var j, s, side, z, d, m, cell, mastX, headX, baseY, headY;
  for (j = count - 1; j >= 0; j--) {
    z = latticeZ(j, spacing, step);
    if (z < NEAR_METRES || z > DRAWN_METRES) continue;
    d = dOf(z);
    if (d < 0.6) continue;
    m = ppm(d);
    cell = latticeCellZ(j, spacing, step);
    baseY = HORIZON + d;
    headY = baseY - height * m;
    for (s = 0; s < SIDES.length; s++) {
      side = SIDES[s];
      mastX = xOf(side.mast, d);
      headX = xOf(side.head, d);
      // near the eye a mast is further to the side than the frame is wide, and
      // a mast that has swung out of frame must not be drawn as a stripe down
      // the whole picture
      if (Math.max(mastX, headX) < -2 || Math.min(mastX, headX) > VIEW_W + 2) continue;
      list.push({
        cell: cell * SIDES.length + s,
        rank: j,
        z: z,
        d: d,
        head: side.head,
        height: height,
        x: mastX,
        headX: headX,
        baseY: baseY,
        headY: headY,
        wide: clamp(Math.round(0.28 * m), 1, 3),
        thick: clamp(Math.round(0.24 * m), 1, 2),
        // the filament, half a metre under the arm: where the light is cast
        // from and where the two hot pixels of the emitter pass are put
        lampX: headX,
        lampY: headY + Math.max(1, 0.5 * m)
      });
    }
  }
  return list;
}

// Three rectangles: the mast, the arm across to the head, and the head itself.
// There is no chamfer on any of them and there is nowhere to put one — the
// nearest mast in shot is three pixels wide and the furthest is one.
export function paintMast(slab, p) {
  var reach = Math.abs(p.headX - p.x) + p.wide;
  slab(POLE, p.x, p.headY, p.wide, p.baseY - p.headY + 1);
  slab(POLE, Math.min(p.x, p.headX), p.headY, reach, p.thick);
  slab(POLE, p.headX, p.headY, p.wide, p.thick * 2);
}

// Which mast a click landed on, or -1 for none. Each answers for the two
// rectangles it actually drew and nothing else: the road under an arm is road,
// and a strike there is a strike on the road. The list is walked from the near
// end, so where two masts overlap on the screen the one in front answers.
export function mastHit(x, y, step) {
  var list = masts(step);
  var pad = Math.max(1, Math.round(S));
  var i, p, left, right;
  for (i = list.length - 1; i >= 0; i--) {
    p = list[i];
    if (x >= p.x - pad && x <= p.x + p.wide + pad &&
        y >= p.headY - pad && y <= p.baseY + pad) return p.cell;
    left = Math.min(p.x, p.headX) - pad;
    right = Math.max(p.x, p.headX) + p.wide + pad;
    if (x >= left && x <= right &&
        y >= p.headY - pad && y <= p.headY + p.thick + pad) return p.cell;
  }
  return -1;
}

// How much extra a lamp is giving right now, 0 to 1. A single strike flares the
// lamp it named; a strike with nowhere in particular to land runs down the
// whole line from the horizon toward the eye, which is what a line of lamps
// does when the circuit closes at the far end — and is the one place in this
// picture where something happens in depth rather than across the screen.
export function mastFlare(state, p, pairs) {
  if (state.kind === STRUCK_LAMP) return p.cell === state.struck ? state.wake : 0;
  if (state.kind === STRUCK_LINE) {
    var gap = WAKE_STEPS / (pairs + 2);
    var since = (1 - state.wake) * WAKE_STEPS - gap * (pairs - 1 - p.rank);
    if (since < 0 || since >= RIPPLE_LIFE) return 0;
    return 1 - since / RIPPLE_LIFE;
  }
  return 0;
}

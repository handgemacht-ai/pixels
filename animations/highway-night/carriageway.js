"use strict";

// The road, seen down its own length: a corridor of flat bands measured
// sideways in metres and painted one row at a time.
//
// The elevation had a ladder of six horizontal bands and put a thing far away
// by drawing it in a high one. Here there is no ladder and there are no bands
// across the screen at all — there is one cross-section, quoted once in metres
// off the camera axis, and every row of the stage is that cross-section drawn
// at its own scale. A row near the horizon is the same road as a row near the
// eye, five pixels wide instead of two hundred.
//
// Which is why the whole road is a single sweep down the rows. Nothing here
// needs to know what is in front of what: a nearer row is a lower row, so
// painting from the horizon down is painting back to front, and the median
// barrier — the one thing standing up out of the plane — comes out solid
// simply because each row paints its own slice of it over the row before.
//
// The cross-section is measured off the plate. The camera sits in the lane
// beside the median, which is why nothing in it is symmetrical: there is a
// carriageway and a half to the left of the axis and half a one to the right.

import { VIEW_W, VIEW_H, HORIZON } from "./state.js";
import { ROAD, LANE, EDGE, RAIL, FARROAD } from "./palette.js";
import { bayer4 } from "./maths.js";
import { zOf, xOf, ppm, travelled, spacingMetres } from "./camera.js";

// The corridor, in metres from the camera axis. Negative is to the left, where
// the median and the oncoming carriageway are. Lane widths are 3.6 metres and
// the shoulders 2.5, which is what a motorway is; where the plate and the
// standard disagreed the plate won, because the picture has to match it.
export var U = {
  farVerge: -15.1,    // where the far shoulder gives out and the verge starts
  farOut: -12.6,      // the oncoming carriageway, outer edge
  farMid: -9.0,       // its lane divider, which is dashed
  farIn: -5.4,        // its inner edge, against the median
  barrierOut: -4.0,   // the concrete barrier down the middle of the median
  barrierIn: -3.2,
  heroIn: -1.8,       // the hero carriageway, inner edge
  heroMid: 1.8,       // its lane divider, also dashed
  heroOut: 5.4,       // its outer edge, against the shoulder
  verge: 7.9,         // where the near shoulder gives out
  leftMast: -14.6,    // the masts stand on the shoulders, just inside the verge
  leftHead: -12.2,    // and reach out over the middle of their own carriageway
  rightMast: 7.4,
  rightHead: 5.0
};

// How tall the median barrier stands. Nine tenths of a metre is a New Jersey
// profile, and at this scale it is the difference between two carriageways and
// one very wide one: it cuts the oncoming cars off at the wheels near the eye
// and leaves them whole in the distance, which is the only thing in the
// picture that says the two carriageways are at the same height.
var BARRIER_H = 0.9;

// And how tall the guard rail on the near shoulder stands. Eight tenths of a
// metre is a steel beam rather than a concrete profile, and it runs where the
// masts do — from the outer edge of the shoulder to the verge — because that is
// where a rail goes and because the two lines then leave the road held between
// them. Without it the near side of the picture simply stopped: the shoulder
// ran out into the same dark as the sky and the eye had nothing on the right to
// follow to the vanishing point, which is half of why the frame read as empty.
var SHOULDER_H = 0.8;

// Half the width of a painted line, in metres. Road markings are about a fifth
// of a metre across, which past the first few rows is less than a pixel — so
// paint is the one thing here drawn with a floor under its width. A line that
// dropped out where it got thin would break exactly where the eye is using it
// most, which is at the vanishing point.
var PAINT = 0.1;

// The lane dashes, on a quarter of the lamp spacing: sixteen of them to a loop,
// so the pattern comes back onto itself at the seam like everything else. How
// much of a cycle is mark rather than gap is the one number here that is
// chosen for the look — enough that a dash is still a dash four rows from the
// horizon.
var DASH_MARK = 0.45;

// How many depths a row is sampled at before it is decided how much of it is
// painted. A row near the horizon covers tens of metres of road, so asking
// whether its midpoint happens to land on a dash gives a line that flickers as
// the lattice slides under it. Asking four times across the row's own depth
// and carrying the answer on the dither gives a dash that fades out as it
// recedes, which is what a real one does.
var SAMPLES = 4;

function span(slab, id, u0, u1, d, y, least) {
  var a = xOf(u0, d);
  var b = xOf(u1, d);
  var w = b - a;
  slab(id, a, y, w > least ? w : least, 1);
}

// One row's worth of a dashed line, at whatever fraction of the row is mark.
function dashes(slab, u, d, y, cycle, scroll) {
  var mark = cycle * DASH_MARK;
  var zTop = zOf(d - 0.5);
  var zBot = zOf(d + 0.5);
  var hits = 0;
  var s, z, phase, cover, a, b, x;
  for (s = 0; s < SAMPLES; s++) {
    z = zBot + (zTop - zBot) * (s + 0.5) / SAMPLES;
    phase = ((z + scroll) % cycle + cycle) % cycle;
    if (phase < mark) hits += 1;
  }
  cover = hits / SAMPLES;
  if (cover <= 0) return;
  a = Math.round(xOf(u - PAINT, d));
  b = Math.round(xOf(u + PAINT, d));
  if (b <= a) b = a + 1;
  for (x = a; x < b; x++) {
    if (cover > bayer4(x, y)) slab(LANE, x, y, 1, 1);
  }
}

// The whole corridor, from the horizon to the bottom of the frame.
//
// Everything below the horizon is ground before it is anything else. The verge
// beyond either shoulder is the same dark asphalt-coloured nothing as the
// median, and saying so with one fill is what stops a lamp's pool ending in a
// straight vertical edge where the measured cross-section runs out.
export function paintCarriageway(slab, step) {
  var cycle = spacingMetres() / 4;
  var scroll = travelled(step);
  var y, d, m, top, a, b;
  for (y = HORIZON + 1; y < VIEW_H; y++) {
    d = y - HORIZON;
    m = ppm(d);

    slab(EDGE, 0, y, VIEW_W, 1);
    span(slab, FARROAD, U.farOut, U.farIn, d, y, 0);
    span(slab, ROAD, U.heroIn, U.heroOut, d, y, 0);

    // the two dashed lane dividers, then the four solid edges over the top of
    // them. Within a few rows of the horizon all six land in the same two or
    // three pixels, and what has to survive there is the pair of lines that
    // says where the road goes: a dash is allowed to disappear into the
    // vanishing point, an edge line is what draws it.
    dashes(slab, U.farMid, d, y, cycle, scroll);
    dashes(slab, U.heroMid, d, y, cycle, scroll);
    span(slab, LANE, U.farOut - PAINT, U.farOut + PAINT, d, y, 1);
    span(slab, LANE, U.farIn - PAINT, U.farIn + PAINT, d, y, 1);
    span(slab, LANE, U.heroIn - PAINT, U.heroIn + PAINT, d, y, 1);
    span(slab, LANE, U.heroOut - PAINT, U.heroOut + PAINT, d, y, 1);

    // the barrier: this row's slice of a wall standing on the road plane, from
    // the row itself up to where its top edge has got to. The top edge is a
    // straight line out of the vanishing point — the wall is the same height
    // everywhere, so on the screen it grows by a fixed fraction of a row per
    // row — and stacking the slices is what makes it solid.
    top = y - BARRIER_H * m;
    a = Math.round(xOf(U.barrierOut, d));
    b = Math.round(xOf(U.barrierIn, d));
    if (b <= a) b = a + 1;
    slab(RAIL, a, top, b - a, y - top + 1);

    // the same wall again on the other side, and drawn the same way. It is
    // stacked after the median rather than with it because it is nearer the
    // camera in every row they share, and a row painting its own slice last is
    // what keeps that true without anybody sorting anything.
    top = y - SHOULDER_H * m;
    a = Math.round(xOf(U.rightMast, d));
    b = Math.round(xOf(U.verge, d));
    if (b <= a) b = a + 1;
    slab(RAIL, a, top, b - a, y - top + 1);
  }
}

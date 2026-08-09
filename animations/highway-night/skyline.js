"use strict";

// The city, which is the whole of the picture above the horizon and none of
// the motion. In the elevation two rows of towers stand on two different bases
// — the far row on the horizon, the near block six pixels lower and so six
// pixels closer — and the sign housings sit on the near block, dark, waiting to
// be lit.
//
// The shot down the road has no near block: there is no ground beside the
// visitor for one to stand on, only a corridor running away from them. What it
// has instead is three rows of towers all standing on the horizon and told
// apart by nothing but their colour, because that is what tells them apart at
// night — haze lightens what is far off rather than darkening it, so the
// furthest row is the palest and the nearest is nearly the ink behind it. Three
// rows is the fewest that reads as a city having a depth rather than as a
// silhouette with a second silhouette behind it. The signs stay bolted to the
// middle row, which is the one the whole picture was measured against.
//
// Which picture this is is one setting rather than an argument because two
// callers a frame apart ask for the same housings — the backdrop paints them
// dark and neon.js decides which of them are lit — and a disagreement between
// the two would light a sign that is not there.
//
// Nothing here scrolls. A side elevation has no parallax to spend: if the city
// slid past at any rate at all it would either race the road or lag it, and
// either way it would say the buildings are a fixed distance away, which is
// the one thing about a skyline that is not true. Standing still says
// "far enough away not to matter", which is what a skyline is for.
//
// The silhouette language is axis-aligned rectangles with a 2-1 stepped
// chamfer on the tops: two pixels in, then one, then straight down. It is the
// same chamfer as the lamp's mast arm and the car's roof, and using one rule
// for all three is what keeps a scene assembled out of boxes from reading as a
// scene assembled out of boxes.

import { VIEW_W, S, HORIZON, Y_RAIL } from "./state.js";
import { C, NEON } from "./palette.js";
import { hash01 } from "./maths.js";
import { SIGN_CELLS } from "./world.js";

var HAZE_SEED = 29;
var FAR_SEED = 17;
var BLOCK_SEED = 47;
var NEAR_SEED = 41;
var SIGN_SEED = 71;

// How far apart the window grid is spaced. Down the road the towers are the
// only thing in the upper half of the frame and their lit cells are most of
// what there is to look at, so they are put on every second pixel; across the
// road the skyline is a strip along the top behind a lit carriageway, and a
// window every third pixel is as much as that strip can carry without becoming
// the brightest thing in a picture it is the backdrop of.
var DEEP_PITCH = 2;
var SIDE_PITCH = 3;

// Which of the two pictures the city is being built for. Every stage builds a
// backdrop before it draws anything, and the backdrop says which — so nothing
// else has to.
var DEEP = false;

export function useSkyline(deep) { DEEP = !!deep; }

// The occasional tower that is not like the others, and where it is allowed to
// stand. With no near block in front of it the far row is the entire skyline,
// and a row of evenly middling boxes reads as a fence: something has to go up
// through it or the line has nowhere to look.
//
// Where that something stands is not a free choice. The road in this picture
// does not run up the middle — the vanishing point is about three fifths of
// the way across — and the plate puts its whole tower group to the left of
// that point, with a low, thin run of city to the right of it. Picked on a
// hash and nothing else the tallest tower lands wherever the hash falls, which
// on this seed was three quarters of the way across: the weight of the picture
// on the far side of the road from the one line the eye is meant to follow.
//
// So the row carries a shape as well as a hash. `at` is where the group stands
// as a fraction of the stage, `span` how far it reaches, `floor` how much of a
// tower is left standing out past it, and `tall` how deep inside the group a
// tower has to be before it may be a landmark at all. The elevation passes
// none of this and gets the row it always had, which is what keeps the two
// pictures' skylines the separate things they are.
var LANDMARK = {
  chance: 0.5, minH: 22, spanH: 14,
  at: 0.3, span: 0.32, floor: 0.24, tall: 0.765
};

// The two rows the shot down the road puts either side of that one. They carry
// shapes of their own rather than the same one offset, because a city at three
// depths is three different groups seen through each other and not one group
// drawn three times: the haze row spreads wide and low behind everything, and
// the near row is a tighter, taller cluster further to the left, which is where
// the plate puts the block that is actually close to the road.
var HAZE_GROUP = {
  chance: 0.30, minH: 15, spanH: 8,
  at: 0.34, span: 0.50, floor: 0.40, tall: 0.80
};

var BLOCK_GROUP = {
  chance: 0.25, minH: 18, spanH: 10,
  at: 0.22, span: 0.34, floor: 0.30, tall: 0.80
};

// How much tower a column is entitled to: all of it at the middle of the
// group, falling to `floor` out past it along a raised cosine, so the city
// slopes away from the group instead of ending at its edge.
function grouping(shape, centre) {
  var t = (centre / VIEW_W - shape.at) / shape.span;
  if (t <= -1 || t >= 1) return shape.floor;
  return shape.floor + (1 - shape.floor) * 0.5 * (1 + Math.cos(t * Math.PI));
}

// A row of towers, walked left to right. Widths and heights are hashed on the
// tower's index rather than on its position, because the row never moves and
// so has no seam to protect. Where a `shape` is offered the hash still decides
// what kind of tower this is; the shape decides how much of it there is.
function towers(base, seed, minW, spanW, minH, spanH, minGap, spanGap, shape) {
  var list = [];
  var x = -Math.round(6 * S);
  var i = 0;
  var w, weight, big, h;
  while (x < VIEW_W && i < 200) {
    w = Math.max(2, Math.round((minW + hash01(i, 1, seed) * spanW) * S));
    weight = shape ? grouping(shape, x + w / 2) : 1;
    // a landmark belongs to the group or it is not a landmark: out past it the
    // same hash fires at the same rate and is simply never asked
    big = !!shape && weight >= shape.tall && hash01(i, 4, seed) > 1 - shape.chance;
    h = big
      ? shape.minH + hash01(i, 2, seed) * shape.spanH
      : (minH + hash01(i, 2, seed) * spanH) * weight;
    h = Math.max(2, Math.round(h * S));
    list.push({ x: x, w: w, h: h, top: base - h });
    x += w + Math.max(1, Math.round((minGap + hash01(i, 3, seed) * spanGap) * S));
    i += 1;
  }
  return list;
}

// Behind the road: lighter than the near block, because distance at night is
// haze rather than shadow. Seen down the road it is the only skyline there is,
// so it runs lower and more varied — most of it well under the sky it stands
// in, with the occasional landmark going up through it.
export function farTowers() {
  if (DEEP) return towers(HORIZON, FAR_SEED, 6, 9, 7, 15, -2, 6, LANDMARK);
  return towers(HORIZON, FAR_SEED, 6, 9, 10, 26, -2, 6);
}

// Behind that again, and only down the road: narrow, closely packed and pale,
// which is what a city reads as once there is enough air in front of it.
function hazeTowers() {
  return towers(HORIZON, HAZE_SEED, 5, 7, 5, 9, 0, 5, HAZE_GROUP);
}

// In front of both, standing on the same horizon and darker than either. It is
// the row that gives the city a near edge, and it is deliberately gappier: a
// third row drawn as solid as the two behind it would close the skyline into a
// wall and take the depth back out again.
function blockTowers() {
  return towers(HORIZON, BLOCK_SEED, 7, 12, 5, 11, 3, 9, BLOCK_GROUP);
}

// Beside the road: taller on the screen and nearly black, which is the whole
// of what puts it in front.
export function nearBlocks() {
  return towers(Y_RAIL, NEAR_SEED, 10, 16, 12, 18, 1, 5);
}

// The height of a row of towers under every column of the stage, so a sign can
// be hung on the roof it belongs to rather than floating at a hashed height.
function topLine(list, base) {
  var line = new Int16Array(VIEW_W);
  var i, b, x, x1;
  for (i = 0; i < VIEW_W; i++) line[i] = base;
  for (i = 0; i < list.length; i++) {
    b = list[i];
    x1 = Math.min(VIEW_W - 1, b.x + b.w - 1);
    for (x = Math.max(0, b.x); x <= x1; x++) {
      if (b.top < line[x]) line[x] = b.top;
    }
  }
  return line;
}

export function nearTopLine() { return topLine(nearBlocks(), Y_RAIL); }

export function farTopLine() { return topLine(farTowers(), HORIZON); }

// Where the signs stand and how low they are allowed to hang: the near block
// in the elevation, the far towers in the shot down the road, and in both
// cases the ground that row of towers is standing on.
function signGround() {
  return DEEP
    ? { line: farTopLine(), floor: HORIZON }
    : { line: nearTopLine(), floor: Y_RAIL };
}

// The sign lattice: one housing per cell, always all of them, whatever the
// `signs` knob says. The housings are part of the backdrop, and the backdrop
// is only ever rebuilt when the stage changes size — so the knob decides how
// many of these are lit, never how many exist. A city has more signs than are
// working on any given night anyway.
export function housings() {
  var ground = signGround();
  var line = ground.line;
  var pitch = VIEW_W / SIGN_CELLS;
  var list = [];
  var cell, w, h, x, mid, top, roof, y;
  for (cell = 0; cell < SIGN_CELLS; cell++) {
    w = Math.max(3, Math.round((3 + Math.floor(hash01(cell, 1, SIGN_SEED) * 5)) * S));
    h = Math.max(2, Math.round((2 + Math.floor(hash01(cell, 2, SIGN_SEED) * 3)) * S));
    x = Math.round(cell * pitch + hash01(cell, 3, SIGN_SEED) * Math.max(0, pitch - w));
    mid = Math.max(0, Math.min(VIEW_W - 1, x + (w >> 1)));
    top = line[mid];
    // half of them stand on the roof and half are bolted to the face, which is
    // the difference between a sign that breaks the skyline and one that does
    // not — and the ones that break it are the ones worth a cross flare
    roof = hash01(cell, 4, SIGN_SEED) < 0.5;
    y = roof ? top - h : top + Math.max(1, Math.round(2 * S));
    if (y < 0) y = 0;
    if (y + h > ground.floor) y = ground.floor - h;
    list.push({
      cell: cell, x: x, y: y, w: w, h: h, roof: roof,
      hue: Math.floor(hash01(cell, 5, SIGN_SEED) * NEON.length),
      kind: Math.floor(hash01(cell, 6, SIGN_SEED) * 4)
    });
  }
  return list;
}

// A tower, chamfered. Anything eight pixels wide or more loses two pixels off
// each top corner and then one more, which reads as a set-back roof; anything
// narrower is a plain box, because a chamfer on a four-pixel tower eats the
// tower.
function block(fill, colour, t) {
  if (t.w >= 8 && t.h >= 4) {
    fill(colour, t.x + 3, t.top, t.w - 6, 1);
    fill(colour, t.x + 1, t.top + 1, t.w - 2, 1);
    fill(colour, t.x, t.top + 2, t.w, t.h - 2);
  } else {
    fill(colour, t.x, t.top, t.w, t.h);
  }
}

// Windows, on a grid inset one pixel from the tower's edges. Most of a night
// skyline is dark, so most cells stay dark and the pattern comes from the few
// that do not — which is why how dark a row is is said as two thresholds and
// not as a colour: the row furthest off has almost nothing on, and the row in
// front of it has enough to be read as a building rather than as a shape.
function windows(fill, t, seed, pitch, cold, warm) {
  var gx, gy, r;
  if (t.w < 5 || t.h < 6) return;
  for (gy = t.top + 3; gy < t.top + t.h - 1; gy += pitch) {
    for (gx = t.x + 1; gx < t.x + t.w - 1; gx += pitch) {
      r = hash01(gx, gy, seed);
      if (r > warm) fill(C.windowLit, gx, gy, 1, 1);
      else if (r > cold) fill(C.window, gx, gy, 1, 1);
    }
  }
}

// One row of towers with its windows in it. Three rows are drawn at three
// depths and the only things that differ between them are the colour, the seed
// and how much of the row is awake.
function row(fill, list, colour, seed, pitch, cold, warm) {
  var i;
  for (i = 0; i < list.length; i++) {
    block(fill, colour, list[i]);
    windows(fill, list[i], seed, pitch, cold, warm);
  }
}

// Every row of skyline and the dark housings, painted through whatever fill the
// caller offers. The backdrop is the only caller; it hands over a fill that
// writes into its own canvas. Furthest first in both pictures, so a row in
// front covers the one behind it simply by being painted after it.
export function paintCity(fill) {
  var signs = housings();
  var i;

  if (DEEP) {
    row(fill, hazeTowers(), C.cityHaze, HAZE_SEED + 5, DEEP_PITCH, 0.88, 0.97);
    row(fill, farTowers(), C.cityFar, FAR_SEED + 5, DEEP_PITCH, 0.44, 0.82);
    row(fill, blockTowers(), C.cityNear, BLOCK_SEED + 5, DEEP_PITCH, 0.58, 0.88);
  } else {
    row(fill, farTowers(), C.cityFar, FAR_SEED + 5, SIDE_PITCH, 0.55, 0.88);
    row(fill, nearBlocks(), C.cityNear, NEAR_SEED + 5, SIDE_PITCH, 0.93, 0.985);
  }

  // Unlit, every one of them: a housing is a box of ink with nothing in it
  // until neon.js decides tonight is its night.
  for (i = 0; i < signs.length; i++) {
    fill(C.ink, signs[i].x, signs[i].y, signs[i].w, signs[i].h);
  }
}

// ---------------------------- the beacons ----------------------------
//
// The red lamp on top of anything tall enough to be a hazard to an aircraft.
// It is the one thing in the city that is not part of the backdrop, and it
// cannot be: the backdrop is painted once per stage size and a beacon blinks.
// So this file settles where they stand and which eighth of the loop each one
// comes on in, and the drawing path puts the pixel down in the pass it draws
// its other emitters in.
//
// Eight phases, because eight divides the loop at every setting of the step
// knob — the loop is four lamp spacings and the spacing is a whole number of
// steps — so a beacon that is lit at step zero is lit again at step LOOP and
// the seam holds.
var BEACON_MIN_H = 17;
var BEACON_MIN_W = 6;
export var BEACON_PHASES = 8;

function beaconsOf(list, seed, out) {
  var i, t;
  for (i = 0; i < list.length; i++) {
    t = list[i];
    if (t.h < BEACON_MIN_H * S || t.w < BEACON_MIN_W * S) continue;
    out.push({
      x: t.x + (t.w >> 1),
      y: t.top - 1,
      phase: Math.floor(hash01(i, 8, seed) * BEACON_PHASES)
    });
  }
}

export function beacons() {
  var out = [];
  if (!DEEP) return out;
  beaconsOf(hazeTowers(), HAZE_SEED, out);
  beaconsOf(farTowers(), FAR_SEED, out);
  beaconsOf(blockTowers(), BLOCK_SEED, out);
  return out;
}

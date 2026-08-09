"use strict";

// The city, which is the whole of the picture above the horizon and none of
// the motion. Two rows of towers stand on two different bases — the far row on
// the horizon, the near block six pixels lower and so six pixels closer — and
// the sign housings sit on the near block, dark, waiting to be lit.
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

var FAR_SEED = 17;
var NEAR_SEED = 41;
var SIGN_SEED = 71;

// A row of towers, walked left to right. Widths and heights are hashed on the
// tower's index rather than on its position, because the row never moves and
// so has no seam to protect.
function towers(base, seed, minW, spanW, minH, spanH, minGap, spanGap) {
  var list = [];
  var x = -Math.round(6 * S);
  var i = 0;
  while (x < VIEW_W && i < 200) {
    var w = Math.max(2, Math.round((minW + hash01(i, 1, seed) * spanW) * S));
    var h = Math.max(2, Math.round((minH + hash01(i, 2, seed) * spanH) * S));
    list.push({ x: x, w: w, h: h, top: base - h });
    x += w + Math.max(1, Math.round((minGap + hash01(i, 3, seed) * spanGap) * S));
    i += 1;
  }
  return list;
}

// Behind the road: lighter than the near block, because distance at night is
// haze rather than shadow.
export function farTowers() {
  return towers(HORIZON, FAR_SEED, 6, 9, 10, 26, -2, 6);
}

// Beside the road: taller on the screen and nearly black, which is the whole
// of what puts it in front.
export function nearBlocks() {
  return towers(Y_RAIL, NEAR_SEED, 10, 16, 12, 18, 1, 5);
}

// The height of the near block under every column of the stage, so a sign can
// be hung on the roof it belongs to rather than floating at a hashed height.
export function nearTopLine() {
  var line = new Int16Array(VIEW_W);
  var blocks = nearBlocks();
  var i, b, x, x1;
  for (i = 0; i < VIEW_W; i++) line[i] = Y_RAIL;
  for (i = 0; i < blocks.length; i++) {
    b = blocks[i];
    x1 = Math.min(VIEW_W - 1, b.x + b.w - 1);
    for (x = Math.max(0, b.x); x <= x1; x++) {
      if (b.top < line[x]) line[x] = b.top;
    }
  }
  return line;
}

// The sign lattice: one housing per cell, always all of them, whatever the
// `signs` knob says. The housings are part of the backdrop, and the backdrop
// is only ever rebuilt when the stage changes size — so the knob decides how
// many of these are lit, never how many exist. A city has more signs than are
// working on any given night anyway.
export function housings() {
  var line = nearTopLine();
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
    if (y + h > Y_RAIL) y = Y_RAIL - h;
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

// Windows, on a three-pixel grid inset one pixel from the tower's edges. Most
// of a night skyline is dark, so most cells stay dark and the pattern comes
// from the few that do not.
function windows(fill, t, seed, cold, warm) {
  var gx, gy, r;
  if (t.w < 5 || t.h < 6) return;
  for (gy = t.top + 3; gy < t.top + t.h - 1; gy += 3) {
    for (gx = t.x + 1; gx < t.x + t.w - 1; gx += 3) {
      r = hash01(gx, gy, seed);
      if (r > warm) fill(C.windowLit, gx, gy, 1, 1);
      else if (r > cold) fill(C.window, gx, gy, 1, 1);
    }
  }
}

// Both skylines and the dark housings, painted through whatever fill the
// caller offers. The backdrop is the only caller; it hands over a fill that
// writes into its own canvas.
export function paintCity(fill) {
  var far = farTowers();
  var near = nearBlocks();
  var signs = housings();
  var i;

  for (i = 0; i < far.length; i++) {
    block(fill, C.cityFar, far[i]);
    windows(fill, far[i], FAR_SEED + 5, 0.55, 0.88);
  }
  for (i = 0; i < near.length; i++) {
    block(fill, C.cityNear, near[i]);
    windows(fill, near[i], NEAR_SEED + 5, 0.93, 0.985);
  }
  // Unlit, every one of them: a housing is a box of ink with nothing in it
  // until neon.js decides tonight is its night.
  for (i = 0; i < signs.length; i++) {
    fill(C.ink, signs[i].x, signs[i].y, signs[i].w, signs[i].h);
  }
}

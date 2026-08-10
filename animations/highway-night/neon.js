"use strict";

// The signs on the near block: which of them are lit tonight, which of them
// are flickering this instant, and how a lit one is drawn.
//
// The housings themselves belong to the backdrop — every one of the twenty-
// four is always there, always dark, painted once per stage size. This module
// only decides which of them have something in them. That split is deliberate:
// the backdrop is rebuilt only when the stage changes shape, so a knob that
// could add or remove a housing would leave the picture disagreeing with
// itself until the next resize. A city has more signs than are working on any
// given night anyway, and the dark ones are half the point.
//
// Signs are drawn straight to the frame after the light has been resolved.
// They are emitters: a neon tube is not a surface that has been lit and
// running it back through the material ramps would put a lamp's amber over a
// pink sign, which is exactly the mistake the material pass exists to prevent.

import { VIEW_W, S, LOOP, P } from "./state.js";
import { C, NEON, NEON_DIM } from "./palette.js";
import { clamp, hash01, bayer4, frac } from "./maths.js";
import { housings } from "./skyline.js";
import { STRUCK_SIGN } from "./world.js";

// How many of the twenty-four housings have anything in them tonight. It
// re-cuts which signs are in the lit set, so it is latched on a loop boundary
// rather than read live — a sign winking on halfway through a lap would be a
// sign the loop does not close over.
export var SIGNS = 18;

export function latchSigns() {
  SIGNS = Math.round(clamp(P.signs, 0, 24));
}

var FLICKER_SEED = 91;
var ORDER_SEED = 113;

// How many times a loop the flicker is allowed to change its mind. Eight is
// slow enough to read as a failing tube rather than as noise, and it divides
// the loop, which is what makes the pattern come back on itself.
var PHASES = 8;

var cachedWidth = -1;
var cached = null;
var order = null;
var ranked = null;

// The housings are expensive enough to be worth keeping — they walk the whole
// near skyline to find the roof each sign stands on — and they only depend on
// how wide the stage is.
function signs() {
  if (cachedWidth === VIEW_W && cached) return cached;
  cached = housings();
  cachedWidth = VIEW_W;

  // Which signs are lit first as the knob comes up. Ranking the cells by a
  // hash rather than lighting them left to right is what stops the knob
  // sweeping a bright edge across the skyline; at any setting the lit ones are
  // scattered along it.
  var i, j, rank;
  order = new Int16Array(cached.length);
  for (i = 0; i < cached.length; i++) {
    rank = 0;
    for (j = 0; j < cached.length; j++) {
      if (hash01(j, 1, ORDER_SEED) < hash01(i, 1, ORDER_SEED)) rank += 1;
    }
    order[i] = rank;
  }

  // Every housing, largest first. How many of them get a cross flare is the
  // caller's business — a flare on every sign is a sky full of stars, and on
  // three it is a skyline with three big signs on it — but the ranking is the
  // same one whoever is asking, so it is worked out here once.
  ranked = [];
  for (i = 0; i < cached.length; i++) ranked.push(i);
  ranked.sort(function (a, b) {
    return (cached[b].w * cached[b].h) - (cached[a].w * cached[a].h);
  });
  return cached;
}

// The cells of the n largest housings. What a strike with nowhere in
// particular to land wakes, on a stage whose whole subject is the signs.
export function biggestSigns(count) {
  signs();
  var out = [];
  var i;
  for (i = 0; i < ranked.length && i < count; i++) out.push(cached[ranked[i]].cell);
  return out;
}

// The nearest housing with nothing in it, walking outwards from the cell asked
// for. A visitor clicking the sky is asking for a sign to come on, and the cell
// under the click is as likely as not one that is already lit — where a strike
// only stutters a running tube, which is the opposite of what was asked for.
// Stepping out to the first dark cell keeps the strike where it was aimed,
// within a housing or two, and makes it do the thing the stage hint promises.
// When every housing is lit there is nothing dark to find and the cell asked
// for comes back unchanged, which is the honest answer: on a night when the
// whole skyline is burning, striking it can only interrupt.
export function darkSignNear(cell) {
  var all = signs();
  var i, k;
  for (i = 0; i < all.length; i++) {
    k = cell - i;
    if (k >= 0 && order[k] >= SIGNS) return all[k].cell;
    k = cell + i;
    if (k < all.length && order[k] >= SIGNS) return all[k].cell;
  }
  return cell;
}

// A strike names one sign, or — where a stage strikes several at once — a
// handful of them. Both arrive as `struck`, and neither is a special case
// worth a second field on the state.
function isStruck(struck, cell) {
  if (struck === null || struck === undefined) return false;
  if (typeof struck === "number") return struck === cell;
  return struck.indexOf(cell) >= 0;
}

// The list of signs that have light in them this step. Everything in it is a
// function of the step number: which cells are in the lit set at all, and then
// which of those the flicker has dropped for this eighth of the loop.
//
// `hueLock` at zero leaves every sign the hue its cell hashed to; one to four
// forces the whole skyline onto a single tube colour, which is the only way to
// see what one of the four is actually doing against a night sky. `flares` is
// how many of the largest housings get the cross — three on the assembled
// highway, and anything from none to six where the signs are the subject.
export function litSigns(state, hueLock, flares) {
  var all = signs();
  var phase = Math.floor(frac(state.step / LOOP) * PHASES);
  var struck = state.kind === STRUCK_SIGN ? state.struck : null;
  var lock = Math.round(hueLock || 0);
  var picks = Math.round(flares || 0);
  var out = [];
  var i, sign, lit, on, wake, pick;
  for (i = 0; i < all.length; i++) {
    sign = all[i];
    lit = order[i] < SIGNS;
    on = lit && hash01(sign.cell, phase, FLICKER_SEED) >= P.flicker * 0.35;
    if (isStruck(struck, sign.cell) && state.wake > 0) {
      // struck: a tube coming up cold stutters far harder than one that has
      // been running, and settles as the transient runs out
      wake = Math.floor(state.wake * 24);
      on = hash01(sign.cell, wake, FLICKER_SEED + 7) > state.wake * 0.55;
    }
    if (!on) continue;
    pick = lock > 0 ? (lock - 1) % NEON.length : sign.hue % NEON.length;
    out.push({
      sign: sign,
      hue: NEON[pick],
      glow: NEON_DIM[pick],
      flare: ranked.indexOf(i) < picks
    });
  }
  return out;
}

// A rectangle in one colour, straight to the frame.
function box(put, colour, x, y, w, h) {
  var i, j;
  for (j = 0; j < h; j++) {
    for (i = 0; i < w; i++) put(x + i, y + j, colour);
  }
}

// The four things a sign can be. They are silhouettes rather than typography:
// at three to seven pixels across there is no reading a sign, only recognising
// that it is one, and a solid block, a hollow box, a stack of bars and a bar
// with a crossbar are four things that stay apart at that size.
function archetype(put, s, colour) {
  var u = Math.max(1, Math.round(S));
  var i, j;
  if (s.kind === 0) {
    box(put, colour, s.x, s.y, s.w, s.h);
  } else if (s.kind === 1) {
    box(put, colour, s.x, s.y, s.w, u);
    box(put, colour, s.x, s.y + s.h - u, s.w, u);
    box(put, colour, s.x, s.y, u, s.h);
    box(put, colour, s.x + s.w - u, s.y, u, s.h);
  } else if (s.kind === 2) {
    for (j = 0; j < s.h; j += 2 * u) box(put, colour, s.x, s.y + j, s.w, u);
  } else {
    box(put, colour, s.x, s.y, s.w, u);
    i = s.x + Math.floor((s.w - u) * 0.5);
    box(put, colour, i, s.y, u, s.h);
  }
}

// The rings around a tube. They are drawn in the sign's dim companion, not in
// the tube colour: the four dim hues are in the table for exactly this, and
// spending four colours on them buys the one thing a halo of the full colour
// could never buy — the tube itself staying the brightest thing in its own
// glow. A sign lit in its own pink and haloed in the same pink is a pink
// rectangle with a ragged edge; lit in pink over a dark pink it is a light.
//
// `ring` is how far out from the tube this one sits. The first lies against the
// sign and lands whole, which is what makes the tube read as sitting in
// something rather than as being outlined; the two outside it take half the
// dither and a quarter, so the glow thins outwards instead of stopping.
var HALO_DITHER = [1, 0.5, 0.25];

function halo(put, s, colour, ring) {
  var u = Math.max(1, Math.round(S));
  var out = ring * u;
  var keep = HALO_DITHER[ring - 1];
  var x0 = s.x - out, y0 = s.y - out;
  var x1 = s.x + s.w + out - 1, y1 = s.y + s.h + out - 1;
  // whatever this ring encloses is either the sign itself or a ring that has
  // already been laid, so only the outermost band of the box belongs to it
  var ix0 = x0 + u, iy0 = y0 + u, ix1 = x1 - u, iy1 = y1 - u;
  var x, y;
  for (x = x0; x <= x1; x++) {
    for (y = y0; y <= y1; y++) {
      if (x >= ix0 && x <= ix1 && y >= iy0 && y <= iy1) continue;
      if (bayer4(x, y) < keep) put(x, y, colour);
    }
  }
}

// Two pixels of white either side of the middle. It is the only place in the
// picture where anything is drawn purely because a camera would have done it,
// and it is worth it: a flare is what separates a sign that is bright from a
// sign that is merely pale.
function flare(put, s) {
  var u = Math.max(1, Math.round(S));
  var cx = s.x + Math.floor(s.w * 0.5);
  var cy = s.y + Math.floor(s.h * 0.5);
  var k;
  for (k = -2 * u; k <= 2 * u; k++) {
    put(cx + k, cy, C.hot);
    put(cx, cy + k, C.hot);
  }
}

// The signs, at whatever strength the intensity knob is asking for. Its three
// bands are three amounts of glow around the same tube — the tube on its own,
// the tube standing in a solid ring of its dim companion, and that ring carried
// two pixels further out on the dither, which is as far as a fixed palette can
// carry a falloff outwards.
//
// The cross flares are not on that ladder. How many signs are big enough to be
// worth one is a question about the skyline, not about how hard the tubes are
// burning, so the count decides it on its own and the ladder decides the glow;
// hanging the flares off the top band would make one of the two knobs say
// nothing wherever the other one was not at its limit.
export function paintNeon(put, list) {
  var bands = Math.round(P.neonIntensity);
  if (bands <= 0) return;
  var i, item;
  for (i = 0; i < list.length; i++) {
    item = list[i];
    // outwards in, so the ring that reads as glow is under the one that reads
    // as the tube
    if (bands >= 3) {
      halo(put, item.sign, item.glow, 3);
      halo(put, item.sign, item.glow, 2);
    }
    if (bands >= 2) halo(put, item.sign, item.glow, 1);
    archetype(put, item.sign, item.hue);
    if (item.flare) flare(put, item.sign);
  }
}

// Called when the stage changes size, so the next frame rebuilds the housings
// against the new width rather than drawing the old ones off the edge.
export function forgetSigns() { cachedWidth = -1; }

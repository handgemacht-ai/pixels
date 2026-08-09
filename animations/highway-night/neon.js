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

import { VIEW_W, S, LOOP, SIGNS, P } from "./state.js";
import { C, NEON } from "./palette.js";
import { hash01, bayer4, frac } from "./maths.js";
import { housings } from "./skyline.js";
import { STRUCK_SIGN } from "./world.js";

var FLICKER_SEED = 91;
var ORDER_SEED = 113;

// How many times a loop the flicker is allowed to change its mind. Eight is
// slow enough to read as a failing tube rather than as noise, and it divides
// the loop, which is what makes the pattern come back on itself.
var PHASES = 8;

var cachedWidth = -1;
var cached = null;
var order = null;
var biggest = null;

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

  // The three largest housings, which are the only ones that get a flare.
  // A flare on every sign is a sky full of stars; on three it is a skyline
  // with three big signs on it.
  biggest = [];
  for (i = 0; i < cached.length; i++) biggest.push(i);
  biggest.sort(function (a, b) {
    return (cached[b].w * cached[b].h) - (cached[a].w * cached[a].h);
  });
  biggest = biggest.slice(0, 3);
  return cached;
}

// The list of signs that have light in them this step. Everything in it is a
// function of the step number: which cells are in the lit set at all, and then
// which of those the flicker has dropped for this eighth of the loop.
export function litSigns(state) {
  var all = signs();
  var phase = Math.floor(frac(state.step / LOOP) * PHASES);
  var struck = state.kind === STRUCK_SIGN ? state.struck : -1;
  var out = [];
  var i, sign, lit, on, wake;
  for (i = 0; i < all.length; i++) {
    sign = all[i];
    lit = order[i] < SIGNS;
    on = lit && hash01(sign.cell, phase, FLICKER_SEED) >= P.flicker * 0.35;
    if (sign.cell === struck && state.wake > 0) {
      // struck: a tube coming up cold stutters far harder than one that has
      // been running, and settles as the transient runs out
      wake = Math.floor(state.wake * 24);
      on = hash01(sign.cell, wake, FLICKER_SEED + 7) > state.wake * 0.55;
    }
    if (!on) continue;
    out.push({
      sign: sign,
      hue: NEON[sign.hue % NEON.length],
      flare: biggest.indexOf(i) >= 0
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

// One ring of the sign's own colour around it, laid down on the ordered dither
// so that half the ring lands and half does not. There is no dimmer pink in
// the palette to make a halo out of, and there must not be: a blend would put
// a thirtieth colour on the stage and break the table the GIF is written from.
// Half a ring of the full colour is what the palette can actually say, and at
// this size it reads as glow rather than as a dotted line.
function halo(put, s, colour) {
  var u = Math.max(1, Math.round(S));
  var x0 = s.x - u, y0 = s.y - u;
  var x1 = s.x + s.w + u - 1, y1 = s.y + s.h + u - 1;
  var x, y;
  for (x = x0; x <= x1; x++) {
    for (y = y0; y <= y1; y++) {
      if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) continue;
      if (bayer4(x, y) < 0.5) put(x, y, colour);
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

export function paintNeon(put, list) {
  var bands = Math.round(P.neonIntensity);
  if (bands <= 0) return;
  var i, item;
  for (i = 0; i < list.length; i++) {
    item = list[i];
    if (bands >= 2) halo(put, item.sign, item.hue);
    archetype(put, item.sign, item.hue);
    if (bands >= 3 && item.flare) flare(put, item.sign);
  }
}

// Called when the stage changes size, so the next frame rebuilds the housings
// against the new width rather than drawing the old ones off the edge.
export function forgetSigns() { cachedWidth = -1; }

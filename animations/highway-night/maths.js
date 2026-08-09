"use strict";

// The small arithmetic this animation is built out of. Nothing here calls
// Math.random: every speck of variety on the stage is a hash of where it is,
// so a frame can be rebuilt from the step number alone and a run filmed twice
// comes out byte for byte the same.

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

export function frac(v) { return v - Math.floor(v); }

// A repeatable speckle: the same coordinates always give the same number.
// Every hash in this animation is taken on a lattice cell counted modulo the
// number of cells in one loop, never on a running index — otherwise a lamp
// leaving the left edge and its replacement arriving on the right would carry
// different detail, and the seam of the loop would show as a pop.
export function hash01(x, y, seed) {
  var h = (x | 0) * 374761393 + (y | 0) * 668265263 + ((seed | 0) + 1) * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth blotches. Used for the mottle in the asphalt and the ragged top of
// the city glow, where a straight hash reads as static rather than as a
// surface.
export function vnoise(x, y, cell, seed) {
  var gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  var fx = x / cell - gx, fy = y / cell - gy;
  var a = hash01(gx, gy, seed);
  var b = hash01(gx + 1, gy, seed);
  var c = hash01(gx, gy + 1, seed);
  var d = hash01(gx + 1, gy + 1, seed);
  var u = fx * fx * (3 - 2 * fx);
  var v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// The same value noise, wrapped. The grid repeats every `cells` columns, so a
// surface scrolled by a whole number of periods comes back onto itself exactly
// — which is the only kind of noise this animation is allowed to have on
// anything that moves. Plain value noise on a scrolling road would look right
// for one lap and then show the seam as a blotch that arrives from nowhere.
export function vnoiseLoop(x, y, cell, cells, seed) {
  var gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  var fx = x / cell - gx, fy = y / cell - gy;
  var x0 = ((gx % cells) + cells) % cells;
  var x1 = (((gx + 1) % cells) + cells) % cells;
  var a = hash01(x0, gy, seed);
  var b = hash01(x1, gy, seed);
  var c = hash01(x0, gy + 1, seed);
  var d = hash01(x1, gy + 1, seed);
  var u = fx * fx * (3 - 2 * fx);
  var v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// The 4 x 4 ordered dither, as a threshold between 0 and 1. Twenty-nine fixed
// colours cannot be blended — mixing two of them would put a thirtieth on the
// stage and break the colour table the GIF is written from — so a value that
// falls between two bands is carried by how many pixels of a small tile take
// the upper band rather than by a colour in between. The 4 x 4 field is the
// smallest one whose pattern still reads as texture rather than as a
// checkerboard at this resolution.
var BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
];

export function bayer4(x, y) {
  return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

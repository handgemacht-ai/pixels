"use strict";

// The small arithmetic this animation is built out of. Nothing here calls
// Math.random: every speck of variety in the model is a hash of where it is, so
// the tower can be rebuilt from the knobs alone and a run filmed twice comes
// out byte for byte the same.
//
// It is a copy of the same helpers the other animations carry rather than a
// shared module. An animation here owns everything it draws with; the moment
// two of them import one file, changing a constant to suit one silently redraws
// the other, and neither README is true any more.

export var TAU = Math.PI * 2;

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

export function frac(v) { return v - Math.floor(v); }

// The shortest way round from b to a, in radians. Everything on the tower is
// placed by its bearing, so this is how a doorway knows it is a doorway rather
// than a hole on the far side of the circle.
export function angleDiff(a, b) {
  var d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

// A repeatable speckle: the same coordinates always give the same number.
export function hash01(x, y, seed) {
  var h = (x | 0) * 374761393 + (y | 0) * 668265263 + ((seed | 0) + 1) * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth blotches in three dimensions, read on the model's own coordinates
// rather than on the screen. That is the whole point of taking it in 3-D: a
// mottle keyed to the screen slides across the stone whenever the model is
// rebuilt at another size, whereas one keyed to the block it is painted on
// belongs to the wall and stays where it was put.
export function vnoise3(x, y, z, cell, seed) {
  var gx = Math.floor(x / cell), gy = Math.floor(y / cell), gz = Math.floor(z / cell);
  var fx = x / cell - gx, fy = y / cell - gy, fz = z / cell - gz;
  var u = fx * fx * (3 - 2 * fx);
  var v = fy * fy * (3 - 2 * fy);
  var w = fz * fz * (3 - 2 * fz);
  // the third axis is folded into the second by a large odd stride, which is
  // cheaper than a third multiply in the hash and just as uncorrelated at the
  // handful of cells this model spans
  var s0 = gz * 911, s1 = (gz + 1) * 911;
  var a = hash01(gx, gy + s0, seed);
  var b = hash01(gx + 1, gy + s0, seed);
  var c = hash01(gx, gy + 1 + s0, seed);
  var d = hash01(gx + 1, gy + 1 + s0, seed);
  var e = hash01(gx, gy + s1, seed);
  var f = hash01(gx + 1, gy + s1, seed);
  var g = hash01(gx, gy + 1 + s1, seed);
  var h = hash01(gx + 1, gy + 1 + s1, seed);
  var lo = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  var hi = e + (f - e) * u + (g - e) * v + (e - f - g + h) * u * v;
  return lo + (hi - lo) * w;
}

// The 4 x 4 ordered dither, as a threshold between 0 and 1. The light module
// hands the same tile back out of its own bands file, and the emitters here use
// that one rather than this — two tiles slightly out of phase read as a moiré.
// This copy is for the backdrop, which is drawn before any light exists.
var BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
];

export function bayer4(x, y) {
  return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

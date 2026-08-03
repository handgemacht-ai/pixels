"use strict";

export function rand(min, max) { return min + Math.random() * (max - min); }
export function randInt(min, max) { return min + ((Math.random() * (max - min + 1)) | 0); }
export function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

export function hash01(x, y, seed) {
  var h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth blotches. Used to push the outline about, to mottle the inside of
// the flame and to tear holes in the smoke.
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

"use strict";

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

export function lerp(a, b, t) { return a + (b - a) * t; }

// 0 at 0, 1 at 1, flat at both ends — the ease a paw swings with.
export function smooth(t) {
  var u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

export function frac(v) { return v - Math.floor(v); }

// A repeatable speckle: the same x and y always give the same number, so the
// ground can be generated from the distance walked rather than remembered.
// Nothing in this animation calls Math.random.
export function hash01(x, y, seed) {
  var h = (x | 0) * 374761393 + (y | 0) * 668265263 + ((seed | 0) + 1) * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth blotches, the same everywhere the same coordinates come round. The
// coat is banded off the shape of the animal rather than off a formula, and
// this is what stops the boundary between two bands being a clean arc.
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

// Two bones, a start and an end: where the joint between them has to be.
// The elbow of a foreleg folds backwards and the stifle of a hind leg folds
// forwards, which is the whole reason a dog's back legs look the way they do,
// so the caller says which way to bend.
export function solveJoint(ax, ay, bx, by, upper, lower, bend, out) {
  var dx = bx - ax;
  var dy = by - ay;
  var len = Math.sqrt(dx * dx + dy * dy) || 0.001;
  var ux = dx / len;
  var uy = dy / len;
  // a leg that cannot reach simply straightens instead of tearing itself apart
  var d = clamp(len, 0.001, upper + lower - 0.001);
  var cosine = clamp((upper * upper + d * d - lower * lower) / (2 * upper * d), -1, 1);
  var turn = Math.acos(cosine) * bend;
  var cs = Math.cos(turn);
  var sn = Math.sin(turn);
  out.x = ax + (ux * cs - uy * sn) * upper;
  out.y = ay + (ux * sn + uy * cs) * upper;
  return out;
}

"use strict";

// The light field: one float per pixel saying how much light landed there, and
// a second saying how much of that light was red.
//
// Sources are added rather than compared. Taking the brightest source at each
// pixel would give a line of lamps a flat sheet of pools all the same
// brightness; adding them makes the place where two pools overlap brighter
// than either, which is the bright / dark / bright rhythm a lit road actually
// has, and it costs nothing but the accumulator.
//
// The second field is what stops a red pool going amber. A tail lamp adds into
// both, so at resolve time a pixel whose red share is more than half its total
// is asphalt standing in a tail light rather than under a lamp, and it is
// resolved along a different ramp.
//
// Two metrics live here, and which one a source uses is a statement about what
// that source is lighting:
//
//   * the ground is lit in the world metric, where a pixel measured downwards
//     is worth less distance than a pixel measured across, because the view is
//     oblique and the vertical axis is carrying depth as well as height.
//     Dividing the vertical by 1.8 is what makes a pool spread down the
//     carriageway instead of stopping in a disc.
//   * the air is lit in the screen metric, isotropically, because a glare
//     around a lamp is a glare and has no ground plane to lie on. A halo
//     stretched 1.8 to one leans, and a leaning halo reads as a mistake.

import { VIEW_W, VIEW_H } from "./state.js";
import { clamp, bayer4 } from "./maths.js";
import { AIR } from "./palette.js";

export var ANISO = 1.8;

export var lux = null;
export var ruby = null;

// How far past its reference length a source is allowed to carry. Three is the
// point where the inverse square has taken it down to about a tenth of a band,
// so the cut cannot be seen; further only costs pixels. A source may name its
// own instead, which is how a short, wide, deliberately local wash is stopped
// before it reaches the next lamp's territory.
var CUT = 3;

// The floor under the inverse square. Without it a surface a pixel from the
// filament goes to a few thousand and every knob downstream is arguing with an
// infinity. With it the pixels immediately under a lamp saturate, which is
// what a sodium lamp on wet asphalt does anyway.
var KNEE = 0.1;

// The outer third of a wedge fades instead of ending. A hard edge on a cone is
// the one thing that makes cast light look drawn, and the dither in the
// resolve cannot rescue an edge that steps a whole band at once.
var RIM = 0.35;

export function allocateLight() {
  var n = VIEW_W * VIEW_H;
  lux = new Float32Array(n);
  ruby = new Float32Array(n);
}

export function clearLight() {
  lux.fill(0);
  ruby.fill(0);
}

// The box a wedge can possibly reach, worked out from its own opening rather
// than from a circle around it. A lamp points down: without this every sweep
// would walk as far above the lamp as below it, and each pole would cost twice
// the pixels it needs.
var box = { x0: 0, y0: 0, x1: 0, y1: 0 };

function wedgeBox(c, aniso) {
  var half = Math.acos(clamp(c.cosHalf, -1, 1));
  var mid = Math.atan2(c.ay, c.ax);
  var reach = c.span * (c.cut || CUT);
  var x0 = c.x, x1 = c.x, y0 = c.y, y1 = c.y;
  var steps = 12;
  var i, a, ca, sa, t, px, py;
  for (i = 0; i <= steps; i++) {
    a = mid - half + 2 * half * i / steps;
    ca = Math.cos(a);
    sa = Math.sin(a);
    // the reach boundary is an ellipse in screen pixels, because the world
    // metric squashes the vertical: solve how far along this ray it lies
    t = reach / Math.sqrt(ca * ca + sa * sa / (aniso * aniso));
    px = c.x + ca * t;
    py = c.y + sa * t;
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }
  // two pixels of slack, because the extreme of the arc can fall between two
  // of the samples above
  box.x0 = Math.max(0, Math.floor(x0) - 2);
  box.y0 = Math.max(0, Math.floor(y0) - 2);
  box.x1 = Math.min(VIEW_W - 1, Math.ceil(x1) + 2);
  box.y1 = Math.min(VIEW_H - 1, Math.ceil(y1) + 2);
}

// A cone landing on something solid. Air is skipped: what light does to air is
// scatter, which is a much weaker and much broader thing, and it has its own
// pass below so the haze knob can turn it off without taking the pools too.
export function addCone(mat, c) {
  if (c.span <= 0.5 || c.gain <= 0) return;
  wedgeBox(c, ANISO);
  var inv = 1 / (c.span * c.span);
  var far = (c.cut || CUT) * (c.cut || CUT);
  var x, y, i, row, dx, dy, dw, len, cos, t, q, v;
  for (y = box.y0; y <= box.y1; y++) {
    dy = y + 0.5 - c.y;
    dw = dy / ANISO;
    row = y * VIEW_W;
    for (x = box.x0; x <= box.x1; x++) {
      i = row + x;
      if (mat[i] === AIR) continue;
      dx = x + 0.5 - c.x;
      len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) len = 0.001;
      // the wedge is measured on screen, because it is a shape somebody has to
      // read; the falloff below is measured in the world, because that is
      // where the distance is
      cos = (dx * c.ax + dy * c.ay) / len;
      t = (cos - c.cosHalf) / (1 - c.cosHalf);
      if (t <= 0) continue;
      q = (dx * dx + dw * dw) * inv;
      if (q > far) continue;
      v = c.gain * cos * (t < RIM ? t / RIM : 1) / (q + KNEE);
      lux[i] += v;
      if (c.red) ruby[i] += v;
    }
  }
}

// The same wedge, in the air only, falling off as one over the distance rather
// than one over its square — because what is being seen is not a surface
// returning the light but the whole column of air between the lamp and the
// eye, and that column grows about as fast as the light in it dims.
export function addHaze(mat, c) {
  if (c.span <= 0.5 || c.gain <= 0) return;
  wedgeBox(c, 1);
  var inv = 1 / c.span;
  var x, y, i, row, dx, dy, len, cos, t, d, v;
  for (y = box.y0; y <= box.y1; y++) {
    dy = y + 0.5 - c.y;
    row = y * VIEW_W;
    for (x = box.x0; x <= box.x1; x++) {
      i = row + x;
      if (mat[i] !== AIR) continue;
      dx = x + 0.5 - c.x;
      len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) len = 0.001;
      cos = (dx * c.ax + dy * c.ay) / len;
      t = (cos - c.cosHalf) / (1 - c.cosHalf);
      if (t <= 0) continue;
      d = len * inv;
      if (d > (c.cut || CUT)) continue;
      v = c.gain * (t < RIM ? t / RIM : 1) / (d + 0.35);
      lux[i] += v;
      if (c.red) ruby[i] += v;
    }
  }
}

// The glare a lamp makes around itself, in every direction and in screen
// pixels. It is what puts a halo in the sky over a cobra head and what makes
// the head the brightest thing on the pole, and it lands on air and on solid
// alike, because glare does.
//
// Alike, but not on everything. A source may name the materials its glare does
// not reach, and the one that always has to is a lamp mounted on the thing
// being looked at: a tail lamp's glare laid over its own bodywork does not read
// as glare, it reads as the paint going white — which at nineteen pixels turns
// a car with two lamps into a face with two eyes. Glare is light in the air
// between the source and the eye, and the shell carrying the source is not in
// front of itself. The mask is a lookup by material id and needs the material
// buffer to read; a source that names none is handed neither, which is every
// other source in the folder.
export function addBloom(b, mat) {
  if (b.span <= 0.5 || b.gain <= 0) return;
  var reach = b.span * 2;
  var x0 = Math.max(0, Math.floor(b.x - reach));
  var y0 = Math.max(0, Math.floor(b.y - reach));
  var x1 = Math.min(VIEW_W - 1, Math.ceil(b.x + reach));
  var y1 = Math.min(VIEW_H - 1, Math.ceil(b.y + reach));
  var inv = 1 / (b.span * b.span);
  var skip = (b.skip && mat) ? b.skip : null;
  var x, y, i, row, dx, dy, q, v;
  for (y = y0; y <= y1; y++) {
    dy = y + 0.5 - b.y;
    row = y * VIEW_W;
    for (x = x0; x <= x1; x++) {
      dx = x + 0.5 - b.x;
      q = (dx * dx + dy * dy) * inv;
      if (q > 4) continue;
      i = row + x;
      if (skip && skip[mat[i]]) continue;
      v = b.gain / (q + 0.25);
      lux[i] += v;
      if (b.red) ruby[i] += v;
    }
  }
}

// How much light there is, said in one of four bands.
//
// Twenty-nine fixed colours cannot be blended, so a value falling between two
// bands is carried by how many pixels of a small tile take the upper one.
// Which tile is the demonstration knob: the ordered dither dissolves the
// boundary into texture, the scanline setting throws it into alternating rows
// the way an interlaced capture would, and hard bands does none of it and
// shows what the banding underneath actually looks like.
export function bandLevel(L, x, y, texture) {
  var v = L * 3;
  if (v <= 0) return 0;
  if (v >= 3) return 3;
  var n = Math.floor(v);
  var f = v - n;
  if (texture < 0.5) {
    if (f > bayer4(x, y)) n += 1;
  } else if (texture < 1.5) {
    if (f > ((y & 1) ? 0.78 : 0.22)) n += 1;
  } else if (f > 0.5) {
    n += 1;
  }
  return n > 3 ? 3 : n;
}

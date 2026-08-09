"use strict";

// How much light there is, said in one of the material's own shades.
//
// A fixed palette cannot be blended. Mixing two of its colours would put a
// third on the stage that the GIF's colour table has never been told about, so
// a value falling between two shades of a ramp is carried by how many pixels
// of a small tile take the upper one, and which tile is a knob rather than a
// decision this module makes for the scene.
//
// Nothing here knows anything about a ramp except how long it is. Four steps
// is what the night highway was written against; a scene that wants six for
// its sky and three for its brick says so per material and the band arithmetic
// follows, because the alternative is every scene sharing one ramp length and
// authoring dead shades to reach it.

var BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
];

// The 4 x 4 ordered dither, as a threshold between 0 and 1, read at the
// pixel's own place in the buffer and never at its place on the thing being
// lit. A dither anchored to a moving object swims, and a swimming dither is
// the one artefact of this whole pipeline that is noticed immediately.
export function bayer4(x, y) {
  return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

// Which step of a `steps`-long ramp a light level of L lands on, with the
// fraction between two steps carried by the chosen tile:
//
//   texture 0  the ordered dither, which dissolves the boundary into texture
//   texture 1  scanlines, the way an interlaced capture would throw it
//   texture 2  hard bands, which does none of it and shows what the banding
//              underneath actually looks like
//
// L is quoted so that 1 is the top of the ramp: a source calibrated for a
// four-step ramp reads the same on a six-step one, one band further up.
export function bandLevel(L, x, y, texture, steps) {
  var top = steps - 1;
  if (top <= 0) return 0;
  var v = L * top;
  if (v <= 0) return 0;
  if (v >= top) return top;
  var n = Math.floor(v);
  var f = v - n;
  if (texture < 0.5) {
    if (f > bayer4(x, y)) n += 1;
  } else if (texture < 1.5) {
    if (f > ((y & 1) ? 0.78 : 0.22)) n += 1;
  } else if (f > 0.5) {
    n += 1;
  }
  return n > top ? top : n;
}

// The one place in the module where a float becomes a colour.
//
// Every byte written here came out of a ramp the scene handed over. The module
// has no palette of its own and no opinion about what lit asphalt looks like:
// it decides which shade of the material, and the scene decided what the
// shades are.
//
// A ramp entry below zero is the scene saying "draw nothing here" — air with
// no light in it, which lets the backdrop through rather than painting black
// over it.
export function resolveInto(field, out, opts) {
  var o = opts || {};
  var texture = o.texture === undefined ? 0 : o.texture;
  var gainMap = o.gainMap || null;
  var bias = o.bias || null;
  var width = field.width;
  var height = field.height;
  var mat = field.mat;
  var lux = field.lux;
  var ramps = field.ramps;
  if (o.clear === undefined || o.clear) out.fill(0);

  var written = 0;
  var x, y, i, k, m, ramp, top, L, level, colour;
  for (y = 0; y < height; y++) {
    for (x = 0; x < width; x++) {
      i = y * width + x;
      m = mat[i];
      ramp = ramps[m];
      // a material with no ramp is one the scene draws for itself afterwards —
      // an emitter, or a sprite that must not be re-lit
      if (!ramp || !ramp.length) continue;
      L = lux[i];
      if (gainMap) L *= gainMap[i];
      top = ramp.length - 1;
      level = bandLevel(L, x, y, texture, ramp.length);
      if (bias) {
        // a whole-material band offset: the difference between sodium and the
        // white lamps that replaced it, said once for the ground rather than
        // as a brightness slider over the whole picture
        level += bias[m] | 0;
        // and clamped into the ramp, because the darkest a lit pixel may go is
        // the darkest shade the scene authored. Stepping below it would be the
        // module inventing a colour, which is the one thing it may never do.
        if (level < 0) level = 0;
        else if (level > top) level = top;
      }
      colour = ramp[level];
      if (colour < 0) continue;
      k = i * 4;
      out[k] = (colour >> 16) & 255;
      out[k + 1] = (colour >> 8) & 255;
      out[k + 2] = colour & 255;
      out[k + 3] = 255;
      written += 1;
    }
  }
  return written;
}

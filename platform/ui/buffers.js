"use strict";

// How a buffer becomes a picture — one painter per declared kind, and nothing
// else in here at all.
//
// There is no DOM, no animation and no clock in this file. A painter is handed
// a tap and an ImageData and fills the second out of the first, which is what
// makes the whole set testable by reading it: the same buffer always comes out
// the same picture, on any page, in any order.
//
// A painter only ever reads. The buffers it is given are the live ones the
// drawing path is writing into, and a painter that wrote to one would be
// changing the frame by looking at it.

// The heat ramp, sixteen steps and no interpolation. It is a lookup because it
// has to be cheap enough to run over every pixel of six fields at the
// animation's own cadence — and because sixteen banded steps is what the rest
// of this page looks like, so a smooth gradient here would be the one thing on
// the screen pretending to have more colours than it has.
var HEAT = [
  [4, 3, 10], [16, 10, 34], [30, 14, 60], [48, 16, 82],
  [70, 18, 96], [96, 22, 100], [124, 28, 92], [152, 38, 78],
  [180, 52, 60], [204, 70, 44], [224, 94, 32], [238, 122, 26],
  [246, 152, 32], [250, 186, 60], [253, 217, 116], [255, 244, 200]
];
var HEAT_TOP = HEAT.length - 1;

// What is actually in the buffer, which is the only honest scale for a field
// nobody declared a range for: a height in stage pixels and a depth either side
// of the origin are different numbers at every stage size.
function extent(data) {
  var lo = Infinity, hi = -Infinity;
  var i, v;
  for (i = 0; i < data.length; i++) {
    v = data[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) { lo = 0; hi = 0; }
  return { min: lo, max: hi };
}

export var PAINT = {
  // A category, drawn in the colours the scene gave its own categories. An id
  // with no colour against it is drawn black rather than guessed at.
  index: function (entry, image) {
    var data = entry.data;
    var out = image.data;
    var colours = entry.colours || [];
    var i, k, c;
    for (i = 0, k = 0; i < data.length; i++, k += 4) {
      c = colours[data[i]];
      if (c === undefined || c === null) {
        out[k] = 0; out[k + 1] = 0; out[k + 2] = 0; out[k + 3] = 255;
        continue;
      }
      out[k] = (c >> 16) & 255;
      out[k + 1] = (c >> 8) & 255;
      out[k + 2] = c & 255;
      out[k + 3] = 255;
    }
    return null;
  },

  // A number per pixel, in grey. Over the range the node declared where there is
  // one, and over what is actually in the buffer where there is not — and the
  // reading is handed back either way, so the panel can print the numbers under
  // a picture that has been stretched to fit them.
  scalar: function (entry, image) {
    var data = entry.data;
    var out = image.data;
    var seen = extent(data);
    var lo = entry.range ? entry.range[0] : seen.min;
    var hi = entry.range ? entry.range[1] : seen.max;
    var span = hi - lo;
    if (!(span > 0)) span = 1;
    var i, k, v;
    for (i = 0, k = 0; i < data.length; i++, k += 4) {
      v = (data[i] - lo) / span * 255;
      if (v < 0) v = 0;
      else if (v > 255) v = 255;
      v = v | 0;
      out[k] = v; out[k + 1] = v; out[k + 2] = v; out[k + 3] = 255;
    }
    return seen;
  },

  // Set or not set. Nothing in between exists in the buffer, so nothing in
  // between is drawn.
  mask: function (entry, image) {
    var data = entry.data;
    var out = image.data;
    var i, k, v;
    for (i = 0, k = 0; i < data.length; i++, k += 4) {
      v = data[i] ? 255 : 0;
      out[k] = v; out[k + 1] = v; out[k + 2] = v; out[k + 3] = 255;
    }
    return null;
  },

  // Three signed numbers per pixel, folded into the three channels the usual
  // way: flat ground comes out lilac, a face turned east comes out warm, one
  // turned north comes out green.
  vector: function (entry, image) {
    var x = entry.x, y = entry.y, z = entry.z;
    var out = image.data;
    var i, k;
    for (i = 0, k = 0; i < x.length; i++, k += 4) {
      out[k] = ((x[i] + 1) * 0.5 * 255) | 0;
      out[k + 1] = ((y[i] + 1) * 0.5 * 255) | 0;
      out[k + 2] = ((z[i] + 1) * 0.5 * 255) | 0;
      out[k + 3] = 255;
    }
    return null;
  },

  // How much light landed, on a ramp rather than in grey. The sources in one
  // scene are orders of magnitude apart — a flood everything gets a little of,
  // and a lamp that saturates the pixels under it — and a grey scaled to the
  // brightest of them shows the rest as black. Each field is scaled to its own
  // top, and what that top was is handed back, because the number is the
  // comparison the picture has thrown away.
  lux: function (entry, image) {
    var data = entry.data;
    var out = image.data;
    var seen = extent(data);
    var hi = seen.max > 0 ? seen.max : 1;
    var i, k, s, c;
    for (i = 0, k = 0; i < data.length; i++, k += 4) {
      s = (data[i] / hi * HEAT_TOP + 0.5) | 0;
      if (s < 0) s = 0;
      else if (s > HEAT_TOP) s = HEAT_TOP;
      c = HEAT[s];
      out[k] = c[0]; out[k + 1] = c[1]; out[k + 2] = c[2]; out[k + 3] = 255;
    }
    return seen;
  },

  // Already a frame. Copied straight across, because anything else done to it
  // would be the panel showing something other than what was drawn.
  rgba: function (entry, image) {
    image.data.set(entry.data);
    return null;
  }
};

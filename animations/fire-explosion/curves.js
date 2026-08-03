"use strict";

// Every curve here was read off the fifty-frame sprite sheet, step by step.
// A blast set to run longer or shorter stretches this arc rather than losing
// the end of it.

// How hot the whole flame is, step by step: a white flash, a fireball that
// cools band by band, then nothing.
export var HEAT = [[0, 7], [7, 6], [9, 1.8], [11, 0.8], [14, 0.2], [20, 0],
                   [24, -0.4], [28, -1.4], [32, -2.8], [36, -4.6], [40, -6.4], [44, -8]];
// The last of the fire holds together in the middle, the way the sheet keeps
// one bright pocket burning long after the outside has gone dark.
export var CORE = [[0, 0], [18, 0], [23, 1], [28, 2.4], [34, 2.6], [38, 1.4], [42, 0]];

// Half-width and height of the mass, in units of its final size.
export var WIDE = [[0, 0.55], [4, 0.9], [9, 0.76], [14, 0.9], [20, 1],
                   [24, 1.02], [28, 0.94], [33, 0.76], [40, 0.56]];
export var TALL = [[0, 0.38], [4, 0.62], [9, 0.56], [14, 0.74], [20, 0.98],
                   [25, 1.12], [30, 1.12], [36, 0.95], [44, 0.78]];
// It only leaves the ground once it has stopped growing outwards.
export var RISE = [[0, 0], [20, 0], [30, 6], [44, 13]];
// The flash goes up as a clean dome; the outline only starts boiling after it.
export var WOB = [[0, 0.1], [2, 0.4], [6, 0.85], [14, 1.15], [30, 1.3]];
// How much of the flame is torn open, and how hard its outline is gnawed at.
export var TEAR = [[0, 0], [18, 0], [21, 0.08], [24, 0.2], [28, 0.38], [32, 0.55], [36, 0.7], [42, 0.88]];
export var BITE = [[0, 0], [16, 0.06], [24, 0.24], [32, 0.42], [40, 0.55]];

export function curve(table, step) {
  if (step <= table[0][0]) return table[0][1];
  for (var i = 1; i < table.length; i++) {
    if (step <= table[i][0]) {
      var a = table[i - 1], b = table[i];
      return a[1] + (b[1] - a[1]) * ((step - a[0]) / (b[0] - a[0]));
    }
  }
  return table[table.length - 1][1];
}

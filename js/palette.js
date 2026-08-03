"use strict";

import { clamp } from "./maths.js";

// ---------------------------------------------------------------------
// The palette is the whole of assets/reference-sheet.png: the sheet is drawn
// with exactly these eight opaque colours, counted straight out of the file,
// and nothing on the stage is allowed to use any other colour.
// ---------------------------------------------------------------------
export var C = {
  white: 0xffffff,
  paleYellow: 0xfffda5,
  amber: 0xffba38,
  orange: 0xfb642f,
  darkRed: 0x750000,
  deepRed: 0x3a0606,
  smoke: 0x2c2626,
  soot: 0x080808
};

// Coolest to hottest. A pixel picks its colour by how deep inside the flame
// it sits, so the bands follow the outline however crooked it is.
export var FIRE = [C.deepRed, C.darkRed, C.orange, C.amber, C.paleYellow, C.white];

// Only used when the palette lock is switched off: the same band value, but
// mixed between the two colours it falls between instead of snapping to one.
export function blend(v) {
  var f = clamp(v, 0, 5);
  var lo = f | 0;
  var a = FIRE[lo];
  var c = FIRE[lo < 5 ? lo + 1 : 5];
  var t = f - lo;
  var red = Math.round(((a >> 16) & 255) + ((((c >> 16) & 255) - ((a >> 16) & 255)) * t));
  var green = Math.round(((a >> 8) & 255) + ((((c >> 8) & 255) - ((a >> 8) & 255)) * t));
  var blue = Math.round((a & 255) + (((c & 255) - (a & 255)) * t));
  return (red << 16) | (green << 8) | blue;
}

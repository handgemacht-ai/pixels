"use strict";

// The void the diorama floats in: one flat colour, a vignette that closes the
// corners, and a scatter of specks far enough out to read as dust hanging in a
// room rather than as stars.
//
// It is drawn once per stage size and left alone behind every frame. That is not
// only thrift. The frame the drawing path produces is transparent wherever air
// was not lit, so the haze around the lamp is laid over this canvas rather than
// mixed into it — the glow brightens the dark it is drawn on without anyone
// having to remember what colour that patch of dark was.

import { VIEW_W, VIEW_H, S } from "./state.js";
import { C } from "./palette.js";
import { hash01, bayer4 } from "./maths.js";

var SPECK_SEED = 3;

export function makeBackdrop() {
  var canvas = document.createElement("canvas");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  var ctx = canvas.getContext("2d");

  function fill(colour, x, y, w, h) {
    ctx.fillStyle = "#" + ("00000" + colour.toString(16)).slice(-6);
    ctx.fillRect(x, y, w, h);
  }

  fill(C.void, 0, 0, VIEW_W, VIEW_H);

  // The vignette is one step darker than the void and nothing between, because
  // there is nothing between: the fade is carried by how many pixels of each
  // little tile take the darker one. It starts well outside the ground disc, so
  // what it darkens is empty space and never the model.
  var cx = VIEW_W / 2;
  var cy = VIEW_H / 2;
  var half = Math.sqrt(cx * cx + cy * cy);
  var x, y, d, strength;
  for (y = 0; y < VIEW_H; y++) {
    for (x = 0; x < VIEW_W; x++) {
      d = Math.sqrt((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy)) / half;
      strength = (d - 0.62) / 0.38;
      if (strength <= 0) continue;
      if (strength > 1) strength = 1;
      if (strength > bayer4(x, y)) fill(C.ink, x, y, 1, 1);
    }
  }

  // A handful of specks, all in the outer half of the stage. Any nearer the
  // middle and the model draws over them, which wastes them.
  var specks = Math.round(26 * S);
  var i;
  for (i = 0; i < specks; i++) {
    x = Math.floor(hash01(i, 1, SPECK_SEED) * VIEW_W);
    y = Math.floor(hash01(i, 2, SPECK_SEED) * VIEW_H);
    d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / half;
    if (d < 0.42) continue;
    fill(C.dust, x, y, 1, 1);
  }

  return canvas;
}

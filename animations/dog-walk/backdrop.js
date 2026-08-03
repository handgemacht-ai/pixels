"use strict";

import { VIEW_W, VIEW_H, GROUND } from "./state.js";
import { C } from "./palette.js";

// Everything that never moves: the dark behind the dog and the band of ground
// it walks on. Drawn once per stage size and left alone — the marks that slide
// past are part of the frame, not of this.
//
// The grid is the plate's own. Muybridge photographed his animals against a
// wall ruled into squares so a reader could measure how far a leg had travelled
// between one exposure and the next; putting the same wall behind this dog is
// the cheapest way to say what the animation beside it is for.
export function makeBackdrop() {
  var canvas = document.createElement("canvas");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  var ctx = canvas.getContext("2d");

  function fill(colour, x, y, w, h) {
    ctx.fillStyle = "#" + ("00000" + colour.toString(16)).slice(-6);
    ctx.fillRect(x, y, w, h);
  }

  fill(C.night, 0, 0, VIEW_W, VIEW_H);

  var step = Math.max(6, Math.round(VIEW_H / 12));
  var x, y;
  for (x = step; x < VIEW_W; x += step) fill(C.earth, x, 0, 1, GROUND);
  for (y = GROUND - step; y > 0; y -= step) fill(C.earth, 0, y, VIEW_W, 1);

  fill(C.earth, 0, GROUND, VIEW_W, VIEW_H - GROUND);
  return canvas;
}

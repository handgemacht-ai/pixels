"use strict";

import { VIEW_W, VIEW_H, GROUND } from "./state.js";
import { C } from "./palette.js";

// Everything that never moves: the dark behind the dog and the band of ground
// it walks on. Drawn once per stage size and left alone — the marks that slide
// past are part of the frame, not of this.
export function makeBackdrop() {
  var canvas = document.createElement("canvas");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#" + ("00000" + C.night.toString(16)).slice(-6);
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "#" + ("00000" + C.earth.toString(16)).slice(-6);
  ctx.fillRect(0, GROUND, VIEW_W, VIEW_H - GROUND);
  return canvas;
}

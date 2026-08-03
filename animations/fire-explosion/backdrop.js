"use strict";

import { VIEW_W, VIEW_H, GROUND } from "./state.js";
import { C } from "./palette.js";
import { randInt } from "./maths.js";

// The ground line and the grit lying on it: drawn once per stage size, behind
// every frame, and shared by both drawing paths so switching between them
// cannot change a speckle.
export function makeBackdrop() {
  var canvas = document.createElement("canvas");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  var ctx = canvas.getContext("2d");
  var i, x;
  ctx.fillStyle = "#" + ("00000" + C.soot.toString(16)).slice(-6);
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "#" + ("00000" + C.smoke.toString(16)).slice(-6);
  for (x = 0; x < VIEW_W; x++) {
    if ((x + 1) % 2 === 0) ctx.fillRect(x, GROUND, 1, 1);
    ctx.fillRect(x, GROUND + 1, 1, 1);
  }
  for (i = 0; i < 70; i++) {
    ctx.fillRect(randInt(0, VIEW_W - 1), randInt(GROUND + 2, VIEW_H - 1), randInt(1, 3), 1);
  }
  return canvas;
}

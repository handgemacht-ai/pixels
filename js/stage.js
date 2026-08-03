"use strict";

import { P } from "./params.js";

// The stage is 160 x 100 pixels by default. Every frame is drawn one pixel at
// a time into a buffer that size, and the canvas is blown up with
// nearest-neighbour scaling, so one drawn pixel becomes one chunky pixel on
// screen.
export var VIEW_W = 0, VIEW_H = 0, GROUND = 0;

// Twelve visual steps a second — the rate the sprite sheet is played back at
// beside the stage, so a blast and the sheet advance frame for frame. Nothing
// moves between steps; that is what makes it read as hand-animated.
export var STEP = 0, LIFE = 0;

export function applyStage() {
  VIEW_W = P.stageWidth;
  VIEW_H = Math.round(VIEW_W * 10 / 16);
  GROUND = Math.round(VIEW_H * 0.88);
}

export function applyTiming() {
  STEP = 1 / P.stepsPerSec;
  LIFE = P.life;
}

applyStage();
applyTiming();

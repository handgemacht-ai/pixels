"use strict";

// What the platform hands this animation: the live values of its knobs, and
// the size of the stage it is drawing on. Everything else in this folder reads
// both from here.

// The knob values. The same object the control panel writes into, so a knob
// moved on screen is read on the next step without anything being copied.
export var P = {};

// The stage is 160 x 100 pixels by default. Every frame is drawn one pixel at
// a time into a buffer that size, and the canvas is blown up with
// nearest-neighbour scaling, so one drawn pixel becomes one chunky pixel on
// screen.
export var VIEW_W = 0, VIEW_H = 0, GROUND = 0;

export function useParams(params) { P = params; }

export function setStage(width, height) {
  VIEW_W = width;
  VIEW_H = height;
  GROUND = Math.round(VIEW_H * 0.88);
}

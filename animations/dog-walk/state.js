"use strict";

// What the platform hands this animation: the live values of its knobs, and
// the size of the stage it is drawing on. Everything else in this folder reads
// both from here.

// The knob values. The same object the control panel writes into, so a knob
// moved on screen is read on the next step without anything being copied.
export var P = {};

// The stage is 160 x 100 pixels by default. The dog walks on the spot and the
// ground slides underneath it, so the whole animation fits in that box however
// long it runs.
export var VIEW_W = 0, VIEW_H = 0, GROUND = 0, CENTRE = 0;

// Every length in the rig is written for a hundred-pixel-tall stage and
// multiplied by this. A wider stage therefore shows a bigger dog rather than
// the same dog with more room around it, which is what the knob is for.
export var S = 1;

export function useParams(params) { P = params; }

export function setStage(width, height) {
  VIEW_W = width;
  VIEW_H = height;
  S = height / 100;
  // low, so the dog stands in the frame rather than floating in the middle of
  // it, with a band of ground beneath its feet
  GROUND = Math.round(VIEW_H * 0.88);
  // a little behind the middle, which leaves room in front of the nose for the
  // ground to arrive from
  CENTRE = Math.round(VIEW_W * 0.46);
}

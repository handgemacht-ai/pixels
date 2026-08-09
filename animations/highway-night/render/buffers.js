"use strict";

// The two buffers a frame is built in, the four words every stage here writes
// into them with, and the pass that turns the pair into colour.
//
// Six stages share this file. They do not share a drawing order — the two
// assemblies paint a whole road and four kinds of light, and a solo paints one
// thing and takes everything else away — but they all build a frame the same
// way: a material buffer saying what each pixel is made of, a light field
// saying how much light landed on it, and one sweep that reads both. Splitting
// that vocabulary out of the assembled paths is what lets a solo be one file
// rather than a copy of one, and what lets a shot down the road reuse the
// resolve that was written for a shot from the side.
//
// Nothing in here reads a knob. The resolve is handed the two numbers it used
// to fetch out of P, because the stage that owns the knobs is the stage that
// knows what they are called: the still one has no lamp warmth to offer and
// the moving ones do, and neither should have to declare a knob it never shows
// in order to keep this file happy.

import { VIEW_W, VIEW_H, SPEED, LOOP, loopStep } from "../state.js";
import {
  RAMP, ROAD, LANE, EDGE, TAILROAD, SHADOW, FARROAD
} from "../palette.js";
import { vnoiseLoop, bayer4 } from "../maths.js";
import { allocateLight, clearLight, lux, ruby, bandLevel } from "../light.js";
import { forgetSigns } from "../neon.js";

// What each pixel is made of. Exported because every stage's material pass
// hands it to the light pass, which skips air.
export var mat = null;

export var frame = document.createElement("canvas");
var fctx, image;
export var pixels;
export var touched = 0;  // pixels written this step, for the stats strip

// Called again whenever the stage resolution knob moves.
export function allocate() {
  mat = new Uint8Array(VIEW_W * VIEW_H);
  allocateLight();
  forgetSigns();
  frame.width = VIEW_W;
  frame.height = VIEW_H;
  fctx = frame.getContext("2d");
  image = fctx.createImageData(VIEW_W, VIEW_H);
  pixels = image.data;
}

export function clearFrame() { pixels.fill(0); }
export function resetTouched() { touched = 0; }

// The finished buffer, handed to the canvas the texture is made from.
export function blit() { fctx.putImageData(image, 0, 0); }

// The only place in the animation where a float becomes a pixel. Everything
// upstream stays fractional: a lattice rounded early would land one pixel out
// on one side of the loop and the seam would pop.
export function put(x, y, colour) {
  if (colour < 0) return;
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= VIEW_W || y >= VIEW_H) return;
  touched += 1;
  var k = (y * VIEW_W + x) * 4;
  pixels[k] = (colour >> 16) & 255;
  pixels[k + 1] = (colour >> 8) & 255;
  pixels[k + 2] = colour & 255;
  pixels[k + 3] = 255;
}

// A rectangle of material. Clipped rather than wrapped, because every train on
// the road is drawn with one member off each edge instead.
export function slab(id, x0, y0, w, h) {
  var xa = Math.max(0, Math.round(x0));
  var ya = Math.max(0, Math.round(y0));
  var xb = Math.min(VIEW_W, Math.round(x0 + w));
  var yb = Math.min(VIEW_H, Math.round(y0 + h));
  var x, y, row;
  for (y = ya; y < yb; y++) {
    row = y * VIEW_W;
    for (x = xa; x < xb; x++) mat[row + x] = id;
  }
}

// ---------------------------- the resolve ----------------------------
//
// One pass, one decision per pixel: how much light landed here, which of the
// four steps of this material's ramp that is, and what colour that is. Air
// with no light in it resolves to nothing at all and lets the backdrop show
// through, which is how the sky stays the sky.

// How coarse the mottle in the asphalt is, in cells to a loop. Sixteen puts a
// blotch about a quarter of a lamp spacing across, which is the size a patch
// of older surfacing actually is, and — because it is exactly sixteen — the
// grid comes back onto itself at the seam.
var MOTTLE_CELLS = 16;
var MOTTLE_SEED = 37;

// Where a red pool stops being a red pool. More than half the light at a pixel
// having come from a tail lamp is the honest test, and taken at exactly a half
// it draws a hard ellipse on the tarmac: the material changes along one smooth
// contour, and where the road either side of that contour is bright the two
// ramps meet at their top steps with nothing in common. Every other edge in
// this folder is carried by the ordered dither, and this one can be too —
// asking a different share of each pixel of a small tile spreads the changeover
// over a band a few pixels wide, so the red thins into the amber instead of
// ending against it.
var RED_EDGE = 0.34;

// `texture` is which dither carries a value between two bands, `warmth` a band
// offset on the road and its paint, `mottle` whether the asphalt is patched at
// all, and `redEdge` whether the road's changeover to red is dithered. The last
// two are not only switches to look through. The mottle is scrolled, and a
// stage that does not scroll has no cell width to scroll by; and the elevation
// wants the plain red test, because there the pool is a wedge on a band rather
// than a circle on a plane and the join lies under the car anyway.
export function resolve(step, texture, warmth, mottle, redEdge) {
  var cell = SPEED * LOOP / MOTTLE_CELLS;
  var scroll = SPEED * loopStep(step);
  var patched = mottle && cell > 0;
  var x, y, i, m, L, share, ramp, level, colour;
  for (y = 0; y < VIEW_H; y++) {
    for (x = 0; x < VIEW_W; x++) {
      i = y * VIEW_W + x;
      m = mat[i];
      L = lux[i];
      // asphalt is not a flat reflector: it is patched, polished by wheels in
      // some places and coarse in others, and a pool laid over it comes out
      // blotched rather than smooth. Without this the dither has nothing to
      // work against over a wide flat band and resolves into a chequerboard,
      // which reads as static rather than as a surface.
      if (patched && (m === ROAD || m === EDGE || m === TAILROAD ||
          m === SHADOW || m === FARROAD)) {
        L *= 0.76 + 0.48 * vnoiseLoop(x + scroll, y, cell, MOTTLE_CELLS, MOTTLE_SEED);
      }
      // more than half the light here was red, so this is asphalt standing in
      // a tail lamp rather than under a street lamp, and it brightens towards
      // ruby instead of towards amber
      if (m === ROAD || m === FARROAD) {
        share = redEdge ? 0.5 + RED_EDGE * (bayer4(x, y) - 0.5) : 0.5;
        if (ruby[i] > share * L) m = TAILROAD;
      }
      ramp = RAMP[m];
      level = bandLevel(L, x, y, texture, ramp.length);
      // the warmth knob is a band offset, and it is allowed on the road and
      // the paint only: shifting the whole picture would just be a brightness
      // slider, whereas shifting the ground alone is the difference between
      // sodium and the white lamps that replaced it
      if (m === ROAD || m === LANE || m === TAILROAD || m === SHADOW || m === FARROAD) {
        level += warmth;
        if (level < 0) level = 0;
        else if (level >= ramp.length) level = ramp.length - 1;
      }
      colour = ramp[level];
      if (colour >= 0) put(x, y, colour);
    }
  }
}

// ------------------------- the registered backend --------------------
// None of these paths has a canvas of its own: each fills the buffer above and
// hands it to the pixel surface the platform offers, which is what blows it up
// on screen. What differs between one stage and the next is the frame it
// draws, so that is the one thing handed in.

export function makeBackend(ctx, drawFrame) {
  var surface = ctx.surface;
  var scene = ctx.scene;
  var count = { pixels: 0 };

  allocate();
  surface.setFrame(frame);

  return {
    canvas: surface.canvas,

    setBackdrop: function (canvas) { surface.setBackdrop(canvas); },

    resize: function (width, height) {
      allocate();
      surface.resize(width, height);
      surface.setFrame(frame);
    },

    draw: function () {
      resetTouched();
      drawFrame(scene);
    },

    upload: function () {
      blit();
      surface.refresh();
    },

    present: function (dx, dy) { surface.present(dx, dy); },

    readFrame: function () { return new Uint8Array(pixels); },

    stats: function () { count.pixels = touched; return count; }
  };
}

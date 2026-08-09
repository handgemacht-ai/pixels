"use strict";

// The one drawing path, and the order it works in.
//
// A frame is not painted. It is built in four sweeps over two buffers the size
// of the stage, and only the third of them knows anything about colour:
//
//   1. the material pass writes what every pixel is made of — asphalt, paint,
//      gravel, glass, sheet metal, air — back to front, and never a colour;
//   2. the light pass adds up how much light lands on every pixel, from every
//      lamp, headlamp and tail lamp at once, into a float field;
//   3. the resolve turns each pixel into one of the palette's colours by
//      reading its own material's four-step ramp at a level worked out from
//      the light that landed on it;
//   4. the emitters go down last and straight to the frame — neon, filaments,
//      tail lamps and the red they drag. They are sources, not surfaces, and
//      running them back through the ramps would put a street lamp's amber
//      over a pink sign.
//
// Doing it in that order is what makes a car standing inside a lamp's pool
// climb its own ramp — dark paint, lit paint, a hot rim — instead of getting
// the pool's amber laid over it like a film. And adding the light rather than
// taking the brightest source is what makes two overlapping pools brighter
// where they cross, which is the bright / dark / bright rhythm a line of
// street lamps actually has.

import { VIEW_W, VIEW_H, S, P, SPEED, LOOP, loopStep } from "../state.js";
import { C, RAMP, AIR, ROAD, LANE, EDGE, TAILROAD } from "../palette.js";
import { bayer4, vnoiseLoop } from "../maths.js";
import {
  allocateLight, clearLight, lux, ruby, addCone, addHaze, addBloom, bandLevel
} from "../light.js";
import {
  paintGround, paintRail, paintMedian, paintDashes, paintEdgeLine, paintSpeckle
} from "../road.js";
import { poleCount, poleAt, paintPole } from "../pole.js";
import { oncoming, paintTraffic, tailOf } from "../traffic.js";
import { carPose, paintCar, lampAt } from "../car.js";
import { litSigns, paintNeon, forgetSigns } from "../neon.js";
import {
  flareOf, poleCone, poleSpill, poleHaze, poleBloom, headCones, headBloom,
  tailCone, tailBloom
} from "../lightcone.js";

// ------------------------- the drawing buffers -----------------------

var mat;    // what each pixel is made of

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
function put(x, y, colour) {
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
function slab(id, x0, y0, w, h) {
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

// ------------------------- the material pass -------------------------
//
// Back to front, and the order is the picture's depth: the rail is behind the
// far carriageway, the far carriageway is behind the median the poles stand
// on, and the car is in front of everything but the line painted between it
// and the visitor.
//
// Two places depart from the layer list the scene was planned against, and
// both for the same reason — in a side elevation "further down the screen" and
// "nearer the eye" are the same statement, so anything drawn later wins.
// Oncoming traffic goes down before the poles, because a mast standing on the
// median is in front of a car on the far carriageway. The lane dashes go down
// before the hero car, because the centre line of a carriageway is the far
// line: drawn afterwards it would saw the car in half.

function materials(scene, poles, cars, pose) {
  var step = scene.state.step;
  var i;

  paintGround(slab);
  paintRail(slab, step);
  paintTraffic(slab, cars);
  paintMedian(slab, step);
  for (i = 0; i < poles.length; i++) paintPole(slab, poles[i]);
  paintDashes(slab, step);
  paintCar(slab, pose);
  paintEdgeLine(slab);
  paintSpeckle(slab, step);
}

// ---------------------------- the light pass -------------------------
//
// Every source in the scene lands in the same two accumulators. Nothing here
// asks what it is lighting or in what order it got there — that is the whole
// value of the arrangement, and it is why a car driving into a pool comes out
// brighter than the pool or the car would be alone.

function lights(scene, poles, cars, pose) {
  var state = scene.state;
  var i, p, flare, cones, lamp, tail;

  for (i = 0; i < poles.length; i++) {
    p = poles[i];
    flare = flareOf(state, p, i);
    addCone(mat, poleCone(p, flare));
    addCone(mat, poleSpill(p, flare));
    addHaze(mat, poleHaze(p, flare));
    addBloom(poleBloom(p, flare));
  }

  for (i = 0; i < cars.length; i++) {
    tail = tailOf(cars[i]);
    addBloom(tailBloom(tail.x, tail.y, 1));
    addCone(mat, tailCone(tail.x, tail.y, 1, 1));
  }

  lamp = lampAt(pose, true);
  cones = headCones(pose, lamp, state.flash);
  for (i = 0; i < cones.length; i++) addCone(mat, cones[i]);
  addBloom(headBloom(lamp, state.flash));

  lamp = lampAt(pose, false);
  addBloom(tailBloom(lamp.x, lamp.y, 1.2));
  addCone(mat, tailCone(lamp.x, lamp.y, -1, 1.2));
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

function resolve(step) {
  var texture = P.coneTexture;
  var warmth = Math.round(P.lampWarmth);
  var cell = SPEED * LOOP / MOTTLE_CELLS;
  var scroll = SPEED * loopStep(step);
  var x, y, i, m, L, level, colour;
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
      if (m === ROAD || m === EDGE || m === TAILROAD) {
        L *= 0.76 + 0.48 * vnoiseLoop(x + scroll, y, cell, MOTTLE_CELLS, MOTTLE_SEED);
      }
      // more than half the light here was red, so this is asphalt standing in
      // a tail lamp rather than under a street lamp, and it brightens towards
      // ruby instead of towards amber
      if (m === ROAD && ruby[i] > 0.5 * L) m = TAILROAD;
      level = bandLevel(L, x, y, texture);
      // the warmth knob is a band offset, and it is allowed on the road and
      // the paint only: shifting the whole picture would just be a brightness
      // slider, whereas shifting the ground alone is the difference between
      // sodium and the white lamps that replaced it
      if (m === ROAD || m === LANE || m === TAILROAD) {
        level += warmth;
        if (level < 0) level = 0;
        else if (level > 3) level = 3;
      }
      colour = RAMP[m][level];
      if (colour >= 0) put(x, y, colour);
    }
  }
}

// ---------------------------- the emitters ---------------------------
//
// Sources rather than surfaces, and the only things in the animation drawn
// straight to the frame. Every one of them is something that is making light
// rather than receiving it, and none of them may be re-lit.

function emitters(scene, poles, cars, pose) {
  var state = scene.state;
  var trail = Math.round(P.trail * S);
  var i, k, p, tail, lamp, colour;

  // the filament under each cobra head
  for (i = 0; i < poles.length; i++) {
    p = poles[i];
    for (k = 0; k < p.mast; k++) put(p.x + p.arm + k, p.lampY, C.hot);
  }

  // the oncoming cars: a red lamp on the back, the streak it drags out behind
  // it, and one pixel of its own headlamp spilling off the front
  for (i = 0; i < cars.length; i++) {
    tail = tailOf(cars[i]);
    put(tail.x - 1, tail.y, C.tail);
    put(tail.x - 1, tail.y - 1, C.tail);
    for (k = 0; k < trail; k++) {
      // the streak thins as it goes, carried by the dither rather than by a
      // colour between the two reds, because there is no such colour
      colour = k < 2 ? C.tail : C.tailFaint;
      if (k >= 2 && bayer4(tail.x + k, tail.y) > 1 - k / trail) continue;
      put(tail.x + k, tail.y, colour);
    }
    put(cars[i].x - 1, tail.y, C.beam);
  }

  // the hero car's own lamps, which sit on the shell and ride with it
  lamp = lampAt(pose, true);
  put(lamp.x - S, lamp.y, C.hot);
  put(lamp.x - S, lamp.y + S, C.hot);
  if (state.flash > 0) put(lamp.x, lamp.y, C.hot);

  lamp = lampAt(pose, false);
  put(lamp.x + S, lamp.y, C.tail);
  put(lamp.x + S, lamp.y + S, C.tail);

  paintNeon(put, litSigns(state));
}

export function drawFrame(scene) {
  var step = scene.state.step;
  var poles = [];
  var count = poleCount();
  var j;
  for (j = 0; j < count; j++) poles.push(poleAt(j, step));
  var cars = oncoming(step);
  var pose = carPose(scene.state);

  clearFrame();
  mat.fill(AIR);
  clearLight();

  materials(scene, poles, cars, pose);
  lights(scene, poles, cars, pose);
  resolve(step);
  emitters(scene, poles, cars, pose);
}

// ------------------------- the registered backend --------------------
// This path has no canvas of its own: it fills a buffer and hands it to the
// pixel surface the platform offers, which is what blows it up on screen.

export function createJavascriptBackend(ctx) {
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

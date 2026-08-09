"use strict";

// The one drawing path, and the order it works in.
//
// A frame is not painted. The model — what every pixel is made of, how high it
// stands, how far into the picture, which face of a block it is — was built once
// and does not move. Every step then does four things:
//
//   1. the light is cleared, because the light is the only thing that changed;
//   2. every source is added into one float field: the sky, the fill, the lamp,
//      the air the lamp is standing in, and the glare on the lamp itself;
//   3. the resolve turns each pixel into one of the palette's colours by reading
//      its own material's ramp at a level worked out from the light that landed
//      on it, multiplied by a gain map baked at rebuild time;
//   4. the emitters go down last and straight to the frame — the lamp, the crest
//      it catches, the motes in the air. They are making light rather than
//      receiving it, and running them back through the ramps would put stone's
//      colours on a flame.
//
// Steps 2 and 3 are the shared light module. This animation is the first thing
// to use it, and what it contributes is the model: it says what is where and
// which way it faces, and never what colour that is until step 3.

import { createLighting, bayer4 } from "../../../platform/light/index.js";
import {
  P, S, VIEW_W, VIEW_H, POINTER, LOOP, loopStep,
  PX_X, PX_YX, PX_YY, PX_Z, ORIGIN_X, ORIGIN_Y,
  GROUND_R, PLINTH_H, WALL_OUT, TOP_Z, shapeStamp
} from "../state.js";
import { C, RAMP, VOID } from "../palette.js";
import { TAU, frac, hash01 } from "../maths.js";
import { FACES, buildModel } from "../model.js";
import { lightAim, lampHidden, sources } from "../orbit.js";

// How much less a pixel measured down the screen is worth than one measured
// across it, for the box a source is swept over. In this view a step down the
// screen is two thirds depth and one third height, and either can carry a pixel
// half again as far as its own reach — so the box is quoted generously. It is a
// bound and nothing else: too wide costs pixels, too narrow clips the pool.
var BOX_ANISO = 1.6;

// And the same axis, for the relief the normals are worked out from — with the
// sign the other way round. In a raised view, further down the screen is nearer
// the eye rather than further from it, so a surface that falls away downwards is
// tilting towards the viewer and not away. Handing the module a negative weight
// is how that is said in the one number it takes.
var DEPTH_TILT = -1.4;

// Where a pixel counts as being in shadow, and where it counts as lit. Both are
// levels of light rather than bands of a ramp, so the two numbers in the stats
// strip mean the same thing whichever material they are counted over.
var SHADOW_AT = 0.34;
var LIT_AT = 0.60;

// How hot the crest has to be before it catches a hard line. High: this is the
// one emitter drawn over the resolve, and a threshold low enough to outline the
// whole silhouette turns the tower into a sticker.
var RIM_AT = 0.95;

var MOTES = 30;
var MOTE_SEED = 61;
var PUFF_MOTES = 14;
var PUFF_SEED = 67;

var L = null;
var gainMap = null;
var edge = null;
var scratch = null;

var frame = document.createElement("canvas");
var fctx = null, image = null;
var pixels = null;
var touched = 0;

var builtStamp = "";
var reliefStamp = -1;
var pending = [];

function allocate() {
  L = createLighting({
    width: VIEW_W,
    height: VIEW_H,
    air: VOID,
    ramps: RAMP,
    aniso: BOX_ANISO,
    // the model keeps its own depth, so the module is told to hold a buffer for
    // it rather than guessing one from where a pixel landed on the screen
    depth: true,
    faces: FACES,
    lift: 1
  });
  var n = VIEW_W * VIEW_H;
  gainMap = new Float32Array(n);
  edge = new Uint8Array(n);
  scratch = new Float32Array(n);
  frame.width = VIEW_W;
  frame.height = VIEW_H;
  fctx = frame.getContext("2d");
  image = fctx.createImageData(VIEW_W, VIEW_H);
  pixels = image.data;
  builtStamp = "";
  reliefStamp = -1;
}

function put(x, y, colour) {
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

// ---------------------------- the rebuild ----------------------------
//
// Rare, and it has to stay rare: this is the expensive half of the animation and
// it is paid only when the tower is actually a different tower. The normals are
// their own stamp because the relief knob is live and a normal is a property of
// the shape, not of the light — moving that knob is worth one pass over the
// field, and never a step's worth.

function rebuild() {
  var stamp = shapeStamp();
  if (stamp !== builtStamp) {
    buildModel(L, gainMap, edge, scratch);
    builtStamp = stamp;
    reliefStamp = -1;
  }
  if (P.relief !== reliefStamp) {
    L.normals({ relief: P.relief, tilt: DEPTH_TILT, blend: 1 });
    reliefStamp = P.relief;
  }
}

// ---------------------------- the emitters ---------------------------

// The lamp: a small hot blob, hard in the middle and dissolving at the edge on
// the same dither the resolve used. Not drawn at all when the tower is between
// it and the eye.
function drawLamp(lamp) {
  var r = 3.2 * S * lamp.flick;
  var x0 = Math.floor(lamp.x - r), x1 = Math.ceil(lamp.x + r);
  var y0 = Math.floor(lamp.y - r), y1 = Math.ceil(lamp.y + r);
  var x, y, dx, dy, d, colour;
  for (y = y0; y <= y1; y++) {
    for (x = x0; x <= x1; x++) {
      dx = x + 0.5 - lamp.x;
      dy = y + 0.5 - lamp.y;
      d = Math.sqrt(dx * dx + dy * dy) / r;
      if (d > 1) continue;
      if (d < 0.34) colour = C.flameCore;
      else if (d < 0.6) colour = C.flameMid;
      else if (d < 0.84) colour = C.flameEdge;
      else {
        if (bayer4(x, y) > (1 - d) / 0.16) continue;
        colour = C.flameSoot;
      }
      put(x, y, colour);
    }
  }
}

// Dust hanging in the room, rising a lap at a time. Every mote's place is a
// function of its own hash and the phase, so the set at step 48 is the set at
// step 0; and each one is drawn only where nothing else is, which is both how
// they stay behind the tower and the cheapest possible depth test.
function drawMotes(phase, lamp) {
  var mat = L.mat;
  var span = P.lightReach * 30 * S;
  var near = span * 0.7, far = span * 1.6;
  var k, a, r, t, X, Y, Z, x, y, i, dx, dy, d;
  for (k = 0; k < MOTES; k++) {
    a = hash01(k, 1, MOTE_SEED) * TAU + 0.25 * Math.sin(TAU * phase + k);
    r = WALL_OUT * 0.7 + hash01(k, 2, MOTE_SEED) * (GROUND_R - WALL_OUT * 0.7);
    t = frac(hash01(k, 3, MOTE_SEED) + phase);
    X = r * Math.cos(a);
    Y = r * Math.sin(a);
    Z = PLINTH_H + t * (TOP_Z - PLINTH_H) * 0.95;
    x = Math.round(ORIGIN_X + PX_X * X + PX_YX * Y);
    y = Math.round(ORIGIN_Y - PX_Z * Z - PX_YY * Y);
    if (x < 0 || y < 0 || x >= VIEW_W || y >= VIEW_H) continue;
    i = y * VIEW_W + x;
    if (mat[i] !== VOID) continue;
    dx = x - lamp.x;
    dy = y - lamp.y;
    d = Math.sqrt(dx * dx + dy * dy);
    if (d < near) put(x, y, C.dustHot);
    else if (d < far) put(x, y, C.dust);
  }
}

// What a strike lifts. It runs on the same clock as everything else — the phase
// decides where a mote is, the transient decides whether it is drawn at all —
// so the puff dies out to exactly nothing and leaves no trace in a film.
function drawPuff(state, phase) {
  var life = state.puff;
  var k, a, rise, x, y;
  for (k = 0; k < PUFF_MOTES; k++) {
    a = hash01(k, 1, PUFF_SEED) * TAU;
    rise = (1 - life) * (7 + 9 * hash01(k, 2, PUFF_SEED)) * S;
    x = state.spotX + Math.cos(a) * rise * 1.4;
    y = state.spotY + Math.sin(a) * rise * 0.5 - rise * 0.7;
    if (bayer4(Math.round(x), Math.round(y)) > life) continue;
    put(x, y, life > 0.55 ? C.flameEdge : C.dustHot);
  }
}

// ----------------------------- one frame -----------------------------

function drawFrame(scene) {
  var state = scene.state;
  var phase = frac(loopStep(state.step) / LOOP);

  rebuild();

  var lamp = lightAim(state, POINTER);
  var hidden = lampHidden(L, lamp);

  L.clear();
  var list = sources(state, lamp, hidden, pending);
  var i;
  for (i = 0; i < list.length; i++) L.add(list[i]);

  touched = L.resolve(pixels, { texture: P.texture, gainMap: gainMap });

  // One pass over the field for three things at once: how much of the model the
  // lamp is not reaching, how much of it it is, and the hard line a crest takes
  // when it is reaching it hard.
  var mat = L.mat;
  var lux = L.lux;
  var n = VIEW_W * VIEW_H;
  var shadow = 0, lit = 0, level;
  for (i = 0; i < n; i++) {
    if (mat[i] === VOID) continue;
    level = lux[i] * gainMap[i];
    if (level < SHADOW_AT) shadow += 1;
    else if (level >= LIT_AT) lit += 1;
    if (edge[i] && level >= RIM_AT) put(i % VIEW_W, (i / VIEW_W) | 0, C.rim);
  }

  drawMotes(phase, lamp);
  if (state.puff > 0) drawPuff(state, phase);
  if (!hidden) drawLamp(lamp);

  scene.report(shadow, lit);
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

    draw: function () { drawFrame(scene); },

    upload: function () {
      fctx.putImageData(image, 0, 0);
      surface.refresh();
    },

    present: function (dx, dy) { surface.present(dx, dy); },

    readFrame: function () { return new Uint8Array(pixels); },

    stats: function () { count.pixels = touched; return count; },

    dispose: function () {
      L = null;
      gainMap = null;
      edge = null;
      scratch = null;
      image = null;
      pixels = null;
    }
  };
}

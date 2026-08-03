"use strict";

// The one drawing path. Every bone the skeleton solved is stamped into a
// buffer as a tapered capsule; a pixel takes its colour from which way the
// surface it landed on is facing, and the silhouette is traced afterwards in
// one pass so the outline follows whatever shape the knobs have made.

import { P, VIEW_W, VIEW_H, GROUND } from "../state.js";
import { C } from "../palette.js";
import { clamp, hash01 } from "../maths.js";

// what a pixel of the body is: nothing, or one of the tones, offset by one so
// zero can mean empty
var EMPTY = 0, SHADE = 1, COAT = 2, LIT = 3, CREAM = 4, INK = 5;
var TONES = [0, C.shadow, C.coat, C.coatLit, C.cream, C.ink];

// the light comes from above and a little ahead of the dog
var LX = 0.26, LY = -0.96;

var N = 0;
var body;

export var frame = document.createElement("canvas");
var fctx, image;
export var pixels;
export var touched = 0;

export function allocate() {
  N = VIEW_W * VIEW_H;
  body = new Uint8Array(N);
  frame.width = VIEW_W;
  frame.height = VIEW_H;
  fctx = frame.getContext("2d");
  image = fctx.createImageData(VIEW_W, VIEW_H);
  pixels = image.data;
}

export function blit() { fctx.putImageData(image, 0, 0); }

function put(x, y, colour) {
  if (x < 0 || y < 0 || x >= VIEW_W || y >= VIEW_H) return;
  touched += 1;
  var k = (y * VIEW_W + x) * 4;
  pixels[k] = (colour >> 16) & 255;
  pixels[k + 1] = (colour >> 8) & 255;
  pixels[k + 2] = colour & 255;
  pixels[k + 3] = 255;
}

// ------------------------------ the body -----------------------------

// A bone, thickened: every pixel within the tapering radius of the segment,
// shaded by the direction of the surface it sits on. Two capsules that overlap
// simply take turns, which is what keeps the silhouette solid.
function capsule(bone) {
  var dx = bone.x1 - bone.x0;
  var dy = bone.y1 - bone.y0;
  var len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) len2 = 0.0001;
  var big = Math.max(bone.r0, bone.r1) + 1;
  var x0 = Math.max(0, Math.floor(Math.min(bone.x0, bone.x1) - big));
  var x1 = Math.min(VIEW_W - 1, Math.ceil(Math.max(bone.x0, bone.x1) + big));
  var y0 = Math.max(0, Math.floor(Math.min(bone.y0, bone.y1) - big));
  var y1 = Math.min(VIEW_H - 1, Math.ceil(Math.max(bone.y0, bone.y1) + big));
  var lift = bone.tip === "muzzle" || bone.tip === "tail" ? 1 : 0;

  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var px = x + 0.5 - bone.x0;
      var py = y + 0.5 - bone.y0;
      var t = clamp((px * dx + py * dy) / len2, 0, 1);
      var ox = px - dx * t;
      var oy = py - dy * t;
      var r = bone.r0 + (bone.r1 - bone.r0) * t;
      if (r < 0.35) continue;
      var d2 = ox * ox + oy * oy;
      if (d2 > r * r) continue;

      var tone;
      if (bone.far || bone.tip === "ear") {
        tone = SHADE;
      } else {
        // how much of the light this bit of the surface is turned towards
        var s = (ox * LX + oy * LY) / r;
        tone = s > 0.34 ? LIT + lift : (s < -0.26 ? SHADE : COAT + lift);
        if (tone > CREAM) tone = CREAM;
      }
      body[y * VIEW_W + x] = tone;
    }
  }
}

// The light does not care which capsule a pixel came out of: whatever is at
// the top of the silhouette catches it, and whatever is underneath is in
// shade. One pass over the whole shape, which is what makes a stack of
// capsules read as one animal.
function rim() {
  for (var y = 0; y < VIEW_H; y++) {
    var row = y * VIEW_W;
    for (var x = 0; x < VIEW_W; x++) {
      var i = row + x;
      var here = body[i];
      if (here === EMPTY || here === INK || here === SHADE) continue;
      var above = y > 0 ? body[i - VIEW_W] : EMPTY;
      var below = y < VIEW_H - 1 ? body[i + VIEW_W] : EMPTY;
      if (above === EMPTY) body[i] = here === CREAM ? CREAM : LIT;
      else if (below === EMPTY) body[i] = SHADE;
    }
  }
}

// The outline: every empty pixel with a neighbour inside the dog. Done once
// over the whole silhouette rather than per bone, so the joins do not show.
function outline() {
  for (var y = 0; y < VIEW_H; y++) {
    var row = y * VIEW_W;
    for (var x = 0; x < VIEW_W; x++) {
      var i = row + x;
      if (body[i] !== EMPTY) continue;
      var near =
        (x > 0 && body[i - 1] > EMPTY && body[i - 1] < INK) ||
        (x < VIEW_W - 1 && body[i + 1] > EMPTY && body[i + 1] < INK) ||
        (y > 0 && body[i - VIEW_W] > EMPTY && body[i - VIEW_W] < INK) ||
        (y < VIEW_H - 1 && body[i + VIEW_W] > EMPTY && body[i + VIEW_W] < INK);
      if (near) body[i] = INK;
    }
  }
}

// ------------------------------ the ground ---------------------------

// The dog walks on the spot, so the ground is what moves. Every mark is worked
// out from how far the dog has come rather than remembered, which is why the
// ground never repeats and never has to be stored.
function ground(scroll) {
  var shift = Math.floor(scroll);
  var depth = Math.max(1, VIEW_H - GROUND);
  for (var x = 0; x < VIEW_W; x++) {
    var world = x + shift;
    var lip = hash01(world, 1);
    put(x, GROUND, lip > 0.3 ? C.shadow : C.ink);
    if (lip > 0.93) put(x, GROUND - 1, C.shadow);
    // the grit thins out towards the bottom of the frame, which reads as the
    // ground falling away rather than as a wall of noise
    for (var y = GROUND + 1; y < VIEW_H; y++) {
      var fade = 1 - (y - GROUND) / depth;
      var n = hash01(world, y);
      if (n > 1 - 0.05 * fade) put(x, y, C.shadow);
      else if (n < 0.05 * fade) put(x, y, C.ink);
    }
  }
}

// A paw carrying weight presses a shadow into the ground under it.
function contact(feet) {
  for (var i = 0; i < feet.length; i++) {
    var f = feet[i];
    if (!f.planted) continue;
    var cx = Math.round(f.x);
    for (var d = -2; d <= 2; d++) {
      if (Math.abs(d) === 2 && f.far) continue;
      put(cx + d, GROUND + 1, C.ink);
    }
  }
}

// ------------------------------ the skeleton -------------------------

function line(x0, y0, x1, y1, colour) {
  var ax = Math.round(x0), ay = Math.round(y0);
  var bx = Math.round(x1), by = Math.round(y1);
  var dx = Math.abs(bx - ax), sx = ax < bx ? 1 : -1;
  var dy = -Math.abs(by - ay), sy = ay < by ? 1 : -1;
  var err = dx + dy;
  for (var guard = 0; guard < 400; guard++) {
    put(ax, ay, colour);
    if (ax === bx && ay === by) return;
    var e2 = 2 * err;
    if (e2 >= dy) { err += dy; ax += sx; }
    if (e2 <= dx) { err += dx; ay += sy; }
  }
}

// The showpiece: the bones and joints the pose was actually solved from, laid
// over the dog they produced.
function bones(pose) {
  var i;
  for (i = 0; i < pose.bones.length; i++) {
    var b = pose.bones[i];
    line(b.x0, b.y0, b.x1, b.y1, C.bone);
  }
  for (i = 0; i < pose.joints.length; i++) {
    var j = pose.joints[i];
    var x = Math.round(j.x), y = Math.round(j.y);
    put(x, y, C.cream);
    put(x - 1, y, C.bone);
    put(x + 1, y, C.bone);
    put(x, y - 1, C.bone);
    put(x, y + 1, C.bone);
  }
}

// ------------------------------ one frame ----------------------------

// A single pixel of the body, set after the shading so the light leaves it
// alone — an eye or a nose, which are the same colour whatever they face.
function mark(fx, fy, tone) {
  var x = Math.round(fx);
  var y = Math.round(fy);
  if (x < 0 || y < 0 || x >= VIEW_W || y >= VIEW_H) return;
  if (body[y * VIEW_W + x] === EMPTY) return;
  body[y * VIEW_W + x] = tone;
}

export function drawDog(scene) {
  var pose = scene.pose;
  var i;

  ground(scene.state.scroll);
  contact(pose.feet);

  body.fill(0);
  for (i = 0; i < pose.bones.length; i++) capsule(pose.bones[i]);
  rim();
  if (P.outline) outline();

  // the eye and the nose, put in after the shading so they are not shaded
  var head = pose.head;
  mark(head.eye.x, head.eye.y, INK);
  mark(head.nose.x, head.nose.y, INK);
  mark(head.nose.x, head.nose.y - 1, INK);

  for (var y = 0; y < VIEW_H; y++) {
    var row = y * VIEW_W;
    for (var x = 0; x < VIEW_W; x++) {
      var tone = body[row + x];
      if (tone !== EMPTY) put(x, y, TONES[tone]);
    }
  }

  if (P.skeleton) bones(pose);
}

// ------------------------- the registered backend --------------------

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
      touched = 0;
      pixels.fill(0);
      drawDog(scene);
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

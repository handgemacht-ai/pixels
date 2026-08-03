"use strict";

// The one drawing path.
//
// The dog is not shaded capsule by capsule. Every capsule of one layer is
// stamped into a coverage field, the field is turned into a single mask, and
// the colour of a pixel is then decided by where it sits inside that mask —
// how far below the lit contour it is, and how deep into the mass. A stack of
// lumps therefore comes out as one animal with one skin, rather than as a
// stack of lumps each with its own little highlight.
//
// There are three of those layers, because a side view has three depths: the
// two legs on the far side, the body, and the two legs nearest the viewer.
// Each is masked and shaded on its own and they are laid down back to front,
// which is what keeps four legs looking like four legs.

import { P, VIEW_W, VIEW_H, GROUND, S } from "../state.js";
import { C, BONE } from "../palette.js";
import { clamp, hash01, vnoise } from "../maths.js";

// what a pixel of the body is: nothing, or one of the tones, offset by one so
// zero can mean empty
var EMPTY = 0, FAR = 1, FARLIT = 2, SHADE = 3, COAT = 4, LIT = 5, CREAM = 6, INK = 7;
var TONES = [0, C.far, C.shadow, C.shadow, C.coat, C.coatLit, C.cream, C.ink];
// under the skeleton overlay the animal drops to two flat tones, so thirty
// bones can be read against it without anything being invented for the job
var DIM = [0, C.far, C.far, C.far, C.shadow, C.shadow, C.shadow, C.ink];

var N = 0;
var body;     // the finished tone of every pixel
var cov;      // coverage of the layer being stamped
var mask;     // that layer, as a yes or no
var core;     // the body layer, kept so the near legs know what is over them
var dist;     // how deep inside the layer each pixel sits
var up;       // how many pixels of the layer stand directly above
var run;      // how tall the unbroken column of layer through this pixel is
var cream;    // where the pale markings are allowed to land
var flap;     // the ear, which is painted dark whatever the light says

export var frame = document.createElement("canvas");
var fctx, image;
export var pixels;
export var touched = 0;

export function allocate() {
  N = VIEW_W * VIEW_H;
  body = new Uint8Array(N);
  cov = new Float32Array(N);
  mask = new Uint8Array(N);
  core = new Uint8Array(N);
  dist = new Float32Array(N);
  up = new Int16Array(N);
  run = new Int16Array(N);
  cream = new Uint8Array(N);
  flap = new Uint8Array(N);
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

// ------------------------------ the mass -----------------------------

// A bone, thickened: coverage falls from 1 along the segment to 0 at the
// tapering radius. Overlapping capsules take the larger of the two, so the
// join between them leaves no seam to find later.
function stamp(bone) {
  var dx = bone.x1 - bone.x0;
  var dy = bone.y1 - bone.y0;
  var len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) len2 = 0.0001;
  var big = Math.max(bone.r0, bone.r1) + 1;
  var x0 = Math.max(0, Math.floor(Math.min(bone.x0, bone.x1) - big));
  var x1 = Math.min(VIEW_W - 1, Math.ceil(Math.max(bone.x0, bone.x1) + big));
  var y0 = Math.max(0, Math.floor(Math.min(bone.y0, bone.y1) - big));
  var y1 = Math.min(VIEW_H - 1, Math.ceil(Math.max(bone.y0, bone.y1) + big));
  var pale = bone.tip === "paw";
  var dark = bone.tip === "ear";

  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var px = x + 0.5 - bone.x0;
      var py = y + 0.5 - bone.y0;
      var t = clamp((px * dx + py * dy) / len2, 0, 1);
      var ox = px - dx * t;
      var oy = py - dy * t;
      var r = bone.r0 + (bone.r1 - bone.r0) * t;
      if (r < 0.35) continue;
      var d = Math.sqrt(ox * ox + oy * oy);
      if (d > r) continue;
      var i = y * VIEW_W + x;
      var v = 1 - d / r;
      if (v > cov[i]) cov[i] = v;
      if (pale) cream[i] = 1;
      if (dark) flap[i] = 1;
    }
  }
}

// How deep inside the mask every covered pixel lies. Chamfer 3-4, two passes,
// the same transform the explosion cuts its bands from. Shading a limb from
// this rather than from the direction the capsule was pointing is what stops
// a highlight blinking on and off as the limb swings past vertical.
function distances() {
  var INF = 1e6, x, y, i, m;
  for (y = 0; y < VIEW_H; y++) {
    for (x = 0; x < VIEW_W; x++) {
      i = y * VIEW_W + x;
      if (!mask[i]) { dist[i] = 0; continue; }
      m = INF;
      if (x > 0) m = Math.min(m, dist[i - 1] + 3);
      if (y > 0) m = Math.min(m, dist[i - VIEW_W] + 3);
      if (x > 0 && y > 0) m = Math.min(m, dist[i - VIEW_W - 1] + 4);
      if (x < VIEW_W - 1 && y > 0) m = Math.min(m, dist[i - VIEW_W + 1] + 4);
      dist[i] = m;
    }
  }
  for (y = VIEW_H - 1; y >= 0; y--) {
    for (x = VIEW_W - 1; x >= 0; x--) {
      i = y * VIEW_W + x;
      if (!mask[i]) continue;
      m = dist[i];
      if (x < VIEW_W - 1) m = Math.min(m, dist[i + 1] + 3);
      if (y < VIEW_H - 1) m = Math.min(m, dist[i + VIEW_W] + 3);
      if (x < VIEW_W - 1 && y < VIEW_H - 1) m = Math.min(m, dist[i + VIEW_W + 1] + 4);
      if (x > 0 && y < VIEW_H - 1) m = Math.min(m, dist[i + VIEW_W - 1] + 4);
      dist[i] = m / 3;
    }
  }
}

// Where a pixel sits between the top of its own mass and the bottom of it.
// The light comes from above, so this is the coordinate the coat is banded
// along; taking it from the mask means the bands follow the animal's own
// outline instead of arcing around whatever capsule happened to be underneath.
function columns() {
  var x, y, i, n;
  for (x = 0; x < VIEW_W; x++) {
    n = 0;
    for (y = 0; y < VIEW_H; y++) {
      i = y * VIEW_W + x;
      if (mask[i]) { up[i] = n; n += 1; } else { up[i] = 0; n = 0; }
    }
    n = 0;
    for (y = VIEW_H - 1; y >= 0; y--) {
      i = y * VIEW_W + x;
      if (mask[i]) { n += 1; run[i] = 0; } else { n = 0; }
      run[i] = n;
    }
    // the second sweep left the depth below; add it to the depth above
    for (y = 0; y < VIEW_H; y++) {
      i = y * VIEW_W + x;
      if (mask[i]) run[i] = up[i] + run[i];
    }
  }
}

// Turn the coverage field into a mask. `cut` is how much coverage a pixel needs
// to count as part of the animal: a shade under a half keeps the silhouette
// full without letting the taper of a capsule fray away at its tip.
function toMask(cut) {
  for (var i = 0; i < N; i++) mask[i] = cov[i] > cut ? 1 : 0;
}

function clearField() {
  cov.fill(0);
}

// The light: from above, and a good way in front of the dog, so a limb has a
// bright side and a dark side rather than only a bright top.
var LX = 0.42, LY = -0.91;

// One layer, shaded and written into the picture.
//
// Two things decide a pixel's tone, and neither of them knows which capsule it
// came out of. The first is which way the nearest bit of the skin is facing,
// read off the slope of the distance field: on top of the back that points at
// the light, under the belly it points away, and down the front of a leg it
// points forward — which is why a limb no longer loses its highlight every
// time it swings through vertical. The second is how far down the mass the
// pixel sits, which is what gives the animal a lit back and a dark underside
// however the capsules beneath happen to be arranged.
//
// `flat` paints the two legs on the far side in a pair of dull tones instead
// of the coat's three, which is the whole of the depth cue in a side view.
function shadeLayer(seed, flat, under) {
  distances();
  columns();
  for (var y = 1; y < VIEW_H - 1; y++) {
    var row = y * VIEW_W;
    for (var x = 1; x < VIEW_W - 1; x++) {
      var i = row + x;
      if (!mask[i]) continue;
      var tall = run[i] || 1;

      // the slope of the distance field points into the mass, away from the
      // nearest edge; turned around, it is the way that edge is facing
      var nx = dist[i - 1] - dist[i + 1];
      var ny = dist[i - VIEW_W] - dist[i + VIEW_W];
      var len = Math.sqrt(nx * nx + ny * ny);
      var s = len > 0.001 ? (nx * LX + ny * LY) / len : 0;
      // and it only means anything near the surface: the middle of a thick
      // mass has no facing to speak of
      var shallow = clamp(1 - dist[i] / 4, 0, 1);
      // a limb running out from under the body catches no light where
      // the body is still over it
      if (under && under[i - VIEW_W]) s = -0.4;

      // 0 along the top of the mass, 1 along its underside
      var f = up[i] / tall;
      var n = (vnoise(x, y, 2.4, seed) - 0.5) * 0.20 +
              (vnoise(x, y, 6.0, seed + 11) - 0.5) * 0.13;
      var v = 0.68 + s * 0.62 * shallow + (0.5 - f) * 0.95 + n;

      var tone;
      if (flat) {
        tone = s > 0.30 && dist[i] < 2 ? FARLIT : FAR;
      } else if (up[i] + 1 >= tall && tall > 2) {
        // a dark line under everything, which is what stops a leg dissolving
        // into the ground it is standing on
        tone = SHADE;
      } else if (v > 0.72) {
        tone = LIT;
      } else if (v > 0.20) {
        tone = COAT;
      } else {
        tone = SHADE;
      }
      // the pale markings: only where the animal is already catching the light
      if (!flat && cream[i] && tone >= COAT) tone = CREAM;
      // and the ear, which is a fold of skin rather than a lump of dog
      if (!flat && flap[i]) tone = up[i] < 3 ? SHADE : FAR;
      body[i] = tone;
    }
  }
}

// Where the far legs touch the near ones there is nothing to tell the two
// apart but a change of tone, and at this size that is not enough. One dark
// pixel is.
function separate() {
  for (var y = 0; y < VIEW_H; y++) {
    var row = y * VIEW_W;
    for (var x = 0; x < VIEW_W; x++) {
      var i = row + x;
      if (body[i] !== FAR && body[i] !== FARLIT) continue;
      var near =
        (x > 0 && body[i - 1] > FARLIT && body[i - 1] < INK) ||
        (x < VIEW_W - 1 && body[i + 1] > FARLIT && body[i + 1] < INK) ||
        (y > 0 && body[i - VIEW_W] > FARLIT && body[i - VIEW_W] < INK) ||
        (y < VIEW_H - 1 && body[i + VIEW_W] > FARLIT && body[i + VIEW_W] < INK);
      if (near) body[i] = INK;
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

// The dog walks on the spot, so the ground is what moves. Marks are worked out
// from how far it has come rather than remembered, which is why the ground
// never repeats and never has to be stored — but they are clustered into
// stones and tufts rather than sprinkled pixel by pixel, because a field of
// single pixels has nothing in it for the eye to follow and so reads as
// standing still however fast it is going.
function ground(scroll) {
  var shift = Math.round(scroll);
  var depth = Math.max(1, VIEW_H - GROUND);
  var x, y;

  for (x = 0; x < VIEW_W; x++) {
    var world = x + shift;
    var lip = hash01(world, 1, 0);
    put(x, GROUND, lip > 0.34 ? C.shadow : C.ink);
    for (y = GROUND + 2; y < VIEW_H; y++) {
      // a thin scatter, so the band is not flat, but nothing that competes
      // with the stones
      if (hash01(world, y, 3) > 0.985) put(x, y, C.ink);
    }
  }

  // one feature every few pixels of ground, each one whole so it can be
  // watched crossing the frame
  var CELL = 7;
  var first = Math.floor(shift / CELL) - 1;
  var last = Math.floor((shift + VIEW_W) / CELL) + 1;
  for (var c = first; c <= last; c++) {
    var pick = hash01(c, 7, 1);
    if (pick > 0.62) continue;
    var wx = c * CELL + Math.floor(hash01(c, 11, 2) * CELL);
    var sx = wx - shift;
    if (sx < -6 || sx >= VIEW_W + 6) continue;
    var deep = Math.floor(hash01(c, 13, 4) * (depth - 1));
    var wide = 1 + Math.floor(hash01(c, 17, 5) * 3);
    var high = pick < 0.22 ? 2 : 1;
    var tone = pick < 0.22 ? C.shadow : C.ink;
    for (y = 0; y < high; y++) {
      for (x = 0; x < wide; x++) {
        put(sx + x, GROUND + 2 + deep + y, tone);
      }
    }
  }
}

// A paw carrying weight presses a shadow into the ground under it, and the
// shadow is as wide as the weight is heavy. What is left behind is a print,
// which is the only mark on the ground that says how far the dog has come.
function contact(feet, prints, scroll) {
  var shift = Math.round(scroll);
  var i, d;

  for (i = 0; i < prints.length; i++) {
    var p = prints[i];
    var px = Math.round(p.x) - shift;
    if (px < -4 || px >= VIEW_W + 4) continue;
    if (p.age > 26) continue;
    var faded = p.age > 13;
    for (d = -1; d <= 1; d++) {
      if (faded && d !== 0) continue;
      put(px + d, GROUND + 1, faded ? C.earth : C.ink);
    }
  }

  for (i = 0; i < feet.length; i++) {
    var f = feet[i];
    if (!f.planted) continue;
    var cx = Math.round(f.x);
    var half = Math.round(1 + f.load * (f.far ? 1.6 : 2.6));
    for (d = -half; d <= half; d++) {
      put(cx + d, GROUND + 1, f.far ? C.earth : C.ink);
    }
    if (!f.far && f.load > 0.55) {
      for (d = -Math.max(1, half - 2); d <= Math.max(1, half - 2); d++) {
        put(cx + d, GROUND + 2, C.ink);
      }
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

// The showpiece: the rig the pose was solved from, laid over the dog it
// produced. Three colours, because a single one turns thirty segments into a
// thicket — the line down the middle of the animal, the two legs nearest the
// viewer, and the two behind. Rings mark the two joints that were worked out
// rather than animated, which is the thing worth pointing at.
function bones(pose) {
  var i, j, x, y;
  for (i = 0; i < pose.bones.length; i++) {
    var b = pose.bones[i];
    line(b.x0, b.y0, b.x1, b.y1, BONE[b.part]);
  }
  for (i = 0; i < pose.joints.length; i++) {
    j = pose.joints[i];
    x = Math.round(j.x);
    y = Math.round(j.y);
    if (!j.solved) { put(x, y, BONE[j.part]); continue; }
    put(x, y, BONE.solved);
    put(x - 1, y - 1, BONE[j.part]);
    put(x + 1, y - 1, BONE[j.part]);
    put(x - 1, y + 1, BONE[j.part]);
    put(x + 1, y + 1, BONE[j.part]);
  }
  // a paw with weight on it, which is what the whole rig is arranged around
  for (i = 0; i < pose.feet.length; i++) {
    var f = pose.feet[i];
    if (!f.planted) continue;
    x = Math.round(f.x);
    y = Math.round(f.y);
    put(x, y, BONE.planted);
    put(x - 1, y, BONE.planted);
    put(x + 1, y, BONE.planted);
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

// The head is the one place on the animal worth a few pixels put down by hand:
// an eye with a lit pixel beside it so it does not read as a hole, and a nose
// heavy enough to be the end of a muzzle rather than a smudge on the outline.
function face(pose) {
  var head = pose.head;
  var reach = Math.max(1, Math.round(head.size * 0.22));
  var ca = Math.cos(head.angle), sa = Math.sin(head.angle);

  mark(head.eye.x - ca, head.eye.y - sa, LIT);
  mark(head.eye.x, head.eye.y, INK);

  var nx = head.nose.x - ca * 0.6;
  var ny = head.nose.y - sa * 0.6;
  for (var d = 0; d < reach; d++) {
    mark(nx - sa * d * 0.9, ny + ca * d * 0.9, INK);
    mark(nx - ca * 0.9 - sa * d * 0.9, ny - sa * 0.9 + ca * d * 0.9, INK);
  }
}

export function drawDog(scene) {
  var pose = scene.pose;
  var shapes = pose.shapes;
  var i, k;

  ground(scene.state.scroll);
  contact(pose.feet, scene.prints, scene.state.scroll);

  body.fill(0);
  cream.fill(0);
  flap.fill(0);
  // barely above nothing: a capsule keeps the radius it was given, and only
  // the last sliver of its taper is allowed to fray away
  var cut = 0.08;

  // --- the two legs on the far side ---
  clearField();
  for (i = 0; i < shapes.length; i++) if (shapes[i].far) stamp(shapes[i]);
  toMask(cut);
  shadeLayer(2, true, null);

  // --- the body, head and tail: one mask, so one skin ---
  clearField();
  for (i = 0; i < shapes.length; i++) {
    if (!shapes[i].far && !shapes[i].leg) stamp(shapes[i]);
  }
  toMask(cut);
  core.set(mask);
  shadeLayer(5, false, null);

  // --- and the two nearest the viewer, in front of all of it ---
  clearField();
  for (i = 0; i < shapes.length; i++) if (shapes[i].leg && !shapes[i].far) stamp(shapes[i]);
  toMask(cut);
  shadeLayer(9, false, core);

  separate();
  face(pose);
  if (P.outline) outline();

  var table = P.skeleton ? DIM : TONES;
  for (var y = 0; y < VIEW_H; y++) {
    var row = y * VIEW_W;
    for (var x = 0; x < VIEW_W; x++) {
      var tone = body[row + x];
      if (tone !== EMPTY) put(x, y, table[tone]);
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

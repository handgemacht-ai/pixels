"use strict";

// Everything here builds a step by writing pixels in JavaScript, one at a
// time, into a buffer the size of the stage. js/render/gpu.js does the same
// work in fragment shaders; the two are meant to land on the same bytes.

import { P } from "../params.js";
import { VIEW_W, VIEW_H, GROUND } from "../stage.js";
import { C, FIRE, blend } from "../palette.js";
import { clamp, hash01, vnoise } from "../maths.js";
import { curve, HEAT, CORE, WIDE, TALL, RISE, WOB, TEAR, BITE } from "../curves.js";
import { bounds } from "../blast.js";
import { METRICS } from "../metrics.js";

// ------------------------- the drawing buffers -----------------------

var N;
var cov;    // how solid the mass is at each pixel
var hole;   // the dark pockets punched through it
var mask;   // which pixels the mass covers
var dist;   // how deep inside the outline each one sits

export var frame = document.createElement("canvas");
var fctx, image;
export var pixels;
export var touched = 0;  // pixels written this step, for the stats panel

// Called again whenever the stage resolution knob moves.
export function allocate() {
  N = VIEW_W * VIEW_H;
  cov = new Float32Array(N);
  hole = new Float32Array(N);
  mask = new Uint8Array(N);
  dist = new Float32Array(N);
  frame.width = VIEW_W;
  frame.height = VIEW_H;
  fctx = frame.getContext("2d");
  image = fctx.createImageData(VIEW_W, VIEW_H);
  pixels = image.data;
  METRICS.view = VIEW_W + " x " + VIEW_H;
}
allocate();

export function clearFrame() { pixels.fill(0); }
export function resetTouched() { touched = 0; }

// The finished buffer, handed to the canvas the texture is made from.
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

function clearField(field, r) {
  for (var y = r.y0; y <= r.y1; y++) field.fill(0, y * VIEW_W + r.x0, y * VIEW_W + r.x1 + 1);
}

// The body of the mass: 1 at its middle, fading to 0 at its rim.
function stampOval(field, cx, cy, rx, ry) {
  if (rx <= 0.5 || ry <= 0.5) return;
  var x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(VIEW_W - 1, Math.ceil(cx + rx));
  var y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(VIEW_H - 1, Math.ceil(cy + ry));
  var ix = 1 / (rx * rx), iy = 1 / (ry * ry);
  for (var y = y0; y <= y1; y++) {
    var dy = y + 0.5 - cy;
    var row = y * VIEW_W;
    for (var x = x0; x <= x1; x++) {
      var dx = x + 0.5 - cx;
      var v = 1 - (dx * dx * ix + dy * dy * iy);
      if (v > field[row + x]) field[row + x] = v;
    }
  }
}

// A lump on its shoulder, which is what makes the outline billow.
function stamp(field, cx, cy, r) {
  if (r <= 0.5) return;
  var x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(VIEW_W - 1, Math.ceil(cx + r));
  var y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(VIEW_H - 1, Math.ceil(cy + r));
  var inv = 1 / (r * r);
  for (var y = y0; y <= y1; y++) {
    var dy = y + 0.5 - cy;
    var row = y * VIEW_W;
    for (var x = x0; x <= x1; x++) {
      var dx = x + 0.5 - cx;
      var v = 1 - (dx * dx + dy * dy) * inv;
      if (v > field[row + x]) field[row + x] = v;
    }
  }
}

// How deep inside the outline every covered pixel lies. Chamfer 3-4, two
// passes. Everything about the look hangs off this: bands, rims and the
// ragged edge are all cut from it, so they follow the silhouette instead of
// sitting in rings around a circle.
function distances(r) {
  var INF = 1e6, x, y, i, m;
  for (y = r.y0; y <= r.y1; y++) {
    for (x = r.x0; x <= r.x1; x++) {
      i = y * VIEW_W + x;
      if (!mask[i]) { dist[i] = 0; continue; }
      m = INF;
      if (x > r.x0) m = Math.min(m, dist[i - 1] + 3);
      if (y > r.y0) m = Math.min(m, dist[i - VIEW_W] + 3);
      if (x > r.x0 && y > r.y0) m = Math.min(m, dist[i - VIEW_W - 1] + 4);
      if (x < r.x1 && y > r.y0) m = Math.min(m, dist[i - VIEW_W + 1] + 4);
      dist[i] = m;
    }
  }
  for (y = r.y1; y >= r.y0; y--) {
    for (x = r.x1; x >= r.x0; x--) {
      i = y * VIEW_W + x;
      if (!mask[i]) continue;
      m = dist[i];
      if (x < r.x1) m = Math.min(m, dist[i + 1] + 3);
      if (y < r.y1) m = Math.min(m, dist[i + VIEW_W] + 3);
      if (x < r.x1 && y < r.y1) m = Math.min(m, dist[i + VIEW_W + 1] + 4);
      if (x > r.x0 && y < r.y1) m = Math.min(m, dist[i + VIEW_W - 1] + 4);
      dist[i] = m;
    }
  }
  for (y = r.y0; y <= r.y1; y++) {
    for (x = r.x0; x <= r.x1; x++) {
      i = y * VIEW_W + x;
      if (mask[i]) dist[i] /= 3;
    }
  }
}

// ----------------------------- one frame -----------------------------

export function drawBlast(b) {
  // Every curve below was read off a fifty-frame sheet, so a blast set to run
  // longer or shorter stretches that arc rather than losing the end of it. At
  // the tuned fifty steps this is step for step.
  var step = b.step * b.warp;
  var R = b.Rmax;
  var r = bounds(b);
  var wide = curve(WIDE, step) * R;
  var tall = curve(TALL, step) * R;
  var rise = curve(RISE, step);
  var heat = curve(HEAT, step) + P.heat;
  var tear = curve(TEAR, step) * P.breakup;
  var bite = curve(BITE, step) * P.breakup;
  var wob = curve(WOB, step) * P.outline;
  var cy = b.base - rise - tall * 0.55;
  var i, x, y, k, p, px, py, pr, d, v, cap, n;

  // --- the smoke, drawn first so the flame can sit in front of it ---
  if (step >= 17 && step < 17 + 31 * P.smokeLife) {
    clearField(cov, r);
    for (k = 0; k < b.puffs.length; k++) {
      p = b.puffs[k];
      if (step < p.born) continue;
      n = step - p.born;
      px = b.x + p.ux * wide * 0.95;
      py = cy + p.uy * tall * 0.8 - p.rise * n;
      pr = R * (p.r + p.grow * n);
      stamp(cov, px, py, pr);
    }
    // it does not shrink away evenly: holes open in it and the rest hangs on
    // as wisps
    var sTear = clamp((step - 28) / (15 * P.smokeLife), 0, 1) * 0.85 * P.breakup;
    for (y = r.y0; y <= r.y1; y++) {
      for (x = r.x0; x <= r.x1; x++) {
        i = y * VIEW_W + x;
        mask[i] = 0;
        if (cov[i] <= 0 || y > GROUND) continue;
        if (cov[i] - (vnoise(x, y, 3.6, b.seed + 5) - 0.5) * 0.55 <= 0.18) continue;
        n = vnoise(x, y, 6.5, b.seed + 9) * 0.62 + vnoise(x, y, 2.8, b.seed + 15) * 0.38;
        if (n > sTear) mask[i] = 1;
      }
    }
    distances(r);
    for (y = r.y0; y <= r.y1; y++) {
      for (x = r.x0; x <= r.x1; x++) {
        i = y * VIEW_W + x;
        if (!mask[i]) continue;
        d = dist[i];
        // the edge frays a pixel at a time instead of pulling in smoothly
        if (d < 1.2 && hash01(x, y, b.seed + 13) < 0.3 + sTear * 0.35) continue;
        if (d < 2.4 && vnoise(x, y, 2.2, b.seed + 17) > 0.82) continue;
        // embers still glowing in the smoke while the flame dies
        n = vnoise(x, y, 3.0, b.seed + 19);
        if (step > 20 && step < 38 && n > 0.76 && d < 3) {
          put(x, y, n > 0.84 ? C.darkRed : C.deepRed);
        } else {
          put(x, y, hash01(x, y, b.seed + 23) > 0.95 ? C.soot : C.smoke);
        }
      }
    }
  }

  // --- the flame ---
  if (heat > -6.5) {
    clearField(cov, r);
    clearField(hole, r);
    stampOval(cov, b.x, cy, wide * 0.92, tall * 0.92);
    for (k = 0; k < b.lumps.length; k++) {
      p = b.lumps[k];
      n = step;
      px = b.x + p.ux * wide * (1 + p.drift * n);
      py = cy + p.uy * tall * (1 + p.drift * n) - p.lift * n * n * 0.5;
      pr = R * p.r * P.lumpSize * (0.3 + 0.9 * clamp(step / 14, 0, 1));
      stamp(cov, px, py, pr);
    }
    for (k = 0; k < b.holes.length; k++) {
      p = b.holes[k];
      if (step < p.born) continue;
      n = clamp(step - p.born, 0, 13);
      px = b.x + p.ux * wide;
      py = cy + p.uy * tall;
      pr = R * Math.min(p.r + p.grow * n, p.cap) *
           clamp(n / 3, 0.3, 1) * clamp(1 - (step - 20) / 10, 0, 1);
      stampOval(hole, px, py, pr * p.wide, pr * p.high);
    }

    var iw = 1 / (wide * wide), ih = 1 / (tall * tall);
    var q2, nx, ny;
    for (y = r.y0; y <= r.y1; y++) {
      ny = y + 0.5 - cy;
      for (x = r.x0; x <= r.x1; x++) {
        i = y * VIEW_W + x;
        v = cov[i] > 0 ? cov[i] - (vnoise(x, y, 3.4, b.seed) - 0.5) * 0.36 * wob : -1;
        if (v <= 0.2 || y > GROUND) { mask[i] = 0; continue; }
        if (hole[i] > 0 && hole[i] >= 0.2 + (vnoise(x, y, 4, b.seed + 43) - 0.5) * 0.8 +
                           (hash01(x, y, b.seed + 47) - 0.5) * (0.3 + tear)) { mask[i] = 0; continue; }
        // the outside of the mass tears open first, the middle holds together
        nx = x + 0.5 - b.x;
        q2 = nx * nx * iw + ny * ny * ih;
        n = vnoise(x, y, 8, b.seed + 3) * 0.7 + vnoise(x, y, 3.2, b.seed + 7) * 0.3;
        mask[i] = n > tear * (0.35 + 1.15 * clamp(q2, 0, 1.2)) ? 1 : 0;
      }
    }
    distances(r);

    var core = curve(CORE, step);
    var cyc = cy + tall * 0.04;
    for (y = r.y0; y <= r.y1; y++) {
      ny = (y + 0.5 - cyc) / (tall * 0.62);
      for (x = r.x0; x <= r.x1; x++) {
        i = y * VIEW_W + x;
        if (!mask[i]) continue;
        d = dist[i];
        // gnaw at the outline pixel by pixel, hardest once it breaks up
        if (bite > 0 && d < 2 && hash01(x, y, b.seed + 29) < bite * (d < 1.2 ? 1 : 0.4)) continue;
        // the band boundary itself is jittered, so one colour breaks into the
        // next pixel by pixel while the middle of a band stays flat
        v = d + (hash01(x, y, b.seed + 37) - 0.5) * 1.15 * P.dither +
            (vnoise(x, y, 3, b.seed + 31) - 0.5) * 1.7 * P.dither;
        cap = v < 1.8 ? 1 : v < 3.2 ? 2 : v < 5 ? 3 : v < 8 ? 4 : 5;
        nx = (x + 0.5 - b.x) / (wide * 0.62);
        v = cap + heat + core * clamp(1 - (nx * nx + ny * ny), 0, 1) +
            (vnoise(x, y, 9, b.seed + 53) - 0.5) * 0.7;
        if (v < -0.45) continue;
        // locked, the pixel takes one of the sheet's eight colours. Unlocked,
        // the bands are mixed instead — which is what the discipline of the
        // palette is holding back.
        if (P.paletteLock) put(x, y, FIRE[clamp(Math.round(v), 0, 5)]);
        else put(x, y, blend(v));
      }
    }
  }

  // --- the flash spikes of the first half second: short blunt wedges off the
  // shoulder of the dome, not thin rays ---
  for (k = 0; k < b.rays.length; k++) {
    p = b.rays[k];
    if (step < p.from || step > p.until) continue;
    var from = Math.min(wide, tall) * 0.78;
    var reach = from + R * p.len * P.spikeReach * (1 - (step - p.from) / (p.until - p.from + 2));
    var ca = Math.cos(p.a), sa = Math.sin(p.a);
    for (n = from; n < reach; n += 0.6) {
      x = Math.round(b.x + ca * n);
      y = Math.round(cy + sa * n);
      if (y > GROUND) continue;
      put(x, y, C.white);
      if (n < from + (reach - from) * 0.62) {
        put(x - Math.round(sa), y + Math.round(ca), C.white);
      }
    }
  }

  // --- grit thrown clear of the break-up ---
  for (k = 0; k < b.specks.length; k++) {
    p = b.specks[k];
    if (step < p.born || step > p.born + p.life) continue;
    n = step - p.born;
    x = Math.round(b.x + p.vx * n);
    y = Math.round(cy + p.vy * n + p.grav * n * n);
    if (y > GROUND) continue;
    var tone = p.dark ? C.deepRed : C.darkRed;
    put(x, y, tone);
    if (p.wide) { put(x + 1, y, tone); put(x, y + 1, p.dark ? C.darkRed : C.orange); }
    if (n < 4) put(x, y - 1, C.darkRed);
  }

  // --- dust shoved outwards along the ground ---
  for (k = 0; k < b.dust.length; k++) {
    p = b.dust[k];
    if (step < p.born || step > 34) continue;
    n = step - p.born;
    x = Math.round(b.x + p.side * (p.d0 * R + p.speed * n));
    y = GROUND - (n > 6 ? 2 : 1);
    for (i = 0; i < p.len; i++) {
      if (hash01(x + i, y, b.seed + 41 + n) > 0.35) put(x + i, y, C.smoke);
    }
  }
}

"use strict";

// The sources. This module knows where a light is, which way it points, how
// far it carries and what that adds to every pixel it reaches; index.js owns
// the buffers it adds into.
//
// There is one source shape and five things to do with it, so a lamp, a torch,
// the sky and the glare around a filament are the same object with different
// numbers in it. Nothing here compares sources — they are all added into the
// same accumulator, because taking the brightest at each pixel gives a line of
// lamps a flat sheet of pools all the same brightness, whereas adding them
// makes the place where two pools overlap brighter than either, which is the
// bright / dark / bright rhythm a lit place actually has.
//
// Every reach is a reference length rather than a limit. A source is quoted by
// the distance at which it has fallen to about a band, and it is carried three
// of those before cutting — so the reach knob widens and brightens together,
// the way turning a lamp up does, instead of scissoring the pool off at a hard
// circle.
//
// Two metrics live here, and which one a source uses is a statement about what
// it is lighting:
//
//   * solid is lit in the world metric, where a pixel measured downwards is
//     worth less distance than a pixel measured across, because a raised view
//     carries depth as well as height on the vertical axis. That is what makes
//     a pool spread away from the eye instead of stopping in a disc.
//   * air is lit in the screen metric, isotropically, because a glare around a
//     lamp is a glare and has no ground plane to lie on. A halo stretched to
//     one side leans, and a leaning halo reads as a mistake.

import { bayer4 } from "./bands.js";

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// How far past its reference length a source is allowed to carry. Three is the
// point where the inverse square has taken it down to about a tenth of a band,
// so the cut cannot be seen; further only costs pixels. A source may name its
// own instead, which is how a short, wide, deliberately local wash is stopped
// before it reaches the next lamp's territory.
var CUT = 3;

// The floor under the inverse square. Without it a surface a pixel from the
// filament goes to a few thousand and every knob downstream is arguing with an
// infinity. With it the pixels immediately under a lamp saturate, which is
// what a bright lamp close to a surface does anyway.
var KNEE = 0.1;

// The outer third of a wedge fades instead of ending. A hard edge on a cone is
// the one thing that makes cast light look drawn, and the dither in the
// resolve cannot rescue an edge that steps a whole band at once.
var RIM = 0.35;

// How far a shadow ray looks before giving up, in stage pixels. A shadow that
// carries the whole width of the stage costs the march its resolution: the
// same number of steps spread over four times the distance walks straight
// through anything thin. Past this the scene is better served by a second lamp
// than by a longer shadow.
var SHADOW_CAP = 64;

// ------------------------------ the source ---------------------------
//
// Filled once per add() into a scratch object rather than onto the caller's,
// because scenes build their sources fresh every step and a module that
// scribbled defaults back into them would be handing the scene its own
// leftovers on the next frame.
//
// The scratch belongs to the field rather than to this module. Two fields lit
// on the same page — a stage and a thumbnail of it, say — would otherwise be
// settling their sources into the same object and sweeping each other's boxes.

export function createScratch() {
  return {
    s: {
      kind: "point",
      x: 0, y: 0, h: 0, d: 0,
      ax: 0, ay: 0, az: -1,
      cosHalf: -1, wedge: false,
      span: 1, cut: CUT, gain: 1, wrap: 0.25,
      shade: true, shadow: false, shadowBias: 0.6, shadowSteps: 24
    },
    box: { x0: 0, y0: 0, x1: 0, y1: 0 }
  };
}

function settle(field, raw) {
  var s = field.scratch.s;
  s.kind = raw.kind || "point";
  s.x = raw.x || 0;
  s.y = raw.y || 0;
  s.h = raw.h || 0;

  // The axis is the direction the light travels, so a lamp over a floor points
  // (0, 0, -1) and that is also what a source with no axis at all is taken to
  // mean. It is normalised here so a scene may write a direction rather than a
  // unit vector.
  var ax = raw.ax || 0;
  var ay = raw.ay || 0;
  var az = raw.az === undefined
    ? ((raw.ax === undefined && raw.ay === undefined) ? -1 : 0)
    : raw.az;
  var len = Math.sqrt(ax * ax + ay * ay + az * az);
  if (len < 1e-6) { ax = 0; ay = 0; az = -1; len = 1; }
  s.ax = ax / len;
  s.ay = ay / len;
  s.az = az / len;

  s.cosHalf = clamp(raw.cosHalf === undefined ? -1 : raw.cosHalf, -1, 1);
  // A source that opens all the way round has no wedge at all, and must not be
  // put through one: the wedge term at cosHalf -1 fades to nothing behind the
  // lamp, which would turn every bare bulb into a hemisphere.
  s.wedge = s.cosHalf > -0.999;

  s.span = raw.span === undefined ? 1 : raw.span;
  s.cut = raw.cut || CUT;
  s.gain = raw.gain === undefined ? 1 : raw.gain;
  s.wrap = raw.wrap === undefined ? 0.25 : raw.wrap;
  s.shade = raw.shade === undefined ? true : !!raw.shade;
  s.shadow = !!raw.shadow;
  s.shadowBias = raw.shadowBias === undefined ? 0.6 : raw.shadowBias;
  s.shadowSteps = raw.shadowSteps === undefined ? 24 : raw.shadowSteps;

  // Where the lamp stands in the same metric the pixels are measured in. A
  // scene keeping its own depth buffer gives its lights a `d` to match; without
  // one the lamp is placed by exactly the rule a pixel is placed by, so a lamp
  // and the floor under it agree about where they are.
  s.d = raw.d === undefined ? (s.y + field.lift * s.h) / field.aniso : raw.d;
  return s;
}

// ------------------------------- the box -----------------------------
//
// The rectangle a source can possibly reach, worked out from its own opening
// rather than from a circle around it. A lamp points down: without this every
// sweep would walk as far above the lamp as below it, and each one would cost
// twice the pixels it needs.

export function wedgeBox(field, s, aniso) {
  var box = field.scratch.box;
  var reach = s.span * s.cut;
  var half = Math.acos(clamp(s.cosHalf, -1, 1));

  // A cone tilted out of the picture plane opens wider on screen than its own
  // half-angle, and one tilted far enough covers every screen bearing there
  // is: what the sweep has to cover is the range of bearings the cone can
  // reach, not the angle it was quoted at. `flat` is how much of the axis lies
  // in the picture plane, which is exactly the sine of its tilt.
  var flat = Math.sqrt(s.ax * s.ax + s.ay * s.ay);
  var phi;
  if (!s.wedge || flat <= 1e-6 || half >= Math.PI / 2 || Math.sin(half) >= flat) {
    phi = Math.PI;
  } else {
    phi = Math.asin(Math.sin(half) / flat);
  }

  var mid = Math.atan2(s.ay, s.ax);
  var x0 = s.x, x1 = s.x, y0 = s.y, y1 = s.y;
  // twice as many samples as a narrow fan would need, because this arc is
  // allowed to be a whole circle and an ellipse sampled every thirty degrees
  // misses its own extreme by more than the slack below
  var steps = 24;
  var i, a, ca, sa, t, px, py;
  for (i = 0; i <= steps; i++) {
    a = mid - phi + 2 * phi * i / steps;
    ca = Math.cos(a);
    sa = Math.sin(a);
    // the reach boundary is an ellipse in screen pixels, because the world
    // metric squashes the vertical: solve how far along this ray it lies
    t = reach / Math.sqrt(ca * ca + sa * sa / (aniso * aniso));
    px = s.x + ca * t;
    py = s.y + sa * t;
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }

  // A tall pixel is drawn higher up the screen than the ground it stands on,
  // so a tower standing beside a lamp has its top drawn well outside a box cut
  // for the floor. The box therefore reaches up by as much as the tallest
  // thing in the field can displace, and only up — height never moves a pixel
  // down the screen.
  y0 -= field.lift * field.hmax;

  // two pixels of slack, because the extreme of the arc can still fall between
  // two of the samples above
  box.x0 = Math.max(0, Math.floor(x0) - 2);
  box.y0 = Math.max(0, Math.floor(y0) - 2);
  box.x1 = Math.min(field.width - 1, Math.ceil(x1) + 2);
  box.y1 = Math.min(field.height - 1, Math.ceil(y1) + 2);
  return box;
}

// ----------------------------- the shadow ----------------------------
//
// A height field seen from one side has one honest way to cast a shadow: walk
// from the pixel towards the lamp and ask whether anything along the way
// stands higher than the straight line between the two. It is a screen-space
// march because a shadow is a shape somebody has to read, and it is walked
// with a dithered start so the steps show up as the same grain the resolve
// already has rather than as a set of concentric arcs.
//
// It runs last of all the tests. A pixel that faces away from the lamp or sits
// past its reach is already dark, and marching for it would be the most
// expensive way possible of confirming that.
export function occluded(field, s, x, y, h0) {
  var w = field.width;
  var height = field.height;
  var mat = field.mat;
  var hgt = field.hgt;
  var air = field.air;
  var ux, uy, rise, reach;

  if (s.kind === "sun") {
    // a sun has no place to march towards, only a direction to march against
    var flat = Math.sqrt(s.ax * s.ax + s.ay * s.ay);
    if (flat <= 1e-6) return false;  // straight overhead: nothing casts sideways
    ux = -s.ax / flat;
    uy = -s.ay / flat;
    rise = -s.az / flat;
    reach = SHADOW_CAP;
  } else {
    var dx = s.x - (x + 0.5);
    var dy = s.y - (y + 0.5);
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) return false;
    ux = dx / dist;
    uy = dy / dist;
    rise = (s.h - h0) / dist;
    reach = dist < SHADOW_CAP ? dist : SHADOW_CAP;
  }

  var steps = s.shadowSteps;
  var jitter = bayer4(x, y);
  var bias = s.shadowBias;
  var k, t, sx, sy, si;
  for (k = 0; k < steps; k++) {
    t = (k + jitter) / steps * reach;
    // the pixel itself is never its own blocker
    if (t < 0.5) continue;
    sx = Math.round(x + 0.5 + ux * t);
    sy = Math.round(y + 0.5 + uy * t);
    // off the stage there is nothing left that could block, and pretending
    // otherwise would put a shadow along every edge
    if (sx < 0 || sy < 0 || sx >= w || sy >= height) return false;
    si = sy * w + sx;
    if (mat[si] === air) continue;
    if (hgt[si] > h0 + rise * t + bias) return true;
  }
  return false;
}

// ------------------------------ the floods ---------------------------
//
// Light with no place, only a direction: the sky, and whatever stands in for
// the sun. Neither falls off, because both are already infinitely far away, so
// they are the only sources whose brightness is the same at both ends of the
// stage — which is what makes them the floor the placed lamps are read
// against.

function flood(field, s, allowShadow) {
  var n = field.width * field.height;
  var mat = field.mat;
  var air = field.air;
  var hgt = field.hgt;
  var lux = field.lux;
  var nx = field.nx, ny = field.ny, nz = field.nz;
  // the vector from the surface back towards the light, which is the way round
  // a normal wants it
  var lx = -s.ax, ly = -s.ay, lz = -s.az;
  var wrap = s.wrap;
  var gain = s.gain;
  var shade = s.shade;
  var shadow = allowShadow && s.shadow;
  var width = field.width;
  var i, ndl;
  for (i = 0; i < n; i++) {
    if (mat[i] === air) continue;
    if (shade) {
      ndl = (nx[i] * lx + ny[i] * ly + nz[i] * lz + wrap) / (1 + wrap);
      if (ndl <= 0) continue;
    } else {
      ndl = 1;
    }
    if (shadow && occluded(field, s, i % width, (i / width) | 0, hgt[i])) continue;
    lux[i] += gain * ndl;
  }
}

// The level everything is read against. Turned all the way down the scene is
// lit only where a lamp reaches it, which is a night; turned up it is an
// overcast afternoon with the lamps barely showing. Shaded against its own
// axis it is a sky rather than a flat fill: what faces up gets more of it,
// which is most of what makes a raised thing read as raised at all.
export function addAmbient(field, raw) {
  var s = settle(field, raw);
  if (s.gain <= 0) return;
  flood(field, s, false);
}

// The same thing with a shadow behind it. A sun is a direction, a strength and
// nothing else — no span, no cut, no cone — so the only knob that changes the
// picture is where it is coming from.
export function addSun(field, raw) {
  var s = settle(field, raw);
  if (s.gain <= 0) return;
  flood(field, s, true);
}

// ------------------------------ the lamps ----------------------------

// A lamp in a place: a bulb if it opens all the way round, a wedge if it does
// not. Air is skipped — what light does to air is scatter, which is a much
// weaker and much broader thing with its own pass below, so the haze knob can
// turn it off without taking the pools with it.
export function addPoint(field, raw) {
  var s = settle(field, raw);
  if (s.span <= 0.5 || s.gain <= 0) return;
  var box = wedgeBox(field, s, field.aniso);

  var w = field.width;
  var mat = field.mat;
  var air = field.air;
  var hgt = field.hgt;
  var dep = field.dep;
  var lux = field.lux;
  var nx = field.nx, ny = field.ny, nz = field.nz;
  var lift = field.lift;
  var aniso = field.aniso;
  var inv = 1 / (s.span * s.span);
  var far = s.cut * s.cut;
  var x, y, i, row, dx, dy, dz, q, len, cos, t, cone, ndl;

  for (y = box.y0; y <= box.y1; y++) {
    row = y * w;
    for (x = box.x0; x <= box.x1; x++) {
      i = row + x;
      if (mat[i] === air) continue;
      dx = x + 0.5 - s.x;
      dy = (dep ? dep[i] : (y + 0.5 + lift * hgt[i]) / aniso) - s.d;
      dz = hgt[i] - s.h;
      q = (dx * dx + dy * dy + dz * dz) * inv;
      if (q > far) continue;
      len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 0.001) len = 0.001;

      if (s.wedge) {
        // measured in the same space as the distance, because an axis with a
        // height in it has no meaning on the screen alone: a lamp pointing
        // straight down would open onto nothing
        cos = (dx * s.ax + dy * s.ay + dz * s.az) / len;
        t = (cos - s.cosHalf) / (1 - s.cosHalf);
        if (t <= 0) continue;
        cone = t < RIM ? t / RIM : 1;
      } else {
        cone = 1;
      }

      // Where the night highway leaned on the cone's own axis to shade its
      // pools, a field with normals in it has something better to ask. The
      // wrap is what stops the terminator falling on a hard line: a real
      // surface at this size is never lit by a point, and a wall that goes
      // black the moment it turns away reads as a cut-out.
      if (s.shade) {
        ndl = (-(dx * nx[i] + dy * ny[i] + dz * nz[i]) / len + s.wrap) / (1 + s.wrap);
        if (ndl <= 0) continue;
      } else {
        ndl = 1;
      }

      if (s.shadow && occluded(field, s, x, y, hgt[i])) continue;
      lux[i] += s.gain * ndl * cone / (q + KNEE);
    }
  }
}

// The glare a lamp makes around itself, in every direction and in screen
// pixels. It is what puts a halo in the air over a filament and what makes the
// filament the brightest thing on its own fitting, and it lands on air and on
// solid alike, because glare does. No normals: a glare is in front of the
// surface, not on it.
export function addBloom(field, raw) {
  var s = settle(field, raw);
  if (s.span <= 0.5 || s.gain <= 0) return;
  var w = field.width;
  var lux = field.lux;
  var reach = s.span * 2;
  var x0 = Math.max(0, Math.floor(s.x - reach));
  var y0 = Math.max(0, Math.floor(s.y - reach));
  var x1 = Math.min(w - 1, Math.ceil(s.x + reach));
  var y1 = Math.min(field.height - 1, Math.ceil(s.y + reach));
  var inv = 1 / (s.span * s.span);
  var x, y, row, dx, dy, q;
  for (y = y0; y <= y1; y++) {
    dy = y + 0.5 - s.y;
    row = y * w;
    for (x = x0; x <= x1; x++) {
      dx = x + 0.5 - s.x;
      q = (dx * dx + dy * dy) * inv;
      if (q > 4) continue;
      lux[row + x] += s.gain / (q + 0.25);
    }
  }
}

// The same wedge in the air only, falling off as one over the distance rather
// than one over its square — because what is being seen is not a surface
// returning the light but the whole column of air between the lamp and the
// eye, and that column grows about as fast as the light in it dims.
export function addHaze(field, raw) {
  var s = settle(field, raw);
  if (s.span <= 0.5 || s.gain <= 0) return;
  // in screen pixels: a shaft of lit air has no ground plane to lie on
  var box = wedgeBox(field, s, 1);

  var w = field.width;
  var mat = field.mat;
  var air = field.air;
  var lux = field.lux;
  var inv = 1 / s.span;
  // the axis as the screen sees it. A shaft whose axis is all height has no
  // screen bearing at all, and is taken to open in every direction rather than
  // in none — a wedge measured against nothing would silently light nothing.
  var flat = Math.sqrt(s.ax * s.ax + s.ay * s.ay);
  var wedge = s.wedge && flat > 1e-6;
  var ax = wedge ? s.ax / flat : 0;
  var ay = wedge ? s.ay / flat : 0;
  var x, y, i, row, dx, dy, len, cos, t, d, cone;
  for (y = box.y0; y <= box.y1; y++) {
    dy = y + 0.5 - s.y;
    row = y * w;
    for (x = box.x0; x <= box.x1; x++) {
      i = row + x;
      if (mat[i] !== air) continue;
      dx = x + 0.5 - s.x;
      len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) len = 0.001;
      if (wedge) {
        cos = (dx * ax + dy * ay) / len;
        t = (cos - s.cosHalf) / (1 - s.cosHalf);
        if (t <= 0) continue;
        cone = t < RIM ? t / RIM : 1;
      } else {
        cone = 1;
      }
      d = len * inv;
      if (d > s.cut) continue;
      lux[i] += s.gain * cone / (d + 0.35);
    }
  }
}

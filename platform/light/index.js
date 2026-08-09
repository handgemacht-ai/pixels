"use strict";

// A light field a scene can borrow instead of writing its own.
//
// The bargain is the same one the night highway struck with itself, generalised
// so more than one animation can take it: the scene says what every pixel is
// made of and how high it stands, the module says how much light lands there,
// and only then — in one pass that reads the scene's own ramps — does either
// side mention a colour. Doing it in that order is what makes a thing standing
// inside a pool of light climb its own ramp, dark paint to lit paint to a hot
// rim, instead of getting the pool's colour laid over it like a film.
//
// What the scene brings:
//
//   mat   what each pixel is made of, one id per pixel, `air` meaning nothing
//   hgt   how far each pixel stands above the ground plane, in stage pixels
//   dep   where it stands along the ground plane, if the scene keeps its own
//         depth rather than letting the module infer one from the screen
//   face  which face of a block it is, if the scene wants crisp cube normals
//         rather than the ones a height field alone can give
//   ramps one list of shades per material, darkest first
//
// What the module never does: invent a colour, read the DOM, draw on a random
// source, or import anything from an animation. Every byte it writes came out
// of a ramp the scene handed it, and a run filmed twice comes out byte for byte
// the same.

import { bandLevel, bayer4, resolveInto } from "./bands.js";
import { addAmbient, addSun, addPoint, addBloom, addHaze, createScratch } from "./sources.js";

// passed on rather than re-declared, because a scene drawing its own emitters
// over the resolve has to dither them against the same tile the resolve used
export { bandLevel, bayer4, resolveInto };

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

export function createLighting(options) {
  var o = options || {};
  if (!(o.width > 0) || !(o.height > 0)) {
    throw new Error("pixels: createLighting() needs a width and a height in stage pixels");
  }
  if (!o.ramps) {
    throw new Error("pixels: createLighting() needs ramps — one list of shades per material");
  }

  // The field is one object, and it is the same object the sources are handed
  // and the scene holds on to. It is sized once and never resized: a stage that
  // changes size changes the model with it, so the scene has to build its
  // lighting again anyway and there is nothing here worth keeping across that.
  var field = {
    width: 0,
    height: 0,

    // Which id means nothing at all. Zero by convention, so clearing the
    // material buffer is a plain fill.
    air: o.air === undefined ? 0 : o.air,

    // One list of colours per material, darkest first, any length. An entry
    // below zero is "draw nothing here" and lets the backdrop through.
    ramps: o.ramps,

    // How much less a pixel measured down the screen is worth than one
    // measured across it. In a raised view the vertical axis is carrying depth
    // as well as height, so a pool of light must spread away from the eye
    // rather than stop in a disc. 1 is a flat-on view and no squash at all.
    aniso: o.aniso === undefined ? 1.8 : o.aniso,

    // How far up the screen a pixel is drawn per unit of height. A scene that
    // draws its towers straight up sets 1 and gets their footprints back; the
    // night highway, whose heights are all zero, would set 0.
    lift: o.lift === undefined ? 1 : o.lift,

    // The tallest thing in the field, refreshed by normals(). The sources need
    // it to know how far above a lamp its own light can still be drawn.
    hmax: 0,

    // The face table, if the scene keeps face ids: one [x, y, z] per id, or a
    // hole where an id means nothing in particular.
    faces: o.faces || null,

    // the sources' own working room, held here so two fields never share it
    scratch: createScratch(),

    mat: null, hgt: null, dep: null, face: null,
    nx: null, ny: null, nz: null, lux: null
  };

  function allocate(width, height) {
    var n = width * height;
    field.width = width;
    field.height = height;
    field.mat = new Uint8Array(n);
    field.hgt = new Float32Array(n);
    field.dep = o.depth ? new Float32Array(n) : null;
    field.face = field.faces ? new Uint8Array(n) : null;
    field.nx = new Float32Array(n);
    field.ny = new Float32Array(n);
    field.nz = new Float32Array(n);
    field.lux = new Float32Array(n);
    field.nz.fill(1);
    field.hmax = 0;
    if (field.air) field.mat.fill(field.air);
  }

  allocate(Math.round(o.width), Math.round(o.height));

  // ---------------------------- the normals ---------------------------
  //
  // Worked out from the height field once, whenever the scene's model changes,
  // and never per step: a normal is a property of the shape, and a scene that
  // recomputed them every frame would be paying for a model it had not moved.
  //
  // The one thing this has to get right is the silhouette. A gradient taken
  // across the edge of a raised thing measures the drop to the floor beside it
  // rather than the shape of the thing, and every object comes out wearing a
  // bright rim one pixel wide all the way round. So at any neighbour that is
  // air or off the stage the difference is taken one-sided, against the pixel
  // itself — which says "the surface stops here", and is the truth.
  function normals(options) {
    var p = options || {};
    var relief = p.relief === undefined ? 1 : p.relief;
    var slopeMax = p.slopeMax === undefined ? 6 : p.slopeMax;
    var blend = p.blend === undefined ? 1 : p.blend;

    // What a step down the screen means, and it is a signed thing rather than
    // the field's own `aniso`, which is a squash and only ever positive. Say it
    // positive for a view where further down the screen is further away, so a
    // surface falling away downwards tilts away from the eye; say it negative
    // for a raised view, where further down the screen is *nearer* and that
    // same surface is tilting towards the eye. 1 is the flat-on reading, and
    // the two axes weighed the same — never inherited from anywhere, because a
    // scene that omitted it and got a metric back would get the sign of its
    // relief silently reversed.
    var tilt = p.tilt === undefined ? 1 : p.tilt;

    var w = field.width;
    var h = field.height;
    var mat = field.mat;
    var hgt = field.hgt;
    var face = field.face;
    var faces = field.faces;
    var nx = field.nx, ny = field.ny, nz = field.nz;
    var air = field.air;
    var hmax = 0;
    var x, y, i, hh, back, fore, has, gx, gy, vx, vy, vz, fv, len;

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        hh = hgt[i];
        if (hh > hmax) hmax = hh;
        if (mat[i] === air) { nx[i] = 0; ny[i] = 0; nz[i] = 1; continue; }

        has = 0;
        back = hh; fore = hh;
        if (x > 0 && mat[i - 1] !== air) { back = hgt[i - 1]; has += 1; }
        if (x < w - 1 && mat[i + 1] !== air) { fore = hgt[i + 1]; has += 1; }
        gx = has ? (fore - back) / has : 0;

        has = 0;
        back = hh; fore = hh;
        if (y > 0 && mat[i - w] !== air) { back = hgt[i - w]; has += 1; }
        if (y < h - 1 && mat[i + w] !== air) { fore = hgt[i + w]; has += 1; }
        gy = has ? (fore - back) / has : 0;

        // A cliff a pixel wide would otherwise hand back a normal lying flat on
        // the ground, and a surface facing exactly sideways takes no light at
        // all from anything above it — which reads as a black outline the scene
        // never asked for.
        gx = clamp(gx, -slopeMax, slopeMax);
        gy = clamp(gy, -slopeMax, slopeMax);

        // only the vertical is weighed, because only the vertical is ambiguous:
        // across the screen a step is a step, while down it a step is whatever
        // the view has decided to carry there
        vx = -gx * relief;
        vy = -gy * relief * tilt;
        vz = 1;

        // A height field cannot tell the top of a block from its side: both are
        // flat, and both come out facing the viewer. Where the scene knows
        // which face it drew, it says so, and the two are added rather than
        // swapped so the relief still shows on a face that has one.
        if (faces && face) {
          fv = faces[face[i]];
          if (fv) {
            vx += fv[0] * blend;
            vy += fv[1] * blend;
            vz += fv[2] * blend;
          }
        }

        len = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (len < 1e-6) { nx[i] = 0; ny[i] = 0; nz[i] = 1; continue; }
        nx[i] = vx / len;
        ny[i] = vy / len;
        nz[i] = vz / len;
      }
    }
    field.hmax = hmax;
    return field;
  }

  // ------------------------------ the field ---------------------------

  // Between steps: the light goes, the model stays. A scene whose model is
  // rebuilt every step clears everything instead.
  field.clear = function () {
    field.lux.fill(0);
    return field;
  };

  field.clearAll = function () {
    field.mat.fill(field.air);
    field.hgt.fill(0);
    if (field.dep) field.dep.fill(0);
    if (field.face) field.face.fill(0);
    field.nx.fill(0);
    field.ny.fill(0);
    field.nz.fill(1);
    field.lux.fill(0);
    field.hmax = 0;
    return field;
  };

  field.normals = normals;

  // Every source in the scene lands in the same accumulator, and nothing here
  // asks what it is lighting or in what order it arrived — which is the whole
  // value of the arrangement, and why a thing driving into a pool comes out
  // brighter than either would make it alone.
  field.add = function (source) {
    var kind = (source && source.kind) || "point";
    if (kind === "point") addPoint(field, source);
    else if (kind === "ambient") addAmbient(field, source);
    else if (kind === "sun") addSun(field, source);
    else if (kind === "bloom") addBloom(field, source);
    else if (kind === "haze") addHaze(field, source);
    else throw new Error('pixels: light source of unknown kind "' + kind + '"');
    return field;
  };

  // The float field, spent. `out` is one RGBA quad per pixel — the buffer an
  // ImageData already has — and what comes back is how many pixels were
  // written, which is the number a scene puts in its stats strip.
  field.resolve = function (out, opts) {
    return resolveInto(field, out, opts);
  };

  return field;
}

"use strict";

// Filming the animation as it stands. The button on the page does not hand out
// a file somebody made earlier: it runs the animation that is on screen, with
// the knobs at whatever the visitor has moved them to, for one whole run, and
// writes the GIF in the browser out of the same encoder the command-line tool
// uses. Nothing is fetched and nothing is uploaded.

import { encodeGif, delaysForRate, magnify } from "./gif.js";

// A film wider than this is not more useful, only larger. The magnification is
// a whole number, so a 160-pixel stage becomes 640 and a 320-pixel one 640 too.
var TARGET_WIDTH = 640;
var MAX_SCALE = 8;

// A guard rather than a preference: the sliders cannot reach it, but no
// animation should be able to ask the browser for a film it cannot hold.
export var MAX_FRAMES = 150;

// One drawn pixel becomes a whole number of file pixels, never a fraction.
export function scaleFor(width) {
  return Math.max(1, Math.min(MAX_SCALE, Math.round(TARGET_WIDTH / width)));
}

// How long the film will be, and whether that is as long as it wanted to be.
export function planFilm(api) {
  var wanted = api.filmSteps();
  return { wanted: wanted, steps: Math.min(wanted, MAX_FRAMES), capped: wanted > MAX_FRAMES };
}

// The colours the file's own table is built from. An animation that declares a
// palette gets exactly that palette, in its declared order, so the file holds
// the colours it draws with and no others.
function paletteOf(spec) {
  if (!spec.palette) return null;
  return Object.keys(spec.palette.colours).map(function (name) {
    var rgb = spec.palette.colours[name];
    return { name: name, rgb: [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255] };
  });
}

// The same run twice running gives the same file: the capture borrows the
// random source for as long as it lasts and hands it back afterwards.
function seededRandom(seed) {
  var state = seed >>> 0;
  return function () {
    state = (state + 0x6D2B79F5) >>> 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Films the animation as it stands and hands back a GIF.
//
//   spec        the animation's registration
//   api         the running animation
//   onStep      called with (done, total) as the capture walks the run
//   override    {steps} for a caller that wants a different length
export async function exportGif(spec, api, onStep, override) {
  if (!spec.poster.film) throw new Error("this animation declares no film");

  var plan = planFilm(api);
  var count = (override && override.steps) ? Math.min(override.steps, MAX_FRAMES) : plan.steps;
  var declared = paletteOf(spec);

  // built as the frames arrive, for an animation that declares no palette
  var found = declared ? null : [];
  var lookup = {};
  if (declared) declared.forEach(function (entry, i) {
    lookup[(entry.rgb[0] << 16) | (entry.rgb[1] << 8) | entry.rgb[2]] = i;
  });

  var probe = document.createElement("canvas");
  var ctx = null;
  var strays = {};
  var frames = [];
  var stage = { width: 0, height: 0 };

  function take(canvas) {
    if (!ctx) {
      stage.width = canvas.width;
      stage.height = canvas.height;
      probe.width = stage.width;
      probe.height = stage.height;
      ctx = probe.getContext("2d", { willReadFrequently: true });
    }
    ctx.clearRect(0, 0, stage.width, stage.height);
    ctx.drawImage(canvas, 0, 0);
    var data = ctx.getImageData(0, 0, stage.width, stage.height).data;
    var pixels = new Uint8Array(stage.width * stage.height);
    for (var p = 0, q = 0; q < pixels.length; p += 4, q++) {
      var rgb = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
      var slot = lookup[rgb];
      if (slot === undefined) {
        if (found) {
          if (found.length >= 256) throw new Error("this frame holds more than 256 colours");
          slot = found.length;
          lookup[rgb] = slot;
          found.push([(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255]);
        } else {
          // a colour outside the declared palette: counted, then drawn as the
          // first palette entry rather than silently adding a ninth colour
          var key = ("00000" + rgb.toString(16)).slice(-6);
          strays[key] = (strays[key] || 0) + 1;
          slot = 0;
        }
      }
      pixels[q] = slot;
    }
    frames.push(pixels);
  }

  var real = Math.random;
  Math.random = seededRandom(0x5f3a91c7);
  var shot;
  try {
    shot = await api.record({
      steps: count,
      onFrame: function (canvas) { take(canvas); },
      onStep: onStep
    });
  } finally {
    Math.random = real;
  }

  var palette = declared ? declared.map(function (e) { return e.rgb; }) : found;
  var scale = scaleFor(stage.width);
  var fps = api.cadence();
  var big = frames.map(function (pixels) {
    return magnify(pixels, stage.width, stage.height, scale);
  });
  var delays = delaysForRate(big.length, fps);

  var made = encodeGif({
    width: stage.width * scale,
    height: stage.height * scale,
    palette: palette,
    frames: big,
    delays: delays,
    // the last palette entry is the darkest in both animations, which is what
    // a viewer that honours the background colour should show around the film
    background: palette.length - 1
  });

  return {
    blob: new Blob([made.bytes], { type: "image/gif" }),
    name: spec.id + ".gif",
    bytes: made.bytes.length,
    frames: big.length,
    width: stage.width * scale,
    height: stage.height * scale,
    scale: scale,
    fps: fps,
    seconds: delays.reduce(function (a, b) { return a + b; }, 0) / 100,
    drawnBy: shot.drawnBy,
    colours: palette.length,
    strays: strays,
    capped: plan.capped,
    wanted: plan.wanted
  };
}

// Hands the file to the browser's own download machinery.
export function saveBlob(blob, name) {
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
}

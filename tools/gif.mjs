// Films a whole run of the animation and writes it out as an animated GIF.
//
//   node tools/gif.mjs                    write assets/<animation>.gif
//   node tools/gif.mjs --scale 6          bigger blocks
//   node tools/gif.mjs --out /tmp/try.gif
//
// The run is the one the animation declares as its film: a detonation dead
// centre, stepped forward one frame at a time from a seeded random source, so
// the same bytes come out of every machine. Each frame is the same picture the
// page draws — backdrop and all — magnified by a whole number, and every pixel
// in it is one of the animation's own colours. Nothing is dithered, resampled
// or reduced; the palette goes straight into the file's colour table.

import fs from "node:fs";
import path from "node:path";
import { ROOT, openSite } from "./lib/page.mjs";
import { encodeGif, delaysForRate, magnify } from "../platform/gif.js";

function readArgs(argv) {
  var out = { out: null, scale: null, fps: null, steps: null, animation: null };
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out.out = argv[i + 1];
    if (argv[i] === "--scale") out.scale = Number(argv[i + 1]);
    if (argv[i] === "--fps") out.fps = Number(argv[i + 1]);
    if (argv[i] === "--steps") out.steps = Number(argv[i + 1]);
    if (argv[i] === "--animation") out.animation = argv[i + 1];
  }
  return out;
}

// ------------------------------ in the page --------------------------
// Poses every step of the run in turn and hands each frame back as one byte
// per pixel: an index into the animation's declared palette.

function film(options) {
  var api = window.pixels;
  if (!api.film) throw new Error("this animation does not declare poster.film");

  var names = Object.keys(api.palette.colours);
  var index = {};
  names.forEach(function (name, i) { index[api.palette.colours[name]] = i; });

  var probe = document.createElement("canvas");
  var ctx = null;
  var strays = {};
  var frames = [];
  var width = 0;
  var height = 0;
  var drawnBy = "";

  function pack(bytes) {
    var pieces = [];
    for (var at = 0; at < bytes.length; at += 8192) {
      pieces.push(String.fromCharCode.apply(null, bytes.subarray(at, at + 8192)));
    }
    return btoa(pieces.join(""));
  }

  for (var step = 0; step < options.steps; step++) {
    window.__reseed();
    var shot = api.poster({ step: step, backend: options.backend || undefined });
    if (!ctx) {
      width = shot.width;
      height = shot.height;
      drawnBy = shot.drawnBy;
      probe.width = width;
      probe.height = height;
      ctx = probe.getContext("2d", { willReadFrequently: true });
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(shot.canvas, 0, 0);
    var data = ctx.getImageData(0, 0, width, height).data;
    var pixels = new Uint8Array(width * height);
    for (var p = 0, q = 0; q < pixels.length; p += 4, q++) {
      var rgb = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
      var slot = index[rgb];
      if (slot === undefined) {
        var key = rgb.toString(16).padStart(6, "0");
        strays[key] = (strays[key] || 0) + 1;
        slot = 0;
      }
      pixels[q] = slot;
    }
    frames.push(pack(pixels));
  }

  return {
    width: width,
    height: height,
    frames: frames,
    strays: strays,
    fps: api.cadence(),
    drawnBy: drawnBy,
    palette: names.map(function (name) {
      var rgb = api.palette.colours[name];
      return { name: name, rgb: [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255] };
    })
  };
}

// ------------------------------ back in node -------------------------

async function main() {
  var args = readArgs(process.argv.slice(2));
  var site = await openSite({ animation: args.animation });

  var plan = await site.page.evaluate(function () {
    return {
      id: window.pixels.id,
      film: window.pixels.film,
      // the run as long as the animation's own defaults make it
      steps: window.pixels.film ? window.pixels.filmSteps() : 0
    };
  });
  if (!plan.film) {
    console.error("This animation declares no poster.film, so there is no run to film.");
    await site.close();
    process.exit(1);
  }

  var shot = await site.page.evaluate(film, {
    steps: args.steps || plan.steps,
    backend: null
  });
  await site.close();

  var scale = args.scale || plan.film.scale;
  var fps = args.fps || shot.fps;
  var frames = shot.frames.map(function (encoded) {
    var flat = new Uint8Array(Buffer.from(encoded, "base64"));
    return magnify(flat, shot.width, shot.height, scale);
  });
  var delays = delaysForRate(frames.length, fps);

  var made = encodeGif({
    width: shot.width * scale,
    height: shot.height * scale,
    palette: shot.palette.map(function (entry) { return entry.rgb; }),
    frames: frames,
    delays: delays,
    background: shot.palette.length - 1
  });

  // where the animation says its film lives, which is also where the page
  // links to it from
  var out = args.out || path.join(ROOT, plan.film.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(made.bytes));

  console.log(JSON.stringify({
    wrote: path.relative(ROOT, out),
    size: shot.width * scale + "x" + shot.height * scale,
    stage: shot.width + "x" + shot.height,
    scale: scale,
    drawnBy: shot.drawnBy,
    frames: frames.length,
    fps: fps,
    delaysCs: delays.slice(0, 6).join(",") + " …",
    totalSeconds: Number((delays.reduce(function (a, b) { return a + b; }, 0) / 100).toFixed(3)),
    bytes: made.bytes.length,
    palette: shot.palette.map(function (e) { return e.name; }),
    coloursOutsideThePalette: shot.strays,
    problems: site.problems
  }, null, 2));

  if (Object.keys(shot.strays).length) process.exit(2);
}

main().catch(function (err) { console.error(err); process.exit(1); });

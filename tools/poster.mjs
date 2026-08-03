// Generates the share image and the favicons from a real frame of the
// animation — the poster step the animation declares, drawn by the animation
// itself. No reference material is read: the pixels here are the pixels the
// page draws.
//
//   node tools/poster.mjs                 write assets/ and favicon.ico
//   node tools/poster.mjs --contact out.png   a contact sheet of candidate steps
//   node tools/poster.mjs --step 18       override the declared step
//
// Needs Playwright with Chromium installed; it serves the repository itself on
// a loopback port and drives the real page, with the random source seeded so
// the same frame comes out every run.

import fs from "node:fs";
import path from "node:path";
import { ROOT, openSite } from "./lib/page.mjs";

function readArgs(argv) {
  var out = { contact: null, step: null, animation: null, steps: null };
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === "--contact") out.contact = argv[i + 1] || "contact.png";
    if (argv[i] === "--step") out.step = Number(argv[i + 1]);
    if (argv[i] === "--animation") out.animation = argv[i + 1];
    if (argv[i] === "--steps") out.steps = argv[i + 1].split(",").map(Number);
  }
  if (!out.steps) {
    out.steps = [];
    for (var s = 4; s <= 40; s += 2) out.steps.push(s);
  }
  return out;
}

// ------------------------------ in the page --------------------------
// Everything below runs in the browser, where the animation lives.

function composeAll(options) {
  var api = window.pixels;
  if (window.__reseed) window.__reseed();
  var shot = api.poster(options.step === null ? {} : { step: options.step });
  var stage = shot.canvas;
  var out = {};

  function blank(w, h) {
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    return { canvas: canvas, ctx: ctx };
  }

  // ---- the share image: the frame at eight times its size, cropped to
  // the card so the ground line sits near the bottom, and nothing resampled
  var og = blank(options.og.width, options.og.height);
  og.ctx.fillStyle = options.ink.page;
  og.ctx.fillRect(0, 0, options.og.width, options.og.height);
  // whole multiples of the scale, so every drawn pixel is an exact block and
  // nothing is resampled
  var scale = options.og.scale;
  var dx = Math.round((options.og.width - stage.width * scale) / (2 * scale)) * scale;
  var dy = Math.round(((options.og.height - stage.height * scale) / 2 - options.og.lift) / scale) * scale;
  og.ctx.drawImage(stage, dx, dy, stage.width * scale, stage.height * scale);

  og.ctx.textBaseline = "alphabetic";
  og.ctx.fillStyle = options.ink.hot;
  og.ctx.font = "600 34px " + options.ink.sans;
  og.ctx.fillText(options.title, 56, 80);
  og.ctx.fillStyle = options.ink.dim;
  og.ctx.font = "18px " + options.ink.mono;
  og.ctx.fillText(options.site, 56, 112);
  out.og = og.canvas.toDataURL("image/png");

  // ---- the icons: a square cut out of the same frame
  var icon = shot.icon || {
    size: Math.round(stage.height * 0.4),
    x: Math.round((stage.width - stage.height * 0.4) / 2),
    y: Math.round(stage.height * 0.3)
  };
  function cut(size, pad) {
    var box = blank(size, size);
    box.ctx.fillStyle = options.ink.stage;
    box.ctx.fillRect(0, 0, size, size);
    var inner = size - pad * 2;
    box.ctx.drawImage(stage, icon.x, icon.y, icon.size, icon.size, pad, pad, inner, inner);
    return box.canvas.toDataURL("image/png");
  }
  out.icon32 = cut(32, 0);
  out.icon16 = cut(16, 0);
  out.apple = cut(180, 10);

  // ---- what the frame is made of, so the caller can prove where it came from
  var probe = blank(stage.width, stage.height);
  probe.ctx.drawImage(stage, 0, 0);
  var bytes = probe.ctx.getImageData(0, 0, stage.width, stage.height).data;
  var seen = {};
  for (var i = 0; i < bytes.length; i += 4) {
    var key = ((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]).toString(16).padStart(6, "0");
    seen[key] = (seen[key] || 0) + 1;
  }
  out.stage = { width: stage.width, height: stage.height, step: shot.step, drawnBy: shot.drawnBy, colours: seen };
  out.stagePng = probe.canvas.toDataURL("image/png");
  out.icon = icon;
  return out;
}

function composeContact(options) {
  var api = window.pixels;
  var cols = 6;
  var cell = 2;
  var steps = options.steps;
  var rows = Math.ceil(steps.length / cols);
  if (window.__reseed) window.__reseed();
  var first = api.poster({ step: steps[0] });
  var w = first.width * cell;
  var h = first.height * cell + 18;
  var canvas = document.createElement("canvas");
  canvas.width = cols * w;
  canvas.height = rows * h;
  var ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  steps.forEach(function (step, i) {
    if (window.__reseed) window.__reseed();
    var shot = api.poster({ step: step });
    var x = (i % cols) * w;
    var y = Math.floor(i / cols) * h;
    ctx.drawImage(shot.canvas, x, y, w, h - 18);
    ctx.fillStyle = "#fec874";
    ctx.font = "12px monospace";
    ctx.fillText("step " + step, x + 6, y + h - 5);
  });
  return canvas.toDataURL("image/png");
}

// ------------------------------ back in node -------------------------

function decode(dataUrl) {
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

// An .ico is a tiny directory in front of the PNGs it carries.
function buildIco(images) {
  var header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  var directory = Buffer.alloc(16 * images.length);
  var offset = 6 + 16 * images.length;
  images.forEach(function (image, i) {
    var at = i * 16;
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, at);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, at + 1);
    directory.writeUInt8(0, at + 2);
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(image.body.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += image.body.length;
  });
  return Buffer.concat([header, directory].concat(images.map(function (i) { return i.body; })));
}

var PAGE = {
  // the frame at eight times its size, lifted a little so the ground line
  // sits near the bottom of the card rather than dead centre
  og: { width: 1200, height: 630, scale: 8, lift: 16 },
  ink: {
    page: "#0a0a0f",
    stage: "#080808",
    hot: "#fec874",
    dim: "#8b8578",
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  },
  site: "pixels.handgemacht.ai"
};

async function main() {
  var args = readArgs(process.argv.slice(2));
  var site = await openSite({ animation: args.animation });
  var page = site.page;

  if (args.contact) {
    var sheet = await page.evaluate(composeContact, {
      steps: args.steps
    });
    fs.writeFileSync(args.contact, decode(sheet));
    console.log("contact sheet: " + args.contact);
    await site.close();
    return;
  }

  var title = await page.evaluate(function () { return window.pixels.title; });
  var made = await page.evaluate(composeAll, Object.assign({}, PAGE, {
    step: args.step === null ? null : args.step,
    title: title
  }));

  var assets = path.join(ROOT, "assets");
  fs.mkdirSync(assets, { recursive: true });
  var icon32 = decode(made.icon32);
  var icon16 = decode(made.icon16);
  fs.writeFileSync(path.join(assets, "og.png"), decode(made.og));
  fs.writeFileSync(path.join(assets, "icon-32.png"), icon32);
  fs.writeFileSync(path.join(assets, "icon-16.png"), icon16);
  fs.writeFileSync(path.join(assets, "apple-touch-icon.png"), decode(made.apple));
  fs.writeFileSync(path.join(ROOT, "favicon.ico"), buildIco([
    { size: 16, body: icon16 },
    { size: 32, body: icon32 }
  ]));

  await site.close();

  var colours = Object.keys(made.stage.colours).sort(function (a, b) {
    return made.stage.colours[b] - made.stage.colours[a];
  });
  console.log(JSON.stringify({
    step: made.stage.step,
    drawnBy: made.stage.drawnBy,
    stage: made.stage.width + "x" + made.stage.height,
    iconCrop: made.icon,
    coloursInFrame: colours.map(function (c) { return c + "=" + made.stage.colours[c]; }),
    wrote: [
      "assets/og.png", "assets/icon-32.png", "assets/icon-16.png",
      "assets/apple-touch-icon.png", "favicon.ico"
    ],
    problems: site.problems
  }, null, 2));
}

main().catch(function (err) { console.error(err); process.exit(1); });

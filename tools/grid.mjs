// Renders an animation into a contact sheet: one PNG holding a grid of its own
// frames, so a whole run can be looked at in one go rather than watched.
//
//   node tools/grid.mjs                                       the first animation, as it runs now
//   node tools/grid.mjs --animation dog-walk --scale 4        bigger cells
//   node tools/grid.mjs --steps 0-49:2 --columns 5            every second step of a long run
//   node tools/grid.mjs --set legLength=20,strideLength=34    with the knobs moved
//   node tools/grid.mjs --compare                             against the registered reference
//
// The frames are the ones the page draws, posed one at a time out of a seeded
// run, so the same command gives the same sheet every time. In comparison mode
// the registered reference sheet is laid out above the live frames, column for
// column, stepped the way the player beside the stage steps it: one reference
// frame per step, wrapping when the sheet is shorter than the run.
//
// Sheets are working artifacts, not site assets: they land in tools/out/,
// which is not committed.

import fs from "node:fs";
import path from "node:path";
import { ROOT, openSite, DEFAULT_SEED } from "./lib/page.mjs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

// "0-49:2" · "0,4,8" · "12" — a range with an optional stride, or a list
function parseSteps(spec) {
  if (spec.indexOf(",") >= 0) {
    return spec.split(",").map(function (part) { return Number(part.trim()); });
  }
  var stride = 1;
  var range = spec;
  var colon = spec.indexOf(":");
  if (colon >= 0) {
    stride = Number(spec.slice(colon + 1));
    range = spec.slice(0, colon);
  }
  var dash = range.indexOf("-", 1);
  var from = dash < 0 ? Number(range) : Number(range.slice(0, dash));
  var to = dash < 0 ? from : Number(range.slice(dash + 1));
  var out = [];
  for (var s = from; s <= to; s += stride) out.push(s);
  return out;
}

function parseSet(text, into) {
  text.split(",").forEach(function (pair) {
    var at = pair.indexOf("=");
    if (at < 0) fail('--set wants key=value pairs, not "' + pair + '"');
    into[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
  });
}

function readArgs(argv) {
  var out = {
    animation: null, steps: null, from: 0, count: null, stride: 1,
    columns: null, scale: 2, set: {}, backend: null, seed: DEFAULT_SEED,
    labels: true, compare: false, out: null
  };
  for (var i = 0; i < argv.length; i++) {
    var flag = argv[i];
    var value = argv[i + 1];
    if (flag === "--animation") out.animation = value;
    else if (flag === "--steps") out.steps = parseSteps(value);
    else if (flag === "--from") out.from = Number(value);
    else if (flag === "--count") out.count = Number(value);
    else if (flag === "--stride") out.stride = Number(value);
    else if (flag === "--columns") out.columns = Number(value);
    else if (flag === "--scale") out.scale = Number(value);
    else if (flag === "--set") parseSet(value, out.set);
    else if (flag === "--backend") out.backend = value;
    else if (flag === "--seed") out.seed = Number(value);
    else if (flag === "--labels") out.labels = true;
    else if (flag === "--no-labels") out.labels = false;
    else if (flag === "--compare") out.compare = true;
    else if (flag === "--out") out.out = value;
    else if (flag === "--help" || flag === "-h") { console.log(HELP); process.exit(0); }
    else if (flag.indexOf("--") === 0) fail("unknown option " + flag);
  }
  if (!(out.scale >= 1) || out.scale !== Math.round(out.scale)) {
    fail("--scale is a whole number of screen pixels per drawn pixel");
  }
  return out;
}

var HELP = [
  "node tools/grid.mjs [options]",
  "",
  "  --animation <id>    which registered animation (default: the first)",
  "  --steps <spec>      0-49:2 for a range and stride, or 0,4,8 for a list",
  "  --from <n>          first step, when --steps is not given (default 0)",
  "  --count <n>         how many steps to take (default: one whole run)",
  "  --stride <n>        take every nth step (default 1)",
  "  --columns <n>       cells across (default 6, or the reference's own columns)",
  "  --scale <n>         whole-number magnification (default 2)",
  "  --set k=v[,k=v]     move knobs before drawing; repeatable",
  "  --backend <id>      which drawing path draws the frames",
  "  --seed <n>          the seed the run starts from (default " + DEFAULT_SEED + ")",
  "  --no-labels         leave the step numbers off",
  "  --compare           lay the registered reference sheet above the live frames",
  "  --out <path>        where the PNG goes (default tools/out/<id>-<mode>.png)"
].join("\n");

// ------------------------------ in the page --------------------------
// Everything below runs in the browser, where the animation lives.

// Moves the knobs the caller asked for, complaining about any it does not
// recognise rather than quietly drawing the defaults.
function applyKnobs(wanted) {
  var api = window.pixels;
  var known = {};
  api.knobs.forEach(function (k) { known[k.key] = k; });
  var unknown = [];
  var applied = {};
  Object.keys(wanted).forEach(function (key) {
    var knob = known[key];
    if (!knob) { unknown.push(key); return; }
    var raw = wanted[key];
    var value;
    if (knob.type === "toggle") value = raw === "1" || raw === "true" || raw === "on" || raw === "yes";
    else value = Number(raw);
    api.params[key] = value;
    applied[key] = value;
  });
  api.apply();
  return { applied: applied, unknown: unknown, known: Object.keys(known) };
}

function describe() {
  var api = window.pixels;
  var spec = null;
  return import("/animations/index.js").then(function (mod) {
    mod.ANIMATIONS.forEach(function (entry) { if (entry.id === api.id) spec = entry; });
    return {
      id: api.id,
      title: api.title,
      cadence: api.cadence(),
      backends: api.backends.map(function (b) { return b.id; }),
      film: api.film ? { steps: api.filmSteps() } : null,
      reference: spec && spec.reference
        ? {
          columns: spec.reference.columns,
          frames: spec.reference.frames,
          name: spec.reference.name
        }
        : null
    };
  });
}

// Draws the sheet. One canvas, one pass, handed back as a data URL.
function compose(options) {
  var api = window.pixels;
  var steps = options.steps;
  var scale = options.scale;
  var cols = options.columns;
  var labels = options.labels;
  var compare = options.compare;

  // the reference material, straight off the registration, addressed exactly
  // the way the player beside the stage addresses it
  var ref = null;
  if (compare) {
    var image = document.getElementById("sheet-img");
    if (!image || !image.naturalWidth) throw new Error("the reference sheet has not loaded");
    ref = Object.assign({ image: image }, options.reference);
  }

  var INK = { page: "#0a0a0f", grid: "#1c1a24", text: "#8b8578", hot: "#fec874" };
  var PAD = 6;
  var LABEL = labels ? 15 : 0;
  var HEAD = 22;

  if (window.__reseed) window.__reseed();
  var first = api.poster({ step: steps[0], backend: options.backend || undefined });
  var cellW = first.width * scale;
  var cellH = first.height * scale;

  var blocks = Math.ceil(steps.length / cols);
  var rows = compare ? blocks * 2 : blocks;
  var canvas = document.createElement("canvas");
  canvas.width = cols * (cellW + PAD) + PAD;
  canvas.height = HEAD + rows * (cellH + LABEL + PAD) + PAD;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = INK.page;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = "12px ui-monospace, monospace";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK.hot;
  ctx.fillText(options.caption, PAD, 15);

  function cellBox(row, column) {
    return {
      x: PAD + column * (cellW + PAD),
      y: HEAD + row * (cellH + LABEL + PAD)
    };
  }

  function label(box, words, tone) {
    if (!labels) return;
    ctx.fillStyle = tone;
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(words, box.x + 1, box.y + cellH + 11);
  }

  // A reference frame is whatever shape the plate is; it is fitted into the
  // same box the live frame occupies so the columns line up whatever it is.
  function drawReference(box, frame) {
    var col = frame % ref.columns;
    var row = (frame / ref.columns) | 0;
    var sx = ref.origin.x + col * (ref.frameWidth + ref.gap.x);
    var sy = ref.origin.y + row * (ref.frameHeight + ref.gap.y);
    var fit = Math.min(cellW / ref.frameWidth, cellH / ref.frameHeight);
    var w = Math.round(ref.frameWidth * fit);
    var h = Math.round(ref.frameHeight * fit);
    ctx.imageSmoothingEnabled = fit < 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(box.x, box.y, cellW, cellH);
    ctx.drawImage(ref.image, sx, sy, ref.frameWidth, ref.frameHeight,
      box.x + Math.round((cellW - w) / 2), box.y + Math.round((cellH - h) / 2), w, h);
  }

  var drawnBy = first.drawnBy;
  steps.forEach(function (step, i) {
    var block = Math.floor(i / cols);
    var column = i % cols;
    var liveRow = compare ? block * 2 + 1 : block;

    if (compare) {
      var refBox = cellBox(block * 2, column);
      // one reference frame per step, wrapping — the same walk the player
      // beside the stage does
      var frame = ((step % ref.frames) + ref.frames) % ref.frames;
      drawReference(refBox, frame);
      ctx.strokeStyle = INK.grid;
      ctx.strokeRect(refBox.x + 0.5, refBox.y + 0.5, cellW - 1, cellH - 1);
      label(refBox, "ref " + (frame + 1) + "/" + ref.frames, INK.text);
    }

    if (window.__reseed) window.__reseed();
    var shot = api.poster({ step: step, backend: options.backend || undefined });
    drawnBy = shot.drawnBy;
    var box = cellBox(liveRow, column);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(shot.canvas, box.x, box.y, cellW, cellH);
    ctx.strokeStyle = INK.grid;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, cellW - 1, cellH - 1);
    label(box, "step " + step, INK.hot);
  });

  return {
    png: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
    stage: first.width + "x" + first.height,
    drawnBy: drawnBy
  };
}

// The reference geometry the page normalised, which the composer needs and the
// runtime does not hand out.
function referenceGeometry() {
  return import("/animations/index.js").then(function (mod) {
    var spec = null;
    mod.ANIMATIONS.forEach(function (entry) { if (entry.id === window.pixels.id) spec = entry; });
    if (!spec || !spec.reference) return null;
    var r = spec.reference;
    return {
      columns: r.columns, rows: r.rows, frames: r.frames,
      frameWidth: r.frameSize, frameHeight: r.frameHeight,
      origin: r.origin, gap: r.gap, name: r.name
    };
  });
}

// ------------------------------ back in node -------------------------

async function main() {
  var args = readArgs(process.argv.slice(2));
  var site = await openSite({ animation: args.animation, seed: args.seed });
  var page = site.page;

  var moved = { applied: {}, unknown: [], known: [] };
  if (Object.keys(args.set).length) {
    moved = await page.evaluate(applyKnobs, args.set);
    if (moved.unknown.length) {
      await site.close();
      fail("no such knob: " + moved.unknown.join(", ") +
        "\nthis animation has: " + moved.known.join(", "));
    }
  }

  var about = await page.evaluate(describe);
  if (args.backend && about.backends.indexOf(args.backend) < 0) {
    await site.close();
    fail('no such drawing path "' + args.backend + '" · this animation has: ' + about.backends.join(", "));
  }
  if (args.compare && !about.reference) {
    await site.close();
    fail("this animation registers no reference sheet, so there is nothing to compare against");
  }

  var reference = args.compare ? await page.evaluate(referenceGeometry) : null;

  // A run's worth of steps unless the caller said otherwise: the whole
  // reference sheet when comparing, otherwise the run the animation declares.
  var steps = args.steps;
  if (!steps) {
    var count = args.count;
    if (!count) count = args.compare ? about.reference.frames : (about.film ? about.film.steps : 24);
    steps = [];
    for (var i = 0; i < count; i++) steps.push(args.from + i * args.stride);
  }
  var columns = args.columns || (args.compare ? about.reference.columns : 6);

  var knobNote = Object.keys(moved.applied).map(function (k) {
    return k + "=" + moved.applied[k];
  }).join(" ");
  var caption = about.id + " · steps " + steps[0] + "-" + steps[steps.length - 1] +
    (args.stride > 1 && !args.steps ? " every " + args.stride : "") +
    " · " + args.scale + "x · seed " + args.seed +
    (knobNote ? " · " + knobNote : "") +
    (args.compare ? " · vs " + about.reference.name : "");

  var made = await page.evaluate(compose, {
    steps: steps,
    scale: args.scale,
    columns: columns,
    labels: args.labels,
    compare: args.compare,
    backend: args.backend,
    reference: reference,
    caption: caption
  });
  await site.close();

  var out = args.out
    ? path.resolve(args.out)
    : path.join(ROOT, "tools", "out", about.id + (args.compare ? "-compare" : "-grid") + ".png");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(made.png.split(",")[1], "base64"));

  console.log(JSON.stringify({
    wrote: path.relative(ROOT, out),
    sheet: made.width + "x" + made.height,
    stage: made.stage,
    cells: steps.length,
    columns: columns,
    rows: Math.ceil(steps.length / columns) * (args.compare ? 2 : 1),
    steps: steps.length > 12 ? steps.slice(0, 12).concat(["…"]) : steps,
    scale: args.scale,
    seed: args.seed,
    drawnBy: made.drawnBy,
    knobs: moved.applied,
    compare: args.compare ? about.reference : null,
    problems: site.problems
  }, null, 2));
}

main().catch(function (err) { console.error(err); process.exit(1); });

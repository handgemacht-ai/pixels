"use strict";

// Everything the platform is told about this animation. There is no other way
// in: the page's title, its knobs, its stats, the sprite sheet beside the
// stage, the file browser and the two drawing paths are all built out of what
// is declared here.

import { defineAnimation, knob } from "../../platform/api.js";
import { C } from "./palette.js";
import { useParams, setStage } from "./state.js";
import { createSimulation } from "./simulation.js";
import { makeBackdrop } from "./backdrop.js";
import { createJavascriptBackend } from "./render/cpu.js";
import { createShaderBackend } from "./render/gpu.js";

var SHEET = "https://opengameart.org/sites/default/files/explosion1_5.png";
var SHEET_PAGE = "https://opengameart.org/content/explosion-7";

export default defineAnimation({
  id: "fire-explosion",
  title: "Procedural pixel-art explosion",
  tagline: "PixiJS 8 · 160 × 100 pixels · eight colours · all generated at runtime",
  base: new URL(".", import.meta.url).href,
  action: { verb: "Detonate", noun: "blast" },

  // ---------------------------- the stage ------------------------------
  stage: {
    width: knob("stageWidth"),
    aspect: 10 / 16,
    background: C.soot,
    legend: "flash · spikes · rolling fireball · shadowed hollow · " +
      "break-up · torn smoke · grit · ground dust"
  },
  cadence: knob("stepsPerSec"),
  replay: knob("replay"),

  // The still the share image and the favicon are cut from: a blast dead
  // centre, stepped forward by hand to the frame where the mass has rolled
  // fully open and the shadowed hollow is at its clearest. Drawn by the
  // JavaScript path, so the same frame comes out on any machine. The icon is
  // the fireball itself, cut square at a size that halves and quarters
  // exactly, so the icons downscale without softening a pixel.
  poster: {
    step: 22,
    backend: "javascript",
    icon: { x: 48, y: 22, size: 64 },
    // and the whole blast, all fifty steps of it, at four times the size
    film: { steps: 50, scale: 4 }
  },

  // ---------------------------- the knobs ------------------------------
  // Every number the control panel can move, at the values the animation was
  // tuned to. Leave them all alone and the effect is exactly what it was
  // before there was a panel at all.
  knobs: [
    { group: "stage", key: "stageWidth", label: "resolution", default: 160,
      min: 96, max: 320, step: 16, unit: "px wide", applies: "live" },
    { group: "stage", key: "stepsPerSec", label: "cadence", default: 12,
      min: 4, max: 30, step: 1, unit: "steps/s", applies: "live" },
    { group: "stage", key: "life", label: "blast length", default: 50,
      min: 20, max: 90, step: 1, unit: "steps", applies: "next" },

    { group: "fireball", key: "size", label: "size", default: 1,
      min: 0.4, max: 1.8, step: 0.05, unit: "x", applies: "next" },
    { group: "fireball", key: "lumps", label: "lobes", default: 12,
      min: 0, max: 24, step: 1, applies: "next" },
    { group: "fireball", key: "lumpSize", label: "lobe size", default: 1,
      min: 0, max: 2, step: 0.05, unit: "x", applies: "live" },
    { group: "fireball", key: "outline", label: "outline", default: 1,
      min: 0, max: 2.5, step: 0.05, unit: "x", applies: "live" },
    { group: "fireball", key: "dither", label: "edge dither", default: 1,
      min: 0, max: 2.5, step: 0.05, unit: "x", applies: "live" },
    { group: "fireball", key: "breakup", label: "break-up", default: 1,
      min: 0, max: 2, step: 0.05, unit: "x", applies: "live" },
    { group: "fireball", key: "heat", label: "heat", default: 0,
      min: -3, max: 3, step: 0.1, unit: "bands", applies: "live" },

    { group: "smoke", key: "smokePuffs", label: "puffs", default: 14,
      min: 0, max: 28, step: 1, applies: "next" },
    { group: "smoke", key: "smokeLife", label: "lifetime", default: 1,
      min: 0.2, max: 2.5, step: 0.05, unit: "x", applies: "live" },

    { group: "flash", key: "spikes", label: "spikes", default: 8,
      min: 0, max: 16, step: 1, applies: "next" },
    { group: "flash", key: "spikeReach", label: "spike reach", default: 1,
      min: 0, max: 2.5, step: 0.05, unit: "x", applies: "live" },

    { group: "scene", key: "shake", label: "shake", default: 3,
      min: 0, max: 8, step: 1, unit: "px", applies: "next" },
    { group: "scene", key: "replay", label: "auto-replay", default: 5.2,
      min: 1, max: 12, step: 0.1, unit: "s", applies: "live" },
    { group: "scene", key: "paletteLock", label: "palette lock", type: "toggle",
      default: true, applies: "live" }
  ],

  // ---------------------------- the palette ----------------------------
  palette: {
    colours: C,
    lockKnob: "paletteLock",
    title: "the eight colours of the sprite sheet"
  },

  // -------------------- the sheet played beside the stage --------------
  reference: {
    image: "assets/reference-sheet.png",
    columns: 10,
    rows: 5,
    frames: 50,
    frameSize: 100,
    alt: "An explosion sprite sheet: 50 frames of a fireball laid out on a ten by five grid.",
    credit: "BenHickling · CC0 1.0 · 50 frames of 100 × 100",
    links: [
      { label: "direct file", href: SHEET },
      { label: "source page", href: SHEET_PAGE }
    ],
    legend: "both sides run at the same cadence · restarts on every blast",
    sourceLegend: "read for its palette, its shape and its timing — " +
      "no frame of it is ever drawn on the stage"
  },

  // -------------------- counts for the stats strip ---------------------
  stats: [
    { key: "blasts", label: "blasts" },
    { key: "lobes", label: "lobes" },
    { key: "particles", label: "particles" }
  ],

  // -------------------- what the file browser lists --------------------
  files: [
    { path: "index.js", sub: "everything declared in one place",
      meta: "metadata, knobs, backends, reference material and this list" },
    { path: "state.js", sub: "knob values and stage size",
      meta: "what the platform hands over, shared by everything here" },
    { path: "simulation.js", sub: "the blasts that are alive",
      meta: "detonate, advance a step, count what is burning" },
    { path: "blast.js", sub: "one detonation, laid out",
      meta: "lobes, hollow, puffs, grit, spikes and dust for a single blast" },
    { path: "curves.js", sub: "the arc, read off the sheet",
      meta: "size, heat, rise, tear — frame by frame off the reference sheet" },
    { path: "palette.js", sub: "the sheet's eight colours",
      meta: "counted out of the sprite sheet; nothing else may be drawn" },
    { path: "maths.js", sub: "hash and value noise",
      meta: "the random source both drawing paths share" },
    { path: "backdrop.js", sub: "ground line and grit",
      meta: "drawn once per stage size, behind every frame" },
    { path: "README.md", sub: "how this one is built",
      meta: "fetched and rendered here" },

    { path: "render/cpu.js", open: true, sub: "JavaScript, pixel by pixel",
      meta: "silhouette, chamfer distance, colour bands — all in a loop" },
    { path: "render/gpu.js", sub: "the same picture in passes",
      meta: "seven WebGL 2 programs standing in for the loop above" },
    { path: "render/shaders.js", sub: "the GLSL, as strings",
      meta: "shader source, repeating the JavaScript arithmetic exactly" },

    { path: "assets/reference-sheet.png", sub: "50-frame explosion sheet", pixelated: true,
      meta: "BenHickling · CC0 1.0 · opengameart.org/sites/default/files/explosion1_5.png",
      alt: "The explosion sprite sheet, 50 frames on a ten by five grid",
      caption: "50 frames of 100 × 100 on a 10 × 5 grid, drawn with eight opaque colours. " +
        "Those eight are the animation's whole palette, and the frames set its arc: white " +
        "flash, rolling fireball, break-up, smoke. No frame of it is drawn into the effect. " +
        "BenHickling, CC0 1.0 — " +
        '<a href="' + SHEET + '" target="_blank" rel="noopener">direct file</a> · ' +
        '<a href="' + SHEET_PAGE + '" target="_blank" rel="noopener">source page</a>.' },
    { path: "assets/reference.jpg", sub: "background photo",
      meta: "U.S. Air Force / Capt. Patrick Nichols · public domain",
      alt: "Photograph of a fireball",
      caption: "Background material. This photograph shaped an earlier, painterly version of " +
        "the animation; the pixel-art one takes its palette and its timing from the sprite " +
        "sheet instead, and nothing here feeds it any more." }
  ],

  // -------------------- the two ways it can be drawn -------------------
  defaultBackend: "shaders",
  backends: [
    { id: "javascript", label: "JavaScript",
      note: "JavaScript is drawing the frame a pixel at a time; the shaders are idle",
      stats: [{ key: "pixels", label: "px / step" }],
      create: createJavascriptBackend },
    { id: "shaders", label: "Shaders",
      note: "fragment shaders are drawing the frame; the JavaScript path is idle",
      stats: [{ key: "draws", label: "draw calls" }],
      create: createShaderBackend }
  ],

  // ---------------------------- the animation --------------------------
  create: function (ctx) {
    useParams(ctx.params);
    setStage(ctx.width, ctx.height);
    var sim = createSimulation();
    sim.resize = setStage;
    sim.backdrop = makeBackdrop;
    return sim;
  }
});

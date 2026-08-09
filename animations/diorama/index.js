"use strict";

// Everything the platform is told about this animation. There is no other way
// in: the page's title, its stage, its knobs, its palette, the file browser and
// the one drawing path are all built out of what is declared here.

import { defineAnimation, knob } from "../../platform/api.js";
import { C } from "./palette.js";
import { useParams, usePointer, setStage } from "./state.js";
import { createWorld } from "./world.js";
import { makeBackdrop } from "./backdrop.js";
import { PIPELINE } from "./pipeline.js";
import { createJavascriptBackend } from "./render/cpu.js";

export default defineAnimation({
  id: "diorama",
  title: "A ruined tower under one lamp",
  tagline: "160 x 160 pixels · 28 colours · one integer of state · the only thing that moves is the light",
  base: new URL(".", import.meta.url).href,
  action: { verb: "Strike", noun: "strike" },

  // ---------------------------- the stage ------------------------------
  // Square, and raised three quarters. A tower is a tall subject and a wide
  // frame spends its extra pixels on the void beside it, so the square setting
  // is the one the model is sized against; the 16:10 setting draws a smaller
  // tower rather than the same tower with its crest off the top edge.
  //
  // `track: true` is what puts the pointer listeners on the stage. The platform
  // holds the reading false while a poster or a film is being made, which is the
  // only reason an animation that follows the mouse can be filmed at all.
  stage: {
    width: knob("stageWidth"),
    aspect: knob("stageShape"),
    track: true,
    background: C.void,
    hint: "move the pointer — the light follows it; click to strike the tower",
    legend: "void · rock · rubble · stone · moss · timber · lamp · haze"
  },
  cadence: knob("stepsPerSec"),
  replay: 0,

  // A lap of the lamp is the loop, the film and the length of the run, all at
  // once: `orbitSteps` is the only number any of them is worked out from, so
  // the last frame of the export meets the first however it is set.
  poster: {
    // Three quarters of the way round, which is the lamp due south: hanging in
    // front of the doorway, close enough to the near wall to throw the stair
    // fragment's shadow up it, and low enough that the crest is still in the
    // cold. It is the one bearing where the doorway reads as a doorway rather
    // than as a dark patch. The icon is cut square around the door and the wall
    // above it — the lamp is in it, but not centred in it, because a crop
    // centred on the lamp at sixteen pixels is a bright dot and nothing else.
    step: 36,
    backend: "javascript",
    icon: { x: 44, y: 62, size: 48 },
    // No spot is declared, and none would do anything: both the poster and the
    // film are posed from reset(), and a reset here is a steady state — the lamp
    // due east, no strike running — so no warm-up sits inside the committed file.
    film: {
      steps: knob("orbitSteps"),
      cycles: 1,
      scale: 4,
      file: "assets/diorama.gif"
    }
  },

  // ---------------------------- the knobs ------------------------------
  knobs: [
    { group: "stage", key: "stageWidth", label: "resolution", default: 160,
      min: 144, max: 240, step: 16, unit: "px wide", applies: "live" },
    { group: "stage", key: "stageShape", label: "shape", type: "choice", default: 1,
      options: [{ value: 1, label: "1:1 square" }, { value: 10 / 16, label: "16:10" }],
      applies: "live" },
    { group: "stage", key: "stepsPerSec", label: "cadence", default: 12,
      min: 6, max: 24, step: 1, unit: "steps/s", applies: "live" },

    // This one is the loop. It only takes hold on a lap boundary, because a lap
    // that changed length halfway through would leave the lamp somewhere other
    // than where it started and tear the seam of the film open.
    { group: "light", key: "orbitSteps", label: "steps per lap", default: 48,
      min: 24, max: 96, step: 12, unit: "steps", applies: "next" },
    { group: "light", key: "lightHeight", label: "lamp height", default: 18,
      min: 2, max: 40, step: 1, unit: "px", applies: "live" },
    { group: "light", key: "lightRadius", label: "orbit radius", default: 34,
      min: 10, max: 60, step: 1, unit: "px", applies: "live" },
    { group: "light", key: "lightReach", label: "lamp reach", default: 1,
      min: 0.4, max: 2, step: 0.05, unit: "x", applies: "live" },
    { group: "light", key: "ambient", label: "fill", default: 0.22,
      min: 0, max: 1, step: 0.01, applies: "live" },
    { group: "light", key: "sky", label: "sky", default: 0.18,
      min: 0, max: 1, step: 0.01, applies: "live" },
    { group: "light", key: "wrap", label: "terminator softness", default: 0.25,
      min: 0, max: 0.6, step: 0.01, applies: "live" },
    { group: "light", key: "shadows", label: "cast shadows", type: "toggle", default: true,
      applies: "live" },
    { group: "light", key: "texture", label: "texture", type: "choice", default: 0,
      options: [
        { value: 0, label: "ordered dither" },
        { value: 1, label: "scanline" },
        { value: 2, label: "hard bands" }
      ], applies: "live" },
    { group: "light", key: "follow", label: "follow pointer", type: "toggle", default: true,
      applies: "live" },

    // The tower. All three rebuild it, so all three wait for a lap boundary —
    // a model that changed mid-lap would be two different models inside one
    // film. Relief does not: it is the shape's own normals, worked out in one
    // pass, and it is the knob you want to be able to move while looking at it.
    { group: "model", key: "towerHeight", label: "tower height", default: 26,
      min: 16, max: 34, step: 1, unit: "vox", applies: "next" },
    { group: "model", key: "ruin", label: "ruin", default: 0.55,
      min: 0, max: 1, step: 0.05, applies: "next" },
    { group: "model", key: "rubble", label: "rubble", default: 0.6,
      min: 0, max: 1, step: 0.05, applies: "next" },
    { group: "model", key: "relief", label: "relief", default: 1,
      min: 0, max: 2, step: 0.05, unit: "x", applies: "live" }
  ],

  // ---------------------------- the palette ----------------------------
  // No lock knob. These twenty-eight colours are the GIF's colour table, and a
  // blend would put a twenty-ninth on the stage. The texture knob makes the
  // same point instead, by changing how a value between two bands is carried.
  palette: {
    colours: C,
    title: "twenty-eight colours: every ramp cold at the bottom and warm at the top"
  },

  // -------------------- counts for the stats strip ---------------------
  stats: [
    { key: "angle", label: "light °" },
    { key: "shadow", label: "shadow px" },
    { key: "lit", label: "lit px" },
    { key: "loop", label: "loop %" }
  ],

  // -------------------- what the file browser lists --------------------
  files: [
    { path: "index.js", open: true, sub: "everything declared in one place",
      meta: "stage, knobs, palette, stats and the one drawing path" },
    { path: "README.md", sub: "how this one is built",
      meta: "fetched and rendered here" },
    { path: "state.js", sub: "the projection and the model's dimensions",
      meta: "whole numbers only · two pixels across, one into the picture, two up" },
    { path: "world.js", sub: "the clock",
      meta: "one integer of state · two transients that decay to exactly zero" },
    { path: "model.js", sub: "the tower, voxel by voxel",
      meta: "solid(X, Y, Z) and the splat that turns it into material, height, depth and face" },
    { path: "orbit.js", sub: "where the lamp is, and what it is made of",
      meta: "one lap is one loop · the pointer moves the bearing and nothing else" },
    { path: "palette.js", sub: "twenty-eight colours and five ramps",
      meta: "the GIF's colour table, and what every material brightens along" },
    { path: "maths.js", sub: "hash, value noise, dither",
      meta: "nothing here calls Math.random" },
    { path: "backdrop.js", sub: "the void and its vignette",
      meta: "drawn once per stage size, behind every frame" },
    { path: "pipeline.js", sub: "every stage, and how to look at it",
      meta: "what the pipeline panel is built from · seventeen stages and the links between them" },
    { path: "render/cpu.js", sub: "the drawing path",
      meta: "clear the light, add the sources, resolve, then the emitters" }
  ],

  // -------------------- the pipeline, as a graph -----------------------
  // Opt-in, and read by nothing that draws. The panel it builds asks the
  // drawing path for the buffers these stages name, and asks for nothing at all
  // while it is closed.
  pipeline: PIPELINE,

  // -------------------- the one way it can be drawn --------------------
  backends: [
    {
      id: "javascript",
      label: "JavaScript",
      note: "the model is built once and never again; every step clears the light, " +
        "adds five sources into it and reads the result off the materials' own ramps",
      stats: [{ key: "pixels", label: "px / step" }],
      create: createJavascriptBackend
    }
  ],

  // ---------------------------- the animation --------------------------
  create: function (ctx) {
    useParams(ctx.params);
    usePointer(ctx.pointer);
    setStage(ctx.width, ctx.height);
    var world = createWorld();
    world.resize = setStage;
    world.backdrop = makeBackdrop;
    return world;
  }
});

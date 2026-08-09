"use strict";

// Everything the platform is told about this animation. There is no other way
// in: the page's title, its stage, its knobs, its stats, the plate beside the
// stage, the file browser and the one drawing path are all built out of what
// is declared here.

import { defineAnimation, knob } from "../../platform/api.js";
import { C } from "./palette.js";
import {
  VIEW_W, HORIZON, LOOP, useParams, setStageDeep, latchWorld, kmh
} from "./state.js";
import { clamp, frac } from "./maths.js";
import { layCamera } from "./camera.js";
import { masts, mastHit } from "./masts.js";
import { onStage, latchApproach } from "./approach.js";
import { latchSigns, darkSignNear } from "./neon.js";
import {
  fade, SIGN_CELLS, FLASH_STEPS, WAKE_STEPS,
  STRUCK_NOTHING, STRUCK_SIGN, STRUCK_LAMP, STRUCK_LINE
} from "./world.js";
import { makeBackdrop } from "./backdrop.js";
import { createJavascriptBackend } from "./render/deep.js";

var PLATE = "https://commons.wikimedia.org/wiki/Special:FilePath/" +
  "Tel_aviv_long_exposure_public_domain_1.jpg";
var PLATE_PAGE = "https://commons.wikimedia.org/wiki/" +
  "File:Tel_aviv_long_exposure_public_domain_1.jpg";
var STREET_PAGE = "https://commons.wikimedia.org/wiki/" +
  "File:Street_at_night,_black_and_white.jpg";
var NEON_PAGE = "https://opengameart.org/content/neon-city-0";

// Every knob the modules this stage draws with are going to read. It shares
// those modules with five other stages and reads a different set of them, so
// the list is checked against what the control panel actually built rather
// than assumed — a stage that projected a road without offering a camera-height
// knob would otherwise arrive at NaN and go quietly black.
var NEEDS = [
  "stageWidth", "stageShape", "stepsPerSec",
  "poleSteps", "poleSpacing", "mastHeight",
  "camHeight", "chaseDistance",
  "coneReach", "coneHaze", "coneTexture", "lampWarmth",
  "density", "exposure",
  "signs", "neonIntensity", "flicker",
  "replay"
];

// ------------------------------ the world ----------------------------
//
// The elevation's world, with one transient taken out of it. There is no surge
// here and there cannot be one: the car ahead is held at a fixed distance, and
// a fixed distance is what fixes it on the screen. Everything else is the
// same one integer and the same guarantee — the frame at step 48 is the frame
// at step 0 to the pixel, because nothing between them accumulates.

function createHighway() {
  var state = {
    step: 0,
    flash: 0,   // the brake lamps, 1 the instant the road is struck
    wake: 0,    // a lamp or a sign coming up to full
    struck: -1,
    kind: STRUCK_NOTHING
  };

  var count = { kmh: 0, cars: 0, lamps: 0, loop: 0 };

  function recount() {
    count.kmh = Math.round(kmh());
    count.cars = onStage(state.step);
    // heads in shot, both shoulders counted, which is what a driver sees
    // rather than how many the lattice is holding
    count.lamps = masts(state.step).length;
    count.loop = Math.round(frac(state.step / LOOP) * 100);
  }

  function latchAll() {
    latchWorld();
    latchApproach();
    latchSigns();
  }

  function reset() {
    state.step = 0;
    state.flash = 0;
    state.wake = 0;
    state.struck = -1;
    state.kind = STRUCK_NOTHING;
    latchAll();
    recount();
  }

  reset();

  return {
    state: state,
    phase: function () { return frac(state.step / LOOP); },

    // A strike reads depth rather than a band, because in this picture there
    // are no bands. The masts are asked first and on their own shapes: a mast
    // is one to three pixels wide and it is what a visitor aims at, and read
    // by position alone the click that most looks like striking a lamp would
    // land on the road under its arm. Above the horizon belongs to the signs.
    // Everything else is road, and striking the road ahead of a car is what
    // makes the car brake.
    detonate: function (spot) {
      var lamp;
      if (!spot) {
        // left to itself — the auto-replay, or the button — the strike runs
        // down the whole lamp line from the horizon towards the eye, which is
        // what a line of lamps does when the circuit closes at the far end
        state.kind = STRUCK_LINE;
        state.struck = -1;
        state.wake = 1;
        state.flash = 1;
        return;
      }
      lamp = mastHit(spot.x, spot.y, state.step);
      if (lamp >= 0) {
        state.kind = STRUCK_LAMP;
        state.struck = lamp;
        state.wake = 1;
        return;
      }
      if (spot.y < HORIZON) {
        state.kind = STRUCK_SIGN;
        // the column clicked, and then the nearest housing in it that is dark.
        // Six of the twenty-four are lit on a default night, so a click aimed
        // at the sky lands on a dark one most of the time already — but "most
        // of the time" is not what the hint beside the stage says, and the two
        // ought to agree
        state.struck = darkSignNear(
          clamp(Math.floor(spot.x / (VIEW_W / SIGN_CELLS)), 0, SIGN_CELLS - 1));
        state.wake = 1;
        return;
      }
      state.kind = STRUCK_NOTHING;
      state.struck = -1;
      state.flash = 1;
    },

    reset: reset,

    advance: function () {
      state.step += 1;
      if (state.step % LOOP === 0) latchAll();

      state.flash = fade(state.flash, FLASH_STEPS);
      state.wake = fade(state.wake, WAKE_STEPS);
      if (state.wake === 0 && state.flash === 0) {
        state.struck = -1;
        state.kind = STRUCK_NOTHING;
      }

      recount();
    },

    stats: function () { return count; }
  };
}

export default defineAnimation({
  id: "highway-night",
  title: "Night highway, lit by its own lamps",
  tagline: "192 x 120 pixels · 29 colours · one integer of state · four seconds round",
  base: new URL(".", import.meta.url).href,
  action: { verb: "Strike", noun: "strike" },

  // ---------------------------- the stage ------------------------------
  // The shot down the road: one vanishing point, one horizon, and depth on
  // every row rather than in a ladder of bands. It is the harder of the two
  // pictures and the one the plate actually shows — a lamp line converging,
  // an oncoming carriageway drawn as light rather than as cars, and a car
  // ahead that never changes size because it never changes distance.
  //
  // The road is a fixed fraction of the stage width, so the square setting
  // adds sky and never touches the carriageway, exactly as the elevation's
  // ground ladder does. What the two settings change is how much room the
  // skyline has above the horizon, which is where every sign in the picture
  // is.
  stage: {
    width: knob("stageWidth"),
    aspect: knob("stageShape"),
    background: C.skyDeep,
    hint: "click a mast and that lamp flares · click the sky and a sign wakes · " +
      "click the road and the brakes come on",
    legend: "sky · skyline · horizon smear · lamp line · oncoming exposure · " +
      "carriageway · the car ahead"
  },
  cadence: knob("stepsPerSec"),
  replay: knob("replay"),

  // Four lamps, one loop, four seconds. The loop closes for the same reason it
  // does in the elevation — the camera covers exactly four lamp spacings in
  // `poleSteps` x 4 steps however either knob is set — but it is worth saying
  // what closes here: the lattice is in metres ahead of the camera rather than
  // in pixels across the stage, and the projection is a pure function of that.
  poster: {
    // Thirty is halfway through the third quarter of the loop, by which point
    // the oncoming carriageway has filled with exposure and the nearest mast
    // pair is well inside the frame rather than half off the edges. The icon
    // is cut square around the car and the road under it: the lamp line is the
    // subject of the picture and is unreadable at sixteen pixels, whereas two
    // tail lamps and the red they lay are not.
    step: 30,
    backend: "javascript",
    icon: { x: 96, y: 72, size: 48 },
    film: {
      steps: knob("poleSteps"),
      cycles: 4,
      scale: 3,
      file: "assets/highway-night.gif"
    }
  },

  // ---------------------------- the knobs ------------------------------
  knobs: [
    { group: "stage", key: "stageWidth", label: "resolution", default: 192,
      min: 144, max: 240, step: 16, unit: "px wide", applies: "live" },
    { group: "stage", key: "stageShape", label: "shape", type: "choice", default: 10 / 16,
      options: [{ value: 10 / 16, label: "16:10" }, { value: 1, label: "1:1 square" }],
      applies: "live" },
    { group: "stage", key: "stepsPerSec", label: "cadence", default: 12,
      min: 6, max: 24, step: 1, unit: "steps/s", applies: "live" },

    // Between them these two are still the speed, and they are still the
    // elevation's numbers: the spacing is in the pixels of a 192-wide side
    // view, converted to metres by the same scale, because the two pictures
    // are the same road and a lamp spacing that differed between them would
    // make one of them a lie.
    { group: "drive", key: "poleSteps", label: "steps per lamp", default: 12,
      min: 6, max: 24, step: 1, unit: "steps", applies: "next" },
    { group: "drive", key: "poleSpacing", label: "lamp spacing", default: 48,
      min: 32, max: 64, step: 8, unit: "px", applies: "next" },
    { group: "drive", key: "mastHeight", label: "mast height", default: 9,
      min: 7, max: 13, step: 0.5, unit: "m", applies: "live" },

    // The two knobs the elevation has no use for at all, and the two that
    // decide the whole geometry. Height is where the horizon falls across the
    // picture and how fast the road opens out below it; chase distance is how
    // big the car ahead is, which is the only thing in shot with a size the
    // eye already knows.
    { group: "camera", key: "camHeight", label: "camera height", default: 4.5,
      min: 3, max: 8, step: 0.5, unit: "m", applies: "live" },
    { group: "camera", key: "chaseDistance", label: "chase distance", default: 12,
      min: 8, max: 20, step: 1, unit: "m", applies: "live" },

    { group: "light", key: "coneReach", label: "lamp reach", default: 1,
      min: 0.4, max: 1.6, step: 0.05, unit: "x", applies: "live" },
    { group: "light", key: "coneHaze", label: "haze", default: 1,
      min: 0, max: 1.5, step: 0.05, unit: "x", applies: "live" },
    { group: "light", key: "coneTexture", label: "cone texture", type: "choice", default: 0,
      options: [
        { value: 0, label: "ordered dither" },
        { value: 1, label: "scanline" },
        { value: 2, label: "hard bands" }
      ], applies: "live" },
    { group: "light", key: "lampWarmth", label: "lamp warmth", default: 0,
      min: -2, max: 2, step: 1, unit: "bands", applies: "live" },

    { group: "traffic", key: "density", label: "oncoming cars", default: 4,
      min: 0, max: 8, step: 1, applies: "next" },
    // The elevation's trail knob, said the way this picture means it: not a
    // length in pixels but how long the shutter was open, because the streak
    // is the same lamp drawn where it was that many steps ago.
    { group: "traffic", key: "exposure", label: "exposure", default: 8,
      min: 0, max: 20, step: 1, unit: "steps", applies: "live" },

    // Six of the twenty-four, where the elevation lights eighteen. The two
    // pictures want different amounts of the same city: from the side the
    // skyline is a strip along the top and a sign every few pixels is what
    // fills it, whereas down the road the sky is half the frame and every lit
    // sign in it is competing with the vanishing point for the eye. The plate
    // settles it — one big sign, a handful of small ones, and a great deal of
    // dark city — and the knob still goes to twenty-four for anyone who wants
    // the carnival.
    { group: "neon", key: "signs", label: "signs lit", default: 6,
      min: 0, max: 24, step: 1, applies: "next" },
    { group: "neon", key: "neonIntensity", label: "neon", default: 2,
      min: 0, max: 3, step: 1, unit: "bands", applies: "live" },
    { group: "neon", key: "flicker", label: "flicker", default: 0.3,
      min: 0, max: 1, step: 0.05, applies: "live" },

    { group: "scene", key: "replay", label: "auto-replay", default: 6,
      min: 1, max: 12, step: 0.1, unit: "s", applies: "live" }
  ],

  // ---------------------------- the palette ----------------------------
  palette: {
    colours: C,
    title: "twenty-nine colours: warm below, cool above, neon only on the signs"
  },

  // -------------------- the plate beside the stage ---------------------
  // The same photograph as the elevation, cropped differently. The elevation
  // reads it as a stack of bands and takes the widest strip it can; this one
  // reads it as a projection and needs the height — the vanishing point sits
  // about 62 per cent across and halfway down the crop, which is where the
  // horizon and the vanishing column in camera.js come from.
  reference: {
    image: "assets/tel-aviv-long-exposure.jpg",
    columns: 1,
    rows: 1,
    frames: 1,
    frameSize: 1600,
    frameHeight: 1000,
    origin: { x: 0, y: 30 },
    player: { width: 480, height: 300 },
    pixelated: false,
    alt: "Long-exposure photograph of a night expressway and rail corridor below a " +
      "lit city skyline, with white headlight trails on one carriageway and red " +
      "tail-light trails on the other",
    credit: "Equalhuman · CC0 1.0 · Ayalon corridor, Tel Aviv",
    links: [
      { label: "direct file", href: PLATE },
      { label: "source page", href: PLATE_PAGE }
    ],
    legend: "the vanishing point about 62% across and halfway down · the lamp line " +
      "running into it · the skyline stacked to the left of it",
    sourceLegend: "read only, and only for its geometry, its palette and the shape of " +
      "a sodium pool — no pixel of it is ever drawn on the stage"
  },

  // -------------------- counts for the stats strip ---------------------
  stats: [
    { key: "kmh", label: "km/h" },
    { key: "cars", label: "cars" },
    { key: "lamps", label: "lamps" },
    { key: "loop", label: "loop %" }
  ],

  // -------------------- what the file browser lists --------------------
  files: [
    { path: "index.js", open: true, sub: "everything declared in one place",
      meta: "stage, knobs, palette, plate, stats and the world this one runs on" },
    { path: "README.md", sub: "how this one is built",
      meta: "fetched and rendered here" },
    { path: "camera.js", sub: "the projection, and the lattice in z",
      meta: "one horizon, one vanishing column, and a row-to-metres table" },
    { path: "carriageway.js", sub: "the road, one row at a time",
      meta: "a cross-section in metres, projected per row · four samples a row for the dashes" },
    { path: "masts.js", sub: "the lamp line",
      meta: "four spacings resolve · past them the light carries the line, not the geometry" },
    { path: "chase.js", sub: "the car ahead",
      meta: "fixed in z, so fixed on the screen · nothing here reads the step" },
    { path: "approach.js", sub: "oncoming traffic, as light only",
      meta: "headlamp pairs and the exposure behind them · no bodywork is drawn" },
    { path: "groundlight.js", sub: "pools on the road plane",
      meta: "measured in metres, projected after · foreshortening is not calculated" },
    { path: "state.js", sub: "the stage and the world constants",
      meta: "knob values, the horizon, and what may only change on a loop boundary" },
    { path: "world.js", sub: "the transients and the strike kinds",
      meta: "shared with the elevation · the lattice half of it belongs to the side view" },
    { path: "palette.js", sub: "twenty-nine colours and thirteen ramps",
      meta: "the GIF's colour table, and what every material brightens along" },
    { path: "maths.js", sub: "hash, value noise, ordered dither",
      meta: "nothing here calls Math.random" },
    { path: "light.js", sub: "the light field",
      meta: "sources are added, never compared · one float of light, one of red" },
    { path: "neon.js", sub: "which signs are lit, and which are flickering",
      meta: "emitters · drawn after the light is resolved and never re-lit" },
    { path: "skyline.js", sub: "towers, windows and sign housings",
      meta: "the tall group stands left of the vanishing point, and the right of it stays low" },
    { path: "backdrop.js", sub: "sky, stars, glow and city",
      meta: "drawn once per stage size, behind every frame" },
    { path: "render/buffers.js", sub: "the buffers all six stages share",
      meta: "material buffer, light field, resolve — and the backend built on them" },
    { path: "render/deep.js", sub: "the drawing path",
      meta: "material pass, light pass, resolve — and depth sorted rather than assumed" },

    { path: "assets/tel-aviv-long-exposure.jpg", sub: "the plate",
      meta: "Equalhuman · CC0 1.0 · 1600 x 1060, downscaled",
      alt: "Long-exposure photograph of a night expressway below a lit skyline",
      caption: "The Ayalon corridor in Tel Aviv, photographed on a long exposure. " +
        "The elevation reads it as a stack of bands; this stage reads it as a " +
        "projection, and takes three numbers from it — where the vanishing point " +
        "sits in the frame, how far down the frame the horizon falls, and how many " +
        "lamp spacings resolve before the line closes into a smear. Read only; no " +
        "pixel of it is drawn on the stage. Equalhuman, CC0 1.0 — " +
        '<a href="' + PLATE + '" target="_blank" rel="noopener">direct file</a> · ' +
        '<a href="' + PLATE_PAGE + '" target="_blank" rel="noopener">source page</a>.' },

    { path: "assets/street-at-night-bw.jpg", sub: "falloff reference",
      meta: "www.Pixel.la Free Stock Photos · CC0 1.0 · 1560 x 2340",
      alt: "Black and white photograph of a street at night under a lamp",
      caption: "A street lamp photographed in black and white, which is the useful " +
        "part: with colour taken away, what is left is how fast the light falls off " +
        "with distance and how sharp the edge of the pool is. Here it is read on the " +
        "road plane rather than on the screen, which is what makes a far pool two " +
        "rows deep and a near one twenty. Read only; no pixel of it is drawn on the " +
        "stage. www.Pixel.la Free Stock Photos, CC0 1.0 — " +
        '<a href="' + STREET_PAGE + '" target="_blank" rel="noopener">source page</a>.' },

    { path: "assets/neon-city.gif", sub: "neon reference", pixelated: true,
      meta: "cottonball · CC0 1.0 · 150 x 150",
      alt: "A small pixel-art animation of a neon-lit city",
      caption: "Pixel-art neon at a small size. Read for two things: which hues stay " +
        "legible against a dark sky at this resolution, and how wide a halo has to be " +
        "before a lit sign reads as lit rather than as a coloured box. Read only; " +
        "no pixel of it is drawn on the stage. cottonball, CC0 1.0 — " +
        '<a href="' + NEON_PAGE + '" target="_blank" rel="noopener">source page</a>.' }
  ],

  // -------------------- the one way it can be drawn --------------------
  backends: [
    {
      id: "javascript",
      label: "JavaScript",
      note: "one pass writes what every pixel is made of, one adds up the light " +
        "landing on it, and one turns the two into a colour",
      stats: [{ key: "pixels", label: "px / step" }],
      create: createJavascriptBackend
    }
  ],

  // ---------------------------- the animation --------------------------
  create: function (ctx) {
    useParams(ctx.params, NEEDS);
    setStageDeep(ctx.width, ctx.height);
    layCamera();
    var world = createHighway();
    world.resize = function (width, height) {
      setStageDeep(width, height);
      layCamera();
    };
    world.backdrop = function () { return makeBackdrop({ deep: true }); };
    return world;
  }
});

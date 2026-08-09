"use strict";

// Everything the platform is told about this animation. There is no other way
// in: the page's title, its stage, its knobs, its stats, the plate beside the
// stage, the file browser and the one drawing path are all built out of what
// is declared here.

import { defineAnimation, knob } from "../../platform/api.js";
import { C } from "./palette.js";
import { useParams, setStage } from "./state.js";
import { createWorld } from "./world.js";
import { makeBackdrop } from "./backdrop.js";
import { createJavascriptBackend } from "./render/side.js";

var PLATE = "https://commons.wikimedia.org/wiki/Special:FilePath/" +
  "Tel_aviv_long_exposure_public_domain_1.jpg";
var PLATE_PAGE = "https://commons.wikimedia.org/wiki/" +
  "File:Tel_aviv_long_exposure_public_domain_1.jpg";
var CAR_PAGE = "https://opengameart.org/content/2d-car-sprite-8";
var NEON_PAGE = "https://opengameart.org/content/neon-city-0";
var STREET_PAGE = "https://commons.wikimedia.org/wiki/" +
  "File:Street_at_night,_black_and_white.jpg";
var VEGAS_PAGE = "https://commons.wikimedia.org/wiki/" +
  "File:WV_banner_Downtown_Las_Vegas_Neon_on_Fremont_Street.jpg";

// Every knob the modules this stage draws with are going to read. The four
// solo stages share those modules and declare far fewer of these, so the list
// is checked against what the control panel actually built rather than assumed
// — a stage that drew a cone without offering a cone knob would otherwise
// arrive at NaN and go quietly black.
var NEEDS = [
  "stageWidth", "stageShape", "stepsPerSec",
  "poleSteps", "poleSpacing", "poleHeight",
  "coneReach", "coneSpread", "coneHaze", "coneTexture", "lampWarmth",
  "density", "trail",
  "signs", "neonIntensity", "flicker",
  "beamReach", "beamSpread",
  "replay"
];

export default defineAnimation({
  id: "highway-side",
  title: "The same road, seen from the side",
  tagline: "192 x 120 pixels · 40 colours · one integer of state · four seconds round",
  base: new URL(".", import.meta.url).href,
  action: { verb: "Strike", noun: "strike" },

  // ---------------------------- the stage ------------------------------
  // The elevation, which is the drawing rather than the photograph: the road
  // laid out flat and square on, so a cone of light is a wedge the width of a
  // hand and the car is a shape rather than a smudge. The shot down the road
  // stands beside it under its own id and shows the same corridor with the
  // lamps receding; what this one is for is the parts of it a vanishing point
  // foreshortens away. The square setting adds sky, never road: the ground
  // ladder is pinned to the width, so no aspect can squeeze the near
  // carriageway thinner than the car standing on it.
  stage: {
    width: knob("stageWidth"),
    aspect: knob("stageShape"),
    background: C.skyDeep,
    hint: "click the sky, the poles or the road — each strikes something different",
    legend: "sky · skyline · neon · rail · oncoming · median · poles and cones · road · car"
  },
  cadence: knob("stepsPerSec"),
  replay: knob("replay"),

  // Four lamps, one stage width, four seconds: the loop closes because the
  // scroll over `poleSteps` x 4 steps is exactly four spacings however either
  // knob is set. The film is that loop, at three times the size.
  poster: {
    // The lamp lattice is phased so that a mast stands over the middle of the
    // car every twelfth step from the third; step 27 is the third of those, by
    // which time the far carriageway has filled up. The icon is cut square
    // around the car standing in that lamp's pool, rather than around the lamp
    // as well: a crop tall enough to hold both the head and the wheels is a
    // stripe, and a stripe at sixteen pixels is a smudge. The platform fits the
    // crop into its own icon boxes and resamples wherever they do not divide
    // it, which of the three only the sixteen-pixel one does.
    step: 27,
    backend: "javascript",
    icon: { x: 62, y: 64, size: 48 },
    // No spot is declared, and none would do anything: both the poster and the
    // film are posed from reset(), and a reset here is deliberately a steady
    // state — every lamp already lit, no transient running — so that no warm-up
    // sits inside the committed file and the last frame meets the first.
    film: {
      steps: knob("poleSteps"),
      cycles: 4,
      scale: 3,
      file: "assets/highway-side.gif"
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

    // Between them these two are the speed: pixels between lamps, divided by
    // steps from one lamp to the next. They only take hold on a loop boundary,
    // because either one read mid-loop would leave the lattice half a spacing
    // out of step with itself and tear the seam open.
    { group: "drive", key: "poleSteps", label: "steps per lamp", default: 12,
      min: 6, max: 24, step: 1, unit: "steps", applies: "next" },
    { group: "drive", key: "poleSpacing", label: "lamp spacing", default: 48,
      min: 32, max: 64, step: 8, unit: "px", applies: "next" },
    { group: "drive", key: "poleHeight", label: "mast height", default: 26,
      min: 18, max: 34, step: 1, unit: "px", applies: "live" },

    { group: "light", key: "coneReach", label: "cone reach", default: 1,
      min: 0.4, max: 1.6, step: 0.05, unit: "x", applies: "live" },
    { group: "light", key: "coneSpread", label: "cone spread", default: 26,
      min: 14, max: 40, step: 1, unit: "deg", applies: "live" },
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
    { group: "traffic", key: "trail", label: "trail length", default: 5,
      min: 0, max: 12, step: 1, unit: "px", applies: "live" },

    { group: "neon", key: "signs", label: "signs lit", default: 18,
      min: 0, max: 24, step: 1, applies: "next" },
    { group: "neon", key: "neonIntensity", label: "neon", default: 2,
      min: 0, max: 3, step: 1, unit: "bands", applies: "live" },
    { group: "neon", key: "flicker", label: "flicker", default: 0.3,
      min: 0, max: 1, step: 0.05, applies: "live" },

    { group: "car", key: "beamReach", label: "beam reach", default: 1.2,
      min: 0.5, max: 2.5, step: 0.05, unit: "x", applies: "live" },
    { group: "car", key: "beamSpread", label: "beam spread", default: 18,
      min: 8, max: 40, step: 1, unit: "deg", applies: "live" },

    { group: "scene", key: "replay", label: "auto-replay", default: 6,
      min: 1, max: 12, step: 0.1, unit: "s", applies: "live" }
  ],

  // ---------------------------- the palette ----------------------------
  // No lock knob. In the other animations unlocking the palette mixes between
  // bands to show what the discipline is holding back; here the forty colours
  // are the GIF's colour table, and a blend would put a forty-first on the
  // stage. The cone texture knob makes the same point instead, by changing how
  // a value between two bands is carried.
  palette: {
    colours: C,
    title: "forty colours: warm below, cool above, neon only on the signs"
  },

  // -------------------- the plate beside the stage ---------------------
  // One frame, held still. The animation's own loop is four seconds long and
  // there is nothing in a still photograph to step through, so the player
  // shows the plate the scene was measured against rather than flickering a
  // sequence that does not exist.
  reference: {
    image: "assets/tel-aviv-long-exposure.jpg",
    columns: 1,
    rows: 1,
    frames: 1,
    frameSize: 1600,
    frameHeight: 636,
    origin: { x: 0, y: 81 },
    player: { width: 480, height: 200 },
    pixelated: false,
    alt: "Long-exposure photograph of a night expressway and rail corridor below a " +
      "lit city skyline, with white headlight trails on one carriageway and red " +
      "tail-light trails on the other",
    credit: "Equalhuman · CC0 1.0 · Ayalon corridor, Tel Aviv",
    links: [
      { label: "direct file", href: PLATE },
      { label: "source page", href: PLATE_PAGE }
    ],
    legend: "the band structure the scene is built on: sky, skyline, lamp line, " +
      "carriageway, shoulder",
    sourceLegend: "read only, and only for its palette, the height of its bands and " +
      "the shape of a sodium pool — no pixel of it is ever drawn on the stage"
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
    { path: "side.js", open: true, sub: "everything declared in one place",
      meta: "stage, knobs, palette, plate, stats and the one drawing path" },
    { path: "README.md", sub: "how this one is built",
      meta: "fetched and rendered here" },
    { path: "state.js", sub: "the stage and the ground ladder",
      meta: "knob values, band heights, and the constants that only change on a loop" },
    { path: "world.js", sub: "the scroll clock and the lattice",
      meta: "one integer of state · where the loop is guaranteed to close" },
    { path: "palette.js", sub: "forty colours and thirteen ramps",
      meta: "the GIF's colour table, and what every material brightens along" },
    { path: "maths.js", sub: "hash, value noise, ordered dither",
      meta: "nothing here calls Math.random" },
    { path: "road.js", sub: "bands, rail, median, paint and grit",
      meta: "four lattices, all of them halvings of the lamp spacing" },
    { path: "pole.js", sub: "mast, arm and cobra head",
      meta: "the one silhouette in the animation with no reference behind it" },
    { path: "light.js", sub: "the light field",
      meta: "sources are added, never compared · ground in world units, air in screen ones" },
    { path: "lightcone.js", sub: "where a cone points and how far it carries",
      meta: "a pool and a headlamp beam are the same object with different numbers" },
    { path: "car.js", sub: "the hero car, and the shade it takes off the road",
      meta: "level, because a car at this speed on a laid carriageway is · reads no knob" },
    { path: "traffic.js", sub: "the other carriageway",
      meta: "two rows on their own lattice, at whole quarters of the scroll speed" },
    { path: "neon.js", sub: "which signs are lit, and which are flickering",
      meta: "emitters · drawn after the light is resolved and never re-lit" },
    { path: "skyline.js", sub: "towers, windows and sign housings",
      meta: "the static half of the picture, and where neon.js finds its signs" },
    { path: "backdrop.js", sub: "sky, stars, glow and city",
      meta: "drawn once per stage size, behind every frame" },
    { path: "render/buffers.js", sub: "the buffers all six stages share",
      meta: "material buffer, light field, resolve — and the backend built on them" },
    { path: "render/side.js", sub: "the drawing path",
      meta: "material pass, light pass, resolve — in that order, and it matters" },

    { path: "assets/tel-aviv-long-exposure.jpg", sub: "the plate",
      meta: "Equalhuman · CC0 1.0 · 1600 x 1060, downscaled",
      alt: "Long-exposure photograph of a night expressway below a lit skyline",
      caption: "The Ayalon corridor in Tel Aviv, photographed on a long exposure. " +
        "This is where the band ladder comes from — sky, skyline, lamp line, " +
        "carriageway, shoulder — along with the palette's split between a cool sky " +
        "and warm ground, and the shape a sodium pool makes on wet asphalt. Read " +
        "only; no pixel of it is drawn on the stage. Equalhuman, CC0 1.0 — " +
        '<a href="' + PLATE + '" target="_blank" rel="noopener">direct file</a> · ' +
        '<a href="' + PLATE_PAGE + '" target="_blank" rel="noopener">source page</a>.' },

    { path: "assets/car-sprite-vintage.png", sub: "car reference", pixelated: true,
      meta: "Chasersgaming · CC0 1.0 · 288 x 192",
      alt: "A small pixel-art car sprite sheet, seen from the side",
      caption: "A side-elevation car at roughly the size this one is drawn at. It " +
        "settled two questions: how many pixels a readable car needs from wheel to " +
        "roof, and where the glass sits in that height. The hero car is drawn from " +
        "the animation's own silhouette rules and takes nothing else from it. " +
        "Read only; no pixel of it is drawn on the stage. Chasersgaming, CC0 1.0 — " +
        '<a href="' + CAR_PAGE + '" target="_blank" rel="noopener">source page</a>.' },

    { path: "assets/street-at-night-bw.jpg", sub: "falloff reference",
      meta: "www.Pixel.la Free Stock Photos · CC0 1.0 · 1560 x 2340",
      alt: "Black and white photograph of a street at night under a lamp",
      caption: "A street lamp photographed in black and white, which is the useful " +
        "part: with colour taken away, what is left is how fast the light falls off " +
        "with distance and how sharp the edge of the pool is. That curve is what the " +
        "light field is tuned against. Read only; no pixel of it is drawn on the " +
        "stage. www.Pixel.la Free Stock Photos, CC0 1.0 — " +
        '<a href="' + STREET_PAGE + '" target="_blank" rel="noopener">source page</a>.' },

    { path: "assets/neon-city.gif", sub: "neon reference", pixelated: true,
      meta: "cottonball · CC0 1.0 · 150 x 150",
      alt: "A small pixel-art animation of a neon-lit city",
      caption: "Pixel-art neon at a small size. Read for two things: which hues stay " +
        "legible against a dark sky at this resolution, and how wide a halo has to be " +
        "before a lit sign reads as lit rather than as a coloured box. Read only; " +
        "no pixel of it is drawn on the stage. cottonball, CC0 1.0 — " +
        '<a href="' + NEON_PAGE + '" target="_blank" rel="noopener">source page</a>.' },

    { path: "assets/vegas-neon-fremont-banner.jpg", sub: "neon hues",
      meta: "Ypsilon from Finland · CC0 1.0 · 3150 x 450",
      alt: "A wide banner photograph of neon signs on Fremont Street, Las Vegas",
      caption: "A long strip of working neon, which is where the four sign hues come " +
        "from — pink, cyan, amber, violet — and the observation that a neon sign at " +
        "night is a bright core with a coloured ring around it rather than a flat " +
        "shape. Read only; no pixel of it is drawn on the stage. " +
        "Ypsilon from Finland, CC0 1.0 — " +
        '<a href="' + VEGAS_PAGE + '" target="_blank" rel="noopener">source page</a>.' }
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
    setStage(ctx.width, ctx.height);
    var world = createWorld();
    world.resize = setStage;
    world.backdrop = makeBackdrop;
    return world;
  }
});

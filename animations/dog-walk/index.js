"use strict";

// The registration. Everything the platform knows about this animation is in
// this one file: what it is, the knobs it offers, the plate it is measured
// against, the files it is made of, and the one way it can draw itself.

import { defineAnimation, knob } from "../../platform/api.js";
import { useParams, setStage } from "./state.js";
import { C } from "./palette.js";
import { createDog } from "./dog.js";
import { makeBackdrop } from "./backdrop.js";
import { createJavascriptBackend } from "./render/cpu.js";

export default defineAnimation({
  id: "dog-walk",
  title: "Procedural pixel-art dog",
  tagline: "a skeleton, a four-beat gait · 160 × 100 pixels · eight colours",
  base: new URL(".", import.meta.url).href,
  action: { verb: "Restart", noun: "stride" },

  stage: {
    width: knob("stageWidth"),
    aspect: 10 / 16,
    background: C.night,
    hint: "click the canvas to put the stride back to its first frame",
    legend: "a four-beat lateral walk: left hind, left fore, right hind, right fore · " +
      "elbows and stifles are solved for, not animated · " +
      "switch on show skeleton to watch the bones underneath"
  },

  // twelve steps a second, twelve steps to a stride: one stride a second, the
  // rate the plate beside it was shot at
  cadence: knob("stepsPerSec"),
  replay: 0,

  knobs: [
    { group: "gait", key: "stepsPerSec", label: "cadence", default: 12,
      min: 4, max: 30, step: 1, unit: "steps/s", applies: "live" },
    { group: "gait", key: "strideSteps", label: "stride", default: 12,
      min: 6, max: 30, step: 1, unit: "steps", applies: "live" },
    { group: "gait", key: "strideLength", label: "reach", default: 22,
      min: 8, max: 34, step: 1, unit: "px", applies: "live" },
    { group: "gait", key: "stepHeight", label: "step height", default: 6,
      min: 0, max: 14, step: 1, unit: "px", applies: "live" },
    { group: "gait", key: "stance", label: "stance share", default: 0.62,
      min: 0.35, max: 0.85, step: 0.01, unit: "of stride", applies: "live" },
    { group: "gait", key: "trot", label: "trot", type: "toggle",
      default: false, applies: "next" },

    { group: "frame", key: "legLength", label: "leg segment", default: 13,
      min: 8, max: 20, step: 1, unit: "px", applies: "live" },
    { group: "frame", key: "bodyLength", label: "back", default: 44,
      min: 28, max: 58, step: 1, unit: "px", applies: "live" },
    { group: "frame", key: "girth", label: "girth", default: 10,
      min: 6, max: 15, step: 1, unit: "px", applies: "live" },
    { group: "frame", key: "neckLength", label: "neck", default: 13,
      min: 8, max: 24, step: 1, unit: "px", applies: "live" },
    { group: "frame", key: "lean", label: "rear drop", default: 1.2,
      min: -3, max: 5, step: 0.1, unit: "px", applies: "live" },

    { group: "motion", key: "bodyBob", label: "body rise", default: 1.6,
      min: 0, max: 5, step: 0.1, unit: "px", applies: "live" },
    { group: "motion", key: "headBob", label: "head bob", default: 1.4,
      min: 0, max: 5, step: 0.1, unit: "px", applies: "live" },
    { group: "motion", key: "tailWag", label: "tail wag", default: 2.6,
      min: 0, max: 9, step: 0.1, unit: "px", applies: "live" },

    { group: "drawing", key: "skeleton", label: "show skeleton", type: "toggle",
      default: false, applies: "live" },
    { group: "drawing", key: "outline", label: "outline", type: "toggle",
      default: true, applies: "live" },
    { group: "drawing", key: "stageWidth", label: "stage width", default: 160,
      min: 120, max: 240, step: 8, unit: "px", applies: "live" }
  ],

  palette: {
    colours: C,
    title: "eight colours: three of them carry the whole coat"
  },

  // Muybridge photographed this walk in 1887; the player runs the twelve
  // lateral frames beside the stage at the same rate the dog walks.
  reference: {
    image: "assets/muybridge-plate-704-lateral.jpg",
    columns: 6,
    rows: 2,
    frames: 12,
    frameSize: 200,
    player: { width: 480, height: 300 },
    pixelated: false,
    alt: "Twelve photographs of a mastiff walking, side on, from Muybridge's Animal Locomotion",
    credit: "Eadweard Muybridge, Animal Locomotion plate 704, 1887 · public domain",
    links: [
      {
        label: "plate",
        href: "https://upload.wikimedia.org/wikipedia/commons/8/8d/" +
          "Animal_locomotion._Plate_704_%28Boston_Public_Library%29.jpg"
      },
      {
        label: "commons",
        href: "https://commons.wikimedia.org/wiki/" +
          "File:Animal_locomotion._Plate_704_(Boston_Public_Library).jpg"
      }
    ],
    legend: "the twelve lateral frames of plate 704, played at the same cadence as the dog",
    sourceLegend: "plate 704 of Animal Locomotion, 1887 · the mastiff Dread, walking · " +
      "public domain, scanned by the Boston Public Library"
  },

  stats: [
    { key: "feet", label: "feet down" },
    { key: "stride", label: "stride %" },
    { key: "bones", label: "bones" }
  ],

  files: [
    { path: "index.js", open: true, sub: "the registration",
      meta: "every knob, the plate, and the files below" },
    { path: "README.md", sub: "what this is", meta: "fetched and rendered here" },
    { path: "state.js", sub: "knobs and stage size", meta: "what the platform hands over" },
    { path: "gait.js", sub: "the four-beat cycle", meta: "one number runs the whole walk" },
    { path: "skeleton.js", sub: "bones and joints", meta: "the elbow is solved for, not animated" },
    { path: "dog.js", sub: "the animation", meta: "two numbers, rebuilt into a skeleton each step" },
    { path: "maths.js", sub: "small helpers", meta: "including the two-bone solve" },
    { path: "palette.js", sub: "the eight colours", meta: "three of them carry the coat" },
    { path: "backdrop.js", sub: "what never moves", meta: "drawn once per stage size" },
    { path: "render/cpu.js", sub: "the drawing path", meta: "bones stamped as tapered capsules" },
    { path: "assets/muybridge-plate-704-lateral.jpg", sub: "the reference frames",
      meta: "the twelve lateral frames, cut from the plate", pixelated: false,
      alt: "Twelve photographs of a mastiff walking, side on",
      caption: "Rows 1 and 3 of plate 704 — the lateral camera — laid out as one " +
        "twelve-frame strip. Public domain." },
    { path: "assets/muybridge-plate-704.jpg", sub: "the whole plate",
      meta: "as published, both camera angles",
      alt: "Muybridge's plate 704: twenty-four photographs of a mastiff walking",
      caption: "Eadweard Muybridge, <em>Animal Locomotion</em> plate 704, 1887. " +
        "Rows 1 and 3 are the side view, rows 2 and 4 the same instants from behind. " +
        "Public domain; scan by the Boston Public Library." }
  ],

  backends: [
    {
      id: "javascript",
      label: "JavaScript",
      note: "every bone is stamped into a pixel buffer in JavaScript, then the " +
        "whole silhouette is outlined in one pass",
      stats: [{ key: "pixels", label: "px / step" }],
      create: createJavascriptBackend
    }
  ],

  poster: {
    step: 5,
    icon: { x: 72, y: 34, size: 48 },
    // two whole strides, which is exactly where the walk comes back round
    film: { steps: 24, scale: 4 }
  },

  create: function (ctx) {
    useParams(ctx.params);
    setStage(ctx.width, ctx.height);
    var dog = createDog();
    dog.resize = setStage;
    dog.backdrop = makeBackdrop;
    return dog;
  }
});

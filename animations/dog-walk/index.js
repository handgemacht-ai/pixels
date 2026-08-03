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
  title: "Mastiff walking, solved from a skeleton",
  tagline: "160 x 100 pixels · eight colours · held against Muybridge, 1887",
  base: new URL(".", import.meta.url).href,
  action: { verb: "Restart", noun: "stride" },

  stage: {
    width: knob("stageWidth"),
    aspect: 10 / 16,
    background: C.night,
    hint: "click the canvas to put the stride back to its first frame",
    legend: "elbows and stifles are solved for, not animated · " +
      "show skeleton lays the rig over the animal it made"
  },

  // twelve steps a second, twelve steps to a stride: one stride a second, and
  // twelve steps to the twelve frames of the plate beside it
  cadence: knob("stepsPerSec"),
  replay: 0,

  knobs: [
    { group: "gait", key: "stepsPerSec", label: "cadence", default: 12,
      min: 4, max: 30, step: 1, unit: "steps/s", applies: "live" },
    { group: "gait", key: "strideSteps", label: "stride", default: 12,
      min: 6, max: 24, step: 1, unit: "steps", applies: "live" },
    { group: "gait", key: "strideLength", label: "reach", default: 27,
      min: 14, max: 38, step: 1, unit: "px", applies: "live" },
    { group: "gait", key: "stepHeight", label: "step height", default: 5,
      min: 1, max: 12, step: 1, unit: "px", applies: "live" },
    { group: "gait", key: "stance", label: "stance share", default: 0.70,
      min: 0.55, max: 0.82, step: 0.01, unit: "of stride", applies: "live" },
    { group: "gait", key: "trot", label: "trot", type: "toggle",
      default: false, applies: "next" },

    { group: "frame", key: "legLength", label: "leg segment", default: 20,
      min: 14, max: 25, step: 1, unit: "px", applies: "live" },
    { group: "frame", key: "bodyLength", label: "back", default: 65,
      min: 46, max: 80, step: 1, unit: "px", applies: "live" },
    { group: "frame", key: "chest", label: "chest depth", default: 19,
      min: 13, max: 25, step: 1, unit: "px", applies: "live" },
    { group: "frame", key: "limb", label: "limb thickness", default: 8,
      min: 5, max: 12, step: 1, unit: "px", applies: "live" },
    { group: "frame", key: "neckLength", label: "neck", default: 15,
      min: 10, max: 21, step: 1, unit: "px", applies: "live" },
    { group: "frame", key: "headSize", label: "head", default: 19,
      min: 13, max: 24, step: 1, unit: "px", applies: "live" },
    { group: "frame", key: "topline", label: "croup drop", default: 3.5,
      min: -1, max: 8, step: 0.5, unit: "px", applies: "live" },

    { group: "motion", key: "bodyBob", label: "body rise", default: 1.4,
      min: 0, max: 5, step: 0.1, unit: "px", applies: "live" },
    { group: "motion", key: "headBob", label: "head bob", default: 3.0,
      min: 0, max: 8, step: 0.1, unit: "px", applies: "live" },
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
    title: "eight colours: four of them carry the whole animal"
  },

  // Muybridge photographed this mastiff in 1887 from a camera set square to
  // the track, twelve exposures to the stride. The player runs those twelve
  // frames beside the stage, locked to where the dog is in its own stride.
  reference: {
    image: "assets/muybridge-plate-706-strip.jpg",
    columns: 6,
    rows: 2,
    frames: 12,
    frameSize: 177,
    frameHeight: 118,
    player: { width: 480, height: 300 },
    pixelated: false,
    alt: "Twelve photographs of a mastiff walking left to right, taken square " +
      "to the track, from Muybridge's Animal Locomotion",
    credit: "Eadweard Muybridge, Animal Locomotion plate 706, 1887 · public domain",
    links: [
      {
        label: "plate",
        href: "https://upload.wikimedia.org/wikipedia/commons/8/85/" +
          "Animal_locomotion._Plate_706_%28Boston_Public_Library%29.jpg"
      },
      {
        label: "commons",
        href: "https://commons.wikimedia.org/wiki/" +
          "File:Animal_locomotion._Plate_706_(Boston_Public_Library).jpg"
      }
    ],
    legend: "twelve exposures of one stride, held to the same point in the " +
      "stride as the dog beside them",
    sourceLegend: "plate 706 of Animal Locomotion, 1887 · captioned " +
      "“Dog; trotting; interrupted; mastiff. Smith” · public domain, " +
      "scanned by the Boston Public Library"
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
    { path: "gait.js", sub: "the walk and the trot", meta: "one number runs the whole animal" },
    { path: "skeleton.js", sub: "bones and joints", meta: "the elbow is solved for, not animated" },
    { path: "dog.js", sub: "the animation", meta: "two numbers, rebuilt into a skeleton each step" },
    { path: "maths.js", sub: "small helpers", meta: "including the two-bone solve" },
    { path: "palette.js", sub: "the eight colours", meta: "four of them carry the animal" },
    { path: "backdrop.js", sub: "what never moves", meta: "the plate's own ruled wall" },
    { path: "render/cpu.js", sub: "the drawing path", meta: "three masks, banded by depth" },
    { path: "assets/muybridge-plate-706-strip.jpg", sub: "the reference frames",
      meta: "the twelve frames, cut from the plate", pixelated: false,
      alt: "Twelve photographs of a mastiff walking left to right",
      caption: "The twelve exposures of plate 706, cut from the mount and laid " +
        "out as one strip. Public domain." },
    { path: "assets/muybridge-plate-706.jpg", sub: "the whole plate",
      meta: "as published, mount and all",
      alt: "Muybridge's plate 706: twelve photographs of a mastiff in motion",
      caption: "Eadweard Muybridge, <em>Animal Locomotion</em> plate 706, 1887, " +
        "captioned <em>Dog; trotting; interrupted; mastiff. Smith</em>. One camera, " +
        "square to a track ruled into squares so the distance covered between two " +
        "exposures can be read off the wall. Public domain; scan by the Boston " +
        "Public Library." }
  ],

  backends: [
    {
      id: "javascript",
      label: "JavaScript",
      note: "the animal is stamped into three masks — the far legs, the body, " +
        "the near legs — and each is shaded by how deep a pixel sits inside it",
      stats: [{ key: "pixels", label: "px / step" }],
      create: createJavascriptBackend
    }
  ],

  poster: {
    // mid-swing: all four legs are apart, so the far pair and the near pair
    // are both legible in a still
    step: 8,
    icon: { x: 100, y: 18, size: 44 },
    // two whole strides, which is exactly where the walk comes back round
    film: { steps: knob("strideSteps"), cycles: 2, scale: 4 }
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

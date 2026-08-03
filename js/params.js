"use strict";

// ---------------------------------------------------------------------
// Every number the control panel can move, at the values the animation was
// tuned to. Leave them all alone and the effect is exactly what it was
// before there was a panel at all.
// ---------------------------------------------------------------------
export var P = {
  stageWidth: 160,   // stage resolution; the height follows at 16:10
  stepsPerSec: 12,   // visual steps a second
  life: 50,          // how many steps a blast runs for
  size: 1,           // fireball size
  lumps: 12,         // lobes riding on its shoulder
  lumpSize: 1,       // how big those lobes are
  outline: 1,        // how hard noise pushes the silhouette about
  dither: 1,         // how far the colour bands stipple into each other
  breakup: 1,        // how fast the mass tears open and frays
  heat: 0,           // whole-flame colour shift, in bands
  smokePuffs: 14,
  smokeLife: 1,
  spikes: 8,         // flash spikes
  spikeReach: 1,
  shake: 3,          // camera shake, in pixels
  replay: 5.2,       // seconds between automatic blasts
  paletteLock: true  // keep to the sheet's eight colours
};

// The panel builds itself from this, so a knob cannot drift out of step with
// the value it moves. Fractional steps are driven as whole numbers and
// divided down, so "reset" lands back on the tuned value exactly.
export var CONTROLS = [
  { group: "stage", key: "stageWidth", label: "resolution", min: 96, max: 320, step: 16, unit: "px wide" },
  { group: "stage", key: "stepsPerSec", label: "cadence", min: 4, max: 30, step: 1, unit: "steps/s" },
  { group: "stage", key: "life", label: "blast length", min: 20, max: 90, step: 1, unit: "steps" },

  { group: "fireball", key: "size", label: "size", min: 0.4, max: 1.8, step: 0.05, unit: "x" },
  { group: "fireball", key: "lumps", label: "lobes", min: 0, max: 24, step: 1, unit: "" },
  { group: "fireball", key: "lumpSize", label: "lobe size", min: 0, max: 2, step: 0.05, unit: "x" },
  { group: "fireball", key: "outline", label: "outline", min: 0, max: 2.5, step: 0.05, unit: "x" },
  { group: "fireball", key: "dither", label: "edge dither", min: 0, max: 2.5, step: 0.05, unit: "x" },
  { group: "fireball", key: "breakup", label: "break-up", min: 0, max: 2, step: 0.05, unit: "x" },
  { group: "fireball", key: "heat", label: "heat", min: -3, max: 3, step: 0.1, unit: "bands" },

  { group: "smoke", key: "smokePuffs", label: "puffs", min: 0, max: 28, step: 1, unit: "" },
  { group: "smoke", key: "smokeLife", label: "lifetime", min: 0.2, max: 2.5, step: 0.05, unit: "x" },

  { group: "flash", key: "spikes", label: "spikes", min: 0, max: 16, step: 1, unit: "" },
  { group: "flash", key: "spikeReach", label: "spike reach", min: 0, max: 2.5, step: 0.05, unit: "x" },

  { group: "scene", key: "shake", label: "shake", min: 0, max: 8, step: 1, unit: "px" },
  { group: "scene", key: "replay", label: "auto-replay", min: 1, max: 12, step: 0.1, unit: "s" },
  { group: "scene", key: "paletteLock", label: "palette lock", type: "toggle" }
];

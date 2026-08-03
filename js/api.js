"use strict";

import { P, CONTROLS } from "./params.js";
import { METRICS, ENV } from "./metrics.js";
import { applyTiming } from "./stage.js";

// The panel talks to the animation through this and nothing else. Boot fills
// in `apply`, `setMode` and `capture` once PixiJS has handed over a renderer.
export var api = {
  params: P,
  defaults: JSON.parse(JSON.stringify(P)),
  controls: CONTROLS,
  metrics: METRICS,
  env: ENV,
  apply: applyTiming,
  mode: "cpu",
  gpuReady: false,
  gpuTrouble: "",
  setMode: function () { return "cpu"; },
  capture: function () {}
};

window.fireDemo = api;

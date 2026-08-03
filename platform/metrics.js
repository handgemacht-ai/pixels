"use strict";

// ---------------------------------------------------------------------
// What the browser will actually tell you about its own performance. There
// is no GPU-load or VRAM figure to read anywhere, so nothing here pretends
// to be one: this is wall-clock timing plus counts the animation and its
// backends hand over.
//
// -1 stands for "this mode does not produce this number", never for zero.
// ---------------------------------------------------------------------
export var METRICS = {
  fps: 0, fpsAvg: 0, frameAvg: 0, frameWorst: 0,
  stepAvg: 0, stepWorst: 0, uploadAvg: 0, presentAvg: 0, gpuPass: -1,
  view: "-", mode: "",
  // per backend id: its last measured step cost, and whatever it counts
  backendStep: {},
  backend: {},
  // whatever the animation counts
  custom: {}
};

export var ENV = {
  dpr: window.devicePixelRatio || 1
};

// Emptied when one animation is put away and another is brought up, so no
// reading from the last one is ever shown against the new one.
export function resetMetrics() {
  METRICS.fps = 0;
  METRICS.fpsAvg = 0;
  METRICS.frameAvg = 0;
  METRICS.frameWorst = 0;
  METRICS.stepAvg = 0;
  METRICS.stepWorst = 0;
  METRICS.uploadAvg = 0;
  METRICS.presentAvg = 0;
  METRICS.gpuPass = -1;
  METRICS.view = "-";
  METRICS.mode = "";
  METRICS.backendStep = {};
  METRICS.backend = {};
  METRICS.custom = {};
  ENV.renderer = "";
  ENV.gpu = "";
}

// Wall-clock timing. Everything the stats panel shows is measured here, with
// a handful of clock reads a frame and a running count of written pixels —
// small enough not to change the thing it is measuring.
export var clock = (window.performance && performance.now)
  ? function () { return performance.now(); }
  : function () { return Date.now(); };

export function ring(size) {
  return { at: new Float64Array(size), ms: new Float32Array(size), i: 0, n: 0, size: size };
}

export function push(r, ms, at) {
  r.at[r.i] = at;
  r.ms[r.i] = ms;
  r.i = (r.i + 1) % r.size;
  if (r.n < r.size) r.n += 1;
}

export function clear(r) {
  r.n = 0;
  r.i = 0;
}

export function summarise(r, now, window_, out) {
  var sum = 0, worst = 0, count = 0, i, v;
  for (i = 0; i < r.n; i++) {
    if (now - r.at[i] > window_) continue;
    v = r.ms[i];
    sum += v;
    if (v > worst) worst = v;
    count += 1;
  }
  out.count = count;
  out.avg = count ? sum / count : 0;
  out.worst = worst;
  return out;
}

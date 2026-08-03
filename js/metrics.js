"use strict";

// ---------------------------------------------------------------------
// What the browser will actually tell you about its own performance. There
// is no GPU-load or VRAM figure to read anywhere, so nothing here pretends
// to be one: this is wall-clock timing plus counts of our own work.
// ---------------------------------------------------------------------
export var METRICS = {
  fps: 0, fpsAvg: 0, frameAvg: 0, frameWorst: 0,
  simAvg: 0, simWorst: 0, uploadAvg: 0, renderAvg: 0,
  blasts: 0, lobes: 0, particles: 0, pixels: 0,
  view: "-",
  // -1 stands for "this mode does not produce this number", never for zero
  mode: "cpu", gpuPass: -1, draws: -1, cpuStep: -1, gpuStep: -1
};

export var ENV = {
  renderer: "starting", gpu: "n/a", dpr: window.devicePixelRatio || 1,
  shaders: "not started", timer: "n/a"
};

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

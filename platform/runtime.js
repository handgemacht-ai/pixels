"use strict";

// The clock. It builds the stage the animation asked for, starts every
// drawing path the animation offers, steps the animation at its declared
// cadence, and hands the panels one small object to talk to it through.
//
// Nothing in here knows what is being drawn.

import { readBinding } from "./api.js";
import { createParams } from "./params.js";
import { createSurface } from "./surface.js";
import { METRICS, ENV, clock, ring, push, clear, summarise } from "./metrics.js";

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

export async function startAnimation(spec, stageEl) {
  var params = createParams(spec.knobs);
  var P = params.values;

  function stageWidth() { return Math.round(readBinding(spec.stage.width, P)); }
  function cadence() { return readBinding(spec.cadence, P); }
  function replayGap() { return readBinding(spec.replay, P); }

  var width = stageWidth();
  var height = Math.round(width * spec.stage.aspect);
  METRICS.view = width + " x " + height;

  var surface = await createSurface({
    width: width,
    height: height,
    background: spec.stage.background
  });
  var senv = surface.env();
  ENV.renderer = senv.renderer;
  ENV.gpu = senv.gpu;
  ENV.dpr = window.devicePixelRatio || 1;

  // The animation, then its backdrop, then its drawing paths — in that order,
  // because a backdrop is made once per stage size and both paths are given
  // the same one.
  var scene = spec.create({ params: P, width: width, height: height });
  var backdrop = scene.backdrop ? scene.backdrop() : null;

  var context = { params: P, scene: scene, surface: surface, width: width, height: height };
  var backends = spec.backends.map(function (declared) {
    var entry = {
      id: declared.id,
      label: declared.label,
      note: declared.note,
      stats: declared.stats,
      instance: null,
      env: {},
      trouble: ""
    };
    try {
      entry.instance = declared.create(context);
      entry.env = entry.instance.env || {};
      if (backdrop && entry.instance.setBackdrop) entry.instance.setBackdrop(backdrop);
    } catch (err) {
      entry.trouble = (err && err.message) ? err.message : String(err);
    }
    METRICS.backendStep[entry.id] = -1;
    return entry;
  });

  var live = backends.filter(function (entry) { return !!entry.instance; });
  if (!live.length) {
    throw new Error("no drawing path would start · " + backends.map(function (entry) {
      return entry.label + ": " + entry.trouble;
    }).join(" · "));
  }

  var canvases = [];
  live.forEach(function (entry) {
    if (canvases.indexOf(entry.instance.canvas) >= 0) return;
    canvases.push(entry.instance.canvas);
    stageEl.appendChild(entry.instance.canvas);
  });

  var current = null;
  function chosen(id) {
    var wanted = live.filter(function (entry) { return entry.id === id; })[0];
    return wanted || live[0];
  }

  function showMode() {
    canvases.forEach(function (canvas) { canvas.hidden = canvas !== current.instance.canvas; });
    api.mode = current.id;
    METRICS.mode = current.id;
  }

  // ---------------------------- measurement ---------------------------
  var frames = ring(240);
  var steps = ring(40);
  var uploads = ring(40);
  var presents = ring(120);
  var passes = ring(40);
  var scratch = { count: 0, avg: 0, worst: 0 };
  var lastFrame = 0, lastTick = 0, lastSummary = 0;
  var carried = 0, sinceRun = 0;
  var shakeX = 0, shakeY = 0;
  var pendingGrab = null;
  var ZERO = { x: 0, y: 0 };

  function advance() {
    var back = current.instance;
    var t0 = clock();
    back.draw();
    scene.advance();
    var t1 = clock();
    if (back.upload) back.upload();
    var t2 = clock();

    push(steps, t1 - t0, t2);
    if (back.upload) push(uploads, t2 - t1, t2);
    if (back.gpuMs && back.gpuMs() >= 0) push(passes, back.gpuMs(), t2);

    METRICS.backend = {};
    if (back.stats) METRICS.backend[current.id] = back.stats();
    METRICS.custom = scene.stats ? scene.stats() : {};

    var offset = scene.offset ? scene.offset() : ZERO;
    shakeX = offset.x;
    shakeY = offset.y;

    if (pendingGrab) {
      var grab = pendingGrab;
      pendingGrab = null;
      grab(back.readFrame(), width, height, current.id);
    }
  }

  function announce() {
    document.dispatchEvent(new CustomEvent("pixels:detonate", {
      detail: { animation: spec.id, fps: cadence(), noun: spec.action.noun }
    }));
  }

  function detonate(spot) {
    scene.detonate(spot || undefined);
    sinceRun = 0;
    announce();
  }

  // A clean start: used at boot, after a resize, and after a change of
  // drawing path, so what is on screen is never the other path's leftovers.
  function restart() {
    scene.reset();
    sinceRun = 0;
    announce();
  }

  // Redone from scratch when the stage size changes: new buffers, a new
  // backdrop and a new texture at the new size.
  function rebuild() {
    width = stageWidth();
    height = Math.round(width * spec.stage.aspect);
    METRICS.view = width + " x " + height;
    if (scene.resize) scene.resize(width, height);
    surface.resize(width, height);
    live.forEach(function (entry) {
      if (entry.instance.resize) entry.instance.resize(width, height);
    });
    backdrop = scene.backdrop ? scene.backdrop() : null;
    if (backdrop) {
      live.forEach(function (entry) {
        if (entry.instance.setBackdrop) entry.instance.setBackdrop(backdrop);
      });
    }
    restart();
  }

  function tick() {
    window.requestAnimationFrame(tick);
    var now = clock();
    // a frame that arrives inside the clock's resolution reports 0ms; that
    // is a real zero, not a missing value, so never substitute a default
    var delta = lastTick ? now - lastTick : 1000 / 60;
    lastTick = now;

    var rate = cadence();
    var step = 1 / rate;
    var wait = Math.max(1, Math.round(replayGap() * rate));
    carried += clamp(delta / 1000, 0, 0.1);
    var guard = 0;
    while (carried >= step && guard < 6) {
      carried -= step;
      guard += 1;
      sinceRun += 1;
      if (replayGap() > 0 && sinceRun >= wait) detonate(null);
      advance();
    }

    // the step above only happens at the animation's cadence; this happens
    // every time the screen refreshes, because no canvas keeps its picture
    var before = clock();
    current.instance.present(shakeX, shakeY);
    var after = clock();
    push(presents, after - before, after);

    if (lastFrame) {
      var gap = after - lastFrame;
      push(frames, gap, after);
      METRICS.fps = gap > 0 ? 1000 / gap : 0;
    }
    lastFrame = after;

    // the panel repaints four times a second, so the averages are worked out
    // at the same rate and not once a frame
    if (after - lastSummary < 240) return;
    lastSummary = after;
    summarise(frames, after, 1000, scratch);
    METRICS.fpsAvg = scratch.count;
    METRICS.frameAvg = scratch.avg;
    METRICS.frameWorst = scratch.worst;
    summarise(steps, after, 3000, scratch);
    METRICS.stepAvg = scratch.avg;
    METRICS.stepWorst = scratch.worst;
    METRICS.backendStep[current.id] = scratch.avg;
    summarise(uploads, after, 3000, scratch);
    METRICS.uploadAvg = current.instance.upload ? scratch.avg : -1;
    summarise(presents, after, 1000, scratch);
    METRICS.presentAvg = scratch.avg;
    summarise(passes, after, 3000, scratch);
    METRICS.gpuPass = scratch.count ? scratch.avg : -1;
  }

  // ------------------------- what the panels see ----------------------
  var api = {
    id: spec.id,
    title: spec.title,
    params: P,
    defaults: params.defaults,
    knobs: spec.knobs,
    metrics: METRICS,
    env: ENV,
    mode: "",
    backends: backends.map(function (entry) {
      return {
        id: entry.id, label: entry.label, note: entry.note,
        stats: entry.stats, env: entry.env,
        ready: !!entry.instance, trouble: entry.trouble
      };
    }),

    // a knob has moved
    apply: function () {
      if (stageWidth() !== width) rebuild();
      document.dispatchEvent(new CustomEvent("pixels:apply", { detail: { animation: spec.id } }));
    },

    reset: function () {
      params.reset();
      api.apply();
    },

    setMode: function (id) {
      var wanted = chosen(id);
      if (wanted === current) return current.id;
      current = wanted;
      showMode();
      // the path that has just been left keeps its last reading, so the two
      // can be read against each other
      clear(steps);
      clear(uploads);
      clear(passes);
      METRICS.gpuPass = -1;
      METRICS.uploadAvg = -1;
      restart();
      advance();
      return current.id;
    },

    detonate: function (spot) { detonate(spot || null); },

    capture: function (fn) { pendingGrab = fn; }
  };

  current = chosen(spec.defaultBackend);
  showMode();

  stageEl.addEventListener("pointerdown", function (event) {
    var rect = stageEl.getBoundingClientRect();
    detonate({
      x: (event.clientX - rect.left) / rect.width * width,
      y: (event.clientY - rect.top) / rect.height * height
    });
  });

  restart();
  window.requestAnimationFrame(tick);
  return api;
}

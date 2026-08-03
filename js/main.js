"use strict";

// Boot. Wires the two drawing paths to one clock, hands the panels the small
// object they talk to the animation through, and starts the page.

import { P } from "./params.js";
import { VIEW_W, VIEW_H, GROUND, STEP, LIFE, applyStage, applyTiming } from "./stage.js";
import { C } from "./palette.js";
import { rand, randInt, clamp } from "./maths.js";
import { makeBlast } from "./blast.js";
import { api } from "./api.js";
import { METRICS, ENV, clock, ring, push, summarise } from "./metrics.js";
import { frame, pixels, touched, allocate, clearFrame, resetTouched, blit, drawBlast } from "./render/cpu.js";
import { createGpuRenderer } from "./render/gpu.js";
import { initExplorer } from "./ui/explorer.js";
import { initShell } from "./ui/shell.js";
import { initControls } from "./ui/controls.js";
import { initStats } from "./ui/stats.js";
import { initSheet } from "./ui/sheet.js";

var stageEl = document.getElementById("stage");
var errorEl = document.getElementById("error");

function fail(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function textureFrom(canvas) {
  var texture;
  if (PIXI.CanvasSource) {
    texture = new PIXI.Texture({
      source: new PIXI.CanvasSource({ resource: canvas, scaleMode: "nearest" })
    });
  } else {
    texture = PIXI.Texture.from(canvas);
  }
  if (texture.source) texture.source.scaleMode = "nearest";
  return texture;
}

function backdrop() {
  var canvas = document.createElement("canvas");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  var ctx = canvas.getContext("2d");
  var i, x;
  ctx.fillStyle = "#" + ("00000" + C.soot.toString(16)).slice(-6);
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "#" + ("00000" + C.smoke.toString(16)).slice(-6);
  for (x = 0; x < VIEW_W; x++) {
    if ((x + 1) % 2 === 0) ctx.fillRect(x, GROUND, 1, 1);
    ctx.fillRect(x, GROUND + 1, 1, 1);
  }
  for (i = 0; i < 70; i++) {
    ctx.fillRect(randInt(0, VIEW_W - 1), randInt(GROUND + 2, VIEW_H - 1), randInt(1, 3), 1);
  }
  return canvas;
}

function boot() {
  if (!window.PIXI) {
    fail("PixiJS could not be loaded from the CDN. Open this page with an internet connection.");
    return;
  }

  if (PIXI.TextureSource && PIXI.TextureSource.defaultOptions) {
    PIXI.TextureSource.defaultOptions.scaleMode = "nearest";
  }

  var app = new PIXI.Application();

  function readEnvironment() {
    var r = app.renderer;
    var gl = r.gl || (r.context && r.context.gl) || null;
    ENV.dpr = window.devicePixelRatio || 1;
    if (!gl) {
      ENV.renderer = r.name ? String(r.name) : "canvas";
      return;
    }
    var version = (r.context && r.context.webGLVersion) ||
      ((typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext) ? 2 : 1);
    ENV.renderer = "WebGL " + version;
    try {
      // the only way a page can name the GPU, and browsers are free to refuse
      var ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) ENV.gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "n/a");
      else ENV.gpu = String(gl.getParameter(gl.RENDERER) || "n/a") + " (masked)";
    } catch (err) {
      ENV.gpu = "n/a";
    }
  }

  function start() {
    stageEl.appendChild(app.canvas);
    var backCanvas = backdrop();
    var backSprite = new PIXI.Sprite(textureFrom(backCanvas));
    app.stage.addChild(backSprite);

    var texture = textureFrom(frame);
    var sprite = new PIXI.Sprite(texture);
    app.stage.addChild(sprite);

    readEnvironment();

    // The shader path is set up beside the JavaScript one and used if it
    // starts. Where WebGL 2 is missing, or a shader will not compile, the page
    // stays on the JavaScript path and says so under the numbers.
    var gpu = null;
    try {
      gpu = createGpuRenderer();
    } catch (err) {
      api.gpuTrouble = err && err.message ? err.message : String(err);
    }
    if (gpu) {
      gpu.loadBackdrop(backCanvas);
      stageEl.appendChild(gpu.canvas);
      ENV.shaders = "7 programs";
      ENV.timer = gpu.hasTimer ? "EXT_disjoint_timer_query_webgl2" : "n/a (extension absent)";
    } else {
      ENV.shaders = "n/a";
      ENV.timer = "n/a";
      if (!api.gpuTrouble) api.gpuTrouble = "WebGL 2 is not available in this browser";
    }
    api.gpuReady = !!gpu;

    var mode = gpu ? "gpu" : "cpu";
    api.mode = mode;
    METRICS.mode = mode;

    // PixiJS drives itself by default; here the page keeps the clock so that
    // both paths are driven the same way and only the mode in use does any
    // work. In JavaScript mode PixiJS still draws the stage; in shader mode it
    // is idle and its canvas is hidden.
    app.stop();

    var blasts = [];
    var shake = 0;
    var shakeX = 0;
    var shakeY = 0;
    var draws = 0;

    var frames = ring(240);
    var steps = ring(40);
    var uploads = ring(40);
    var renders = ring(120);
    var passes = ring(40);
    var scratch = { count: 0, avg: 0, worst: 0 };
    var lastFrame = 0;
    var lastTick = 0;
    var lastSummary = 0;
    var pendingGrab = null;

    function showMode() {
      app.canvas.hidden = mode !== "cpu";
      if (gpu) gpu.canvas.hidden = mode !== "gpu";
      api.mode = mode;
      METRICS.mode = mode;
    }
    showMode();

    function advance() {
      var t0 = clock();
      resetTouched();
      var i, b;
      if (mode === "cpu") {
        clearFrame();
        for (i = blasts.length - 1; i >= 0; i--) drawBlast(blasts[i]);
      } else {
        draws = gpu.build(blasts);
      }
      var lobes = 0, particles = 0;
      for (i = blasts.length - 1; i >= 0; i--) {
        b = blasts[i];
        lobes += b.lumps.length;
        particles += b.specks.length + b.puffs.length + b.dust.length + b.rays.length;
        b.step += 1;
        if (b.step > b.life) blasts.splice(i, 1);
      }
      var t1 = clock();
      if (mode === "cpu") {
        blit();
        texture.source.update();
      }
      var t2 = clock();
      push(steps, t1 - t0, t2);
      push(uploads, t2 - t1, t2);
      if (gpu && mode === "gpu" && gpu.gpuMs() >= 0) push(passes, gpu.gpuMs(), t2);
      METRICS.pixels = mode === "cpu" ? touched : -1;
      METRICS.draws = mode === "cpu" ? -1 : draws;
      METRICS.blasts = blasts.length;
      METRICS.lobes = lobes;
      METRICS.particles = particles;

      // the shake moves in whole pixels, never half of one, and it is drawn
      // the same either way: the picture is made unshaken and then laid down
      // shifted
      if (shake > 0) {
        shakeX = randInt(-shake, shake);
        shakeY = randInt(-shake, shake);
        shake -= 1;
      } else {
        shakeX = 0;
        shakeY = 0;
      }
      sprite.position.set(shakeX, shakeY);

      if (pendingGrab) {
        var grab = pendingGrab;
        pendingGrab = null;
        grab(mode === "cpu" ? new Uint8Array(pixels) : gpu.readFrame(), VIEW_W, VIEW_H, mode);
      }
    }

    // Redone from scratch when the resolution knob moves: new buffers, a new
    // backdrop and a new texture at the new size.
    function rebuild() {
      applyStage();
      allocate();
      app.renderer.resize(VIEW_W, VIEW_H);
      backCanvas = backdrop();
      var oldBack = backSprite.texture;
      backSprite.texture = textureFrom(backCanvas);
      oldBack.destroy(true);
      var oldFrame = texture;
      texture = textureFrom(frame);
      sprite.texture = texture;
      oldFrame.destroy(true);
      if (gpu) {
        gpu.resize();
        gpu.loadBackdrop(backCanvas);
      }
      blasts.length = 0;
      blastAt(VIEW_W * 0.5, GROUND);
    }

    api.apply = function () {
      applyTiming();
      if (P.stageWidth !== VIEW_W) rebuild();
    };

    api.setMode = function (name) {
      var wanted = name === "gpu" ? "gpu" : "cpu";
      if (wanted === "gpu" && !gpu) wanted = "cpu";
      if (wanted === mode) return mode;
      mode = wanted;
      showMode();
      // the mode that has just been left keeps its last reading, so the two
      // can be read against each other
      steps.n = 0;
      steps.i = 0;
      renders.n = 0;
      renders.i = 0;
      passes.n = 0;
      passes.i = 0;
      METRICS.gpuPass = -1;
      METRICS.uploadAvg = -1;
      // start the picture again rather than showing the other path's leftovers
      blasts.length = 0;
      blastAt(VIEW_W * 0.5, GROUND);
      advance();
      return mode;
    };

    api.capture = function (fn) { pendingGrab = fn; };

    var carried = 0;
    var sinceBlast = 0;

    function blastAt(x, y) {
      blasts.push(makeBlast(x, y));
      sinceBlast = 0;
      shake = P.shake;
      document.dispatchEvent(new CustomEvent("blast", {
        detail: { steps: LIFE, rate: STEP, fps: P.stepsPerSec }
      }));
    }

    function tick() {
      window.requestAnimationFrame(tick);
      var now = clock();
      // a frame that arrives inside the clock's resolution reports 0ms; that
      // is a real zero, not a missing value, so never substitute a default
      var delta = lastTick ? now - lastTick : 1000 / 60;
      lastTick = now;

      carried += clamp(delta / 1000, 0, 0.1);
      var guard = 0;
      var wait = Math.max(1, Math.round(P.replay * P.stepsPerSec));
      while (carried >= STEP && guard < 6) {
        carried -= STEP;
        guard += 1;
        sinceBlast += 1;
        if (sinceBlast >= wait) blastAt(VIEW_W * rand(0.4, 0.6), GROUND);
        advance();
      }

      // the step above only happens twelve times a second; this happens every
      // time the screen refreshes, because neither canvas keeps its picture
      var before = clock();
      if (mode === "cpu") app.render();
      else gpu.present(shakeX, shakeY);
      var after = clock();
      push(renders, after - before, after);

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
      METRICS.simAvg = scratch.avg;
      METRICS.simWorst = scratch.worst;
      if (mode === "cpu") METRICS.cpuStep = scratch.avg;
      else METRICS.gpuStep = scratch.avg;
      summarise(uploads, after, 3000, scratch);
      METRICS.uploadAvg = mode === "cpu" ? scratch.avg : -1;
      summarise(renders, after, 1000, scratch);
      METRICS.renderAvg = scratch.avg;
      summarise(passes, after, 3000, scratch);
      METRICS.gpuPass = (mode === "gpu" && scratch.count) ? scratch.avg : -1;
    }

    stageEl.addEventListener("pointerdown", function (e) {
      var rect = stageEl.getBoundingClientRect();
      blastAt(
        (e.clientX - rect.left) / rect.width * VIEW_W,
        (e.clientY - rect.top) / rect.height * VIEW_H
      );
    });

    blastAt(VIEW_W * 0.5, GROUND);
    document.dispatchEvent(new CustomEvent("firedemo-ready"));
    window.requestAnimationFrame(tick);
  }

  app.init({
    width: VIEW_W,
    height: VIEW_H,
    background: C.soot,
    antialias: false,
    autoDensity: false,
    resolution: 1,
    roundPixels: true
  }).then(start).catch(function (err) {
    fail("The WebGL renderer could not start: " + (err && err.message ? err.message : err));
  });
}

boot();
initExplorer();
initShell();
initControls();
initStats();
initSheet();

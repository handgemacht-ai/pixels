"use strict";

// ==================== the same picture, on the GPU ===================
// render/cpu.js builds a step by writing pixels in JavaScript. What follows
// does the same work in fragment shaders on a second WebGL 2 canvas, one
// small pass at a time:
//
//   silhouette -> depth -> colour        (for the smoke, then the flame)
//
// The silhouette pass writes the mask straight into a depth texture; ten
// cheap passes then push the same 3-4 chamfer distance outwards that the
// CPU sweeps in two; the colour pass reads that depth and paints. Sparks,
// spikes and ground dust are one more pass, and a last one lays the
// finished frame over the backdrop with the camera shake.
// ---------------------------------------------------------------------

import { P, VIEW_W, VIEW_H, GROUND } from "../state.js";
import { C } from "../palette.js";
import { clamp } from "../maths.js";
import { curve, HEAT, CORE, WIDE, TALL, RISE, WOB, TEAR, BITE } from "../curves.js";
import { bounds } from "../blast.js";
import {
  GLSL_VERT, GLSL_MASK_FIRE, GLSL_MASK_SMOKE, GLSL_DIST,
  GLSL_PAINT_FIRE, GLSL_PAINT_SMOKE, GLSL_EXTRAS, GLSL_COMPOSITE
} from "./shaders.js";

// How far in the depth passes bother to measure, in chamfer units of three
// to the pixel. The last band starts at a depth of eight pixels and the
// dither can pull a pixel that many bands back, so past this point every
// reading paints the same colour and measuring deeper would cost passes for
// nothing. Each pass carries a value one pixel further, hence the count.
function fireDepth() {
  var cap = Math.min(72, Math.ceil(3 * (8 + 1.425 * P.dither)) + 1);
  return { cap: cap, sweeps: Math.ceil(cap / 3) };
}
var SMOKE_CAP = 12;
var SMOKE_SWEEPS = 4;

export function createGpuRenderer() {
  var canvas = document.createElement("canvas");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  canvas.setAttribute("aria-label", "The same explosion, drawn by fragment shaders");
  var gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  });
  if (!gl) throw new Error("WebGL 2 is not available in this browser");

  var trouble = "";

  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      trouble = gl.getShaderInfoLog(shader) || "shader would not compile";
      return null;
    }
    return shader;
  }

  function build(fragment) {
    var vs = compile(gl.VERTEX_SHADER, GLSL_VERT);
    var fs = vs ? compile(gl.FRAGMENT_SHADER, fragment) : null;
    if (!vs || !fs) return null;
    var id = gl.createProgram();
    gl.attachShader(id, vs);
    gl.attachShader(id, fs);
    gl.bindAttribLocation(id, 0, "aPos");
    gl.linkProgram(id);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(id, gl.LINK_STATUS)) {
      trouble = gl.getProgramInfoLog(id) || "program would not link";
      return null;
    }
    return { id: id, at: {} };
  }

  var progs = {
    maskFire: build(GLSL_MASK_FIRE),
    maskSmoke: build(GLSL_MASK_SMOKE),
    depth: build(GLSL_DIST),
    paintFire: build(GLSL_PAINT_FIRE),
    paintSmoke: build(GLSL_PAINT_SMOKE),
    extras: build(GLSL_EXTRAS),
    composite: build(GLSL_COMPOSITE)
  };
  var key;
  for (key in progs) {
    if (Object.prototype.hasOwnProperty.call(progs, key) && !progs[key]) {
      throw new Error(trouble || "a shader program would not build");
    }
  }

  var current = null;
  function use(prog) {
    if (current !== prog) { gl.useProgram(prog.id); current = prog; }
    return prog;
  }
  function at(prog, name) {
    if (!(name in prog.at)) prog.at[name] = gl.getUniformLocation(prog.id, name);
    return prog.at[name];
  }

  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.SCISSOR_TEST);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  var timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  var pending = [];
  var lastGpuMs = -1;

  var targets = {};
  function target(name) {
    if (!targets[name]) {
      targets[name] = { texture: gl.createTexture(), buffer: gl.createFramebuffer(), w: 0, h: 0 };
    }
    var t = targets[name];
    if (t.w !== VIEW_W || t.h !== VIEW_H) {
      gl.bindTexture(gl.TEXTURE_2D, t.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, VIEW_W, VIEW_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.buffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.texture, 0);
      t.w = VIEW_W;
      t.h = VIEW_H;
    }
    return t;
  }

  var backTexture = gl.createTexture();
  function loadBackdrop(source) {
    gl.bindTexture(gl.TEXTURE_2D, backTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  var palette = new Float32Array([
    (C.white >> 16) & 255, (C.white >> 8) & 255, C.white & 255,
    (C.paleYellow >> 16) & 255, (C.paleYellow >> 8) & 255, C.paleYellow & 255,
    (C.amber >> 16) & 255, (C.amber >> 8) & 255, C.amber & 255,
    (C.orange >> 16) & 255, (C.orange >> 8) & 255, C.orange & 255,
    (C.darkRed >> 16) & 255, (C.darkRed >> 8) & 255, C.darkRed & 255,
    (C.deepRed >> 16) & 255, (C.deepRed >> 8) & 255, C.deepRed & 255,
    (C.smoke >> 16) & 255, (C.smoke >> 8) & 255, C.smoke & 255,
    (C.soot >> 16) & 255, (C.soot >> 8) & 255, C.soot & 255
  ]);

  var lumpData = new Float32Array(28 * 3);
  var holeData = new Float32Array(4 * 4);
  var rayData = new Float32Array(16 * 4);
  var speckData = new Float32Array(26 * 3);
  var dustData = new Float32Array(10 * 4);

  var draws = 0;
  function drawPass(prog, box) {
    use(prog);
    gl.uniform1i(at(prog, "uW"), VIEW_W);
    gl.uniform1i(at(prog, "uH"), VIEW_H);
    gl.uniform4i(at(prog, "uBox"), box[0], box[1], box[2], box[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    draws += 1;
  }

  // A blast is built inside its own rectangle: the passes are pointed at
  // that rectangle alone, so the rest of the stage costs nothing. Nothing
  // outside it is ever read back either — the depth passes answer for those
  // pixels from the cap rather than from the texture.
  function bindTarget(t, box) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.buffer : null);
    if (box) gl.viewport(box[0], VIEW_H - 1 - box[3], box[2] - box[0] + 1, box[3] - box[1] + 1);
    else gl.viewport(0, 0, VIEW_W, VIEW_H);
  }

  function bindTexture(prog, name, texture, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(at(prog, name), unit);
  }

  // smoke and flame share this: silhouette into the depth texture, then a
  // handful of sweeps, then the paint pass reads it back
  function layer(maskProg, paintProg, box, cap, sweeps, frameTarget) {
    var a = target("depthA"), b = target("depthB");
    bindTarget(a, box);
    drawPass(maskProg, box);
    var from = a, to = b, swap;
    for (var i = 0; i < sweeps; i++) {
      bindTarget(to, box);
      use(progs.depth);
      gl.uniform1i(at(progs.depth, "uCap"), cap);
      bindTexture(progs.depth, "uPrev", from.texture, 0);
      drawPass(progs.depth, box);
      swap = from; from = to; to = swap;
    }
    bindTarget(frameTarget, box);
    use(paintProg);
    bindTexture(paintProg, "uDepth", from.texture, 0);
    drawPass(paintProg, box);
  }

  // One visual step: everything that makes the picture, into a texture.
  function buildFrame(blasts) {
    draws = 0;
    var query = null;
    if (timer) {
      query = gl.createQuery();
      gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    }

    var frameTarget = target("frame");
    bindTarget(frameTarget);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (var i = blasts.length - 1; i >= 0; i--) {
      drawOne(blasts[i], frameTarget);
    }

    if (query) {
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      pending.push(query);
    }
    collectTimings();
    return draws;
  }

  // Every displayed frame: that texture over the backdrop, shifted by the
  // shake. Cheap enough to redo at screen rate between steps, which is what
  // it has to be — a WebGL canvas keeps nothing from the frame before.
  function present(shakeX, shakeY) {
    var frameTarget = target("frame");
    bindTarget(null);
    use(progs.composite);
    bindTexture(progs.composite, "uFrame", frameTarget.texture, 0);
    bindTexture(progs.composite, "uBack", backTexture, 1);
    gl.uniform2i(at(progs.composite, "uShake"), shakeX, shakeY);
    drawPass(progs.composite, [0, 0, VIEW_W - 1, VIEW_H - 1]);
  }

  // The frame as the shaders left it, top row first, so it can be held next
  // to the buffer the JavaScript path fills.
  function readFrame() {
    var flipped = new Uint8Array(VIEW_W * VIEW_H * 4);
    var raw = new Uint8Array(VIEW_W * VIEW_H * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target("frame").buffer);
    gl.readPixels(0, 0, VIEW_W, VIEW_H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    var row = VIEW_W * 4;
    for (var y = 0; y < VIEW_H; y++) {
      flipped.set(raw.subarray((VIEW_H - 1 - y) * row, (VIEW_H - y) * row), y * row);
    }
    return flipped;
  }

  function collectTimings() {
    while (pending.length) {
      var q = pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      pending.shift();
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
        lastGpuMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1000000;
      }
      gl.deleteQuery(q);
    }
    if (pending.length > 6) gl.deleteQuery(pending.shift());
  }

  function drawOne(b, frameTarget) {
    var step = b.step * b.warp;
    var R = b.Rmax;
    var r = bounds(b);
    var box = [r.x0, r.y0, r.x1, r.y1];
    var wide = curve(WIDE, step) * R;
    var tall = curve(TALL, step) * R;
    var rise = curve(RISE, step);
    var heat = curve(HEAT, step) + P.heat;
    var tear = curve(TEAR, step) * P.breakup;
    var bite = curve(BITE, step) * P.breakup;
    var wob = curve(WOB, step) * P.outline;
    var cy = b.base - rise - tall * 0.55;
    var k, p, n, px, py, pr, count;

    if (step >= 17 && step < 17 + 31 * P.smokeLife) {
      count = 0;
      for (k = 0; k < b.puffs.length; k++) {
        p = b.puffs[k];
        if (step < p.born) continue;
        n = step - p.born;
        px = b.x + p.ux * wide * 0.95;
        py = cy + p.uy * tall * 0.8 - p.rise * n;
        pr = R * (p.r + p.grow * n);
        if (pr <= 0.5) continue;
        lumpData[count * 3] = px;
        lumpData[count * 3 + 1] = py;
        lumpData[count * 3 + 2] = pr;
        count += 1;
      }
      var sTear = clamp((step - 28) / (15 * P.smokeLife), 0, 1) * 0.85 * P.breakup;
      use(progs.maskSmoke);
      gl.uniform1i(at(progs.maskSmoke, "uSeed"), b.seed);
      gl.uniform1i(at(progs.maskSmoke, "uGround"), GROUND);
      gl.uniform1i(at(progs.maskSmoke, "uCap"), SMOKE_CAP);
      gl.uniform1i(at(progs.maskSmoke, "uLumpCount"), count);
      gl.uniform3fv(at(progs.maskSmoke, "uLumps"), lumpData);
      gl.uniform1f(at(progs.maskSmoke, "uTear"), sTear);
      use(progs.paintSmoke);
      gl.uniform1i(at(progs.paintSmoke, "uSeed"), b.seed);
      gl.uniform1f(at(progs.paintSmoke, "uTear"), sTear);
      gl.uniform1f(at(progs.paintSmoke, "uStep"), step);
      gl.uniform3fv(at(progs.paintSmoke, "uPalette"), palette);
      layer(progs.maskSmoke, progs.paintSmoke, box, SMOKE_CAP, SMOKE_SWEEPS, frameTarget);
    }

    if (heat > -6.5) {
      var depth = fireDepth();
      count = 0;
      for (k = 0; k < b.lumps.length; k++) {
        p = b.lumps[k];
        px = b.x + p.ux * wide * (1 + p.drift * step);
        py = cy + p.uy * tall * (1 + p.drift * step) - p.lift * step * step * 0.5;
        pr = R * p.r * P.lumpSize * (0.3 + 0.9 * clamp(step / 14, 0, 1));
        if (pr <= 0.5) continue;
        lumpData[count * 3] = px;
        lumpData[count * 3 + 1] = py;
        lumpData[count * 3 + 2] = pr;
        count += 1;
      }
      var holes = 0;
      for (k = 0; k < b.holes.length && holes < 4; k++) {
        p = b.holes[k];
        if (step < p.born) continue;
        n = clamp(step - p.born, 0, 13);
        pr = R * Math.min(p.r + p.grow * n, p.cap) *
             clamp(n / 3, 0.3, 1) * clamp(1 - (step - 20) / 10, 0, 1);
        if (pr * p.wide <= 0.5 || pr * p.high <= 0.5) continue;
        holeData[holes * 4] = b.x + p.ux * wide;
        holeData[holes * 4 + 1] = cy + p.uy * tall;
        holeData[holes * 4 + 2] = pr * p.wide;
        holeData[holes * 4 + 3] = pr * p.high;
        holes += 1;
      }
      use(progs.maskFire);
      gl.uniform2f(at(progs.maskFire, "uCentre"), b.x, cy);
      gl.uniform2f(at(progs.maskFire, "uSize"), wide, tall);
      gl.uniform2f(at(progs.maskFire, "uInvSq"), 1 / (wide * wide), 1 / (tall * tall));
      gl.uniform1f(at(progs.maskFire, "uWob"), wob);
      gl.uniform1f(at(progs.maskFire, "uTear"), tear);
      gl.uniform1i(at(progs.maskFire, "uSeed"), b.seed);
      gl.uniform1i(at(progs.maskFire, "uGround"), GROUND);
      gl.uniform1i(at(progs.maskFire, "uCap"), depth.cap);
      gl.uniform1i(at(progs.maskFire, "uBody"),
        (wide * 0.92 > 0.5 && tall * 0.92 > 0.5) ? 1 : 0);
      gl.uniform1i(at(progs.maskFire, "uLumpCount"), count);
      gl.uniform3fv(at(progs.maskFire, "uLumps"), lumpData);
      gl.uniform1i(at(progs.maskFire, "uHoleCount"), holes);
      gl.uniform4fv(at(progs.maskFire, "uHoles"), holeData);

      use(progs.paintFire);
      gl.uniform2f(at(progs.paintFire, "uCentre"), b.x, cy);
      gl.uniform2f(at(progs.paintFire, "uInvBand"), 1 / (wide * 0.62), 1 / (tall * 0.62));
      gl.uniform1f(at(progs.paintFire, "uCyc"), cy + tall * 0.04);
      gl.uniform1f(at(progs.paintFire, "uHeat"), heat);
      gl.uniform1f(at(progs.paintFire, "uCore"), curve(CORE, step));
      gl.uniform1f(at(progs.paintFire, "uBite"), bite);
      gl.uniform1f(at(progs.paintFire, "uDither"), P.dither);
      gl.uniform1i(at(progs.paintFire, "uSeed"), b.seed);
      gl.uniform1i(at(progs.paintFire, "uLock"), P.paletteLock ? 1 : 0);
      gl.uniform3fv(at(progs.paintFire, "uPalette"), palette);
      layer(progs.maskFire, progs.paintFire, box, depth.cap, depth.sweeps, frameTarget);
    }

    var rays = 0;
    for (k = 0; k < b.rays.length && rays < 16; k++) {
      p = b.rays[k];
      if (step < p.from || step > p.until) continue;
      var from = Math.min(wide, tall) * 0.78;
      rayData[rays * 4] = Math.cos(p.a);
      rayData[rays * 4 + 1] = Math.sin(p.a);
      rayData[rays * 4 + 2] = from;
      rayData[rays * 4 + 3] = from + R * p.len * P.spikeReach *
        (1 - (step - p.from) / (p.until - p.from + 2));
      rays += 1;
    }
    var specks = 0;
    for (k = 0; k < b.specks.length && specks < 26; k++) {
      p = b.specks[k];
      if (step < p.born || step > p.born + p.life) continue;
      n = step - p.born;
      py = Math.round(cy + p.vy * n + p.grav * n * n);
      if (py > GROUND) continue;
      speckData[specks * 3] = Math.round(b.x + p.vx * n);
      speckData[specks * 3 + 1] = py;
      speckData[specks * 3 + 2] = (p.wide ? 1 : 0) + (p.dark ? 2 : 0) + (n < 4 ? 4 : 0);
      specks += 1;
    }
    var dust = 0;
    for (k = 0; k < b.dust.length && dust < 10; k++) {
      p = b.dust[k];
      if (step < p.born || step > 34) continue;
      n = step - p.born;
      dustData[dust * 4] = Math.round(b.x + p.side * (p.d0 * R + p.speed * n));
      dustData[dust * 4 + 1] = GROUND - (n > 6 ? 2 : 1);
      dustData[dust * 4 + 2] = p.len;
      dustData[dust * 4 + 3] = (b.seed + 41 + n) | 0;
      dust += 1;
    }

    if (rays + specks + dust > 0) {
      bindTarget(frameTarget);
      use(progs.extras);
      gl.uniform2f(at(progs.extras, "uCentre"), b.x, cy);
      gl.uniform1i(at(progs.extras, "uSeed"), b.seed);
      gl.uniform1i(at(progs.extras, "uGround"), GROUND);
      gl.uniform1i(at(progs.extras, "uRayCount"), rays);
      gl.uniform4fv(at(progs.extras, "uRays"), rayData);
      gl.uniform1i(at(progs.extras, "uSpeckCount"), specks);
      gl.uniform3fv(at(progs.extras, "uSpecks"), speckData);
      gl.uniform1i(at(progs.extras, "uDustCount"), dust);
      gl.uniform4fv(at(progs.extras, "uDust"), dustData);
      gl.uniform3fv(at(progs.extras, "uPalette"), palette);
      drawPass(progs.extras, [0, 0, VIEW_W - 1, VIEW_H - 1]);
    }
  }

  return {
    canvas: canvas,
    gl: gl,
    hasTimer: !!timer,
    trouble: trouble,
    build: buildFrame,
    present: present,
    readFrame: readFrame,
    loadBackdrop: loadBackdrop,
    gpuMs: function () { return lastGpuMs; },
    // A browser only keeps a handful of live WebGL contexts. Switching away
    // from this animation hands this one back rather than waiting for the
    // garbage collector to notice, so switching to and fro cannot run the
    // page out of contexts.
    dispose: function () {
      var lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    },
    resize: function () {
      canvas.width = VIEW_W;
      canvas.height = VIEW_H;
      target("frame");
      target("depthA");
      target("depthB");
    }
  };
}

// ------------------------- the registered backend --------------------
// This path owns its canvas and puts the finished frame on screen itself,
// so it never touches the platform's pixel surface. If WebGL 2 is missing or
// a program will not build, this throws and the platform says why under the
// stats and leaves the switch on the JavaScript path.

export function createShaderBackend(ctx) {
  var gpu = createGpuRenderer();
  var scene = ctx.scene;
  var count = { draws: 0 };

  return {
    canvas: gpu.canvas,

    env: {
      "shader path": "7 programs",
      "gpu timer": gpu.hasTimer ? "EXT_disjoint_timer_query_webgl2" : "n/a (extension absent)"
    },

    setBackdrop: function (canvas) { gpu.loadBackdrop(canvas); },
    resize: function () { gpu.resize(); },
    draw: function () { count.draws = gpu.build(scene.blasts); },
    present: function (dx, dy) { gpu.present(dx, dy); },
    readFrame: function () { return gpu.readFrame(); },
    stats: function () { return count; },
    gpuMs: function () { return gpu.gpuMs(); },
    dispose: function () { gpu.dispose(); }
  };
}

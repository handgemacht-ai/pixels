"use strict";

// The stats readout and the switch between the two drawing paths. Everything
// shown here is measured by the animation; nothing is guessed at.

import { api } from "../api.js";

// ---------------- where each frame is drawn --------------------------
// Two paths make the same picture: the JavaScript one that writes the
// buffer a pixel at a time, and the shader one that draws it in passes on
// the graphics card. The page opens on the shaders where they are available
// and falls back on its own, saying so.
var MODES = [
  { key: "cpu", label: "JavaScript" },
  { key: "gpu", label: "Shaders" }
];

function fixed(places) {
  // -1 is how the animation says a number does not exist in this mode; it is
  // never a measurement, so it is shown as such rather than as zero
  return function (v) {
    if (typeof v !== "number") return "n/a";
    return v < 0 ? "n/a" : v.toFixed(places);
  };
}
var whole = fixed(0);

var LIVE = [
  { key: "fps", label: "fps now", fmt: fixed(0) },
  { key: "fpsAvg", label: "fps 1s avg", fmt: whole },
  { key: "frameAvg", label: "frame avg ms", fmt: fixed(2) },
  { key: "frameWorst", label: "frame worst ms", fmt: fixed(2) },
  { key: "simAvg", label: "step js ms", fmt: fixed(2) },
  { key: "simWorst", label: "step worst ms", fmt: fixed(2) },
  { key: "gpuPass", label: "gpu pass ms", fmt: fixed(3) },
  { key: "uploadAvg", label: "upload ms", fmt: fixed(2) },
  { key: "renderAvg", label: "present ms", fmt: fixed(2) },
  { key: "draws", label: "draw calls", fmt: whole },
  { key: "cpuStep", label: "js path ms", fmt: fixed(2) },
  { key: "gpuStep", label: "shader path ms", fmt: fixed(2) },
  { key: "blasts", label: "blasts", fmt: whole },
  { key: "lobes", label: "lobes", fmt: whole },
  { key: "particles", label: "particles", fmt: whole },
  { key: "pixels", label: "px / step", fmt: whole }
];

function heapText() {
  var memory = window.performance && window.performance.memory;
  if (!memory || !memory.usedJSHeapSize) return "n/a";
  return (memory.usedJSHeapSize / 1048576).toFixed(1) + " MB";
}

var ENVCELLS = [
  { label: "drawn by", read: function () { return api.mode === "gpu" ? "shaders" : "javascript"; } },
  { label: "stage", read: function () { return api.metrics.view; } },
  { label: "renderer", read: function () { return api.env.renderer; } },
  { label: "shader path", read: function () { return api.env.shaders; } },
  { label: "device pixel ratio", read: function () { return String(api.env.dpr); } },
  { label: "js heap (chrome)", read: heapText },
  { label: "gpu timer", wide: true, read: function () { return api.env.timer; } },
  { label: "gpu", wide: true, read: function () { return api.env.gpu; } }
];

function cell(parent, label, extra) {
  var box = document.createElement("div");
  box.className = "stat" + (extra ? " " + extra : "");
  var value = document.createElement("b");
  var caption = document.createElement("span");
  caption.textContent = label;
  box.appendChild(value);
  box.appendChild(caption);
  parent.appendChild(box);
  return value;
}

export function initStats() {
  var statsEl = document.getElementById("stats");
  var envEl = document.getElementById("stats-env");
  var modesEl = document.getElementById("modes");
  var noteEl = document.getElementById("mode-note");
  if (!api || !statsEl) return;

  var modeButtons = [];

  function describeMode() {
    if (!noteEl) return;
    var honest = "no browser reports GPU load, VRAM or driver queue depth — " +
      "these are the numbers a page can actually read";
    if (!api.gpuReady) {
      noteEl.textContent = "the shader path is off: " + api.gpuTrouble +
        " · the JavaScript path is drawing · " + honest;
      return;
    }
    noteEl.textContent = (api.mode === "gpu"
      ? "fragment shaders are drawing the frame; the JavaScript path is idle"
      : "JavaScript is drawing the frame a pixel at a time; the shaders are idle") +
      " · " + honest;
  }

  if (modesEl) {
    MODES.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.setAttribute("data-mode", item.key);
      button.setAttribute("aria-pressed", String(api.mode === item.key));
      if (item.key === "gpu" && !api.gpuReady) {
        button.disabled = true;
        button.title = api.gpuTrouble;
      }
      button.addEventListener("click", function () {
        api.setMode(item.key);
        modeButtons.forEach(function (other) {
          other.setAttribute("aria-pressed", String(other.getAttribute("data-mode") === api.mode));
        });
        describeMode();
        paint();
      });
      modesEl.appendChild(button);
      modeButtons.push(button);
    });
  }

  var liveCells = LIVE.map(function (item) { return cell(statsEl, item.label); });
  var envCells = ENVCELLS.map(function (item) {
    return cell(envEl, item.label, "env" + (item.wide ? " span2" : ""));
  });

  var shown = [];
  function write(node, index, text) {
    if (shown[index] === text) return;
    shown[index] = text;
    node.textContent = text;
  }

  function paint() {
    var i;
    for (i = 0; i < LIVE.length; i++) {
      write(liveCells[i], i, LIVE[i].fmt(api.metrics[LIVE[i].key]));
    }
    for (i = 0; i < ENVCELLS.length; i++) {
      var text = ENVCELLS[i].read();
      write(envCells[i], LIVE.length + i, text);
      envCells[i].title = text;
    }
  }

  describeMode();
  paint();
  window.setInterval(paint, 250);

  // the animation only knows whether the shaders started once PixiJS has
  // handed it a renderer, which is after this panel is built
  document.addEventListener("firedemo-ready", function () {
    modeButtons.forEach(function (button) {
      var key = button.getAttribute("data-mode");
      if (key === "gpu") {
        button.disabled = !api.gpuReady;
        button.title = api.gpuReady ? "" : api.gpuTrouble;
      }
      button.setAttribute("aria-pressed", String(key === api.mode));
    });
    describeMode();
    paint();
  });
}

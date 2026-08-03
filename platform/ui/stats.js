"use strict";

// The stats readout and the switch between the drawing paths the animation
// registered. Everything shown here is measured; nothing is guessed at, and a
// number the path in use cannot produce is shown as `n/a` rather than as zero.

var HONEST = "no browser reports GPU load, VRAM or driver queue depth — " +
  "these are the numbers a page can actually read";

function fixed(places) {
  // -1 is how the runtime says a number does not exist in this mode; it is
  // never a measurement, so it is shown as such rather than as zero
  return function (v) {
    if (typeof v !== "number") return "n/a";
    return v < 0 ? "n/a" : v.toFixed(places);
  };
}
var whole = fixed(0);
var millis = fixed(2);

function formatter(name) {
  return name === "ms" ? millis : whole;
}

function heapText() {
  var memory = window.performance && window.performance.memory;
  if (!memory || !memory.usedJSHeapSize) return "n/a";
  return (memory.usedJSHeapSize / 1048576).toFixed(1) + " MB";
}

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

export function initStats(spec, api) {
  var statsEl = document.getElementById("stats");
  var envEl = document.getElementById("stats-env");
  var modesEl = document.getElementById("modes");
  var noteEl = document.getElementById("mode-note");
  if (!statsEl) return function () {};

  statsEl.textContent = "";
  if (envEl) envEl.textContent = "";
  if (modesEl) modesEl.textContent = "";

  var metrics = api.metrics;

  // ---------------- what is measured for every animation ---------------
  var live = [
    { label: "fps now", fmt: whole, read: function () { return metrics.fps; } },
    { label: "fps 1s avg", fmt: whole, read: function () { return metrics.fpsAvg; } },
    { label: "frame avg ms", fmt: millis, read: function () { return metrics.frameAvg; } },
    { label: "frame worst ms", fmt: millis, read: function () { return metrics.frameWorst; } },
    { label: "step avg ms", fmt: millis, read: function () { return metrics.stepAvg; } },
    { label: "step worst ms", fmt: millis, read: function () { return metrics.stepWorst; } },
    { label: "gpu pass ms", fmt: fixed(3), read: function () { return metrics.gpuPass; } },
    { label: "upload ms", fmt: millis, read: function () { return metrics.uploadAvg; } },
    { label: "present ms", fmt: millis, read: function () { return metrics.presentAvg; } }
  ];

  // the last step cost measured on each path, side by side, so the two can
  // still be held against each other after switching
  api.backends.forEach(function (backend) {
    if (api.backends.length < 2) return;
    live.push({
      label: backend.label.toLowerCase() + " path ms", fmt: millis,
      read: function () { return metrics.backendStep[backend.id]; }
    });
  });

  // ---------------- what the paths and the animation count -------------
  api.backends.forEach(function (backend) {
    backend.stats.forEach(function (item) {
      live.push({
        label: item.label, fmt: formatter(item.format),
        read: function () {
          var owned = metrics.backend[backend.id];
          return owned && owned[item.key] !== undefined ? owned[item.key] : -1;
        }
      });
    });
  });

  spec.stats.forEach(function (item) {
    live.push({
      label: item.label, fmt: formatter(item.format),
      read: function () {
        return metrics.custom[item.key] === undefined ? -1 : metrics.custom[item.key];
      }
    });
  });

  // ---------------- the environment ------------------------------------
  var env = [
    { label: "drawn by", read: function () { return currentBackend().label.toLowerCase(); } },
    { label: "stage", read: function () { return metrics.view; } },
    { label: "renderer", read: function () { return api.env.renderer; } },
    { label: "device pixel ratio", read: function () { return String(api.env.dpr); } },
    { label: "js heap (chrome)", read: heapText }
  ];
  api.backends.forEach(function (backend) {
    Object.keys(backend.env).forEach(function (name) {
      env.push({ label: name, wide: true, read: function () { return backend.env[name]; } });
    });
  });
  env.push({ label: "gpu", wide: true, read: function () { return api.env.gpu; } });

  function currentBackend() {
    return api.backends.filter(function (b) { return b.id === api.mode; })[0] || api.backends[0];
  }

  function describeMode() {
    if (!noteEl) return;
    var off = api.backends.filter(function (b) { return !b.ready; });
    var lead = off.map(function (b) {
      return "the " + b.label + " path is off: " + b.trouble;
    });
    lead.push(currentBackend().note);
    lead.push(HONEST);
    noteEl.textContent = lead.join(" · ");
  }

  // ---------------- the switch, only where there is a choice -----------
  var modeButtons = [];
  if (modesEl && api.backends.length > 1) {
    api.backends.forEach(function (backend) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = backend.label;
      button.setAttribute("data-mode", backend.id);
      button.setAttribute("aria-pressed", String(api.mode === backend.id));
      if (!backend.ready) {
        button.disabled = true;
        button.title = backend.trouble;
      }
      button.addEventListener("click", function () {
        api.setMode(backend.id);
        modeButtons.forEach(function (other) {
          other.setAttribute("aria-pressed",
            String(other.getAttribute("data-mode") === api.mode));
        });
        describeMode();
        paint();
      });
      modesEl.appendChild(button);
      modeButtons.push(button);
    });
  }

  var liveCells = live.map(function (item) { return cell(statsEl, item.label); });
  var envCells = env.map(function (item) {
    return cell(envEl, item.label, "env" + (item.wide ? " span2" : ""));
  });

  var shown = [];
  function write(node, index, value) {
    if (shown[index] === value) return;
    shown[index] = value;
    node.textContent = value;
  }

  function paint() {
    var i;
    for (i = 0; i < live.length; i++) write(liveCells[i], i, live[i].fmt(live[i].read()));
    for (i = 0; i < env.length; i++) {
      var value = env[i].read();
      write(envCells[i], live.length + i, value);
      envCells[i].title = value;
    }
  }

  describeMode();
  paint();
  var timer = window.setInterval(paint, 250);

  return function () {
    window.clearInterval(timer);
    statsEl.textContent = "";
    if (envEl) envEl.textContent = "";
    if (modesEl) modesEl.textContent = "";
    if (noteEl) noteEl.textContent = "";
  };
}

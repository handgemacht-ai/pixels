"use strict";

// The pipeline panel: the stages an animation declares, laid out as the graph
// they form, with a live picture of every buffer drawn on the node that
// produces it.
//
// It is opt-in twice over. An animation that declares no pipeline never sees
// this panel at all — it stays hidden and nothing here runs. An animation that
// does declare one still pays nothing until somebody opens the panel: the graph
// library is fetched on that first click and not before, and the drawing path is
// only told which stages to capture while the panel is open. Closing it hands
// everything back, and holding the clock still to pose a poster or film a run
// hands it back whether the panel noticed or not.
//
// Nothing in here draws anything the animation did not already draw. The
// painters read the drawing path's own buffers and write into canvases of their
// own; the frame on the stage is the same frame with the panel open or shut.

import { PAINT } from "./buffers.js";
import { escapeHtml } from "./highlight.js";
import { rootOf } from "./shell.js";

// ---------------------------- the library ----------------------------
//
// Three pinned files from the same CDN the page already uses for PixiJS, with
// the same Subresource Integrity hashes over the exact bytes — injected the
// first time the panel is opened, so the page as it loads is exactly as light as
// it was before this panel existed. cytoscape-dagre carries its own copy of
// dagre, so the layout costs one file rather than two.
var CDN = "https://cdn.jsdelivr.net/npm/";
var LIBS = [
  {
    url: CDN + "cytoscape@3.34.0/dist/cytoscape.min.js",
    integrity: "sha384-K+k+ywfDuvV9dwg+bwsVE0WGkrTnqFamaER+ydBgMFQTtlI0jdI9no9AjkQHwh/T"
  },
  {
    url: CDN + "cytoscape-dagre@4.0.0/dist/cytoscape-dagre.min.js",
    integrity: "sha384-ZB0G8+HSDcFhSFvwJP3rhJhh2sU/lJrfRrhqis4Gg7pP/CQ2IUzl86Gdlu3S17UF"
  },
  {
    url: CDN + "cytoscape-node-html-label@1.2.2/dist/cytoscape-node-html-label.min.js",
    integrity: "sha384-5DY1293pJOzYo9uqkLHaP8DW6S378tsX6fj8xY4o/xj8EP27cZw5p01KUozwSaLT"
  }
];

// One attempt for the life of the page, kept whether it worked or not. A failed
// fetch is a failed fetch: retrying it on every click would turn a CDN that is
// down into a page hammering it.
var fetching = null;

function script(lib) {
  return new Promise(function (resolve, reject) {
    var el = document.createElement("script");
    el.src = lib.url;
    el.integrity = lib.integrity;
    el.crossOrigin = "anonymous";
    el.addEventListener("load", function () { resolve(); });
    el.addEventListener("error", function () {
      reject(new Error("could not load " + lib.url));
    });
    document.head.appendChild(el);
  });
}

function loadGraphLibrary() {
  if (fetching) return fetching;
  // in order: the plugins register themselves against the global the first file
  // installs, so neither of them can be asked for first
  fetching = script(LIBS[0])
    .then(function () { return script(LIBS[1]); })
    .then(function () { return script(LIBS[2]); })
    .then(function () {
      window.cytoscape.use(window.cytoscapeDagre);
      return window.cytoscape;
    });
  return fetching;
}

// ----------------------------- the chrome ----------------------------

function attr(text) {
  return escapeHtml(String(text)).replace(/"/g, "&quot;");
}

function number(value) {
  if (typeof value !== "number" || !isFinite(value)) return "n/a";
  var size = Math.abs(value);
  if (size >= 100) return value.toFixed(0);
  if (size >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function ink(name, fallback) {
  var value = window.getComputedStyle(document.documentElement)
    .getPropertyValue(name).trim();
  return value || fallback;
}

function nodeHtml(stage) {
  var badge = stage.when ? '<i>' + escapeHtml(stage.when) + "</i>" : "";
  // a stage with no buffer behind it is a stage that says something instead of
  // showing something, and the two want different room
  var body = (stage.kind === "code" || stage.kind === "record")
    ? '<div class="tap-words"></div>'
    : '<div class="tap-box"><canvas class="tap-shot"></canvas></div>';
  return '<div class="tap" data-tap="' + attr(stage.id) + '" title="' + attr(stage.legend) + '">' +
    '<div class="tap-head"><b>' + escapeHtml(stage.label) + "</b>" + badge + "</div>" +
    body +
    '<div class="tap-foot"></div>' +
    "</div>";
}

// ------------------------------ the panel ----------------------------

export function initTaps(spec, api) {
  var panel = document.getElementById("taps-panel");
  var details = document.getElementById("taps");
  var host = document.getElementById("taps-graph");
  var metaEl = document.getElementById("taps-meta");
  var legendEl = document.getElementById("taps-legend");
  if (!panel || !details || !host) return function () {};

  details.open = false;
  host.textContent = "";
  if (metaEl) metaEl.textContent = "";
  if (legendEl) legendEl.textContent = "";

  // An animation that declares no pipeline gets no panel, and nothing below
  // this line ever runs for it.
  if (!spec.pipeline) {
    panel.hidden = true;
    return function () { panel.hidden = true; };
  }

  var stages = spec.pipeline.nodes;
  var links = spec.pipeline.edges;
  // bare maps rather than object literals: everything here is keyed on ids the
  // animation chose, and a stage named after something already on
  // Object.prototype would otherwise look declared when it is not
  var byId = Object.create(null);
  stages.forEach(function (stage) { byId[stage.id] = stage; });

  // every stage the animation declared, asked for in one go: the drawing path
  // decides which of them cost anything to produce
  var WANT = stages.map(function (stage) { return stage.id; });

  var gone = false;
  var building = false;
  var cy = null;
  var timer = 0;
  var pinned = null;
  var shells = Object.create(null);
  var args = Object.create(null);
  var seenTaps = null;
  var warning = "";

  // ---------------------------- the readings -------------------------

  function shellOf(id) {
    var kept = shells[id];
    if (kept && kept.root.isConnected) return kept;
    var root = host.querySelector('.tap[data-tap="' + id.replace(/"/g, '\\"') + '"]');
    if (!root) return null;
    var canvas = root.querySelector(".tap-shot");
    kept = {
      root: root,
      canvas: canvas,
      ctx: canvas ? canvas.getContext("2d") : null,
      image: null,
      words: root.querySelector(".tap-words"),
      foot: root.querySelector(".tap-foot"),
      shownFoot: null,
      shownWords: null
    };
    if (pinned === id) root.classList.add("pinned");
    shells[id] = kept;
    return kept;
  }

  function write(shell, field, node, text) {
    if (!node || shell[field] === text) return;
    shell[field] = text;
    node.textContent = text;
  }

  function absent(shell) {
    shell.root.classList.add("off");
    write(shell, "shownFoot", shell.foot, "n/a");
  }

  // the painters take one object, and it is the same object every step: a panel
  // that allocated one per stage per frame would be the most expensive thing on
  // the page it is measuring
  function argsFor(stage, entry) {
    var arg = args[stage.id];
    if (!arg) {
      arg = { data: null, x: null, y: null, z: null, colours: stage.colours, range: stage.range };
      args[stage.id] = arg;
    }
    arg.data = entry.data || null;
    arg.x = entry.x || null;
    arg.y = entry.y || null;
    arg.z = entry.z || null;
    return arg;
  }

  function scalars(record) {
    var keys = record ? Object.keys(record) : [];
    if (!keys.length) return "";
    return keys.map(function (key) { return key + " " + number(record[key]); }).join("\n");
  }

  function drawStage(stage, entry) {
    var shell = shellOf(stage.id);
    if (!shell) return;

    if (stage.kind === "code") {
      shell.root.classList.remove("off");
      write(shell, "shownWords", shell.words, stage.note);
      write(shell, "shownFoot", shell.foot, stage.source);
      return;
    }

    if (stage.kind === "record") {
      var rows = scalars(entry && entry.record);
      if (!rows) { absent(shell); return; }
      shell.root.classList.remove("off");
      write(shell, "shownWords", shell.words, rows);
      write(shell, "shownFoot", shell.foot, stage.source);
      return;
    }

    var has = entry && (stage.kind === "vector" ? !!entry.x : !!entry.data);
    if (!has || !shell.ctx) { absent(shell); return; }

    if (!shell.image || shell.canvas.width !== entry.width ||
        shell.canvas.height !== entry.height) {
      shell.canvas.width = entry.width;
      shell.canvas.height = entry.height;
      shell.image = shell.ctx.createImageData(entry.width, entry.height);
    }
    var seen = PAINT[stage.kind](argsFor(stage, entry), shell.image);
    shell.ctx.putImageData(shell.image, 0, 0);
    shell.root.classList.remove("off");
    write(shell, "shownFoot", shell.foot, seen
      ? number(seen.min) + " … " + number(seen.max)
      : entry.width + " × " + entry.height);
  }

  // A buffer the drawing path offers that no stage declares is the graph having
  // gone out of date with the animation, which is worth saying rather than
  // quietly not drawing.
  function checkStrays(taps) {
    var extra = Object.keys(taps).filter(function (id) { return !byId[id]; });
    warning = extra.length
      ? " · " + extra.length + " untapped: " + extra.join(", ")
      : "";
  }

  function tick() {
    // the animation's own cadence rather than a clock of this panel's own: a
    // preview drawn faster than the buffer behind it changes is the same picture
    // read twice, at the cost of a repaint
    window.clearTimeout(timer);
    timer = window.setTimeout(tick, Math.max(16, Math.round(1000 / api.cadence())));
    if (gone || !cy) return;
    var taps = api.taps(WANT);
    // null while a poster or a film is being posed, and the panel simply waits
    if (!taps) return;
    if (taps !== seenTaps) {
      seenTaps = taps;
      checkStrays(taps);
      describe();
    }
    for (var i = 0; i < stages.length; i++) drawStage(stages[i], taps[stages[i].id]);
  }

  // ---------------------------- the graph -----------------------------

  function layoutRun() {
    cy.layout({
      name: "dagre",
      rankDir: "LR",
      nodeSep: 14,
      rankSep: 46,
      edgeSep: 6,
      fit: true,
      padding: 14,
      animate: false
    }).run();
  }

  function pin(id) {
    pinned = id;
    cy.nodes().removeClass("pinned");
    if (id) cy.getElementById(id).addClass("pinned");
    Object.keys(shells).forEach(function (key) {
      if (shells[key].root.isConnected) {
        shells[key].root.classList.toggle("pinned", key === pinned);
      }
    });
    // the enlarged stage needs room the last layout did not leave it
    layoutRun();
    describe();
  }

  function describe() {
    if (metaEl) {
      metaEl.textContent = stages.length + " stages · " + links.length + " links · " +
        (cy ? "read " + Math.round(api.cadence()) + " times a second" : "click to open") +
        warning;
    }
    if (!legendEl) return;
    var stage = pinned ? byId[pinned] : null;
    legendEl.textContent = stage
      ? stage.label + " · " + rootOf(spec) + stage.source +
        (stage.legend ? " · " + stage.legend : "")
      : "click a stage to enlarge it and open the file it comes out of";
  }

  function build(cytoscape) {
    if (gone) return;
    host.textContent = "";
    var elements = stages.map(function (stage) {
      return { group: "nodes", data: { id: stage.id, stage: stage } };
    });

    cy = cytoscape({
      container: host,
      elements: [],
      userZoomingEnabled: false,
      boxSelectionEnabled: false,
      autoungrabify: true,
      style: [
        {
          selector: "node",
          style: {
            shape: "round-rectangle",
            width: 128,
            height: 134,
            "background-color": ink("--panel", "#121218"),
            "border-width": 1,
            "border-color": ink("--line", "#262632"),
            label: ""
          }
        },
        {
          selector: "node.pinned",
          style: {
            width: 244,
            height: 256,
            "border-color": ink("--hot", "#fec874")
          }
        },
        {
          selector: "edge",
          style: {
            width: 1.2,
            "line-color": ink("--graph-edge", "#3f3f52"),
            "target-arrow-color": ink("--graph-edge", "#3f3f52"),
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.8,
            "curve-style": "bezier"
          }
        }
      ]
    });

    // registered before a single element exists, because the label layer builds
    // its boxes off the events the elements fire as they arrive
    cy.nodeHtmlLabel([{
      query: "node",
      halign: "center",
      valign: "center",
      halignBox: "center",
      valignBox: "center",
      tpl: function (data) { return nodeHtml(data.stage); }
    }]);

    cy.add(elements);
    cy.add(links.map(function (link) {
      return { group: "edges", data: { source: link.from, target: link.to } };
    }));
    layoutRun();

    cy.on("tap", "node", function (event) {
      var id = event.target.id();
      if (!byId[id]) return;
      pin(pinned === id ? null : id);
      document.dispatchEvent(new CustomEvent("pixels:open-file", {
        detail: { animation: spec.id, path: byId[id].source }
      }));
    });

    describe();
    tick();
  }

  function fail(err) {
    if (gone) return;
    host.textContent = "";
    var note = document.createElement("p");
    note.className = "tap-trouble";
    note.textContent = "the graph library did not load · " +
      (err && err.message ? err.message : String(err));
    host.appendChild(note);
  }

  function stop() {
    window.clearTimeout(timer);
    timer = 0;
    if (!gone) api.taps(null);
  }

  function opened() {
    if (gone) return;
    if (!details.open) { stop(); describe(); return; }
    if (cy) { tick(); describe(); return; }
    if (building) return;
    building = true;
    host.textContent = "";
    var note = document.createElement("p");
    note.className = "tap-trouble";
    note.textContent = "fetching the graph library …";
    host.appendChild(note);
    loadGraphLibrary().then(build).catch(fail);
  }

  // a resize built new buffers, so the references handed out are stale and the
  // canvases are the wrong size
  function reread() {
    shells = Object.create(null);
    args = Object.create(null);
    seenTaps = null;
    if (cy && details.open) {
      cy.resize();
      cy.fit(undefined, 14);
    }
    describe();
  }

  panel.hidden = false;
  describe();
  details.addEventListener("toggle", opened);
  document.addEventListener("pixels:apply", reread);

  return function () {
    gone = true;
    window.clearTimeout(timer);
    details.removeEventListener("toggle", opened);
    document.removeEventListener("pixels:apply", reread);
    api.taps(null);
    if (cy) { cy.destroy(); cy = null; }
    shells = Object.create(null);
    args = Object.create(null);
    host.textContent = "";
    details.open = false;
    panel.hidden = true;
    if (metaEl) metaEl.textContent = "";
    if (legendEl) legendEl.textContent = "";
  };
}

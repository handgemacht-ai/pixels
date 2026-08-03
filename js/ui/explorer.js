"use strict";

// The file browser under the demo. It lists the files this site is actually
// made of and fetches them from the server, so what is on screen is what is
// being run — no copy of the source is embedded in the page.

import { escapeHtml, highlighter } from "./highlight.js";
import { renderMarkdown } from "./markdown.js";

var FILES = [
  { path: "index.html", lang: "html", sub: "panels, stage, file browser",
    meta: "the page itself, fetched from the server" },

  { path: "css/styles.css", lang: "css", sub: "the whole look",
    meta: "one stylesheet, no framework" },

  { path: "js/main.js", lang: "js", sub: "boot and the clock",
    meta: "starts PixiJS, drives both paths off one clock" },
  { path: "js/api.js", lang: "js", sub: "what the panels may touch",
    meta: "the only object the panels talk to the animation through" },
  { path: "js/params.js", lang: "js", sub: "seventeen tuned numbers",
    meta: "the defaults, and the list the control panel builds itself from" },
  { path: "js/palette.js", lang: "js", sub: "the sheet's eight colours",
    meta: "counted out of the sprite sheet; nothing else may be drawn" },
  { path: "js/curves.js", lang: "js", sub: "the arc, read off the sheet",
    meta: "size, heat, rise, tear — frame by frame off the reference sheet" },
  { path: "js/maths.js", lang: "js", sub: "hash and value noise",
    meta: "the random source both drawing paths share" },
  { path: "js/stage.js", lang: "js", sub: "resolution and cadence",
    meta: "stage size, ground line, and the length of a step" },
  { path: "js/blast.js", lang: "js", sub: "one detonation, laid out",
    meta: "lobes, hollow, puffs, grit, spikes and dust for a single blast" },
  { path: "js/metrics.js", lang: "js", sub: "what a page can measure",
    meta: "wall-clock rings and the counts the stats strip reads" },

  { path: "js/render/cpu.js", lang: "js", sub: "JavaScript, pixel by pixel",
    meta: "silhouette, chamfer distance, colour bands — all in a loop" },
  { path: "js/render/gpu.js", lang: "js", sub: "the same picture in passes",
    meta: "seven WebGL 2 programs standing in for the loop above" },
  { path: "js/render/shaders.js", lang: "js", sub: "the GLSL, as strings",
    meta: "shader source, repeating the JavaScript arithmetic exactly" },

  { path: "js/ui/controls.js", lang: "js", sub: "the seventeen knobs",
    meta: "builds itself from js/params.js so a knob cannot drift" },
  { path: "js/ui/stats.js", lang: "js", sub: "readout and mode switch",
    meta: "repaints four times a second" },
  { path: "js/ui/explorer.js", lang: "js", sub: "this file browser",
    meta: "fetches each file from the server and shows it" },
  { path: "js/ui/highlight.js", lang: "js", sub: "colouring for the viewer",
    meta: "one line at a time, no parser" },
  { path: "js/ui/markdown.js", lang: "js", sub: "the README renderer",
    meta: "headings, lists, fences and the inline bits" },
  { path: "js/ui/sheet.js", lang: "js", sub: "the sprite-sheet player",
    meta: "blits the sheet into its own canvas, nothing more" },
  { path: "js/ui/shell.js", lang: "js", sub: "palette strip and button",
    meta: "page furniture" },

  { path: "README.md", view: "readme", sub: "sourcing and licence",
    meta: "fetched and rendered here" },

  { path: "assets/reference-sheet.png", view: "sheet", sub: "50-frame explosion sheet",
    meta: "BenHickling · CC0 1.0 · opengameart.org/sites/default/files/explosion1_5.png" },
  { path: "assets/reference.jpg", view: "image", sub: "background photo",
    meta: "U.S. Air Force / Capt. Patrick Nichols · public domain" }
];

function directoryOf(path) {
  var cut = path.lastIndexOf("/");
  return cut < 0 ? "pixels/" : path.slice(0, cut + 1);
}

export function initExplorer() {
  var list = document.getElementById("filelist");
  var viewer = document.getElementById("viewer");
  var viewerMeta = document.getElementById("viewer-meta");
  var codeView = document.getElementById("code-view");
  if (!list || !viewer || !codeView) return;

  var VIEWS = {
    code: codeView,
    readme: document.getElementById("readme-view"),
    image: document.getElementById("image-view"),
    sheet: document.getElementById("sheet-view")
  };

  var buttons = {};
  var subs = {};
  var cache = {};
  var showing = null;

  function renderCode(file, text) {
    var colour = highlighter(file.lang);
    var lines = text.replace(/\s+$/, "").split("\n");
    var html = "";
    for (var i = 0; i < lines.length; i++) {
      html += '<span class="row"><span class="num">' + (i + 1) + "</span>" +
        '<span class="src">' + (colour(lines[i]) || " ") + "</span></span>";
    }
    subs[file.path].textContent = lines.length + " lines · " + file.sub;
    return html;
  }

  function show(file) {
    var wanted = file.view || "code";
    for (var key in VIEWS) {
      if (Object.prototype.hasOwnProperty.call(VIEWS, key) && VIEWS[key]) {
        VIEWS[key].hidden = key !== wanted;
      }
    }
    for (var p in buttons) {
      if (Object.prototype.hasOwnProperty.call(buttons, p)) {
        buttons[p].setAttribute("aria-selected", p === file.path ? "true" : "false");
      }
    }
    viewerMeta.textContent = file.meta;
    viewer.scrollTop = 0;
    showing = file.path;

    if (wanted === "image" || wanted === "sheet") return;
    var target = wanted === "readme" ? VIEWS.readme : codeView;

    if (cache[file.path] !== undefined) {
      target.innerHTML = cache[file.path];
      return;
    }
    target.innerHTML = '<span class="loading">reading ' + escapeHtml(file.path) + " …</span>";
    fetch(file.path, { cache: "no-cache" }).then(function (response) {
      if (!response.ok) throw new Error(response.status + " " + response.statusText);
      return response.text();
    }).then(function (text) {
      cache[file.path] = wanted === "readme"
        ? renderMarkdown(text.replace(/^\n+/, "").replace(/\s+$/, ""))
        : renderCode(file, text);
      if (showing === file.path) target.innerHTML = cache[file.path];
    }).catch(function (err) {
      var message = '<span class="loading">could not read ' + escapeHtml(file.path) +
        ": " + escapeHtml(String(err && err.message ? err.message : err)) + "</span>";
      if (showing === file.path) target.innerHTML = message;
    });
  }

  var lastDir = "";
  FILES.forEach(function (file) {
    var dir = directoryOf(file.path);
    if (dir !== lastDir) {
      var head = document.createElement("div");
      head.className = "dir";
      head.textContent = dir;
      list.appendChild(head);
      lastDir = dir;
    }

    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("data-file", file.path);
    var name = file.path.slice(directoryOf(file.path) === "pixels/" ? 0 : dir.length);
    button.innerHTML = escapeHtml(name) + '<span class="sub">' + escapeHtml(file.sub) + "</span>";
    button.addEventListener("click", function () { show(file); });
    buttons[file.path] = button;
    subs[file.path] = button.querySelector(".sub");
    list.appendChild(button);
  });

  // the sheet's own size, once the browser has it
  var sheetImg = document.getElementById("sheet-img");
  function showDimensions() {
    if (!sheetImg || !sheetImg.naturalWidth) return;
    var sub = subs["assets/reference-sheet.png"];
    if (sub) sub.textContent = sheetImg.naturalWidth + " × " + sheetImg.naturalHeight + " · 50 frames";
  }
  if (sheetImg && sheetImg.complete) showDimensions();
  if (sheetImg) sheetImg.addEventListener("load", showDimensions);

  show(FILES.filter(function (f) { return f.path === "js/render/cpu.js"; })[0] || FILES[0]);
}

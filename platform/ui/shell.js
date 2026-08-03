"use strict";

// The page furniture the animation's declaration fills in: the title, the
// button, the palette strip, the panel around the reference material, and the
// notes that quote numbers the knobs can move.
//
// Every panel here hands back a way to undo itself, because the page outlives
// the animation showing in it.

import { readBinding } from "../api.js";

function text(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value;
}

function empty(id) {
  var el = document.getElementById(id);
  if (el) el.textContent = "";
  return el;
}

function hex(colour) {
  return "#" + ("00000" + colour.toString(16)).slice(-6);
}

// The animation's own folder, as the file browser heads it.
export function rootOf(spec) {
  var path = new URL(spec.base).pathname;
  return path.replace(/^\//, "");
}

export function initShell(spec) {
  var undo = [];

  document.title = spec.title + " · pixels";
  text("title", spec.title);
  text("tagline", spec.tagline);
  text("stage-legend", spec.stage.legend);
  text("explorer-root", rootOf(spec));
  text("controls-meta", spec.knobs.length + " parameters · click to open");

  // ---------------- the button, which starts one where a click would ---
  var button = document.getElementById("detonate");
  if (button) {
    button.textContent = spec.action.verb;
    var press = function () {
      var stage = document.getElementById("stage");
      if (!stage) return;
      var box = stage.getBoundingClientRect();
      var options = {
        bubbles: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height * 0.66
      };
      var event = typeof PointerEvent === "function"
        ? new PointerEvent("pointerdown", options)
        : new MouseEvent("pointerdown", options);
      stage.dispatchEvent(event);
    };
    button.addEventListener("click", press);
    undo.push(function () { button.removeEventListener("click", press); });
  }

  // ---------------- palette strip, straight off the declaration --------
  var swatches = empty("swatches");
  var paletteNote = document.getElementById("palette-legend");
  if (paletteNote) paletteNote.textContent = spec.palette ? spec.palette.title : "";
  if (paletteNote) paletteNote.hidden = !spec.palette;
  if (swatches) swatches.hidden = !spec.palette;
  if (swatches && spec.palette) {
    swatches.title = spec.palette.title;
    Object.keys(spec.palette.colours).forEach(function (name) {
      var chip = document.createElement("span");
      chip.style.background = hex(spec.palette.colours[name]);
      chip.setAttribute("data-name", name);
      chip.title = name + " " + hex(spec.palette.colours[name]);
      swatches.appendChild(chip);
    });
  }

  // ---------------- the reference material, if any is registered -------
  var sheetPanel = document.getElementById("sheet-panel");
  var refPanel = document.getElementById("ref-panel");
  var image = document.getElementById("sheet-img");
  var meta = empty("ref-meta");
  var done = function () { undo.forEach(function (fn) { fn(); }); };

  if (!spec.reference) {
    if (sheetPanel) sheetPanel.hidden = true;
    if (refPanel) refPanel.hidden = true;
    if (image) image.removeAttribute("src");
    return done;
  }

  var reference = spec.reference;
  if (sheetPanel) sheetPanel.hidden = false;
  text("sheet-name", reference.name);
  text("sheet-legend", reference.legend);

  if (refPanel) refPanel.hidden = false;
  text("ref-name", rootOf(spec) + reference.image);
  text("ref-legend", reference.sourceLegend);

  if (meta) {
    meta.textContent = reference.credit;
    reference.links.forEach(function (link) {
      meta.appendChild(document.createTextNode(" · "));
      var anchor = document.createElement("a");
      anchor.href = link.href;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      anchor.textContent = link.label;
      meta.appendChild(anchor);
    });
  }

  if (image) {
    image.src = reference.url;
    image.alt = reference.alt;
  }

  return done;
}

// The two notes that quote a number a knob can move, so they are rewritten
// whenever one does.
export function linkShell(spec, api) {
  var live = spec.knobs.filter(function (k) { return k.applies === "live"; });
  var next = spec.knobs.filter(function (k) { return k.applies === "next"; });
  var labels = function (list) {
    return list.map(function (k) { return k.label; }).join(", ");
  };

  var note = "";
  if (live.length) note += labels(live) + " apply at once";
  if (live.length && next.length) note += " · ";
  if (next.length) note += labels(next) + " take hold on the next " + spec.action.noun;
  text("control-note", note);

  function stageMeta() {
    var gap = readBinding(spec.replay, api.params);
    text("stage-meta", spec.stage.hint +
      (gap > 0 ? " · auto-replays every " + gap.toFixed(1) + "s unless the knobs say otherwise" : ""));
  }

  stageMeta();
  document.addEventListener("pixels:apply", stageMeta);
  return function () { document.removeEventListener("pixels:apply", stageMeta); };
}

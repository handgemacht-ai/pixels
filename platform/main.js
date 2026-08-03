"use strict";

// The entry point. It builds the switcher once, then brings one animation up
// at a time: every panel is built from that animation's declaration, and every
// panel is taken down again before the next one arrives, so nothing of the one
// that has left is still on the page.

import { ANIMATIONS, pickAnimation } from "../animations/index.js";
import { startAnimation } from "./runtime.js";
import { resetMetrics } from "./metrics.js";
import { initShell, linkShell } from "./ui/shell.js";
import { initExplorer } from "./ui/explorer.js";
import { initSheet } from "./ui/sheet.js";
import { initControls } from "./ui/controls.js";
import { initStats } from "./ui/stats.js";
import { initSidebar } from "./ui/sidebar.js";
import { initFilm } from "./ui/film.js";

var stageEl = document.getElementById("stage");
var errorEl = document.getElementById("error");
var showing = null;
var teardown = [];
var swapping = false;

function fail(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function put(fn) { if (typeof fn === "function") teardown.push(fn); }

function unmount() {
  // in reverse, so the panels go before the animation they were reading
  for (var i = teardown.length - 1; i >= 0; i--) teardown[i]();
  teardown = [];
  window.pixels = null;
  resetMetrics();
  showing = null;
}

async function mount(spec) {
  if (errorEl) errorEl.hidden = true;
  showing = spec.id;
  switcher.mark(spec.id);

  put(initShell(spec));
  put(initExplorer(spec));

  var api = await startAnimation(spec, stageEl);
  put(api.dispose);
  window.pixels = api;
  // after the animation, because the reference player follows its stride
  put(initSheet(spec, api));
  put(linkShell(spec, api));
  put(initControls(spec, api));
  put(initStats(spec, api));
  put(initFilm(spec, api));
  document.dispatchEvent(new CustomEvent("pixels:ready", { detail: { animation: spec.id } }));
}

async function swap(id, remember) {
  if (swapping || id === showing) return;
  swapping = true;
  try {
    unmount();
    var spec = pickAnimation(id);
    if (remember) {
      var url = spec === ANIMATIONS[0]
        ? window.location.pathname
        : window.location.pathname + "?animation=" + encodeURIComponent(spec.id);
      window.history.pushState({ animation: spec.id }, "", url);
    }
    await mount(spec);
  } catch (err) {
    fail("The animation could not start: " + (err && err.message ? err.message : err));
  } finally {
    swapping = false;
  }
}

var switcher = initSidebar(ANIMATIONS, function (id) { swap(id, true); });

window.addEventListener("popstate", function () {
  swap(pickAnimation(new URLSearchParams(window.location.search).get("animation")).id, false);
});

mount(pickAnimation(new URLSearchParams(window.location.search).get("animation")))
  .catch(function (err) {
    fail("The animation could not start: " + (err && err.message ? err.message : err));
  });

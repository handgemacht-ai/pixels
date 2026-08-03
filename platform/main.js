"use strict";

// The entry point. It picks one animation out of the registry, builds the page
// from what that animation declares, and starts it.

import { pickAnimation } from "../animations/index.js";
import { startAnimation } from "./runtime.js";
import { initShell, linkShell } from "./ui/shell.js";
import { initExplorer } from "./ui/explorer.js";
import { initSheet } from "./ui/sheet.js";
import { initControls } from "./ui/controls.js";
import { initStats } from "./ui/stats.js";

var spec = pickAnimation(new URLSearchParams(window.location.search).get("animation"));

function fail(message) {
  var errorEl = document.getElementById("error");
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

// Everything that reads the declaration alone can be built at once; the panels
// that talk to the running animation wait for it to start.
initShell(spec);
initExplorer(spec);
initSheet(spec);

startAnimation(spec, document.getElementById("stage")).then(function (api) {
  window.pixels = api;
  linkShell(spec, api);
  initControls(spec, api);
  initStats(spec, api);
  document.dispatchEvent(new CustomEvent("pixels:ready", { detail: { animation: spec.id } }));
}).catch(function (err) {
  fail("The animation could not start: " + (err && err.message ? err.message : err));
});

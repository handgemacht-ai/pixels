"use strict";

// The GIF button. It films the animation that is on screen — current knobs,
// current drawing path, current cadence — and saves the result, counting the
// steps on the button's own face while it works.

import { exportGif, saveBlob, planFilm, scaleFor, MAX_FRAMES } from "../export.js";

export function initFilm(spec, api) {
  var button = document.getElementById("film-button");
  if (!button) return function () {};

  if (!spec.poster.film) {
    button.hidden = true;
    return function () { button.hidden = true; };
  }

  var gone = false;
  var busy = false;
  var settle = 0;

  function idle() {
    var plan = planFilm(api);
    var scale = scaleFor(Math.round(api.metrics.view.split(" x ")[0]) || 160);
    button.textContent = "GIF";
    button.disabled = false;
    button.title = "film this " + spec.action.noun + " as it is now · " +
      plan.steps + " frames at " + Math.round(api.cadence()) + " a second, " +
      scale + "× size" +
      (plan.capped ? " · capped at " + MAX_FRAMES + " of the " + plan.wanted + " steps" : "");
  }

  function say(words, hold) {
    button.textContent = words;
    window.clearTimeout(settle);
    settle = window.setTimeout(function () { if (!gone && !busy) idle(); }, hold);
  }

  async function run() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    window.clearTimeout(settle);
    button.textContent = "0/" + planFilm(api).steps;
    try {
      var made = await exportGif(spec, api, function (done, total) {
        if (!gone) button.textContent = done + "/" + total;
      });
      if (gone) return;
      saveBlob(made.blob, made.name);
      busy = false;
      say(made.capped ? "capped" : "saved", 2200);
      if (made.capped) {
        button.title = "the film was cut at " + MAX_FRAMES + " frames · " +
          spec.action.noun + " length asks for " + made.wanted;
      }
    } catch (err) {
      busy = false;
      if (gone) return;
      say("failed", 2600);
      button.title = String(err && err.message ? err.message : err);
      throw err;
    } finally {
      busy = false;
      if (!gone) button.disabled = false;
    }
  }

  button.hidden = false;
  idle();
  button.addEventListener("click", run);
  document.addEventListener("pixels:apply", idle);

  return function () {
    gone = true;
    window.clearTimeout(settle);
    button.removeEventListener("click", run);
    document.removeEventListener("pixels:apply", idle);
    button.hidden = true;
    button.disabled = false;
  };
}

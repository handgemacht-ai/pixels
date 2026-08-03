"use strict";

// The two small pieces of page furniture: the palette strip under the sheet
// playback, and the Detonate button in the top bar.

import { C } from "../palette.js";

export function initShell() {
  // ---------------- palette strip, straight off js/palette.js ----------
  var swatches = document.getElementById("swatches");
  if (swatches) {
    Object.keys(C).forEach(function (name) {
      var hex = ("00000" + C[name].toString(16)).slice(-6);
      var chip = document.createElement("span");
      chip.style.background = "#" + hex;
      chip.setAttribute("data-name", name);
      chip.title = name + " #" + hex;
      swatches.appendChild(chip);
    });
  }

  // ---------------- the button, which detonates where a click would ----
  var button = document.getElementById("detonate");
  if (!button) return;
  button.addEventListener("click", function () {
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
  });
}

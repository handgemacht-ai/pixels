"use strict";

// The knobs. They talk to the animation through the one small object it hands
// out, and nothing here draws a pixel of it.

import { api } from "../api.js";

// A range input works in whole numbers and the value is divided down after,
// so a knob with a fractional step lands back on its tuned default exactly
// rather than a hair either side of it.
function scaleOf(control) {
  return control.step < 1 ? Math.round(1 / control.step) : 1;
}

function decimalsOf(control) {
  var text = String(control.step);
  var dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

function readout(control) {
  var value = api.params[control.key];
  if (control.type === "toggle") return value ? "on" : "off";
  return value.toFixed(decimalsOf(control)) + (control.unit ? " " + control.unit : "");
}

export function initControls() {
  var groupsEl = document.getElementById("control-groups");
  if (!api || !groupsEl) return;

  var order = [];
  var grouped = {};
  api.controls.forEach(function (control) {
    if (!grouped[control.group]) { grouped[control.group] = []; order.push(control.group); }
    grouped[control.group].push(control);
  });

  var widgets = [];

  order.forEach(function (name) {
    var box = document.createElement("div");
    box.className = "cgroup";
    var heading = document.createElement("h4");
    heading.textContent = name;
    box.appendChild(heading);

    grouped[name].forEach(function (control) {
      var row = document.createElement("div");
      row.className = "krow";
      var id = "knob-" + control.key;

      var label = document.createElement("label");
      label.setAttribute("for", id);
      label.textContent = control.label;

      var input = document.createElement("input");
      input.id = id;

      var value = document.createElement("output");
      value.setAttribute("for", id);

      if (control.type === "toggle") {
        input.type = "checkbox";
        input.checked = api.params[control.key];
      } else {
        var scale = scaleOf(control);
        input.type = "range";
        input.min = String(Math.round(control.min * scale));
        input.max = String(Math.round(control.max * scale));
        input.step = String(control.step < 1 ? 1 : control.step);
        input.value = String(Math.round(api.params[control.key] * scale));
      }

      function pushValue() {
        if (control.type === "toggle") {
          api.params[control.key] = input.checked;
        } else {
          var scale2 = scaleOf(control);
          var raw = Number(input.value);
          api.params[control.key] = scale2 === 1 ? raw : raw / scale2;
        }
        value.textContent = readout(control);
        api.apply();
      }

      function pull() {
        var current = api.params[control.key];
        if (control.type === "toggle") input.checked = current;
        else input.value = String(Math.round(current * scaleOf(control)));
        value.textContent = readout(control);
      }

      input.addEventListener("input", pushValue);
      input.addEventListener("change", pushValue);
      value.textContent = readout(control);
      widgets.push(pull);

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(value);
      box.appendChild(row);
    });

    groupsEl.appendChild(box);
  });

  document.getElementById("reset-params").addEventListener("click", function () {
    for (var key in api.defaults) {
      if (Object.prototype.hasOwnProperty.call(api.defaults, key)) {
        api.params[key] = api.defaults[key];
      }
    }
    widgets.forEach(function (pull) { pull(); });
    api.apply();
  });
}

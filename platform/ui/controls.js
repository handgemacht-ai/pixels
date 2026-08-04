"use strict";

// The knobs. Every row here comes from the animation's own declaration, so a
// control cannot drift away from the number it moves, and nothing in this file
// knows what any of them do.

// A range input works in whole numbers and the value is divided down after,
// so a knob with a fractional step lands back on its tuned default exactly
// rather than a hair either side of it.
function scaleOf(knob) {
  return knob.step < 1 ? Math.round(1 / knob.step) : 1;
}

function decimalsOf(knob) {
  var written = String(knob.step);
  var dot = written.indexOf(".");
  return dot < 0 ? 0 : written.length - dot - 1;
}

export function initControls(spec, api) {
  var groupsEl = document.getElementById("control-groups");
  if (!groupsEl) return function () {};
  groupsEl.textContent = "";

  function readout(knob) {
    var value = api.params[knob.key];
    if (knob.type === "toggle") return value ? "on" : "off";
    return value.toFixed(decimalsOf(knob)) + (knob.unit ? " " + knob.unit : "");
  }

  function optionOf(knob, value) {
    return knob.options.filter(function (o) { return o.value === value; })[0] || knob.options[0];
  }

  var order = [];
  var grouped = {};
  spec.knobs.forEach(function (knob) {
    if (!grouped[knob.group]) { grouped[knob.group] = []; order.push(knob.group); }
    grouped[knob.group].push(knob);
  });

  var widgets = [];

  order.forEach(function (name) {
    var box = document.createElement("div");
    box.className = "cgroup";
    var heading = document.createElement("h4");
    heading.textContent = name;
    box.appendChild(heading);

    grouped[name].forEach(function (knob) {
      var row = document.createElement("div");
      row.className = "krow";
      var id = "knob-" + knob.key;

      var label = document.createElement("label");
      label.setAttribute("for", id);
      label.textContent = knob.label;
      label.title = knob.applies === "next"
        ? "takes hold on the next " + spec.action.noun
        : "applies at once";

      var input = document.createElement(knob.type === "choice" ? "select" : "input");
      input.id = id;

      // a choice already says which setting it is on, so it takes the reading's
      // column as well rather than repeating itself in it
      var value = knob.type === "choice" ? null : document.createElement("output");
      if (value) value.setAttribute("for", id);

      if (knob.type === "choice") {
        knob.options.forEach(function (option) {
          var item = document.createElement("option");
          item.value = String(option.value);
          item.textContent = option.label;
          input.appendChild(item);
        });
        input.value = String(optionOf(knob, api.params[knob.key]).value);
      } else if (knob.type === "toggle") {
        input.type = "checkbox";
        input.checked = api.params[knob.key];
      } else {
        var scale = scaleOf(knob);
        input.type = "range";
        input.min = String(Math.round(knob.min * scale));
        input.max = String(Math.round(knob.max * scale));
        input.step = String(knob.step < 1 ? 1 : knob.step);
        input.value = String(Math.round(api.params[knob.key] * scale));
      }

      function pushValue() {
        if (knob.type === "choice") {
          api.params[knob.key] = Number(input.value);
        } else if (knob.type === "toggle") {
          api.params[knob.key] = input.checked;
        } else {
          var scale2 = scaleOf(knob);
          var raw = Number(input.value);
          api.params[knob.key] = scale2 === 1 ? raw : raw / scale2;
        }
        if (value) value.textContent = readout(knob);
        api.apply();
      }

      function pull() {
        var current = api.params[knob.key];
        if (knob.type === "choice") input.value = String(optionOf(knob, current).value);
        else if (knob.type === "toggle") input.checked = current;
        else input.value = String(Math.round(current * scaleOf(knob)));
        if (value) value.textContent = readout(knob);
      }

      input.addEventListener("input", pushValue);
      input.addEventListener("change", pushValue);
      if (value) value.textContent = readout(knob);
      widgets.push(pull);

      row.appendChild(label);
      row.appendChild(input);
      if (value) row.appendChild(value);
      box.appendChild(row);
    });

    groupsEl.appendChild(box);
  });

  var reset = document.getElementById("reset-params");
  function putBack() {
    api.reset();
    widgets.forEach(function (pull) { pull(); });
  }
  if (reset) reset.addEventListener("click", putBack);

  return function () {
    if (reset) reset.removeEventListener("click", putBack);
    groupsEl.textContent = "";
  };
}

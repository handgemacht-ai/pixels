"use strict";

// The live values of an animation's knobs. Built once from the declarations,
// so a knob cannot exist without a default and a default cannot exist without
// a knob.

export function createParams(knobs) {
  var values = {};
  var defaults = {};
  knobs.forEach(function (k) {
    values[k.key] = k.default;
    defaults[k.key] = k.default;
  });
  return {
    values: values,
    defaults: defaults,
    reset: function () {
      knobs.forEach(function (k) { values[k.key] = k.default; });
    }
  };
}

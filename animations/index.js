"use strict";

// The registry. Every animation the site can show is imported here once; the
// switcher lists them in this order, `?animation=` picks one by id, and
// without one the first is used.

import fireExplosion from "./fire-explosion/index.js";
import dogWalk from "./dog-walk/index.js";
import highwayNight from "./highway-night/index.js";

export var ANIMATIONS = [fireExplosion, dogWalk, highwayNight];

export function pickAnimation(id) {
  for (var i = 0; i < ANIMATIONS.length; i++) {
    if (ANIMATIONS[i].id === id) return ANIMATIONS[i];
  }
  return ANIMATIONS[0];
}

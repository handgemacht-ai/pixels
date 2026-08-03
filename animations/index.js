"use strict";

// The registry. Every animation the site can show is imported here once; the
// platform picks one by id from `?animation=` and falls back to the first.

import fireExplosion from "./fire-explosion/index.js";

export var ANIMATIONS = [fireExplosion];

export function pickAnimation(id) {
  for (var i = 0; i < ANIMATIONS.length; i++) {
    if (ANIMATIONS[i].id === id) return ANIMATIONS[i];
  }
  return ANIMATIONS[0];
}

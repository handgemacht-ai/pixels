"use strict";

// The registry. Every entry the site can show is imported here once; the
// switcher lists them in this order, `?animation=` picks one by id, and
// without one the first is used.
//
// A folder is not an entry. `highway-night` registers six of them — the same
// road assembled twice, once seen down its length and once square from the
// side, and four stages that take one part of the elevation out and put it on
// its own — because everything the platform builds a page from is keyed on an
// entry's id rather than on where its files live. The two assemblies come
// first, the shot down the road ahead of the elevation it was drawn from; the
// solos follow, in the order the picture is built up.

import fireExplosion from "./fire-explosion/index.js";
import dogWalk from "./dog-walk/index.js";
import highwayNight from "./highway-night/index.js";
import highwaySide from "./highway-night/side.js";
import highwayCar from "./highway-night/solo-car.js";
import highwayLamp from "./highway-night/solo-lamp.js";
import highwayTraffic from "./highway-night/solo-traffic.js";
import highwayCity from "./highway-night/solo-city.js";
import diorama from "./diorama/index.js";

export var ANIMATIONS = [
  fireExplosion, dogWalk, highwayNight, highwaySide,
  highwayCar, highwayLamp, highwayTraffic, highwayCity,
  diorama
];

export function pickAnimation(id) {
  for (var i = 0; i < ANIMATIONS.length; i++) {
    if (ANIMATIONS[i].id === id) return ANIMATIONS[i];
  }
  return ANIMATIONS[0];
}

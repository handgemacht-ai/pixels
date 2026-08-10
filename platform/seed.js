"use strict";

// The seeded random source a run draws on when it has to come out the same
// twice: a run being filmed, and a run being walked a step at a time. It is the
// generator the command-line tools install over Math.random before they open
// the page, written out here so the page can install it for itself.

// One seed rather than one per caller, because a film of a run and a walk of it
// are meant to be the same run: a step walked to by hand is the frame the film
// holds at that step, and it would not be if the two counted from different
// places.
export var FILM_SEED = 0x5f3a91c7;

export function seededRandom(seed) {
  var state = seed >>> 0;
  return function () {
    state = (state + 0x6D2B79F5) >>> 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

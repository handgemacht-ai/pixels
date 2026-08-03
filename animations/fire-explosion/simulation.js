"use strict";

import { P, VIEW_W, GROUND } from "./state.js";
import { rand, randInt } from "./maths.js";
import { makeBlast } from "./blast.js";

// The blasts that are alive, and the camera shake. This is the whole of what
// the platform steps: it knows nothing about lobes or smoke, only that there
// is something to detonate, something to advance, and an offset to draw at.
export function createSimulation() {
  var blasts = [];
  var shake = 0, shakeX = 0, shakeY = 0;
  var counts = { blasts: 0, lobes: 0, particles: 0 };
  var spot = { x: 0, y: 0 };

  function fire(x, y) {
    blasts.push(makeBlast(x, y));
    shake = P.shake;
  }

  return {
    // both drawing paths read this list; it is never replaced, only emptied
    blasts: blasts,

    offset: function () {
      spot.x = shakeX;
      spot.y = shakeY;
      return spot;
    },

    stats: function () { return counts; },

    // Where the platform says, or — left to itself, on auto-replay — somewhere
    // around the middle of the ground.
    detonate: function (at) {
      if (at) fire(at.x, at.y);
      else fire(VIEW_W * rand(0.4, 0.6), GROUND);
    },

    // A clean start: nothing left burning, one blast dead centre — or
    // wherever the platform asks for one.
    reset: function (at) {
      blasts.length = 0;
      if (at) fire(at.x, at.y);
      else fire(VIEW_W * 0.5, GROUND);
    },

    advance: function () {
      var lobes = 0, particles = 0, i, b;
      for (i = blasts.length - 1; i >= 0; i--) {
        b = blasts[i];
        lobes += b.lumps.length;
        particles += b.specks.length + b.puffs.length + b.dust.length + b.rays.length;
        b.step += 1;
        if (b.step > b.life) blasts.splice(i, 1);
      }
      counts.blasts = blasts.length;
      counts.lobes = lobes;
      counts.particles = particles;

      // the shake moves in whole pixels, never half of one, and it is drawn
      // the same either way: the picture is made unshaken and then laid down
      // shifted
      if (shake > 0) {
        shakeX = randInt(-shake, shake);
        shakeY = randInt(-shake, shake);
        shake -= 1;
      } else {
        shakeX = 0;
        shakeY = 0;
      }
    }
  };
}

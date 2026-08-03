"use strict";

import { P } from "./params.js";
import { VIEW_W, VIEW_H, GROUND } from "./stage.js";
import { rand, randInt, clamp } from "./maths.js";

// ---------------------------- a detonation ---------------------------

export function makeBlast(ox, oy) {
  // 35 pixels at the tuned stage size, scaled with the stage so a bigger
  // buffer shows the same explosion rather than a smaller one.
  var Rmax = Math.max(6, 35 * (VIEW_H / 100) * P.size);
  var b = {
    x: clamp(Math.round(ox), Math.min(Rmax, VIEW_W / 2), Math.max(VIEW_W - Rmax, VIEW_W / 2)),
    base: clamp(Math.round(oy), GROUND - 4, GROUND),
    step: 0,
    // a blast keeps the length it was born with, and stretches the tuned
    // fifty-step arc onto it
    life: P.life,
    warp: 50 / P.life,
    Rmax: Rmax,
    seed: randInt(1, 9999),
    lumps: [],
    holes: [],
    puffs: [],
    specks: [],
    rays: [],
    dust: []
  };

  var k, a, q;

  // lumps ride on the shoulder of the body, so the outline billows instead of
  // sitting on a circle
  for (k = 0; k < P.lumps; k++) {
    a = k * 2.39996323 + rand(-0.6, 0.6);
    q = rand(0.25, 0.62);
    b.lumps.push({
      ux: Math.cos(a) * q,
      uy: Math.sin(a) * q * 0.86 - 0.08,
      r: 0.2 + rand(0, 0.15),
      drift: rand(0.004, 0.018),
      lift: rand(0, 0.008)
    });
  }

  // the shadowed hollow the sheet keeps under its rolling mass
  b.holes.push({
    ux: rand(-0.3, 0.3),
    uy: rand(0.12, 0.28),
    r: rand(0.14, 0.19),
    wide: 1.12,
    high: 0.78,
    born: 11 + randInt(0, 2),
    grow: rand(0.004, 0.008),
    cap: 0.3
  });

  // the smoke that is left when the flame goes out
  for (k = 0; k < P.smokePuffs; k++) {
    a = k * 2.39996323 + rand(-0.4, 0.4);
    q = 0.15 + 0.75 * (k / Math.max(1, P.smokePuffs - 1));
    b.puffs.push({
      ux: Math.cos(a) * q,
      uy: Math.sin(a) * q * 0.8 - 0.1,
      r: rand(0.3, 0.55),
      born: 17 + k + randInt(0, 2),
      rise: rand(0.1, 0.45),
      grow: rand(0.006, 0.014)
    });
  }

  for (k = 0; k < 26; k++) {
    a = rand(-Math.PI * 0.98, Math.PI * 0.02);
    var speed = rand(0.6, 2.1);
    b.specks.push({
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      grav: rand(0.05, 0.13),
      born: randInt(17, 26),
      life: randInt(6, 16),
      wide: Math.random() < 0.55,
      dark: Math.random() < 0.4
    });
  }

  for (k = 0; k < P.spikes; k++) {
    b.rays.push({
      a: -Math.PI * 0.5 + rand(-1.4, 1.4),
      len: rand(0.34, 0.6),
      from: randInt(2, 4),
      until: randInt(5, 7)
    });
  }

  for (k = 0; k < 10; k++) {
    b.dust.push({
      side: k % 2 ? 1 : -1,
      d0: rand(0.4, 0.9),
      speed: rand(0.5, 1.5),
      born: randInt(2, 8),
      len: randInt(1, 3)
    });
  }

  return b;
}

// A blast is built inside its own rectangle: both drawing paths are pointed
// at that rectangle alone, so the rest of the stage costs nothing.
export function bounds(b) {
  var w = b.Rmax * 1.55, h = b.Rmax * 2.1;
  return {
    x0: Math.max(1, Math.floor(b.x - w)),
    x1: Math.min(VIEW_W - 2, Math.ceil(b.x + w)),
    y0: Math.max(1, Math.floor(b.base - h)),
    y1: Math.min(VIEW_H - 2, Math.ceil(b.base + 2))
  };
}

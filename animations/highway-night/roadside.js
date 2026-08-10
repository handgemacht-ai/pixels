"use strict";

// What stands along a motorway besides the lamps: the sign gantries that step
// over it every other spacing, and the delineator posts that run down the near
// shoulder between them.
//
// Both are here for the same reason. A shot down an empty carriageway has one
// rhythm in it — the lamps — and one rhythm read against nothing else is a
// pattern rather than a road. A gantry every second spacing beats at half that
// rate and puts something across the top of the frame where the sky otherwise
// runs unbroken to the towers; the posts beat at twice it and put a line of
// small red catches down the shoulder, which is the thing a driver actually
// sees most of on a motorway at night and the one this picture was missing.
//
// Neither is hashed. Every gantry is the same gantry and every post the same
// post, so there is nothing to vary per cell and nothing that has to be taken
// modulo the loop: the trains close at the seam because their spacings divide
// the distance the camera covers in a lap — two gantries to a loop and eight
// posts — and that is the whole of the argument.

import { S } from "./state.js";
import { POLE } from "./palette.js";
import { clamp } from "./maths.js";
import {
  dOf, ppm, xOf, rowOf, latticeZ, latticeCountZ, spacingMetres
} from "./camera.js";
import { U } from "./carriageway.js";

// How far down the road either train is drawn, and how near. The same limits
// the masts use, for the same reasons: past two hundred and fifty metres a
// gantry is a two-pixel scratch on the horizon and the posts are under a row
// apart, and nearer than four metres everything has swung off the side anyway.
var DRAWN_METRES = 250;
var NEAR_METRES = 4;

// A gantry every second lamp spacing. Sixty-six and a half metres is what a
// motorway actually puts between two sign bridges, and at the declared settings
// it is exactly two to a lap.
var GANTRY_EVERY = 2;

// How high the beam runs over the road. Five and a half metres is a lorry and
// a half, which is what the clearance under one has to be.
var GANTRY_H = 5.5;

// The marker lamps on the beam, in metres off the axis. One over each line the
// gantry steps across — the oncoming carriageway's lane divider, the median,
// and the hero's own divider — which is why there are three of them and why
// they are where they are rather than spaced along the beam for the look.
var MARKERS = [U.farMid, -3.6, U.heroMid];

// A delineator post every half spacing, on the near shoulder just outside the
// edge line. Sixteen and a half metres is close enough that the near ones read
// as a train rather than as three separate objects.
var POST_EVERY = 0.5;
var POST_U = 6.6;
var POST_H = 1.0;

// How tall a post has to come out before it is worth a red pixel on top. Under
// three rows the post is the reflector — putting the tail colour on a two-pixel
// post leaves one pixel of steel under one pixel of red, which at this distance
// reads as a red post and not as a post with a catch on it.
var POST_LIT = 2;

// Every gantry in shot, far end first, so drawing them in order draws them back
// to front like everything else standing on this road.
export function gantries(step) {
  var spacing = spacingMetres() * GANTRY_EVERY;
  var count = latticeCountZ(spacing, DRAWN_METRES);
  var list = [];
  var j, z, d, m, i, marks;
  for (j = count - 1; j >= 0; j--) {
    z = latticeZ(j, spacing, step);
    if (z < NEAR_METRES || z > DRAWN_METRES) continue;
    d = dOf(z);
    if (d < 0.6) continue;
    m = ppm(d);
    marks = [];
    for (i = 0; i < MARKERS.length; i++) marks.push(Math.round(xOf(MARKERS[i], d)));
    list.push({
      z: z,
      d: d,
      baseY: rowOf(z),
      beamY: rowOf(z) - GANTRY_H * m,
      leftX: xOf(U.leftMast, d),
      rightX: xOf(U.rightMast, d),
      // stouter than a lamp mast, because it is: a sign bridge carries a
      // hoarding across four lanes and a cobra head carries a bulb
      wide: clamp(Math.round(0.45 * m), 1, 4),
      thick: clamp(Math.round(0.5 * m), 1, 4),
      marks: marks
    });
  }
  return list;
}

// Three rectangles again: an upright on each shoulder, on the same two lines
// the masts stand on, and the beam across the top of them.
export function paintGantry(slab, g) {
  slab(POLE, g.leftX, g.beamY, g.wide, g.baseY - g.beamY + 1);
  slab(POLE, g.rightX, g.beamY, g.wide, g.baseY - g.beamY + 1);
  slab(POLE, g.leftX, g.beamY, g.rightX - g.leftX + g.wide, g.thick);
}

// Every delineator post in shot, far end first.
export function posts(step) {
  var spacing = spacingMetres() * POST_EVERY;
  var count = latticeCountZ(spacing, DRAWN_METRES);
  var unit = Math.max(1, Math.round(S));
  var list = [];
  var j, z, d, m, h;
  for (j = count - 1; j >= 0; j--) {
    z = latticeZ(j, spacing, step);
    if (z < NEAR_METRES || z > DRAWN_METRES) continue;
    d = dOf(z);
    if (d < 0.6) continue;
    m = ppm(d);
    h = Math.max(1, Math.round(POST_H * m));
    list.push({
      x: Math.round(xOf(POST_U, d)),
      y: Math.round(rowOf(z)) - h,
      w: unit,
      h: h,
      lit: h > POST_LIT
    });
  }
  return list;
}

export function paintPost(slab, p) {
  slab(POLE, p.x, p.y, p.w, p.h);
}

"use strict";

// The car the camera is following, seen from behind.
//
// In the elevation the hero car never goes anywhere, because the road is
// dragged past it. Here it never goes anywhere for a stronger reason: it is at
// a fixed distance ahead of the camera, and a fixed distance projects to a
// fixed rectangle. Nothing in this file reads the step. The shell is the same
// nineteen pixels by eighteen on step 0 and on step 47, and the checks that
// film the loop ask for exactly that.
//
// The elevation's car had a surge — it pulled forward when the near
// carriageway was struck, which was a change of speed rather than a bump, and
// it was the right answer there. It has none here, and it cannot have one. A
// car ahead of the camera that surges forward gets smaller, and a shell that
// changes size is a shell that changes shape, because at this scale a tenth of
// a metre is a pixel appearing on one side of it and not the other. So a
// strike flashes the brake lamps and pushes the red further down the road, and
// the body does not move at all. The level guarantee is absolute.
//
// The shell is measured in metres and projected, not laid out in pixels: two
// metres of car at twelve metres is nineteen pixels at the declared camera and
// something else at every other setting of the two camera knobs, and it has to
// stay a car through all of them.

import { S, P, HORIZON } from "./state.js";
import { C, CAR, GLASS, WHEEL, SHADOW } from "./palette.js";
import { clamp } from "./maths.js";
import { VP_X, dOf, ppm } from "./camera.js";

// The car itself. Wider than it is tall would be a saloon, and at nineteen
// pixels across a saloon's rear reads as a letterbox with lights in it — so
// this is the tall end of the range, a hatchback, which is the shape that
// survives being nineteen pixels wide.
var CAR_W = 1.8;
var CAR_H = 1.9;

// Which lane it is in: the camera's own. The corridor puts the near lane
// between −1.8 and +1.8 metres, so a car centred on the camera axis is a car
// centred in its lane, and the vanishing point sits on the middle of its roof.
var LANE_U = 0;

// The shell, as fractions of the box, so that the same car comes out of every
// camera setting rather than a well-proportioned one at the default and a
// smear everywhere else.
var CABIN_IN = 0.16;    // how far the cabin is inset from the flanks
var CABIN_H = 0.28;     // how much of the height the cabin takes
var GLASS_IN = 0.08;    // and the glass inside the cabin
var LAMP_ROW = 0.62;    // where the tail lamp clusters sit down the shell
var LAMP_IN = 0.16;
var LAMP_W = 0.13;
var LAMP_H = 0.11;

// The pool of red is thrown from a metre or so behind the tail, not from the
// lamps themselves: what is being lit is the road between the car and the eye,
// and starting the source inside the bodywork only lights the bodywork.
var POOL_BACK = 1;

export function chaseDistance() { return clamp(P.chaseDistance, 4, 40); }

// The rectangle, worked out once. Every number in it is a whole pixel before
// anything is drawn, because a shell whose edges land on halves would gain and
// lose a column as the knobs move and there would be no telling a rounding
// wobble from a real one.
export function heroBox() {
  var z = chaseDistance();
  var d = dOf(z);
  var m = ppm(d);
  var contact = Math.round(HORIZON + d);
  var half = Math.round(CAR_W * m / 2);
  var h = Math.max(4, Math.round(CAR_H * m));
  var w = 2 * half + 1;
  var cabH = clamp(Math.round(CABIN_H * h), 2, h - 2);
  return {
    z: z,
    d: d,
    m: m,
    contactY: contact,
    x0: Math.round(VP_X + LANE_U * m) - half,
    y0: contact - h,
    w: w,
    h: h,
    cabH: cabH,
    cabIn: clamp(Math.round(CABIN_IN * w), 1, Math.floor((w - 3) / 2)),
    rim: Math.max(1, Math.round(S))
  };
}

// Where the red comes from, in metres down the road.
export function brakeZ(box) { return Math.max(1, box.z - POOL_BACK); }

// The two tail lamp clusters, in pixels.
export function tailLamps(box) {
  var w = clamp(Math.round(LAMP_W * box.w), 1, 4);
  var inset = clamp(Math.round(LAMP_IN * box.w), 1, 6);
  var y = box.y0 + Math.round(LAMP_ROW * box.h);
  return [
    { x: box.x0 + inset, y: y, w: w, h: clamp(Math.round(LAMP_H * box.h), 1, 3) },
    { x: box.x0 + box.w - inset - w, y: y, w: w, h: clamp(Math.round(LAMP_H * box.h), 1, 3) }
  ];
}

// Two rectangles for the shell and one for the cabin, each laid on a dark one
// a pixel bigger. The rim is not detail: a dark car standing on a road that is
// bright with its own tail lamps has no edge at all without it, and an edge is
// the only thing that says this is a solid object and not a hole in the
// asphalt.
export function paintHero(slab, box) {
  var r = box.rim;
  var cabX = box.x0 + box.cabIn;
  var cabW = box.w - 2 * box.cabIn;
  var bodyY = box.y0 + box.cabH;
  var bodyH = box.h - box.cabH;
  var glassIn = clamp(Math.round(GLASS_IN * box.w), 1, Math.floor((cabW - 3) / 2));
  var glassH = box.cabH - 2;

  // what the car takes away from the road it stands on. SHADOW is the same
  // asphalt with the top of its ramp out of reach, so it stays behind the road
  // however bright the road under it gets — which is what keeps the car on the
  // carriageway when its own red is at its brightest.
  slab(SHADOW, box.x0 - r, box.contactY, box.w + 2 * r,
    Math.max(1, Math.round(0.22 * box.m)));

  slab(WHEEL, cabX - r, box.y0 - r, cabW + 2 * r, box.cabH + 2 * r);
  slab(WHEEL, box.x0 - r, bodyY - r, box.w + 2 * r, bodyH + 2 * r);
  slab(CAR, cabX, box.y0, cabW, box.cabH);
  slab(CAR, box.x0, bodyY, box.w, bodyH);
  if (glassH >= 1) {
    slab(GLASS, cabX + glassIn, box.y0 + 1, cabW - 2 * glassIn, glassH);
  }
}

// What the shell is made of, so that the glare around its own lamps can be
// told to stay off it.
var BODYWORK = [];
BODYWORK[CAR] = 1;
BODYWORK[GLASS] = 1;
BODYWORK[WHEEL] = 1;

// The glare the tail lamps put in the air around themselves. Small and red:
// what makes the back of a car at night is the red on the road, not a halo.
//
// And it lands on the air and the road, never on the car. A bloom is a circle
// around the lamp and the lamp is bolted to the shell, so left to itself most
// of the circle falls on paint two pixels away and climbs it to the top of the
// car ramp, which is white — two white patches with a red centre each, a
// hand's breadth apart, at the height of a face. The road behind the car is
// where this light is supposed to go and the pool is already taking it there;
// what is left for the bloom is the air around the silhouette, which is what
// makes the edge of a dark car glow rather than the middle of it.
export function tailBlooms(box, flash) {
  var lamps = tailLamps(box);
  var span = clamp(0.6 * box.m, 1.2 * S, 4 * S);
  var out = [];
  var i, l;
  for (i = 0; i < lamps.length; i++) {
    l = lamps[i];
    out.push({
      x: l.x + l.w / 2,
      y: l.y + l.h / 2,
      span: span,
      gain: 0.28 * (1 + 1.6 * flash),
      red: true,
      skip: BODYWORK
    });
  }
  return out;
}

// The lamps themselves, which are sources and go down last. Braking adds a row
// rather than a colour, because there is no red in the palette brighter than
// the red they are already lit in — the brightness has to come from the pool
// and from the lamp being bigger, which is what a brake lamp coming on next to
// a tail lamp actually looks like.
export function paintTailLamps(put, box, flash) {
  var lamps = tailLamps(box);
  var grow = flash > 0.35 ? 1 : 0;
  var i, l, x, y;
  for (i = 0; i < lamps.length; i++) {
    l = lamps[i];
    for (y = l.y - grow; y < l.y + l.h; y++) {
      for (x = l.x; x < l.x + l.w; x++) put(x, y, C.tail);
    }
  }
}

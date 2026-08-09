"use strict";

// Everything that never moves, drawn once per stage size and left alone behind
// every frame: the banded sky, the stars the city has not washed out, the hump
// of glow it pushes up instead, both skylines, the ground they stand on, and
// the sign housings sitting dark on the near block.
//
// Splitting the static half of the picture off like this is not only thrift.
// The frame the drawing path produces is transparent wherever nothing was
// drawn, and the air above the road is exactly that — so the light in the air
// is laid over this canvas rather than mixed into it, and a beam crossing the
// sky brightens the sky it crosses without anyone having to remember what
// colour that patch of sky was.

import { VIEW_W, VIEW_H, S, HORIZON, Y_RAIL } from "./state.js";
import { C } from "./palette.js";
import { hash01, bayer4 } from "./maths.js";
import { paintCity } from "./skyline.js";

var STAR_SEED = 3;

// What of the static half a stage wants. All three default to on, so the
// assembled highway asks for nothing and gets everything; a stage whose
// subject is the road turns the city and its glow off, because a skyline
// behind a thing being examined is decoration and decoration is what a solo
// is for taking away.
export function makeBackdrop(options) {
  var wanted = options || {};
  var wantCity = wanted.city !== false;
  var wantStars = wanted.stars !== false;
  var wantGlow = wanted.glow !== false;

  var canvas = document.createElement("canvas");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  var ctx = canvas.getContext("2d");

  function fill(colour, x, y, w, h) {
    ctx.fillStyle = "#" + ("00000" + colour.toString(16)).slice(-6);
    ctx.fillRect(x, y, w, h);
  }

  var x, y, i, d, hump, strength;

  // ---------------------------- the sky --------------------------------
  // Three flat bands rather than a gradient. A gradient at this resolution is
  // a stack of one-pixel stripes anyway, and it would want colours that are
  // not in the palette to make them; three bands with a hard edge is what the
  // palette can actually say, and it is also what a long exposure of a city
  // sky looks like once the sensor has clipped.
  fill(C.skyDeep, 0, 0, VIEW_W, VIEW_H);
  fill(C.skyMid, 0, Math.round(HORIZON * 0.42), VIEW_W, Math.round(HORIZON * 0.32));
  fill(C.skyLow, 0, Math.round(HORIZON * 0.74), VIEW_W, HORIZON - Math.round(HORIZON * 0.74));

  // ---------------------------- the stars ------------------------------
  // Drawn before the glow, so the glow puts out the low ones. That is the
  // right way round: a city does not hide stars evenly, it hides the ones
  // nearest its own light.
  var stars = wantStars ? Math.round(50 * S) : 0;
  for (i = 0; i < stars; i++) {
    x = Math.floor(hash01(i, 1, STAR_SEED) * VIEW_W);
    y = Math.floor(hash01(i, 2, STAR_SEED) * HORIZON * 0.86);
    fill(C.star, x, y, 1, 1);
  }

  // ---------------------------- the city glow --------------------------
  // One broad hump over the tower cluster, solid where it meets the horizon
  // and dissolving upwards on the ordered dither. There is no colour between
  // `glow` and the sky bands to fade through, so the fade is carried by how
  // many pixels of each little tile take the glow.
  var cx = VIEW_W * 0.34;
  var half = VIEW_W * 0.46;
  var tall = wantGlow ? HORIZON * 0.62 : 0;
  for (x = 0; x < VIEW_W; x++) {
    d = (x - cx) / half;
    if (d <= -1 || d >= 1) continue;
    hump = tall * 0.5 * (1 + Math.cos(d * Math.PI));
    if (hump < 1) continue;
    for (y = HORIZON - 1; y > HORIZON - hump - 1; y--) {
      if (y < 0) break;
      strength = 1 - (HORIZON - y) / hump;
      if (strength > bayer4(x, y)) fill(C.glow, x, y, 1, 1);
    }
  }

  // ---------------------------- the far ground -------------------------
  // The strip between the horizon and the guard rail: the embankment the city
  // stands on. One lit pixel along the top, where the city's own glow catches
  // the far kerb, and dark below it.
  fill(C.ink, 0, HORIZON, VIEW_W, Y_RAIL - HORIZON);
  fill(C.road, 0, HORIZON, VIEW_W, 1);

  // ---------------------------- the city -------------------------------
  if (wantCity) paintCity(fill);

  return canvas;
}

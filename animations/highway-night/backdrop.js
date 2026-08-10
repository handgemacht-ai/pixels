"use strict";

// Everything that never moves, drawn once per stage size and left alone behind
// every frame: the sky and the dithered joins between its tones, the stars the
// city has not washed out, the layer of lit air standing on the horizon, every
// row of skyline, the ground they stand on, and the sign housings sitting dark
// on the row of towers they are bolted to.
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
import { paintCity, useSkyline } from "./skyline.js";

var STAR_SEED = 3;

// How many rows either side of a tone change the two tones are stippled
// together. Eleven rows of a sixty-row sky is a join wide enough to read as a
// gradient and narrow enough that what lies either side of it is still a tone.
var JOIN = 11;

// Where the sky changes tone, as fractions of the height of the sky.
var STOPS = [0, 0.40, 0.74];

// The layer of dirty air the city is lit through: how deep it is, where its
// middle stands, how far it reaches, how much light is in it, and how far the
// whole of it is pushed down towards the horizon out past the city. The depth
// is a fraction of the width and not of the horizon, because it is a thing in
// the world — so many metres of air — and the horizon moves with the shape of
// the stage while the road, and therefore the scale, does not.
//
// The last two are what carry the temperature, and they are what the hump used
// to do between them. Scaling the layer's brightness by the hump meant the
// right third of the frame, where the hump has all but run out, never climbed
// past the first step: violet-grey from the horizon all the way up, on the side
// of the picture the road is on. Air over a lit city is sodium at the horizon
// wherever it is looked at; what the city decides is how far up that reaches.
// So the ramp is the same one in every column and the hump slides it — sitting
// whole over the towers, and five rows lower out past them, where only the
// rows nearest the horizon are still inside it.
var HAZE_DEPTH = 0.125;
var HAZE_AT = 0.34;
var HAZE_HALF = 0.78;
var HAZE_GAIN = 9;
var HAZE_LIFT = 5;

// What of the static half a stage wants. The first three default to on, so the
// assembled highway asks for nothing and gets everything; a stage whose
// subject is the road turns the city and its glow off, because a skyline
// behind a thing being examined is decoration and decoration is what a solo
// is for taking away.
//
// `deep` is the fourth, and it is not a piece being taken away: it says which
// of the two pictures this is. A shot down the road has no ground beside the
// visitor and therefore no near block, and everything below its horizon is
// road rather than a six-pixel embankment. Every stage builds a backdrop
// before it draws anything, so saying it here is saying it once — skyline.js
// hangs the signs on whichever row of towers is left standing.
export function makeBackdrop(options) {
  var wanted = options || {};
  var wantCity = wanted.city !== false;
  var wantStars = wanted.stars !== false;
  var wantGlow = wanted.glow !== false;
  var deep = wanted.deep === true;

  useSkyline(deep);

  var canvas = document.createElement("canvas");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  var ctx = canvas.getContext("2d");

  function fill(colour, x, y, w, h) {
    ctx.fillStyle = "#" + ("00000" + colour.toString(16)).slice(-6);
    ctx.fillRect(x, y, w, h);
  }

  var x, y, i, d, hump, band, next, into, s, f, drop, up, v, level;

  // ---------------------------- the sky --------------------------------
  // Three tones, and eleven rows of ordered dither where each pair of them
  // meets. This used to be three flat bands, and the reason given for them was
  // that a gradient would want colours the palette has not got. The palette
  // has them now — but that is not what changed the answer, because a gradient
  // drawn as a colour a row would want sixty of them and no colour table is
  // going to hold that. What changed is the join. Stippling two tones together
  // over a dozen rows spends no colour at all: it spends the arrangement of the
  // two it already has, and at this resolution the eye reads the arrangement as
  // the colour in between rather than as a pattern.
  var tones = [C.skyDeep, C.skyMid, C.skyLow];
  var stops = [0, Math.round(STOPS[1] * HORIZON), Math.round(STOPS[2] * HORIZON)];
  var join = Math.max(1, Math.round(JOIN * S));
  fill(C.skyDeep, 0, 0, VIEW_W, VIEW_H);
  for (y = 0; y < HORIZON; y++) {
    band = y >= stops[2] ? 2 : (y >= stops[1] ? 1 : 0);
    fill(tones[band], 0, y, VIEW_W, 1);
    next = band + 1;
    if (next > 2) continue;
    into = y - (stops[next] - join);
    if (into < 0) continue;
    // how much of this row is still the tone above, on a curve rather than a
    // straight line: a linear join has a visible edge at each end of it, where
    // the rate the stipple is thinning at changes all at once
    s = 1 - into / (join + 1);
    f = s * s * (3 - 2 * s);
    for (x = 0; x < VIEW_W; x++) {
      if (bayer4(x, y) >= f) fill(tones[next], x, y, 1, 1);
    }
  }

  // ---------------------------- the stars ------------------------------
  // Drawn before the glow, so the glow puts out the low ones. That is the
  // right way round: a city does not hide stars evenly, it hides the ones
  // nearest its own light — and it hides them at a rate rather than at a line,
  // which is why a star near the horizon is asked to survive a second hash
  // instead of being cut off above one.
  var stars = wantStars ? Math.round(64 * S) : 0;
  for (i = 0; i < stars; i++) {
    x = Math.floor(hash01(i, 1, STAR_SEED) * VIEW_W);
    y = Math.floor(hash01(i, 2, STAR_SEED) * HORIZON);
    if (hash01(i, 5, STAR_SEED) < y / HORIZON) continue;
    fill(C.star, x, y, 1, 1);
  }

  // ---------------------------- the pollution band ---------------------
  // A layer of dirty air standing on the horizon, lit from underneath by the
  // city inside it. It replaced a hump of a single colour, and the difference
  // is that a layer has a temperature: sodium against the horizon where the
  // light is coming from, violet a few rows up where it has scattered, and the
  // last of the glow at the top of it where it gives out into the sky.
  //
  // Its temperature is fixed and its depth is what varies across the frame,
  // not the other way about, because air does not stop at the edge of a city
  // and it does not go cold at the edge of one either. Every column climbs the
  // same three steps towards the horizon; out past the towers it starts them
  // lower down and so only gets through the warm end of them.
  //
  // It goes down before the skyline and not after, which was tried and is
  // wrong. Laid over the towers the layer dissolves them: its brightest rows
  // are the ones the city is standing in, and at the middle of the hump they
  // are nearly solid, so the three depths that took the trouble to be three
  // depths come back as one wash. The plate settles it as well — the glow on it
  // is between the buildings and above them, and the buildings are silhouettes.
  // The warm end of the layer is therefore mostly behind the city, and what
  // carries the horizon in front of it is the lamp line's own smear.
  //
  // Four steps, of which the first is the sky already there: a value under the
  // first band leaves the row alone, which is what makes the top of the layer
  // dissolve instead of ending.
  var ramp = [C.glow, C.skyHaze, C.skyEmber];
  var rows = Math.round(HAZE_DEPTH * VIEW_W);
  var cx = HAZE_AT * VIEW_W;
  var half = HAZE_HALF * VIEW_W;
  var lift = HAZE_LIFT * S / rows;
  if (wantGlow) {
    for (x = 0; x < VIEW_W; x++) {
      d = (x - cx) / half;
      hump = (d <= -1 || d >= 1) ? 0 : 0.5 * (1 + Math.cos(d * Math.PI));
      drop = lift * (1 - hump);
      for (y = Math.max(0, HORIZON - rows); y < HORIZON; y++) {
        // how far into this column's layer the row is: nothing at its top,
        // all of it at the horizon, and the top is what the hump moves
        up = 1 - (HORIZON - y) / rows - drop;
        v = up <= 0 ? 0 : HAZE_GAIN * up * up;
        level = Math.floor(v);
        if (v - level > bayer4(x, y)) level += 1;
        if (level > 3) level = 3;
        if (level > 0) fill(ramp[level - 1], x, y, 1, 1);
      }
    }
  }

  // ---------------------------- the far ground -------------------------
  // The strip between the horizon and the guard rail: the embankment the city
  // stands on. One lit pixel along the top, where the city's own glow catches
  // the far kerb, and dark below it. Down the road there is no embankment and
  // no rail, and what lies below the horizon is ground all the way to the
  // bottom of the frame — the corridor is painted over most of it, and what is
  // left showing is the verge either side, which at night is simply dark.
  fill(C.ink, 0, HORIZON, VIEW_W, deep ? VIEW_H - HORIZON : Y_RAIL - HORIZON);
  fill(C.road, 0, HORIZON, VIEW_W, 1);

  // ---------------------------- the city -------------------------------
  if (wantCity) paintCity(fill);

  return canvas;
}

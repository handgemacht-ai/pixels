"use strict";

// The light, in a picture where the ground is a plane going away from the eye
// rather than a band across it.
//
// The elevation lit its road with wedges measured on the screen, and had to
// divide the vertical by 1.8 to stop a pool coming out as a disc. That fudge
// was standing in for exactly one thing: the fact that a step down the screen
// is further than a step across it. Here the camera says how much further, per
// row, so the fudge can go. A pool is measured in metres on the road plane and
// its shape on the screen is whatever the projection makes of it — narrow and
// squashed at the horizon, wide and open near the eye, without anybody writing
// either of those down.
//
// A lamp on a mast lighting a flat road is the textbook case and it is worth
// using the textbook answer: the light falling on a patch of road goes as the
// inverse square of the distance to the lamp, times the cosine of the angle it
// arrives at. Both together come out as
//
//     E = gain x h^3 / (h^2 + r^2)^1.5
//
// where h is the mast and r is how far along the road the patch is from the
// lamp's foot. Written that way the gain is what lands directly under the
// lamp, whatever the lamp is and however high it hangs — so raising the mast
// spreads the same pool wider instead of dimming it, which is both what a
// taller mast is for and what stops the mast knob dimming the picture as it is
// dragged.
//
// Sources are added, never compared, for the same reason as everywhere else in
// this folder: where two pools overlap the road is brighter, and that is the
// bright / dark / bright rhythm a lit road actually has.

import { VIEW_W, VIEW_H, S, HORIZON, P } from "./state.js";
import { AIR, ROAD, LANE, EDGE, FARROAD, SHADOW } from "./palette.js";
import { clamp } from "./maths.js";
import { lux, ruby } from "./light.js";
import { zAt, rowOf, ppm, xOf, uOf, VP_X } from "./camera.js";

// What lands on the road directly under a lamp at the declared settings: a
// shade over saturation, so the few pixels under the head are pinned at the
// top of the asphalt ramp and the pool falls away from there through three
// bands. Three bands across a pool is what makes a pool; two makes a sticker
// and four makes a wash.
var LAMP_GAIN = 1.06;

// The mast the gain was quoted against, and how far a pool is carried before
// it is cut. Twelve metres is about a third of the way to the next lamp, which
// is what leaves the stretch between two of them dark — the rhythm the whole
// picture is built on. Both scale with the mast, because a lamp hung higher
// throws its light further out as well as spreading it thinner.
var MAST_REF = 9;
var REACH_M = 12;

// The outer part of a pool fades instead of ending. A hard circle on wet
// asphalt is the one thing that makes cast light look drawn, and at this
// distance from the source the falloff alone is still nearly a whole band when
// the cut arrives.
var RIM = 0.3;

// The city, landing on everything. A night road between lamps is dark and is
// never black: there is a lit city on the horizon and the sky over it is doing
// some of the work. Without this the dark stretch resolves to flat ink and the
// road stops being a surface between one pool and the next.
var CITY_FLOOR = 0.13;

// The lamps past the end of the drawn train, said as a band rather than as
// lamps. Four spacings from the eye the gap between one mast and the next is
// under a row, so a lamp there is no longer a lamp — it is a contribution to a
// smear at the vanishing point, which is exactly what the plate shows and
// exactly what a train of point sources cannot draw without aliasing.
var SMEAR_ROWS = 9;
var SMEAR_GAIN = 0.75;

// And how far above the horizon it is allowed to reach. Two rows, and on those
// two it may land on nothing at all — which is the only place in the picture
// where light is added to air. The argument for it is the plate: a lamp line
// running to a vanishing point does not stop at the ground, it puts a haze in
// the air over itself, and a smear that stopped dead on the horizon row read as
// the far end of nothing.
//
// Above the horizon it is a hump rather than a band, and that is not a taste
// decision. Below the horizon the road fills the width, so a row of it is lit
// all the way across and looks it. Above the horizon there is no road — there
// is a lamp line converging on one column — so haze the full width of the frame
// draws a bar across the picture and cuts it in half, which is exactly what it
// did the first time. Half a frame wide, centred on the vanishing column, is
// the shape the thing casting it actually has.
var SMEAR_ABOVE = 2;
var SMEAR_HALF = 0.45;

// A tail lamp sits about a metre and a quarter off the road and throws a pool
// of its own behind the car. It is quoted high because it has to win the red
// test — more than half the light at a pixel — against the city floor, and it
// is cut short because a tail lamp that reached the next pool would make the
// whole carriageway pink.
var TAIL_H = 1.25;
var TAIL_GAIN = 1.6;
var TAIL_REACH = 4.5;

// ------------------------------ the pool itself -----------------------------
//
// What a pool is allowed to land on. A pool is a road-plane object: it is a
// circle of tarmac of a fixed size in metres, and the only thing that is on
// the road plane is the road. Anything standing up out of it — a mast, the car
// ahead — is not inside the pool at all however many of its pixels the
// projected circle happens to cover, and letting the circle light them is what
// turned the car into a white box the first time this was drawn. They are
// silhouettes against the road, which at night is what they are.
var ONPLANE = [];
ONPLANE[ROAD] = 1;
ONPLANE[LANE] = 1;
ONPLANE[EDGE] = 1;
ONPLANE[FARROAD] = 1;
ONPLANE[SHADOW] = 1;

// One sweep, bounded in both axes by the reach: rows first, because a row is a
// depth and the pool only covers a few of them, then columns, because at that
// depth the reach is a known number of pixels wide. Nothing outside the circle
// is visited.

export function addPool(mat, pool) {
  if (pool.gain <= 0 || pool.reach <= 0) return;
  var h2 = pool.height * pool.height;
  var strength = pool.gain * pool.height * h2;
  var reach = pool.reach;
  var far = reach * reach;
  var soft = reach * (1 - RIM);
  var soft2 = soft * soft;
  var y, d, z, dz, half, x0, x1, x, i, du, r2, q, v, r;
  y = Math.floor(rowOf(pool.z + reach));
  if (y < HORIZON + 1) y = HORIZON + 1;
  // a source may name the row it starts at, which is how the hero car keeps
  // the red it throws on the road out of its own bodywork: the shell stands
  // between its lamps and everything further away, and a shell lit red from
  // the inside is not a thing
  if (pool.fromRow && y < pool.fromRow) y = pool.fromRow;
  for (; y < VIEW_H; y++) {
    z = zAt(y);
    dz = z - pool.z;
    if (dz < -reach) break;
    d = y - HORIZON;
    // how far off the axis the circle still reaches at this depth, turned into
    // the columns that can possibly be inside it
    half = Math.sqrt(far - dz * dz);
    x0 = Math.max(0, Math.floor(xOf(pool.u - half, d)));
    x1 = Math.min(VIEW_W - 1, Math.ceil(xOf(pool.u + half, d)));
    for (x = x0; x <= x1; x++) {
      i = y * VIEW_W + x;
      if (!ONPLANE[mat[i]]) continue;
      du = uOf(x + 0.5, d) - pool.u;
      r2 = dz * dz + du * du;
      if (r2 > far) continue;
      q = h2 + r2;
      v = strength / (q * Math.sqrt(q));
      if (r2 > soft2) {
        r = Math.sqrt(r2);
        v *= (reach - r) / (reach - soft);
      }
      lux[i] += v;
      if (pool.red) ruby[i] += v;
    }
  }
}

// ------------------------------ what casts them -----------------------------

// The pool a mast lays. Its reach and its brightness move together with the
// reach knob, the way turning a lamp up does, rather than the knob scissoring
// a pool off at a wider circle.
export function lampPool(p, flare) {
  var reach = clamp(P.coneReach, 0.2, 3);
  return {
    u: p.head,
    z: p.z,
    height: p.height,
    gain: LAMP_GAIN * reach * (1 + 1.2 * flare),
    reach: REACH_M * reach * p.height / MAST_REF * (1 + 0.4 * flare),
    red: false
  };
}

// The red the hero car lays on the road behind it. It is the only light in the
// picture that comes toward the eye rather than away from it, which is why it
// is the one piece of the car that is visible when nothing else is.
export function brakePool(z, flash, fromRow) {
  return {
    u: 0,
    z: z,
    fromRow: fromRow,
    height: TAIL_H,
    gain: TAIL_GAIN * (1 + 1.4 * flash),
    reach: TAIL_REACH,
    red: true
  };
}

// The glare around a cobra head, which is the part of a lamp that is visible
// from anywhere. It is measured on the screen rather than on the road, because
// a halo is a halo from wherever you stand — and it widens with the haze knob,
// because that is what haze does to a light source.
//
// It asks for the skirt, which is the second and much fainter lobe light.js
// lays around the same point. A lamp on a long exposure has a core the width of
// its fitting and a wash several times that, and the wash is what makes a lamp
// look photographed rather than stamped.
export function headBloom(p, flare) {
  var m = ppm(p.d);
  return {
    x: p.lampX,
    y: p.lampY,
    span: clamp((0.22 + 0.16 * P.coneHaze) * m, 1.1 * S, 4 * S),
    gain: 0.34 * (1 + 1.5 * flare),
    skirt: true,
    red: false
  };
}

// The air under a head, which is the one thing in this picture that is lit
// without being a surface. A wedge pointing down from the filament: above the
// horizon it has sky to work on and lights it, below the horizon every pixel
// is road and it does nothing, so the glow stops at the horizon by itself
// rather than by being told to. The half-angle is fixed at thirty-four
// degrees — there is no cone-spread knob in this picture, because a cone seen
// end on has no width to argue about.
var HAZE_COS = Math.cos(34 * Math.PI / 180);

export function headHaze(p, flare) {
  var m = ppm(p.d);
  return {
    x: p.lampX,
    y: p.lampY,
    ax: 0,
    ay: 1,
    cosHalf: HAZE_COS,
    span: Math.max(1.2 * S, 0.5 * m),
    gain: 0.24 * P.coneHaze * (1 + flare),
    cut: 1.8,
    red: false
  };
}

// What is behind the camera, which is a car with its lamps on.
//
// A pair of dipped beams throws most of its light at the tarmac, and the
// tarmac is already lit far better than the beams could manage — light landing
// on a road at a grazing angle is spread over so much of it that a lamp
// standing over it wins easily. What the beams do that nothing else in the
// picture does is fall square on the one vertical surface pointed straight
// back at them, which is the rear of the car ahead. That is the whole reason
// there is anything to see there at all, and it is why this is applied to the
// shell and to nothing else.
//
// It falls off with distance, so the chase knob is not only how big the car is
// but how well lit — and it falls off up the shell, because a dipped beam is
// aimed low and the roof is the last thing it reaches.
var CHASE_GAIN = 70;
var CHASE_KNEE = 60;
var CHASE_TILT = 0.45;

export function addFrontLight(mat, box) {
  var base = CHASE_GAIN / (box.z * box.z + CHASE_KNEE);
  var pad = box.rim;
  var y0 = Math.max(0, box.y0 - pad);
  var y1 = Math.min(VIEW_H - 1, box.y0 + box.h - 1 + pad);
  var x0 = Math.max(0, box.x0 - pad);
  var x1 = Math.min(VIEW_W - 1, box.x0 + box.w - 1 + pad);
  var y, x, i, t, v;
  for (y = y0; y <= y1; y++) {
    t = (box.y0 + box.h - 1 - y) / Math.max(1, box.h - 1);
    v = base * (1 - CHASE_TILT * clamp(t, 0, 1));
    for (x = x0; x <= x1; x++) {
      i = y * VIEW_W + x;
      if (mat[i] === AIR || ONPLANE[mat[i]]) continue;
      lux[i] += v;
    }
  }
}

// ------------------------------ the flat two --------------------------------

export function addCityFloor(mat) {
  var n = VIEW_W * VIEW_H;
  var i;
  for (i = 0; i < n; i++) {
    if (mat[i] !== AIR) lux[i] += CITY_FLOOR;
  }
}

export function addHorizonSmear(mat) {
  var rows = Math.max(2, Math.round(SMEAR_ROWS * S));
  var above = Math.max(1, Math.round(SMEAR_ABOVE * S));
  var gain = SMEAR_GAIN * clamp(P.coneReach, 0.2, 3);
  var last = Math.min(VIEW_H, HORIZON + rows);
  var first = Math.max(0, HORIZON - above + 1);
  var half = SMEAR_HALF * VIEW_W;
  var y, d, v, row, x, i, s;
  for (y = first; y < last; y++) {
    d = Math.abs(y - HORIZON);
    v = gain / (1 + d * 0.35);
    row = y * VIEW_W;
    for (x = 0; x < VIEW_W; x++) {
      i = row + x;
      if (y > HORIZON) {
        if (mat[i] !== AIR) lux[i] += v;
        continue;
      }
      s = (x - VP_X) / half;
      if (s <= -1 || s >= 1) continue;
      lux[i] += v * 0.5 * (1 + Math.cos(s * Math.PI));
    }
  }
}

"use strict";

// The other carriageway, coming the other way — and down the road it is
// nothing but lights.
//
// The elevation drew small cars with a red lamp on the back, because from the
// side a car is a shape four pixels tall and the shape is worth having. Head
// on at a hundred metres it is not: what a camera on a bridge records of
// oncoming traffic is two white points and the line they drew while the
// shutter was open, and the bodywork never appears at all. So nothing here
// draws a car. It draws a pair of headlamps and the exposure behind them.
//
// The echo is the same lamp re-projected further down the road: where it was
// one step ago, two steps ago, and so on for as many steps as the exposure
// knob asks for. That is not a streak drawn along the screen — it is the same
// piece of geometry evaluated at earlier positions, so it bends the way the
// road bends, thins the way the road thins, and converges on the vanishing
// point without anything being told to converge. A drawn streak would have to
// be told, and would be wrong the moment the camera height changed.
//
// The lattice is this module's own, as it is in the elevation, and for the
// same reason: these cars do not travel at the scroll speed but at the scroll
// plus their own. Three quarters over and five quarters over, so a row covers
// seven and nine of its own spacings in a loop — both whole, so both rows come
// back onto themselves at the seam.

import { P, VIEW_W, S, HORIZON, loopStep } from "./state.js";
import { C } from "./palette.js";
import { clamp, hash01, bayer4 } from "./maths.js";
import { dOf, ppm, xOf, spacingMetres, stepMetres, travelled, loopCellsZ } from "./camera.js";
import { U } from "./carriageway.js";

// The two lanes of the far carriageway, on their middles.
var ROWS = [
  { over: 3, u: (U.farOut + U.farMid) / 2, seed: 61 },
  { over: 5, u: (U.farMid + U.farIn) / 2, seed: 83 }
];

// Where this lattice is pinned, in metres, and how far down the road cars are
// worth putting. Past two hundred and sixty metres a headlamp pair is closer
// together than a pixel and the two lamps stop being two.
var ANCHOR = 20;
var FAR = 260;

// A car this close has gone past the shoulder of the frame anyway, and its
// lamps have swung off the left edge some way before that.
var NEAR = 8;

// The lamps on it: two thirds of a metre up, one and a half metres apart.
var LAMP_UP = 0.7;
var TRACK = 0.75;

// How many are running. The knob is `applies: "next"` — it re-cuts the row, so
// it is latched on a loop boundary rather than read live, exactly as the
// elevation's is.
export var CARS = 4;

export function latchApproach() {
  CARS = Math.round(clamp(P.density, 0, 8));
}

function rowSpeed(row) { return stepMetres() * (1 + row.over / 4); }

// Four spacings of scroll in a loop plus this row's own, which is what makes
// the count whole. Every hash is taken on the cell index modulo it, so the car
// appearing at the horizon is the car that has just swept past the camera,
// carrying the same lane offset it had then.
function rowCells(row) { return loopCellsZ(spacingMetres()) + row.over; }

export function oncoming(step) {
  var turn = loopStep(step);
  var spacing = spacingMetres();
  var count = Math.ceil(FAR / spacing) + 2;
  // one slot per spacing per row, so the number on the knob is the number of
  // cars standing in the drawn depth
  var threshold = spacing * CARS / (ROWS.length * FAR);
  var list = [];
  var r, row, speed, cells, drift, base, j, cell, z;
  for (r = 0; r < ROWS.length; r++) {
    row = ROWS[r];
    speed = rowSpeed(row);
    cells = rowCells(row);
    drift = ((ANCHOR - speed * turn) % spacing + spacing) % spacing;
    base = Math.floor((speed * turn - ANCHOR) / spacing);
    for (j = 0; j < count; j++) {
      cell = ((base + j) % cells + cells) % cells;
      if (hash01(cell, r + 1, row.seed) >= threshold) continue;
      z = drift + j * spacing;
      if (z < NEAR || z > FAR) continue;
      list.push({
        // a third of a lane of wander, so the two rows are never a corridor of
        // lamps in a perfectly straight line
        u: row.u + (hash01(cell, 7, row.seed) - 0.5) * 1.2,
        z: z,
        v: speed,
        row: r,
        cell: cell
      });
    }
  }
  return list;
}

// One pair of lamps, at whatever depth is asked for — the car's own, or one of
// the earlier positions the exposure is made of.
export function lampsAt(car, z) {
  var d = dOf(z);
  var m = ppm(d);
  var y = HORIZON + d - LAMP_UP * m;
  return [
    { x: xOf(car.u - TRACK, d), y: y, m: m },
    { x: xOf(car.u + TRACK, d), y: y, m: m }
  ];
}

function inFrame(l) { return l.x >= -2 && l.x < VIEW_W + 2; }

// What the stats strip counts: pairs actually in shot.
export function onStage(step) {
  var cars = oncoming(step);
  var n = 0, i, lamps;
  for (i = 0; i < cars.length; i++) {
    lamps = lampsAt(cars[i], cars[i].z);
    if (inFrame(lamps[0]) || inFrame(lamps[1])) n += 1;
  }
  return n;
}

// The glare around each lamp. Small: a headlamp at this distance is a point,
// and the halo is the only thing that says the point is a light rather than a
// star that has got below the horizon. Small, and then carried a long way out
// by the skirt — a headlamp pointed at the camera is the one source in the
// picture whose wash is wider than the thing throwing it.
export function approachBlooms(cars) {
  var out = [];
  var i, k, lamps, l;
  for (i = 0; i < cars.length; i++) {
    lamps = lampsAt(cars[i], cars[i].z);
    for (k = 0; k < lamps.length; k++) {
      l = lamps[k];
      if (!inFrame(l)) continue;
      out.push({
        x: l.x,
        y: l.y,
        span: clamp(0.55 * l.m, 1.1 * S, 3.5 * S),
        gain: 0.30,
        skirt: true,
        red: false
      });
    }
  }
  return out;
}

// The lamps and their exposure, straight to the frame. The head of the streak
// is white because a headlamp seen head on is the brightest thing in the
// picture; the tail is beam and then the fainter beam, and past the second
// step it is thinned by the dither rather than by a colour between the two —
// because there is no such colour.
export function paintApproach(put, cars, exposure) {
  var steps = Math.round(clamp(exposure, 0, 24));
  var i, k, lamps, l, z, wide, dx, dy;
  for (i = 0; i < cars.length; i++) {
    for (k = steps; k >= 1; k--) {
      z = cars[i].z + k * cars[i].v;
      if (z > FAR) continue;
      lamps = lampsAt(cars[i], z);
      for (l = 0; l < lamps.length; l++) {
        if (!inFrame(lamps[l])) continue;
        if (k >= 3 && bayer4(lamps[l].x, lamps[l].y) > 1 - k / (steps + 1)) continue;
        put(lamps[l].x, lamps[l].y, k <= 2 ? C.beam : C.beamFaint);
      }
    }
    lamps = lampsAt(cars[i], cars[i].z);
    for (l = 0; l < lamps.length; l++) {
      if (!inFrame(lamps[l])) continue;
      // near the eye a headlamp is worth more than one pixel, because by then
      // it is worth more than one pixel
      wide = clamp(Math.round(0.22 * lamps[l].m), 1, 3);
      for (dy = 0; dy < wide; dy++) {
        for (dx = 0; dx < wide; dx++) put(lamps[l].x + dx, lamps[l].y + dy, C.hot);
      }
    }
  }
}

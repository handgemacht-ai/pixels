"use strict";

// The shot down the road, and the order it is built in.
//
// The same four sweeps over the same two buffers as the elevation — material,
// light, resolve, emitters — and for the same reasons, which are set out at
// the head of render/side.js and are not repeated here. What is worth saying
// is where this path differs, and it differs in one thing: back to front is no
// longer down the screen.
//
// In an elevation "further down the stage" and "nearer the eye" are the same
// statement, so painting in row order paints in depth order and the layer list
// is a list of bands. Here depth runs into the screen and the row order is the
// depth order only for the road itself. Everything standing on the road has to
// be sorted: the masts are walked from the far end so a near one is drawn over
// the one behind it, and the hero car goes down last because there is nothing
// between it and the camera.
//
// The light pass gains two sources that an elevation has no use for and this
// picture cannot do without. One is a floor: a city on the horizon puts a
// little light on everything, and without it the road three hundred metres
// away is pure black and the lamp line ends in a hard edge. The other is the
// smear along the horizon, which is what a train of lamps too close together
// to resolve actually looks like — the geometry stops resolving them at about
// the fourth spacing, and rather than draw aliasing the picture stops drawing
// masts and lets the light carry the rest of the line.

import { P, LOOP, loopStep } from "../state.js";
import { C, AIR } from "../palette.js";
import { clearLight, addHaze, addBloom } from "../light.js";
import { paintCarriageway } from "../carriageway.js";
import { masts, paintMast, mastFlare } from "../masts.js";
import { oncoming, approachBlooms, paintApproach } from "../approach.js";
import {
  heroBox, brakeZ, paintHero, paintTailLamps, tailBlooms
} from "../chase.js";
import {
  addPool, lampPool, brakePool, headBloom, headHaze, addFrontLight,
  addCityFloor, addHorizonSmear
} from "../groundlight.js";
import { litSigns, paintNeon } from "../neon.js";
import { beacons, BEACON_PHASES } from "../skyline.js";
import { mat, put, slab, clearFrame, resolve, makeBackend } from "./buffers.js";

// How many of the largest sign housings get a cross flare, as in the
// elevation and for the same reason.
var FLARES = 3;

// How much of its own cycle an aviation beacon is lit for. Three eighths is a
// long enough blink to be caught at twelve steps a second and short enough that
// a skyline with half a dozen of them on it is never all lit at once, which is
// what stops them reading as a row of red windows.
var BEACON_ON = 3;

// ------------------------- the material pass -------------------------

function materials(step, poles, box) {
  var i;
  paintCarriageway(slab, step);
  for (i = 0; i < poles.length; i++) paintMast(slab, poles[i]);
  paintHero(slab, box);
}

// ---------------------------- the light pass -------------------------
//
// Every pool here is measured in metres on the road plane and then projected,
// never drawn as an ellipse on the screen. That is the whole reason this
// picture is worth having: a lamp's pool is a circle of a fixed size on the
// tarmac whether it is under the camera or two hundred metres away, and doing
// it in metres means the foreshortening — a near pool tall and open, a far one
// squashed to a couple of rows — is something that happens rather than
// something that had to be worked out.

function lights(state, poles, cars, box, pairs) {
  var i, p, flare, blooms;

  addCityFloor(mat);
  addHorizonSmear(mat);

  // every bloom here is handed the material buffer, because one of them has a
  // surface it must not land on and none of them can tell without it
  for (i = 0; i < poles.length; i++) {
    p = poles[i];
    flare = mastFlare(state, p, pairs);
    addPool(mat, lampPool(p, flare));
    addHaze(mat, headHaze(p, flare));
    addBloom(headBloom(p, flare), mat);
  }

  blooms = approachBlooms(cars);
  for (i = 0; i < blooms.length; i++) addBloom(blooms[i], mat);

  // the red on the road behind the car, which is the only light in the picture
  // travelling towards the eye rather than away from it
  addPool(mat, brakePool(brakeZ(box), state.flash, box.contactY));
  addFrontLight(mat, box);
  blooms = tailBlooms(box, state.flash);
  for (i = 0; i < blooms.length; i++) addBloom(blooms[i], mat);
}

// ---------------------------- the emitters ---------------------------

function emitters(state, poles, cars, box) {
  var i, k, p, lights, turn, since;

  // the beacons first, because they are the furthest thing on the stage and
  // everything else is drawn in front of them
  lights = beacons();
  turn = Math.floor(loopStep(state.step) * BEACON_PHASES / LOOP);
  for (i = 0; i < lights.length; i++) {
    since = ((turn - lights[i].phase) % BEACON_PHASES + BEACON_PHASES) % BEACON_PHASES;
    if (since < BEACON_ON) put(lights[i].x, lights[i].y, C.tail);
  }

  for (i = 0; i < poles.length; i++) {
    p = poles[i];
    for (k = 0; k < p.wide; k++) put(p.lampX + k, p.lampY, C.hot);
  }

  paintApproach(put, cars, P.exposure);
  paintTailLamps(put, box, state.flash);
  paintNeon(put, litSigns(state, 0, FLARES));
}

export function drawFrame(scene) {
  var state = scene.state;
  var step = state.step;
  var poles = masts(step);
  var cars = oncoming(step);
  var box = heroBox();
  var pairs = 0;
  var i;
  // how long the lamp line is, which the ripple has to know: the strike runs
  // from the far end to the near one inside one wake, however many lamps the
  // spacing knob has put on the road
  for (i = 0; i < poles.length; i++) {
    if (poles[i].rank + 1 > pairs) pairs = poles[i].rank + 1;
  }

  clearFrame();
  mat.fill(AIR);
  clearLight();

  materials(step, poles, box);
  lights(state, poles, cars, box, pairs);
  // no mottle: the patch grid is scrolled sideways by a pixels-per-step that
  // only an elevation has, and a fixed grid laid over a road that recedes
  // would be a texture standing still on a moving surface
  // the red pool's own edge is dithered here and not in the elevation: down the
  // road it is a circle laid on open tarmac with both sides of it lit, and a
  // clean contour between two saturated ramps is the one join in this picture
  // the eye can catch
  resolve(step, P.coneTexture, Math.round(P.lampWarmth), false, true);
  emitters(state, poles, cars, box);
}

export function createJavascriptBackend(ctx) {
  return makeBackend(ctx, drawFrame);
}

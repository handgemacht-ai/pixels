"use strict";

// The side elevation's drawing path, and the order it works in.
//
// A frame is not painted. It is built in four sweeps over two buffers the size
// of the stage, and only the third of them knows anything about colour:
//
//   1. the material pass writes what every pixel is made of — asphalt, paint,
//      gravel, glass, sheet metal, air — back to front, and never a colour;
//   2. the light pass adds up how much light lands on every pixel, from every
//      lamp, headlamp and tail lamp at once, into a float field;
//   3. the resolve turns each pixel into one of the palette's colours by
//      reading its own material's four-step ramp at a level worked out from
//      the light that landed on it;
//   4. the emitters go down last and straight to the frame — neon, filaments,
//      tail lamps and the red they drag. They are sources, not surfaces, and
//      running them back through the ramps would put a street lamp's amber
//      over a pink sign.
//
// Doing it in that order is what makes a car standing inside a lamp's pool
// climb its own ramp — dark paint, lit paint, a hot rim — instead of getting
// the pool's amber laid over it like a film. And adding the light rather than
// taking the brightest source is what makes two overlapping pools brighter
// where they cross, which is the bright / dark / bright rhythm a line of
// street lamps actually has.
//
// The buffers themselves, and the resolve that reads them, are in buffers.js:
// the four solo stages build a frame the same way out of fewer parts, and the
// shot down the road builds one out of different parts entirely, so the only
// thing that differs between one stage's path and another's is the three
// sweeps below.

import { S, P } from "../state.js";
import { C, AIR } from "../palette.js";
import { bayer4 } from "../maths.js";
import { clearLight, addCone, addHaze, addBloom } from "../light.js";
import {
  paintGround, paintRail, paintMedian, paintDashes, paintEdgeLine, paintSpeckle
} from "../road.js";
import { poleCount, poleAt, paintPole } from "../pole.js";
import { oncoming, paintTraffic, tailOf } from "../traffic.js";
import { carPose, paintCar, lampAt } from "../car.js";
import { litSigns, paintNeon } from "../neon.js";
import {
  flareOf, poleCone, poleSpill, poleHaze, poleBloom, headCones, headBloom,
  tailCone, tailBloom
} from "../lightcone.js";
import { mat, put, slab, clearFrame, resolve, makeBackend } from "./buffers.js";

// How many of the largest sign housings get a cross flare. Three: a flare on
// every sign is a sky full of stars, and none at all is a skyline of coloured
// boxes.
var FLARES = 3;

// ------------------------- the material pass -------------------------
//
// Back to front, and the order is the picture's depth: the rail is behind the
// far carriageway, the far carriageway is behind the median the poles stand
// on, and the car is in front of everything but the line painted between it
// and the visitor.
//
// Two places depart from the layer list the scene was planned against, and
// both for the same reason — in a side elevation "further down the screen" and
// "nearer the eye" are the same statement, so anything drawn later wins.
// Oncoming traffic goes down before the poles, because a mast standing on the
// median is in front of a car on the far carriageway. The lane dashes go down
// before the hero car, because the centre line of a carriageway is the far
// line: drawn afterwards it would saw the car in half.

function materials(scene, poles, cars, pose) {
  var step = scene.state.step;
  var i;

  paintGround(slab);
  paintRail(slab, step);
  paintTraffic(slab, cars);
  paintMedian(slab, step);
  for (i = 0; i < poles.length; i++) paintPole(slab, poles[i]);
  paintDashes(slab, step);
  paintCar(slab, pose, step, true);
  paintEdgeLine(slab);
  paintSpeckle(slab, step);
}

// ---------------------------- the light pass -------------------------
//
// Every source in the scene lands in the same two accumulators. Nothing here
// asks what it is lighting or in what order it got there — that is the whole
// value of the arrangement, and it is why a car driving into a pool comes out
// brighter than the pool or the car would be alone.

function lights(scene, poles, cars, pose) {
  var state = scene.state;
  var i, p, c, flare, cones, lamp, tail;

  for (i = 0; i < poles.length; i++) {
    p = poles[i];
    flare = flareOf(state, p, i);
    addCone(mat, poleCone(p, flare));
    addCone(mat, poleSpill(p, flare));
    addHaze(mat, poleHaze(p, flare));
    addBloom(poleBloom(p, flare));
  }

  for (i = 0; i < cars.length; i++) {
    c = cars[i];
    tail = tailOf(c);
    addBloom(tailBloom(tail.x, tail.y, 1));
    addCone(mat, tailCone(tail.x, tail.y, 1, 1));
    // the far headlamp, seen end on rather than as a beam: a car coming the
    // other way shows a white point and no wedge at all, because its beam is
    // pointing away down its own carriageway
    addBloom({ x: c.x - 1, y: tail.y, span: 2 * S, gain: 0.20, red: false });
  }

  lamp = lampAt(pose, true);
  cones = headCones(lamp, state.flash);
  for (i = 0; i < cones.length; i++) addCone(mat, cones[i]);
  addBloom(headBloom(lamp, state.flash));

  lamp = lampAt(pose, false);
  addBloom(tailBloom(lamp.x, lamp.y, 1.2));
  addCone(mat, tailCone(lamp.x, lamp.y, -1, 1.2));
}

// ---------------------------- the emitters ---------------------------
//
// Sources rather than surfaces, and the only things in the animation drawn
// straight to the frame. Every one of them is something that is making light
// rather than receiving it, and none of them may be re-lit.

function emitters(scene, poles, cars, pose) {
  var state = scene.state;
  var trail = Math.round(P.trail * S);
  var i, k, p, c, tail, lamp, colour;

  // the filament under each cobra head
  for (i = 0; i < poles.length; i++) {
    p = poles[i];
    for (k = 0; k < p.mast; k++) put(p.x + p.arm + k, p.lampY, C.hot);
  }

  // the oncoming cars: a red lamp on the back, the streak it drags out behind
  // it, and the two white pixels of its own headlamps coming the other way
  for (i = 0; i < cars.length; i++) {
    c = cars[i];
    tail = tailOf(c);
    put(tail.x - 1, tail.y, C.tail);
    put(tail.x - 1, tail.y - 1, C.tail);
    for (k = 0; k < trail; k++) {
      // the streak thins as it goes, carried by the dither rather than by a
      // colour between the two reds, because there is no such colour
      colour = k < 1 ? C.tail : C.tailFaint;
      if (k >= 2 && bayer4(tail.x + k, tail.y) > 1 - k / trail) continue;
      put(tail.x + k, tail.y, colour);
    }
    // a headlamp seen head on is the brightest thing in the picture, not a
    // patch of lit air: two pixels of white, where a wedge of beam colour used
    // to sit and read as a smear
    put(c.x - 1, tail.y, C.hot);
    put(c.x - 1, tail.y - 1, C.hot);
  }

  // the hero car's own lamps, which sit on the shell and ride with it
  lamp = lampAt(pose, true);
  put(lamp.x - S, lamp.y, C.hot);
  put(lamp.x - S, lamp.y + S, C.hot);
  if (state.flash > 0) put(lamp.x, lamp.y, C.hot);

  lamp = lampAt(pose, false);
  put(lamp.x + S, lamp.y, C.tail);
  put(lamp.x + S, lamp.y + S, C.tail);

  paintNeon(put, litSigns(state, 0, FLARES));
}

export function drawFrame(scene) {
  var step = scene.state.step;
  var poles = [];
  var count = poleCount();
  var j;
  for (j = 0; j < count; j++) poles.push(poleAt(j, step));
  var cars = oncoming(step);
  var pose = carPose(scene.state);

  clearFrame();
  mat.fill(AIR);
  clearLight();

  materials(scene, poles, cars, pose);
  lights(scene, poles, cars, pose);
  resolve(step, P.coneTexture, Math.round(P.lampWarmth), true);
  emitters(scene, poles, cars, pose);
}

export function createJavascriptBackend(ctx) {
  return makeBackend(ctx, drawFrame);
}

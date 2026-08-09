"use strict";

// The wedges. This module knows where a cone points, how wide it opens and how
// far it carries; light.js knows what to do with that once it has it.
//
// Splitting the two apart is what lets a lamp, a headlamp and a tail lamp be
// the same object with different numbers in it. There is no separate code path
// for a beam and a pool: a pool is a wedge pointing down and a beam is a wedge
// pointing along the road, and both land in the same accumulator, which is why
// a car driving into a lamp's pool comes out brighter than either would make
// it alone.
//
// Every reach here is a reference length rather than a limit. A cone is quoted
// by the distance at which it has fallen to about a band, and light.js carries
// it three of those before cutting — so the reach knob widens and brightens
// together, the way turning a lamp up does, instead of scissoring the pool off
// at a hard circle.

import { P, S, Y_NEAR, Y_SHOULDER } from "./state.js";
import { ANISO } from "./light.js";
import { clamp } from "./maths.js";
import { STRUCK_LAMP, STRUCK_LINE, WAKE_STEPS } from "./world.js";

var DEG = Math.PI / 180;

// Calibration, and there is only one number in it that was chosen freely. The
// lamp gain is set so that at the declared defaults the road directly under a
// cobra head saturates, the middle of the near carriageway sits one band below
// that, the near edge of it sits one lower again and the shoulder falls off
// the bottom. Three bands across a pool is what makes a pool; two makes a
// sticker and four makes a wash. Everything else here is relative to that one
// number.
//
// The tail gain is deliberately small. A tail lamp only has to win the red
// test — more than half the light at a pixel — and it only has to win it where
// no street lamp is arguing, so it is set to make a pool about ten pixels
// across with a couple of saturated pixels at its middle. Anything stronger
// and every car would drag a red carpet through the amber ones.
var LAMP_GAIN = 0.75;
var HEAD_GAIN = 0.55;
var TAIL_GAIN = 0.18;

// How far the headlamps throw, as a fraction of the stage width. Thirty pixels
// of a hundred and ninety-two is roughly a car and a half ahead at the first
// band, which is where dipped beams actually put their edge.
var BEAM_REACH = 30;

// Dipped, not level: nine degrees down is what keeps a beam on the road
// instead of in the eyes of the traffic it is drawn beside.
var BEAM_TILT = 9 * DEG;

// How hard a struck lamp flares, and for how many steps the ripple takes to
// walk from one lamp to the next.
var RIPPLE_GAP = 2;
var RIPPLE_LIFE = 6;

// How much extra a lamp is giving right now, 0 to 1. A single strike flares
// the lamp it named; a strike with nowhere in particular to land runs down the
// whole line, one lamp every couple of steps, which is what a line of lamps
// does when the circuit closes at one end.
export function flareOf(state, p, j) {
  if (state.kind === STRUCK_LAMP) return p.cell === state.struck ? state.wake : 0;
  if (state.kind === STRUCK_LINE) {
    var since = (1 - state.wake) * WAKE_STEPS - RIPPLE_GAP * j;
    if (since < 0 || since >= RIPPLE_LIFE) return 0;
    return 1 - since / RIPPLE_LIFE;
  }
  return 0;
}

// The pool a lamp lays on the road. Its reference length is the drop from the
// filament to the middle of the near carriageway, in world units — so a taller
// mast automatically quotes a longer reach and lights a wider piece of road at
// the same brightness, which is both what a taller mast is for and what stops
// the mast-height knob dimming the picture as it is dragged.
export function poleCone(p, flare) {
  var mid = Y_NEAR + (Y_SHOULDER - Y_NEAR) * 0.5;
  var drop = Math.max(4 * S, mid - p.lampY);
  return {
    x: p.lampX,
    y: p.lampY,
    ax: 0,
    ay: 1,
    cosHalf: Math.cos(clamp(P.coneSpread, 4, 60) * DEG),
    span: P.coneReach * drop / ANISO * (1 + 0.5 * flare),
    gain: LAMP_GAIN * (1 + 1.2 * flare),
    red: false
  };
}

// The spill. A road luminaire is not a torch: it throws a broad, weak wash
// sideways as well as the beam it aims at the carriageway, and without it the
// wedge ends in a vertical edge a few pixels below the head, where the cone is
// still narrow — which reads as a lit rectangle rather than as a pool. The
// spill is the same wedge opened two and a half times as wide and turned down
// to a quarter, so it puts a skirt around every pool and nothing else.
export function poleSpill(p, flare) {
  var cone = poleCone(p, flare);
  cone.cosHalf = Math.cos(Math.min(78 * DEG, clamp(P.coneSpread, 4, 60) * 2.6 * DEG));
  cone.span = cone.span * 0.42;
  cone.gain = LAMP_GAIN * 0.95 * (1 + 1.2 * flare);
  // it is quoted short and cut short on purpose. A spill that carried as far
  // as the beam would meet the next lamp's spill halfway and lift the dark
  // stretch between two lamps off the bottom band, and the whole rhythm the
  // picture is built on is that the stretch between two lamps is dark.
  cone.cut = 2;
  return cone;
}

// The same wedge in the air under the head. It is short on purpose: the only
// air in this picture is the strip above the guard rail and the sky above
// that, so a shaft quoted any longer would spend its reach on ground it is not
// allowed to touch.
export function poleHaze(p, flare) {
  return {
    x: p.lampX,
    y: p.lampY,
    ax: 0,
    ay: 1,
    cosHalf: Math.cos(clamp(P.coneSpread, 4, 60) * DEG),
    span: Math.max(2 * S, 6 * S * P.coneReach),
    gain: P.coneHaze * 0.8 * (1 + flare),
    red: false
  };
}

// The glare around the head itself, which is the part of a lamp that is
// visible from anywhere. It widens with the haze knob because that is what
// haze does to a light source, and it lands on the pole as well as on the sky,
// so the cobra head is always the brightest thing on the mast.
export function poleBloom(p, flare) {
  return {
    x: p.lampX,
    y: p.lampY,
    span: (3 + 2 * P.coneHaze) * S,
    gain: 0.42 * (1 + 1.5 * flare),
    red: false
  };
}

// Both headlamps. The near one is the one that is drawn; the far one is two
// pixels higher and a pixel further back, which is where the other side of the
// car would put it in an oblique view — and casting it rather than pretending
// it is not there is what gives the road ahead a bright core inside a wider
// spill instead of one flat wedge.
export function headCones(pose, lamp, flash) {
  var tilt = BEAM_TILT - pose.pitch * 0.06;
  var spread = clamp(P.beamSpread, 4, 60) * DEG * (1 - 0.45 * flash);
  var span = Math.max(4 * S, P.beamReach * (1 + flash) * BEAM_REACH * S);
  var gain = HEAD_GAIN * (1 + 1.4 * flash);
  return [
    { x: lamp.x, y: lamp.y, ax: Math.cos(tilt), ay: Math.sin(tilt),
      cosHalf: Math.cos(spread), span: span, gain: gain, red: false },
    { x: lamp.x - S, y: lamp.y - 2 * S,
      ax: Math.cos(tilt * 0.6), ay: Math.sin(tilt * 0.6),
      cosHalf: Math.cos(spread * 1.5), span: span * 0.8, gain: gain * 0.55, red: false }
  ];
}

export function headBloom(lamp, flash) {
  return { x: lamp.x, y: lamp.y, span: (3 + 2 * flash) * S, gain: 0.5 * (1 + flash), red: false };
}

// A tail lamp: a small red bloom and a short red wedge dragged out behind it.
// Both feed the red field as well as the total one, so the asphalt under them
// resolves along the ruby ramp and a red pool never comes out amber.
export function tailCone(x, y, back, gain) {
  return {
    x: x, y: y, ax: back, ay: 0,
    cosHalf: Math.cos(50 * DEG),
    span: Math.max(2 * S, 9 * S),
    gain: TAIL_GAIN * gain,
    red: true
  };
}

export function tailBloom(x, y, gain) {
  return { x: x, y: y, span: 3 * S, gain: 0.22 * gain, red: true };
}

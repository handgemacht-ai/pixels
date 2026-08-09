"use strict";

// Where the lamp is, and what it is made of.
//
// The whole animation is one lamp going round one tower, so this file is the
// animation. Everything it hands back is a function of the step number — or, if
// the visitor is pointing at the stage and the follow knob is on, of where they
// are pointing. Nothing is integrated, nothing is remembered, and the lamp at
// step 48 is at exactly the bearing it was at step 0.

import {
  P, S, POINTER, LOOP, loopStep, PLINTH_H,
  PX_X, PX_YX, PX_YY, PX_Z, DEP_Y, ORIGIN_X, ORIGIN_Y
} from "./state.js";
import { VOID } from "./palette.js";
import { TAU, frac } from "./maths.js";

// The orbit is a circle in the world, and the view turns it into an ellipse on
// the stage for nothing: a voxel of depth moves the lamp one pixel where a voxel
// of width moves it two. This squashes it a little further, in the world, so the
// lamp does not spend a quarter of its lap so far behind the tower that there is
// nothing to look at.
var ORBIT_SQUASH = 0.7;

// How far the lamp swings up and down over a lap, in voxels. Twice round per
// lap, because an even number closes and an odd one leaves the lamp half a bob
// out at the seam.
var BOB = 1.6;

// The lamp's reference length, in stage pixels at the design size: the distance
// at which it has fallen to about a band. The cut is short — a lamp this bright
// carried three reference lengths reaches the far rim of the ground disc, and
// the dark the tower is standing in is the picture.
var LAMP_SPAN = 34;
var LAMP_CUT = 2.4;
var LAMP_GAIN = 0.72;

// The glare on the lamp itself, and the lit air around it. The haze is kept
// deliberately short: carried far it becomes an even disc of the one shade above
// the void, and an even disc is a shape somebody drew rather than air with light
// in it.
var BLOOM_SPAN = 5;
var BLOOM_GAIN = 0.34;
var HAZE_SPAN = 24;
var HAZE_GAIN = 0.3;

// What the two flood knobs are worth at the top of their travel. Turned all the
// way up they are an overcast afternoon with the lamp barely showing, which is a
// setting worth having and not the one this animation is about — so a knob at
// its default leaves the stone one step off the bottom of its own ramp, and the
// lamp is the only thing that lifts it further.
var AMBIENT_GAIN = 0.38;
var SKY_GAIN = 1.15;

// A strike: a short, wide, very bright glare at the place that was struck. It is
// a bloom rather than a lamp because a bloom needs no geometry — it lands on the
// air and the stone alike, in screen pixels, which is exactly what a flash on
// the far side of a wall does.
var FLARE_SPAN = 16;
var FLARE_GAIN = 2.6;

// Where the sky comes from: high, and leaning in from the same side the eye is
// on. It is the floor the lamp is read against, and it is what stops a cylinder
// reading as a slab — a fill arriving square on lights the whole visible arc of
// the wall equally, whereas one arriving from one end of that arc puts a
// gradient across it, and a gradient across it is the roundness.
var SUN = { x: -1.1, y: 0.2, z: -0.9 };

// The lamp is a flame, so it is never quite steady. Three harmonics at whole
// multiples of the lap: irregular enough to read as a flame, and periodic by
// construction, so the flicker cannot be what stops the loop closing.
function flicker(phase) {
  return 1 +
    0.055 * Math.sin(TAU * 3 * phase + 1.7) +
    0.035 * Math.sin(TAU * 5 * phase) +
    0.02 * Math.sin(TAU * 7 * phase + 0.9);
}

// Which bearing the visitor is asking for. The stage is read back onto the
// ground plane and the answer is an angle, not a place: the lamp keeps its own
// radius and its own height, so following the mouse changes where the light is
// coming from and never how much of it there is.
function aimFrom(pointer) {
  var Y = -(pointer.y - ORIGIN_Y) / PX_YY;
  var X = (pointer.x - ORIGIN_X - PX_YX * Y) / PX_X;
  return Math.atan2(Y / ORBIT_SQUASH, X);
}

export function lightAim(state, pointer) {
  var phase = frac(loopStep(state.step) / LOOP);
  var point = pointer || POINTER;
  // No easing back to the orbit when the mouse leaves. An ease is a state, and a
  // state that is still running when a film starts is a state that gets filmed:
  // the first lap would come out of the export different from the second.
  var a = (P.follow && point.inside) ? aimFrom(point) : TAU * phase;

  var R = P.lightRadius * S / PX_X;
  var X = R * Math.cos(a);
  var Y = R * Math.sin(a) * ORBIT_SQUASH;
  // measured from the shelf the tower stands on rather than from the ground the
  // rock stands on. A lamp quoted against the ground spends the bottom half of
  // its travel buried in the plinth, which is half a knob that does nothing.
  var Z = PLINTH_H + P.lightHeight * S / PX_Z + BOB * S * Math.sin(2 * TAU * phase);

  return {
    angle: a,
    flick: flicker(phase),
    // where it stands, in the three numbers the light module measures in
    x: ORIGIN_X + PX_X * X + PX_YX * Y,
    y: ORIGIN_Y - PX_Z * Z - PX_YY * Y,
    h: PX_Z * Z,
    d: DEP_Y * Y
  };
}

// Whether the tower is between the lamp and the eye. The model already knows: at
// the lamp's own block there is either nothing drawn, or something drawn whose
// depth says whether it is in front. This is the one thing in the animation that
// reads the light field rather than writing to it.
export function lampHidden(field, lamp) {
  var x = Math.round(lamp.x), y = Math.round(lamp.y);
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return true;
  var i = y * field.width + x;
  if (field.mat[i] === VOID) return false;
  return field.dep[i] < lamp.d - 1;
}

// Every source in the scene, rebuilt from scratch each step. They are added into
// one accumulator and never compared, so the place where the lamp's pool crosses
// the sky's fill is brighter than either — which is the whole reason for adding
// them rather than taking the brightest.
//
// `tap` names the source for anything watching the accumulator grow. It is a
// name rather than a place in this list, because the list is not the same length
// every step — the glare goes when the lamp is behind the tower, and a strike
// adds a sixth — and a watcher keyed on position would relabel every source the
// moment one of them was missing. The light module never reads it.
export function sources(state, lamp, hidden, out) {
  out.length = 0;

  out.push({
    tap: "lux:sky",
    kind: "ambient",
    ax: 0, ay: 0, az: -1,
    gain: P.ambient * AMBIENT_GAIN,
    // wide open: this is the sky, and the sky is not a point. What faces up
    // still gets more of it than what faces sideways, which is what stops the
    // unlit half of the tower going flat.
    wrap: 1
  });

  out.push({
    tap: "lux:sun",
    kind: "sun",
    ax: SUN.x, ay: SUN.y, az: SUN.z,
    gain: P.sky * SKY_GAIN,
    wrap: 0.35,
    shadow: false
  });

  out.push({
    tap: "lux:lamp",
    kind: "point",
    x: lamp.x, y: lamp.y, h: lamp.h, d: lamp.d,
    span: P.lightReach * LAMP_SPAN * S,
    cut: LAMP_CUT,
    gain: LAMP_GAIN * lamp.flick,
    wrap: P.wrap,
    shade: true,
    shadow: !!P.shadows,
    shadowBias: 1.2,
    shadowSteps: 20
  });

  // the air the lamp is standing in, which is drawn whether or not the lamp
  // itself can be seen: light leaking round the edge of a wall is the strongest
  // evidence there is that something is behind it
  out.push({
    tap: "lux:haze",
    kind: "haze",
    x: lamp.x, y: lamp.y, h: lamp.h, d: lamp.d,
    span: HAZE_SPAN * S,
    cut: 2.4,
    gain: HAZE_GAIN * lamp.flick
  });

  // the glare on the lamp, which is not drawn when the lamp is behind the tower.
  // A halo over a wall with nothing in the middle of it reads as a fault.
  if (!hidden) {
    out.push({
      tap: "lux:bloom",
      kind: "bloom",
      x: lamp.x, y: lamp.y,
      span: BLOOM_SPAN * S,
      gain: BLOOM_GAIN * lamp.flick
    });
  }

  if (state.flare > 0) {
    out.push({
      // the same tap as the lamp's own halo: a strike is a bloom too, and the
      // two are the same kind of light landing on the same air
      tap: "lux:bloom",
      kind: "bloom",
      x: state.spotX, y: state.spotY,
      span: FLARE_SPAN * S,
      gain: FLARE_GAIN * state.flare
    });
  }

  return out;
}

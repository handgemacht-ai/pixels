"use strict";

import { P, GROUND, CENTRE, S } from "./state.js";
import { clamp, solveJoint } from "./maths.js";
import { offsets, foot, bodyRise, bodyPitch, headDip, tailSwing } from "./gait.js";

// ---------------------------------------------------------------------
// The rig. Bone lengths come off the knobs, the gait says where each paw has
// to be, and the joints in between are solved for rather than animated: the
// elbow and the stifle are wherever they have to be for the paw to land on
// the mark. Nothing here draws anything.
//
// Two lists come out of it. `shapes` is the animal: capsules of every kind,
// including the ones that are only there to give it a chest or an ear.
// `bones` is the rig underneath, which is what the overlay shows — the spine,
// the neck, the skull, the tail and the four legs, and nothing that is merely
// a lump of the drawing.
// ---------------------------------------------------------------------

// Which way each leg folds. A foreleg's elbow points backwards and a hind
// leg's stifle points forwards — the two together are what make a dog's
// silhouette read as a dog rather than as a table.
var FOLD = { hindFar: -1, foreFar: 1, hindNear: -1, foreNear: 1 };

// The two legs on the far side stand a little behind the near ones and are
// painted flat, which is all the depth a side view needs.
var FAR = { hindFar: true, foreFar: true, hindNear: false, foreNear: false };

var FORE = { hindFar: false, foreFar: true, hindNear: false, foreNear: true };

function shape(pose, x0, y0, x1, y1, r0, r1, far, tip) {
  pose.shapes.push({
    x0: x0, y0: y0, x1: x1, y1: y1, r0: r0, r1: r1,
    far: !!far, leg: false, tip: tip || ""
  });
}

// The same, but flagged as belonging to a leg. The drawing keeps the legs
// nearest the viewer in a layer of their own so they are shaded as limbs in
// front of the body rather than as the bottom of it.
function limb(pose, x0, y0, x1, y1, r0, r1, far, tip) {
  shape(pose, x0, y0, x1, y1, r0, r1, far, tip);
  pose.shapes[pose.shapes.length - 1].leg = true;
}

function bone(pose, x0, y0, x1, y1, part) {
  pose.bones.push({ x0: x0, y0: y0, x1: x1, y1: y1, part: part });
}

function joint(pose, x, y, part, solved) {
  pose.joints.push({ x: x, y: y, part: part, solved: !!solved });
}

// ------------------------------ one leg ------------------------------
// A foreleg is a near-straight column with a short pastern; a hind leg has a
// long thigh, a sharp hock and a long metatarsus below it. Building them from
// the same three segments with different proportions is what stops the two
// ends of the dog looking like the same leg twice.
function leg(pose, name, ax, ay, phase) {
  var fore = FORE[name];
  var L = P.legLength * S;
  var upper = fore ? L * 0.95 : L * 0.86;
  var lower = fore ? L * 1.00 : L * 0.92;
  var pastern = fore ? L * 0.26 : L * 0.52;
  var far = FAR[name];
  var step = foot(offsets()[name], phase, pose.scratch);

  var toeX = ax + step.x * S + (far ? -3 * S : 0);
  var toeY = GROUND - 1 + step.y * S;

  // the paw folds under while it is being carried, rolls over the toe as the
  // leg pushes off, and flattens to meet the ground again
  var fold = step.planted ? (0.42 - step.push) * 0.62 : -0.8;
  var ankleX = toeX - Math.sin(fold) * pastern;
  var ankleY = toeY - Math.cos(fold) * pastern;

  var knee = solveJoint(ax, ay, ankleX, ankleY, upper, lower, FOLD[name], { x: 0, y: 0 });

  var t = P.limb * S * 0.5;
  var top = fore ? t * 1.15 : t * 1.34;
  var mid = fore ? t * 0.74 : t * 0.70;
  var low = fore ? t * 0.56 : t * 0.50;

  limb(pose, ax, ay, knee.x, knee.y, top, mid, far);
  limb(pose, knee.x, knee.y, ankleX, ankleY, mid * 0.94, low, far);
  limb(pose, ankleX, ankleY, toeX, toeY, low, low * 0.86, far);

  // The paw. A fore paw is a round block; a hind paw is longer and narrower,
  // and both tip up over the toe as the leg leaves the ground.
  var roll = step.planted ? -step.push * 0.5 : 0.5;
  var pawLen = (fore ? 1.55 : 1.85) * low;
  limb(pose,
    toeX - Math.cos(roll) * low * 0.5, toeY - Math.sin(roll) * low * 0.5,
    toeX + Math.cos(roll) * pawLen, toeY + Math.sin(roll) * pawLen,
    low * 0.95, low * 0.72, far, "paw");

  bone(pose, ax, ay, knee.x, knee.y, far ? "far" : "near");
  bone(pose, knee.x, knee.y, ankleX, ankleY, far ? "far" : "near");
  bone(pose, ankleX, ankleY, toeX, toeY, far ? "far" : "near");
  joint(pose, ax, ay, far ? "far" : "near", false);
  joint(pose, knee.x, knee.y, far ? "far" : "near", true);
  joint(pose, ankleX, ankleY, far ? "far" : "near", false);

  pose.feet.push({
    x: toeX, y: toeY, planted: step.planted, far: far, load: step.load
  });
  if (step.planted) pose.planted += 1;
}

export function buildPose(phase, pose) {
  pose.shapes.length = 0;
  pose.bones.length = 0;
  pose.joints.length = 0;
  pose.feet.length = 0;
  pose.planted = 0;

  var chest = P.chest * S;
  var back = P.bodyLength * S;
  var rise = bodyRise(phase) * S;
  var pitch = bodyPitch(phase) * S;

  // Where the shoulder joint has to sit for the paw to reach the ground, and
  // where the spine has to sit above that. The plate is emphatic about the
  // proportion: the trunk takes the top half of a standing mastiff and the
  // legs the bottom half, so the spine rides a whole chest-depth above the
  // joint the foreleg hangs off.
  var reach = P.legLength * S * (0.95 + 1.00) * 0.93 + P.legLength * S * 0.26;
  var shoulderX = CENTRE + back * 0.5;
  var hipX = CENTRE - back * 0.5;

  var jointY = GROUND - 1 - reach + rise;
  var shoulderY = jointY - chest * 1.05 + pitch;
  var hipY = shoulderY + P.topline * S - pitch * 1.2;

  // ---------------- the two legs on the far side ----------------
  // pushed first, because everything is painted in the order it is listed and
  // the far side has to end up behind the body
  var foreJointY = shoulderY + chest * 1.05;
  var hipJointY = hipY + chest * 0.95;
  var foreX = shoulderX - chest * 0.34;
  var hindX = hipX + chest * 0.40;

  leg(pose, "hindFar", hindX, hipJointY, phase);
  leg(pose, "foreFar", foreX, foreJointY, phase);

  // ---------------- the trunk ----------------
  // Three capsules that add up to one animal. The back sets the topline and
  // nothing else; the ribcage hangs below it, thick at the chest and thin at
  // the loin, which is where the tuck-up comes from; the brisket is the deep
  // drop at the front that a dog has and a whippet does not.
  // The topline, in two lengths so it can have a shape: the withers are the
  // highest point on the animal, the back sags a little behind them, and the
  // croup falls away to the tail. A dog's back is not a plank.
  var backR = chest * 0.30;
  var saddleX = hipX + back * 0.45;
  var saddleY = (hipY + shoulderY) * 0.5 + chest * 0.08;
  shape(pose, saddleX, saddleY, shoulderX + chest * 0.16, shoulderY,
    backR * 0.90, backR);
  shape(pose, hipX + chest * 0.02, hipY, saddleX, saddleY,
    backR * 0.86, backR * 0.90);

  // the croup, rounding the back end off into the tail instead of leaving the
  // square corner a capsule ends on
  shape(pose, hipX + chest * 0.14, hipY + chest * 0.10,
    hipX - chest * 0.20, hipY + chest * 0.44,
    chest * 0.46, chest * 0.22);

  // The ribs and the loin, as two capsules rather than one. A single tapering
  // barrel gives a belly that slopes evenly from front to back; two of them,
  // overlapping in the middle, put a bend in that line — deep and level under
  // the ribs, then rising sharply behind them. That bend is the tuck-up, and
  // the tuck-up is most of what separates a mastiff from a barrel.
  var mid = (hipX + shoulderX) * 0.5;
  var midY = (hipY + shoulderY) * 0.5;
  shape(pose, mid - back * 0.06, midY + chest * 0.58,
    shoulderX - chest * 0.34, shoulderY + chest * 0.60,
    chest * 0.74, chest * 0.80);
  shape(pose, hipX + chest * 0.12, hipY + chest * 0.22,
    mid + back * 0.06, midY + chest * 0.34,
    chest * 0.44, chest * 0.56);

  // the brisket: forward of centre, and dropping past the elbow
  shape(pose, shoulderX - back * 0.40, shoulderY + chest * 0.70,
    shoulderX - chest * 0.34, shoulderY + chest * 0.74,
    chest * 0.56, chest * 0.66, false, "brisket");

  // the shoulder itself, which is what makes the front of a mastiff heavy
  shape(pose, shoulderX - chest * 0.52, shoulderY + chest * 0.26,
    shoulderX - chest * 0.28, shoulderY + chest * 0.76,
    chest * 0.46, chest * 0.44);

  // The haunch over the hip. It has to stop short of the belly line, or it
  // fills in the tuck-up behind the ribs and the dog goes back to being a
  // sausage on legs.
  shape(pose, hipX + chest * 0.16, hipY + chest * 0.16,
    hipX + chest * 0.56, hipY + chest * 0.28,
    chest * 0.42, chest * 0.38);

  bone(pose, hipX, hipY, shoulderX, shoulderY, "axial");
  joint(pose, hipX, hipY, "axial", false);
  joint(pose, shoulderX, shoulderY, "axial", false);
  joint(pose, hindX, hipJointY, "axial", false);
  joint(pose, foreX, foreJointY, "axial", false);

  // ---------------- the tail ----------------
  // Set low, below the line of the back, and carried down: three joints, each
  // one arriving a little after the one before it, with the last of them
  // lifting so the tip curls up rather than pointing at the floor.
  var seg = back * 0.17;
  var tx = hipX - chest * 0.20;
  var ty = hipY + chest * 0.42;
  var angle = Math.PI - 1.34;
  var thick = [0.24, 0.15, 0.10, 0.06];
  var bend = [0.20, 0.24, 0.30];
  for (var t = 0; t < 3; t++) {
    angle += bend[t] + tailSwing(phase, t / 3) * 0.09 * S;
    var nx = tx + Math.cos(angle) * seg;
    var ny = ty + Math.sin(angle) * seg;
    shape(pose, tx, ty, nx, ny, chest * thick[t], chest * thick[t + 1],
      false, t === 2 ? "tail" : "");
    bone(pose, tx, ty, nx, ny, "axial");
    joint(pose, tx, ty, "axial", false);
    tx = nx;
    ty = ny;
  }

  // ---------------- the legs nearest the viewer ----------------
  leg(pose, "hindNear", hindX, hipJointY, phase);
  leg(pose, "foreNear", foreX, foreJointY, phase);

  // ---------------- the neck and the head ----------------
  // The plate is the argument for all of this. Dread carries his head level
  // with his withers and his nose well below them, on a neck that runs
  // forward and down out of the shoulder. Lift that head and the animal stops
  // being a mastiff and starts being a deer, which is the single change that
  // decides whether the silhouette reads.
  var dip = headDip(phase);
  var head = P.headSize * S;
  var neck = P.neckLength * S;
  var bob = P.headBob * S;

  // The neck runs forward and down out of the withers and is thick where it
  // leaves them, so the throat opens as a notch between it and the front of
  // the chest. That notch is the thing that says which end of the animal you
  // are looking at.
  var neckAngle = 0.40 + dip * 0.06;
  var poll = shoulderX - chest * 0.24;
  var pollY = shoulderY - chest * 0.06 + dip * bob * 0.35;
  var crownX = poll + Math.cos(neckAngle) * neck;
  var crownY = pollY + Math.sin(neckAngle) * neck + dip * bob * 0.55;
  shape(pose, poll, pollY, crownX, crownY, chest * 0.50, head * 0.46);
  bone(pose, poll, pollY, crownX, crownY, "axial");
  joint(pose, poll, pollY, "axial", false);

  // The skull: a heavy block, not more taper off the neck. It runs forward
  // and slightly down, and the nod tips it rather than only sliding it.
  var headAngle = neckAngle - 0.16 + dip * 0.11;
  var browX = crownX + Math.cos(headAngle) * head * 0.62;
  var browY = crownY + Math.sin(headAngle) * head * 0.62;
  shape(pose, crownX, crownY, browX, browY, head * 0.58, head * 0.52, false, "skull");
  bone(pose, crownX, crownY, browX, browY, "axial");
  joint(pose, crownX, crownY, "axial", false);

  // the jaw, hung under the front of the skull, which is what gives the head a
  // stop instead of tapering straight into the nose
  shape(pose, crownX + Math.cos(headAngle) * head * 0.20,
    crownY + Math.sin(headAngle) * head * 0.20 + head * 0.34,
    browX + head * 0.06, browY + head * 0.34,
    head * 0.34, head * 0.30, false, "jaw");

  // the muzzle off the front of the stop, level or dropping, never rising, and
  // blunt at the end rather than tapering to a point
  var muzzleAngle = headAngle + 0.26;
  var noseX = browX + Math.cos(muzzleAngle) * head * 0.46;
  var noseY = browY + Math.sin(muzzleAngle) * head * 0.46;
  shape(pose, browX - Math.cos(muzzleAngle) * head * 0.10,
    browY - Math.sin(muzzleAngle) * head * 0.10 + head * 0.14,
    noseX, noseY + head * 0.06, head * 0.38, head * 0.34, false, "muzzle");
  bone(pose, browX, browY, noseX, noseY, "axial");
  joint(pose, browX, browY, "axial", false);
  joint(pose, noseX, noseY, "axial", false);

  // A drop ear: folded over at the crown and hanging down the cheek, and
  // painted dark whatever the light is doing, because at this size a fold of
  // the same colour as the head beside it is not a fold at all. It has to
  // break the outline of the head downwards, or it reads as a lump on the
  // shoulder rather than as an ear.
  var earBaseX = crownX + Math.cos(headAngle) * head * 0.20;
  var earBaseY = crownY + Math.sin(headAngle) * head * 0.20 - head * 0.34;
  var earA = headAngle + 1.94 - dip * 0.07;
  shape(pose, earBaseX, earBaseY,
    earBaseX + Math.cos(earA) * head * 0.52,
    earBaseY + Math.sin(earA) * head * 0.52,
    head * 0.17, head * 0.11, false, "ear");

  pose.head = {
    x: browX, y: browY, angle: headAngle,
    size: head,
    nose: { x: noseX, y: noseY },
    // set back from the stop and above the muzzle line, on the side of the
    // skull rather than on its outline
    eye: {
      x: browX - Math.cos(headAngle) * head * 0.44 + Math.cos(headAngle - 1.57) * head * 0.20,
      y: browY - Math.sin(headAngle) * head * 0.44 + Math.sin(headAngle - 1.57) * head * 0.20
    }
  };

  pose.rise = rise;
  pose.top = clamp(Math.min(shoulderY, hipY) - chest, 0, GROUND);
  return pose;
}

export function emptyPose() {
  return {
    shapes: [], bones: [], joints: [], feet: [], planted: 0, rise: 0, top: 0,
    head: { x: 0, y: 0, angle: 0, size: 0, nose: { x: 0, y: 0 }, eye: { x: 0, y: 0 } },
    scratch: { x: 0, y: 0, planted: false, push: 0, load: 0 }
  };
}

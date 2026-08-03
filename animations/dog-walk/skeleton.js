"use strict";

import { P, GROUND, CENTRE } from "./state.js";
import { clamp, solveJoint } from "./maths.js";
import { offsets, foot, bodyRise, bodyPitch, headDip, tailSwing } from "./gait.js";

// ---------------------------------------------------------------------
// The rig. Bone lengths come off the knobs, the gait says where each paw has
// to be, and the joints in between are solved for rather than animated: the
// elbow and the stifle are wherever they have to be for the paw to land on
// the mark. Nothing here draws anything.
// ---------------------------------------------------------------------

// Which way each leg folds. A foreleg's elbow points backwards and a hind
// leg's stifle points forwards — the two together are what make a dog's
// silhouette read as a dog rather than as a table.
var FOLD = { hindFar: -1, foreFar: 1, hindNear: -1, foreNear: 1 };

// The two legs on the far side stand a little behind the near ones and are
// drawn in the shade, which is all the depth a side view needs.
var FAR = { hindFar: true, foreFar: true, hindNear: false, foreNear: false };

function bone(list, x0, y0, x1, y1, r0, r1, far, tip) {
  list.push({ x0: x0, y0: y0, x1: x1, y1: y1, r0: r0, r1: r1, far: !!far, tip: tip || "" });
}

// One leg, from the joint it hangs off to the paw on the ground.
function leg(pose, name, ax, ay, phase) {
  var upper = P.legLength;
  var lower = P.legLength * 1.06;
  var pastern = P.legLength * 0.45;
  var far = FAR[name];
  var step = foot(offsets()[name], phase, pose.scratch);

  var toeX = ax + step.x + (far ? -3 : 0);
  var toeY = GROUND - 1 + step.y;

  // the paw folds under while it is being carried, and straightens to meet
  // the ground
  var fold = step.planted ? (0.5 - step.push) * 0.35 : -0.75;
  var ankleX = toeX - Math.sin(fold) * pastern;
  var ankleY = toeY - Math.cos(fold) * pastern;

  var knee = solveJoint(ax, ay, ankleX, ankleY, upper, lower, FOLD[name], { x: 0, y: 0 });

  var thick = P.girth * 0.4;
  bone(pose.bones, ax, ay, knee.x, knee.y, thick, thick * 0.62, far);
  bone(pose.bones, knee.x, knee.y, ankleX, ankleY, thick * 0.58, thick * 0.4, far);
  bone(pose.bones, ankleX, ankleY, toeX, toeY, thick * 0.38, thick * 0.34, far);
  // the paw itself, a stub pointing the way the dog is going
  bone(pose.bones, toeX - 0.8, toeY, toeX + 2, toeY, thick * 0.4, thick * 0.32, far, "paw");

  pose.joints.push({ x: ax, y: ay }, { x: knee.x, y: knee.y }, { x: ankleX, y: ankleY });
  pose.feet.push({ x: toeX, y: toeY, planted: step.planted, far: far });
  if (step.planted) pose.planted += 1;
}

export function buildPose(phase, pose) {
  pose.bones.length = 0;
  pose.joints.length = 0;
  pose.feet.length = 0;
  pose.planted = 0;

  var rise = bodyRise(phase);
  var pitch = bodyPitch(phase);
  var stand = (P.legLength * 2.06) * 0.9 + P.legLength * 0.45;

  var hipX = CENTRE - P.bodyLength * 0.5;
  var shoulderX = CENTRE + P.bodyLength * 0.5;
  var base = GROUND - 1 - stand;
  var shoulderY = base + rise + pitch;
  var hipY = base + rise - pitch + P.lean;

  var girth = P.girth;
  var drop = girth * 0.34;
  var foreX = shoulderX - girth * 0.25;
  var hindX = hipX + girth * 0.3;

  // Everything below is pushed in the order it is painted: the two legs on
  // the far side first, then the body, then the two nearest the viewer, then
  // the head in front of all of it.
  leg(pose, "hindFar", hindX, hipY + drop, phase);
  leg(pose, "foreFar", foreX, shoulderY + drop, phase);

  // ---------------- the trunk ----------------
  // The chest goes down first and the back over the top of it, so the line
  // along the spine is the one that survives where the two overlap. All the
  // depth of the animal hangs below the spine: the back itself stays straight,
  // which is what stops a hump appearing over the shoulder.
  bone(pose.bones, shoulderX - girth * 0.2, shoulderY + girth * 0.55,
    hipX + girth * 1.0, hipY + girth * 0.25, girth * 0.74, girth * 0.3);
  bone(pose.bones, hipX, hipY, shoulderX, shoulderY, girth * 0.82, girth * 0.82);
  pose.joints.push({ x: hipX, y: hipY }, { x: shoulderX, y: shoulderY });

  // ---------------- the tail ----------------
  // Three joints, each one arriving a little after the one before it, so the
  // tail follows the dog rather than being carried by it.
  var seg = P.bodyLength * 0.15;
  var tx = hipX - girth * 0.05;
  var ty = hipY - girth * 0.62;
  var angle = Math.PI - 0.10;
  var thick = [0.32, 0.22, 0.15, 0.09];
  for (var t = 0; t < 3; t++) {
    angle += 0.33 + tailSwing(phase, t / 3) * 0.1;
    var nx = tx + Math.cos(angle) * seg;
    var ny = ty + Math.sin(angle) * seg;
    bone(pose.bones, tx, ty, nx, ny, girth * thick[t], girth * thick[t + 1],
      false, t === 2 ? "tail" : "");
    pose.joints.push({ x: tx, y: ty });
    tx = nx;
    ty = ny;
  }

  // ---------------- the legs nearest the viewer ----------------
  leg(pose, "hindNear", hindX, hipY + drop, phase);
  leg(pose, "foreNear", foreX, shoulderY + drop, phase);

  // ---------------- the neck and the head ----------------
  // The neck lifts forward and up out of the withers, the skull levels off on
  // the end of it and the muzzle drops away from that. The open throat this
  // leaves between the head and the chest is the thing that tells you at a
  // glance which end of the animal you are looking at.
  var dip = headDip(phase);
  var neckAngle = -0.45 + dip * 0.04;
  var neckX = shoulderX + girth * 0.15 + Math.cos(neckAngle) * P.neckLength;
  var neckY = shoulderY - girth * 0.45 + Math.sin(neckAngle) * P.neckLength + dip * 0.35;
  bone(pose.bones, shoulderX - girth * 0.1, shoulderY - girth * 0.3, neckX, neckY,
    girth * 0.68, girth * 0.42);

  // the skull is a short block rather than more taper, which is what stops the
  // head reading as the end of the neck
  var headAngle = neckAngle + 0.55 + dip * 0.02;
  var skull = P.neckLength * 0.46;
  var browX = neckX + Math.cos(headAngle) * skull;
  var browY = neckY + Math.sin(headAngle) * skull;
  bone(pose.bones, neckX, neckY, browX, browY, girth * 0.48, girth * 0.4, false, "skull");

  // an ear, standing up and folding back off the crown, always in shade so it
  // shows against the lit top of the skull
  var earA = headAngle - 2.15;
  var earBaseX = neckX + Math.cos(headAngle) * skull * 0.3;
  var earBaseY = neckY + Math.sin(headAngle) * skull * 0.3;
  bone(pose.bones, earBaseX, earBaseY,
    earBaseX + Math.cos(earA) * girth * 0.58,
    earBaseY + Math.sin(earA) * girth * 0.58,
    girth * 0.36, girth * 0.16, false, "ear");

  // and a muzzle off the front of it, thinner and lighter
  var muzzleAngle = headAngle + 0.18;
  var noseX = browX + Math.cos(muzzleAngle) * P.neckLength * 0.28;
  var noseY = browY + Math.sin(muzzleAngle) * P.neckLength * 0.28;
  bone(pose.bones, browX - Math.cos(muzzleAngle) * 1.5, browY - Math.sin(muzzleAngle) * 1.5,
    noseX, noseY, girth * 0.29, girth * 0.18, false, "muzzle");

  pose.joints.push({ x: neckX, y: neckY }, { x: browX, y: browY }, { x: noseX, y: noseY });
  pose.head = {
    x: browX, y: browY, angle: headAngle,
    nose: { x: noseX, y: noseY },
    // just behind the brow and a little above the muzzle line
    eye: {
      x: browX - Math.cos(headAngle) * girth * 0.45 + Math.cos(headAngle - 1.57) * girth * 0.22,
      y: browY - Math.sin(headAngle) * girth * 0.45 + Math.sin(headAngle - 1.57) * girth * 0.22
    }
  };

  pose.rise = rise;
  pose.top = clamp(Math.min(shoulderY, hipY) - girth * 1.1, 0, GROUND);
  return pose;
}

export function emptyPose() {
  return {
    bones: [], joints: [], feet: [], planted: 0, rise: 0, top: 0,
    head: { x: 0, y: 0, angle: 0, nose: { x: 0, y: 0 }, eye: { x: 0, y: 0 } },
    scratch: { x: 0, y: 0, planted: false, push: 0 }
  };
}

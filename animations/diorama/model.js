"use strict";

// The tower, and how it becomes pixels.
//
// There is no image file anywhere in this animation. `solid(X, Y, Z)` answers
// what stands at one voxel of the model — stone, rock, moss, timber or nothing
// — and everything on the stage is that function asked a few tens of thousands
// of times and projected. Every hash in it is taken on the integer lattice, so
// the same knobs always build the same tower, on any machine, in any order.
//
// It is asked once per rebuild and not once per step. The only thing that moves
// in this picture is the light, and a model rebuilt for a lamp that has turned
// four degrees is a model rebuilt for nothing.

import {
  S,
  PX_X, PX_YX, PX_YY, PX_Z, DEP_Y, VS, ORIGIN_X, ORIGIN_Y, viewDepth,
  GROUND_R, PLINTH_R, PLINTH_H, WALL_OUT, WALL_IN, TOWER_H, TOP_Z, MERLON,
  DOOR_W, DOOR_H, STAIR_H, JOIST_Z, RUIN, RUBBLE
} from "./state.js";
import { VOID, STONE, EARTH, MOSS, TIMBER } from "./palette.js";
import { TAU, clamp, hash01, vnoise3, angleDiff } from "./maths.js";

// ----------------------------- the faces -----------------------------
//
// A height field cannot tell the top of a block from its side: both are flat and
// both come out facing the viewer. Splatting cubes means knowing exactly which
// face of one is being looked at, so the model says, and the light module adds
// what it is told to the relief it works out for itself.
//
// The vectors are in the light module's own frame — screen sideways, depth into
// the picture, height up — and there are eight of them round the compass rather
// than four, because the wall is a circle and a circle quantised to four faces
// lights up in four flat panels.
export var F_TOP = 1;
export var F_E = 2, F_NE = 3, F_N = 4, F_NW = 5;
export var F_W = 6, F_SW = 7, F_S = 8, F_SE = 9;

var D = 0.70710678;

// Every side carries a little upward tilt as well. A wall that faces exactly
// sideways takes nothing at all from a lamp standing above it, and a tower lit
// from above with no tilt in its walls is a lit disc on a black cylinder.
var UP = 0.18;

export var FACES = [];
FACES[F_TOP] = [0, 0, 1.25];
FACES[F_E] = [1, 0, UP];
FACES[F_NE] = [D, D, UP];
FACES[F_N] = [0, 1, UP];
FACES[F_NW] = [-D, D, UP];
FACES[F_W] = [-1, 0, UP];
FACES[F_SW] = [-D, -D, UP];
FACES[F_S] = [0, -1, UP];
FACES[F_SE] = [D, -D, UP];

// (ey + 1) * 3 + (ex + 1) — which way the empty neighbours point
var OCTANT = [F_SW, F_S, F_SE, F_W, F_TOP, F_E, F_NW, F_N, F_NE];

// ----------------------------- the seeds -----------------------------
// Each feature gets its own, so turning the ruin knob does not also reshuffle
// which stones are mossy.
var SEED_RIM = 5;
var SEED_MOUND = 9;
var SEED_CREST = 17;
var SEED_MOSS = 23;
var SEED_RUBBLE = 31;
var SEED_MOTTLE = 43;

// Where the wall has fallen in, and where the door is. Both are bearings, and
// both are chosen against the camera: the break faces east-south-east so the eye
// looks down into the tower through it, and the door faces the camera squarely
// enough to read as a door rather than as a notch.
var BREAK_A = -0.30;
var DOOR_A = -1.65;

// How many cells the crest is cut into. Twenty puts a step about three voxels of
// arc wide, which is the size a course of masonry actually breaks in.
var CREST_CELLS = 20;

// The two joists still in the wall, and where the stair starts and how fast it
// climbs, in radians per voxel of height.
var JOIST_A1 = -2.5;
var JOIST_A2 = 1.2;
var STAIR_A0 = 2.4;
var STAIR_RISE = 0.42;

// How coarse the mottle in the stone is, in voxels to a blotch, and how many
// voxels there are to a course of masonry.
var MOTTLE_CELL = 3;
var COURSE = 3;

// --------------------------- the rock below --------------------------
//
// A disc of ground with a mound of rock on it, flat where the tower stands and
// falling away to nothing before the disc's own edge. The rim of the disc is
// pulled about by a hash on a coarse lattice: a perfect circle reads as a plate
// the model has been stood on, and the whole idea is that this is a piece of a
// place rather than an object on a table.
function rockTop(X, Y) {
  var r = Math.sqrt(X * X + Y * Y);
  var cx = Math.floor(X / 2), cy = Math.floor(Y / 2);
  var edge = GROUND_R * (0.84 + 0.16 * hash01(cx, cy, SEED_RIM));
  if (r > edge) return -1;
  var shelf = WALL_OUT + 2;
  if (r <= shelf) return PLINTH_H;
  var t = (r - shelf) / Math.max(1, PLINTH_R - shelf);
  var top = PLINTH_H * (1 - t) + (hash01(cx, cy, SEED_MOUND) - 0.4) * 1.8 * S;
  return top < 0 ? 0 : Math.round(top);
}

// --------------------------- the wall above --------------------------
//
// A hollow cylinder with three things taken out of it and one thing added: a
// bite where it has collapsed, a doorway, a slit above the doorway, and
// merlons on whatever is left standing high enough to have kept them.
function crestAt(a, cell) {
  // one broad collapse rather than an even nibbling all round. A ruin eroded
  // uniformly reads as a wall that was built low.
  var bite = Math.cos(clamp(angleDiff(a, BREAK_A) * 1.35, -Math.PI / 2, Math.PI / 2));
  if (bite < 0) bite = 0;
  var cut = RUIN * (TOWER_H * 0.55 * bite + 3.5 * S * hash01(cell, 3, SEED_CREST));
  var top = TOP_Z - cut;
  // merlons survive only where the wall did. Putting them on a broken edge is
  // the one detail that makes a ruin look like a toy.
  if (cut < 1.2 * S && (cell & 1) === 0 && hash01(cell, 5, SEED_CREST) > 0.25) {
    top += MERLON;
  }
  return top;
}

function towerAt(X, Y, Z) {
  if (Z < PLINTH_H) return VOID;
  var r = Math.sqrt(X * X + Y * Y);
  if (r > WALL_OUT || r < WALL_IN - 1) return VOID;
  var a = Math.atan2(Y, X);
  var cell = Math.floor((a + Math.PI) / TAU * CREST_CELLS) % CREST_CELLS;
  if (Z > crestAt(a, cell)) return VOID;

  // the outside of a dry wall is not a cylinder: a course here and there has
  // spalled off, and that is what the light has to catch to read as stone
  var out = WALL_OUT - (hash01(cell, Z, SEED_CREST) < 0.22 ? 1 : 0);
  if (r > out || r < WALL_IN) return VOID;

  var zz = Z - PLINTH_H;
  var along = angleDiff(a, DOOR_A) * WALL_OUT;

  // the doorway: square jambs to the springing line, a half round above it
  if (Math.abs(along) <= DOOR_W && zz <= DOOR_H) {
    var spring = DOOR_H - DOOR_W;
    if (zz <= spring) return VOID;
    if (along * along + (zz - spring) * (zz - spring) <= DOOR_W * DOOR_W) return VOID;
  }
  // and the slit above it
  if (Math.abs(along) <= Math.max(0.9, 0.9 * S) &&
      zz >= DOOR_H + 3 * S && zz <= DOOR_H + 8 * S) {
    return VOID;
  }

  return STONE;
}

// Two joists left in the wall where a floor used to be, poking out of both faces
// of it. They are here to be lit: a beam standing proud of a wall is the only
// thing in the model that casts a shadow across a flat surface behind it.
function timberAt(X, Y, Z) {
  if (Z - PLINTH_H !== JOIST_Z) return VOID;
  var r = Math.sqrt(X * X + Y * Y);
  if (r < WALL_IN - 2 || r > WALL_OUT + 2) return VOID;
  var a = Math.atan2(Y, X);
  // a joist stops where the wall it was set into stopped. Left in over a
  // collapsed course it hangs in mid-air, and one floating beam undoes the
  // whole reading of the thing as masonry.
  var cell = Math.floor((a + Math.PI) / TAU * CREST_CELLS) % CREST_CELLS;
  if (Z > crestAt(a, cell)) return VOID;
  if (Math.abs(angleDiff(a, JOIST_A1)) * r < 1.1 * S) return TIMBER;
  if (Math.abs(angleDiff(a, JOIST_A2)) * r < 1.1 * S) return TIMBER;
  return VOID;
}

// A fragment of the stair that wound up the inside. It stops where the wall it
// was built into stops, which is why there is any of it left to see.
function stairAt(X, Y, Z) {
  var zz = Z - PLINTH_H;
  if (zz < 1 || zz > STAIR_H) return VOID;
  var r = Math.sqrt(X * X + Y * Y);
  if (r > WALL_IN - 0.2 || r < WALL_IN - 3.4 * S) return VOID;
  var want = STAIR_A0 + zz * STAIR_RISE;
  if (Math.abs(angleDiff(Math.atan2(Y, X), want)) > 0.5) return VOID;
  return STONE;
}

// What came off the wall, lying where it fell. Scattered on a lattice rather
// than from a list, so the scatter costs nothing to look up at any one voxel and
// the knob can thin it out without the survivors moving.
function rubbleAt(X, Y, Z) {
  if (RUBBLE <= 0) return VOID;
  var r = Math.sqrt(X * X + Y * Y);
  if (r < WALL_OUT + 1 || r > GROUND_R) return VOID;
  var cell = Math.max(2, Math.round(3 * S));
  var cx = Math.floor(X / cell), cy = Math.floor(Y / cell);
  if (hash01(cx, cy, SEED_RUBBLE) > RUBBLE * 0.5) return VOID;

  var size = 1 + (hash01(cx, cy, SEED_RUBBLE + 1) < 0.45 ? Math.max(1, Math.round(S)) : 0);
  var room = cell - size;
  var ox = cx * cell + Math.floor(hash01(cx, cy, SEED_RUBBLE + 2) * (room + 1));
  var oy = cy * cell + Math.floor(hash01(cx, cy, SEED_RUBBLE + 3) * (room + 1));
  if (X < ox || X >= ox + size || Y < oy || Y >= oy + size) return VOID;

  var base = rockTop(ox, oy);
  if (base < 0) return VOID;
  var tall = 1 + (hash01(cx, cy, SEED_RUBBLE + 4) < 0.4 ? Math.max(1, Math.round(S)) : 0);
  if (Z <= base || Z > base + tall) return VOID;
  return hash01(cx, cy, SEED_RUBBLE + 5) < 0.7 ? STONE : EARTH;
}

// Moss is a material, not a tint. It holds where the light rarely reaches — the
// north side, and low down out of the weather — and because it is its own ramp
// it stays green under the lamp instead of going tan with the stone around it.
function mossed(X, Y, Z, m) {
  if (m !== STONE && m !== EARTH) return m;
  var north = Math.cos(Math.atan2(Y, X) - 1.9);
  var low = 1 - clamp((Z - PLINTH_H) / Math.max(1, TOWER_H * 0.5), 0, 1);
  var want = 0.28 * north + 0.26 * low;
  if (want <= 0.24) return m;
  return vnoise3(X, Y, Z, 3.5 * S, SEED_MOSS) < want * 0.85 ? MOSS : m;
}

export function solid(X, Y, Z) {
  if (Z < 0) return VOID;
  var m = timberAt(X, Y, Z);
  if (m !== VOID) return m;
  m = towerAt(X, Y, Z);
  if (m !== VOID) return mossed(X, Y, Z, m);
  m = stairAt(X, Y, Z);
  if (m !== VOID) return m;
  m = rubbleAt(X, Y, Z);
  if (m !== VOID) return mossed(X, Y, Z, m);
  var top = rockTop(X, Y);
  if (top >= 0 && Z <= top) return mossed(X, Y, Z, EARTH);
  return VOID;
}

function faceOf(X, Y, Z) {
  // anything with sky above it is a top, whatever else is missing beside it. In
  // a view from above that is what is being looked at, and calling the crest of
  // a wall a side face lights the one horizontal surface in the picture as if it
  // were vertical.
  if (solid(X, Y, Z + 1) === VOID) return F_TOP;
  var ex = 0, ey = 0;
  if (solid(X + 1, Y, Z) === VOID) ex += 1;
  if (solid(X - 1, Y, Z) === VOID) ex -= 1;
  if (solid(X, Y + 1, Z) === VOID) ey += 1;
  if (solid(X, Y - 1, Z) === VOID) ey -= 1;
  return OCTANT[(ey + 1) * 3 + (ex + 1)];
}

// ------------------------------ the splat ----------------------------
//
// Every voxel of every part, projected into its block, keeping whichever sample
// is nearest the eye. The depth is kept in a scratch buffer of its own rather
// than inferred from the height, because two things at the same height are
// exactly the case a height cannot separate — the far rim of the crest and the
// near one are the same distance up and a whole tower apart.

function part(x0, x1, y0, y1, z0, z1) {
  return { x0: x0, x1: x1, y0: y0, y1: y1, z0: z0, z1: z1 };
}

// Two boxes rather than one. The ground is wide and flat, the tower is narrow
// and tall, and one box round both of them is four times the voxels for the same
// picture. Where they overlap a voxel is simply visited twice and the depth test
// keeps the same winner both times.
function boxes() {
  var g = GROUND_R + 1;
  var w = WALL_OUT + 2;
  return [
    part(-g, g, -g, g, 0, PLINTH_H + 3 + Math.round(2 * S)),
    part(-w, w, -w, w, PLINTH_H, TOP_Z + MERLON + 1)
  ];
}

export function buildModel(field, gainMap, edge, depthOf) {
  var w = field.width, h = field.height;
  var mat = field.mat, hgt = field.hgt, dep = field.dep, face = field.face;
  var list = boxes();
  var i, b, X, Y, Z, m, f, px, py, d, ox, oy, x, y, mottle;

  field.clearAll();
  gainMap.fill(1);
  edge.fill(0);
  depthOf.fill(1e9);

  for (b = 0; b < list.length; b++) {
    var box = list[b];
    for (Z = box.z0; Z <= box.z1; Z++) {
      for (Y = box.y0; Y <= box.y1; Y++) {
        px = ORIGIN_X + PX_YX * Y + PX_X * box.x0;
        py = ORIGIN_Y - PX_Z * Z - PX_YY * Y;
        // a whole row of the box is off the stage more often than not, and the
        // cheapest voxel is the one never asked about
        if (py + VS <= 0 || py >= h) continue;
        for (X = box.x0; X <= box.x1; X++, px += PX_X) {
          if (px + VS <= 0 || px >= w) continue;
          m = solid(X, Y, Z);
          if (m === VOID) continue;
          d = viewDepth(X, Y, Z);
          f = -1;
          mottle = -1;
          for (oy = 0; oy < VS; oy++) {
            y = py + oy;
            if (y < 0 || y >= h) continue;
            for (ox = 0; ox < VS; ox++) {
              x = px + ox;
              if (x < 0 || x >= w) continue;
              i = y * w + x;
              if (d >= depthOf[i]) continue;
              if (f < 0) {
                f = faceOf(X, Y, Z);
                // the mottle is read on the model's own coordinates, so it sits
                // on the block rather than on the screen the block landed on
                mottle = (m === STONE || m === EARTH)
                  ? 0.68 + 0.58 * vnoise3(X, Y, Z, MOTTLE_CELL * S, SEED_MOTTLE)
                  : 0.88 + 0.24 * vnoise3(X, Y, Z, MOTTLE_CELL * S, SEED_MOTTLE);
                // The bed joints. A wall is laid in courses and the mortar
                // between them is recessed, but a recess of a voxel is invisible
                // to a height field — the joint is at the same height as the
                // stone, only further in. So the courses are baked as gain
                // rather than as shape, which is also the only version of them
                // that survives the light coming from any direction at all.
                if (m === STONE && Z > PLINTH_H && (Z - PLINTH_H) % COURSE === 0) {
                  mottle *= 0.74;
                }
              }
              depthOf[i] = d;
              mat[i] = m;
              hgt[i] = PX_Z * Z;
              dep[i] = DEP_Y * Y;
              face[i] = f;
              gainMap[i] = mottle;
            }
          }
        }
      }
    }
  }

  fillPinholes(field, gainMap, depthOf);
  occlude(field, gainMap, depthOf);
  markEdges(field, edge);
}

// A voxel a step further into the picture lands one pixel right and one pixel
// up, so a surface receding from the eye is drawn as a staircase — and a
// staircase of two-pixel blocks can leave a single pixel of void showing through
// at the inside of a corner. One pass closes them, taking whichever neighbour is
// nearest so the hole is filled by the surface it was a hole in.
function fillPinholes(field, gainMap, depthOf) {
  var w = field.width, h = field.height;
  var mat = field.mat, hgt = field.hgt, dep = field.dep, face = field.face;
  var air = field.air;
  var x, y, i, k, best, at, n;
  var off = [-1, 1, -w, w];
  for (y = 1; y < h - 1; y++) {
    for (x = 1; x < w - 1; x++) {
      i = y * w + x;
      if (mat[i] !== air) continue;
      best = 1e9;
      at = -1;
      for (k = 0; k < 4; k++) {
        n = i + off[k];
        if (mat[n] === air) break;
        if (depthOf[n] < best) { best = depthOf[n]; at = n; }
      }
      if (k < 4 || at < 0) continue;
      mat[i] = mat[at];
      hgt[i] = hgt[at];
      dep[i] = dep[at];
      face[i] = face[at];
      gainMap[i] = gainMap[at];
    }
  }
}

// Crevice occlusion, baked once: a small blur of the height field, minus the
// height itself. Where a pixel sits lower than everything around it — the joint
// between the wall and the rock, the inside of a broken course — it is in a
// crack, and a crack is darker than the surface it is in whatever the lamp is
// doing. Doing it here rather than per step costs one pass per rebuild and
// nothing at all afterwards.
var AO_R = 2;
var AO_K = 0.09;
var AO_FLOOR = 0.45;

function occlude(field, gainMap, scratch) {
  var w = field.width, h = field.height;
  var mat = field.mat, hgt = field.hgt;
  var air = field.air;
  var x, y, i, dx, dy, n, sum, count, ao;

  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      i = y * w + x;
      if (mat[i] === air) { scratch[i] = 0; continue; }
      sum = 0;
      count = 0;
      for (dy = -AO_R; dy <= AO_R; dy++) {
        if (y + dy < 0 || y + dy >= h) continue;
        for (dx = -AO_R; dx <= AO_R; dx++) {
          if (x + dx < 0 || x + dx >= w) continue;
          n = i + dy * w + dx;
          // air is not a neighbour that shades anything. Counting it would put
          // a dark line round every silhouette, which is the opposite of what a
          // crack is.
          if (mat[n] === air) continue;
          sum += hgt[n];
          count += 1;
        }
      }
      scratch[i] = count ? sum / count : hgt[i];
    }
  }

  for (i = 0; i < w * h; i++) {
    if (mat[i] === air) continue;
    ao = 1 - (scratch[i] - hgt[i]) * AO_K;
    if (ao > 1) ao = 1;
    else if (ao < AO_FLOOR) ao = AO_FLOOR;
    gainMap[i] *= ao;
  }
}

// The top pixel of every silhouette against the void. It is where a lit crest
// catches a hard line of light, and working it out here means the emitter that
// draws that line costs one array read.
function markEdges(field, edge) {
  var w = field.width, h = field.height;
  var mat = field.mat;
  var air = field.air;
  var x, y, i;
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      i = y * w + x;
      if (mat[i] === air) continue;
      if (y === 0 || mat[i - w] === air) edge[i] = 1;
    }
  }
}

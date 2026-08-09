"use strict";

// ---------------------------------------------------------------------
// Twenty-eight colours, and nothing on the stage may use a twenty-ninth. This
// object is handed to the GIF writer as the file's colour table, so a colour
// mixed at drawing time would either be quantised back to one of these or push
// the table past what the encoder was given. Everything is banded rather than
// blended, and where a value falls between two bands the dither carries it.
//
// There is one lamp and it is warm, so every ramp runs cold at the bottom and
// warm at the top: a stone the lamp has not reached is blue-grey because that
// is the shade its own ramp starts on, and the same stone under the lamp is tan
// because that is where its ramp ends. Nothing anywhere in this animation mixes
// a lit colour with a lamp colour — there is no colour mixer to mix them with.
// Temperature is a property of the ramp, and the light only decides how far up
// it a pixel has climbed.
//
// The darkest shade of every lit material is a colour somebody chose, never
// black. A shadow made by turning a material down to nothing is a hole in the
// picture; a shadow made by reading the cold end of the material's own ramp is
// still stone.
// ---------------------------------------------------------------------
export var C = {
  // the void the diorama floats in, and the stage background behind everything
  void: 0x07060c,

  // light in the air: the haze under the lamp, then the halo, then the rim of
  // the halo — which is also the crest a lit edge catches, because they are the
  // same brightness of the same warm light
  airDim: 0x110e1e,
  airLit: 0x30253c,
  rim: 0xf7dca6,

  // stone, cold to warm, five steps. The extra step over the four the other
  // animations use is spent low down: most of this picture is stone the lamp is
  // some way from, and that is where a missing step shows.
  stoneInk: 0x101320,
  stone0: 0x212634,
  stone1: 0x45444e,
  stone2: 0x776552,
  stoneHot: 0xbf9a6a,

  // the rock the tower stands on, and the earth around it
  earth0: 0x0e0c14,
  earth1: 0x241f2b,
  earth2: 0x4c3d38,
  earth3: 0x7a5c3e,

  // moss, which is the one thing here that stays green rather than going warm
  moss0: 0x101a18,
  moss1: 0x1d3227,
  moss2: 0x3a5333,
  moss3: 0x6d7a3e,

  // the joists left in the wall
  timber0: 0x161119,
  timber1: 0x2f2029,
  timber2: 0x543323,
  timber3: 0x8c5a2e,

  // the lamp itself, drawn as an emitter and never lit by anything
  flameCore: 0xfff4d2,
  flameMid: 0xffc463,
  flameEdge: 0xe07a2c,
  flameSoot: 0x8a3f16,

  // motes in the lamplight, cold when they are out at the edge of it
  dust: 0x50485c,
  dustHot: 0xa98a5e,

  // darker than the void: the vignette, and nothing else
  ink: 0x030206
};

// ---------------------------------------------------------------------
// What a pixel is made of, decided before anything is lit.
//
// VOID is zero so clearing the material buffer is a plain fill, and the bottom
// of its ramp is CLEAR: air with no light in it draws nothing at all and lets
// the backdrop through, which is how the void stays the void and how a halo
// brightens the dark it is drawn on.
// ---------------------------------------------------------------------
export var CLEAR = -1;

export var VOID = 0;
export var STONE = 1;
export var EARTH = 2;
export var MOSS = 3;
export var TIMBER = 4;

// Ramps do not have to be the same length. Stone gets five steps because it is
// most of the picture; the rest get four; air gets four because a halo with
// three steps has a visible edge. The light module reads whatever length it is
// handed and quotes its levels so that a source calibrated against one ramp
// lands in the same place on another.
export var RAMP = [];
RAMP[VOID] = [CLEAR, C.airDim, C.airLit, C.rim];
RAMP[STONE] = [C.stoneInk, C.stone0, C.stone1, C.stone2, C.stoneHot];
RAMP[EARTH] = [C.earth0, C.earth1, C.earth2, C.earth3];
RAMP[MOSS] = [C.moss0, C.moss1, C.moss2, C.moss3];
RAMP[TIMBER] = [C.timber0, C.timber1, C.timber2, C.timber3];

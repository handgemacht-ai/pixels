"use strict";

// ---------------------------------------------------------------------
// Twenty-nine colours, and nothing on the stage may use a thirtieth. This
// object is not a suggestion: it is handed to the GIF writer as the file's
// colour table, so a colour mixed at drawing time would either be quantised
// back to one of these or push the table past what the encoder was given.
// Everything is therefore banded rather than blended, and where a value falls
// between two bands the dither in maths.js carries it.
//
// The scene is lit from below and behind: sodium lamps, headlamps and tail
// lamps are the only sources, so warmth means near and cold means far. The sky
// runs cool, the road runs warm, and the four neon hues appear nowhere except
// on the signs themselves and the single ring of halo around them — which is
// what keeps a pink sign from reading as part of the road.
// ---------------------------------------------------------------------
export var C = {
  skyDeep: 0x0b0a1e,     // the top of the sky, and the stage background
  skyMid: 0x141a33,      // the middle band
  skyLow: 0x1f2647,      // the band the city stands against
  glow: 0x3a3055,        // the hump of light the city pushes into the sky
  star: 0x8f9ad0,        // the fifty specks the glow has not washed out

  cityFar: 0x171a2e,     // towers behind the road, lighter because further off
  cityNear: 0x0e1020,    // the block beside the road, nearly a silhouette
  window: 0x4a5891,      // an office left on, seen cold and small
  windowLit: 0xbfa46b,   // the few that are warm

  neonPink: 0xff4d8d,
  neonCyan: 0x35e0e8,
  neonAmber: 0xffb03a,
  neonViolet: 0x9a5cff,
  hot: 0xfff3d0,         // the middle of a lamp, and the top of the car ramp

  road: 0x16161f,        // asphalt with nothing on it
  roadLit: 0x2b2830,     // the outer skirt of a pool
  roadGlow: 0x4e4438,    // inside a pool
  roadHot: 0x8a7346,     // directly under a lamp
  lane: 0x6d6a5c,        // paint in the dark
  laneLit: 0xe8dcae,     // paint under a lamp, which is what makes it read

  carDark: 0x1a1526,     // the underside of anything
  carBody: 0x3b2f4e,
  carLit: 0x7a6a86,
  carGlass: 0x25405e,    // glass takes the sky, not the lamps
  beam: 0xc9b070,        // air thick enough to see the light in it
  beamFaint: 0x6a5f45,   // the outer skirt of that
  tail: 0xd8324a,
  tailFaint: 0x6e1f2e,
  ink: 0x05050a          // the outline, and the shadow under everything
};

// The four hues a sign is allowed to be lit in, in the order the sign lattice
// indexes them.
export var NEON = [C.neonPink, C.neonCyan, C.neonAmber, C.neonViolet];

// ---------------------------------------------------------------------
// What a pixel is made of, decided before anything is lit. A car standing
// inside a lamp's pool must climb its own ramp — darker paint to lit paint to
// a hot rim — rather than have the pool's amber laid over it like a film, so
// the material pass writes one of these ids into every pixel and the light
// pass never touches colour at all.
//
// AIR is zero so clearing the buffer is a plain fill, and its bottom band is
// CLEAR: air with no light in it draws nothing and lets the backdrop through.
// ---------------------------------------------------------------------
export var CLEAR = -1;

export var AIR = 0;
export var ROAD = 1;
export var LANE = 2;
export var EDGE = 3;       // median, kerb, shoulder, gravel: ground, not road
export var CAR = 4;
export var GLASS = 5;
export var WHEEL = 6;
export var POLE = 7;
export var RAIL = 8;
export var TRAFFIC = 9;    // the oncoming cars, small and never detailed
export var TAILROAD = 10;  // road standing in a red pool rather than an amber one

// Four levels each, darkest first. The resolve pass reads one of these with a
// level between 0 and 3 worked out from how much light landed on the pixel, so
// every material brightens along its own colours: asphalt goes amber, paint
// goes white, glass stays blue, a wheel stays black until it is almost under
// the lamp.
export var RAMP = [];
RAMP[AIR] = [CLEAR, C.beamFaint, C.beamFaint, C.beam];
RAMP[ROAD] = [C.road, C.roadLit, C.roadGlow, C.roadHot];
RAMP[LANE] = [C.lane, C.lane, C.laneLit, C.laneLit];
RAMP[EDGE] = [C.ink, C.road, C.roadLit, C.roadGlow];
RAMP[CAR] = [C.carDark, C.carBody, C.carLit, C.hot];
RAMP[GLASS] = [C.ink, C.carGlass, C.carGlass, C.carLit];
RAMP[WHEEL] = [C.ink, C.ink, C.carDark, C.carBody];
RAMP[POLE] = [C.ink, C.carDark, C.carBody, C.carLit];
RAMP[RAIL] = [C.ink, C.carDark, C.carBody, C.carBody];
RAMP[TRAFFIC] = [C.carDark, C.carBody, C.carLit, C.carLit];
RAMP[TAILROAD] = [C.road, C.tailFaint, C.tailFaint, C.tail];

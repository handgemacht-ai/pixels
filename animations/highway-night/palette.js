"use strict";

// ---------------------------------------------------------------------
// Forty colours, and nothing on the stage may use a forty-first. This object
// is not a suggestion: it is handed to the GIF writer as the file's colour
// table, so a colour mixed at drawing time would either be quantised back to
// one of these or push the table past what the encoder was given. Everything
// is therefore banded rather than blended, and where a value falls between two
// bands the dither in maths.js carries it.
//
// The scene is lit from below and behind: sodium lamps, headlamps and tail
// lamps are the only sources, so warmth means near and cold means far. The sky
// runs cool, the road runs warm, and the four neon hues appear nowhere except
// on the signs themselves and the halo around them — which is what keeps a
// pink sign from reading as part of the road.
//
// Where a colour has a dimmer twin — the neon hues, the two ends of the beam
// ramp, the red on the road — the twin is not decoration. A halo has to fall
// off, and a table with one step in a colour can only fall off by taking
// pixels away; a table with three can fall off by getting dimmer, which is
// what light actually does and what an ordered dither on its own cannot say.
// ---------------------------------------------------------------------
export var C = {
  skyDeep: 0x0b0a1e,     // the top of the sky, and the stage background
  skyMid: 0x141a33,      // the middle tone
  skyLow: 0x1f2647,      // the tone the city stands against
  skyHaze: 0x554058,     // dirty air over the city, a few rows up
  skyEmber: 0x7a5a3a,    // the same air on the horizon, where it is all sodium
  glow: 0x3a3055,        // where that layer gives out into the sky above it
  star: 0x8f9ad0,        // the specks the glow has not washed out

  cityHaze: 0x1e2440,    // the furthest row of towers, and so the palest
  cityFar: 0x171a2e,     // towers behind the road, lighter because further off
  cityNear: 0x0e1020,    // the block beside the road, nearly a silhouette
  window: 0x4a5891,      // an office left on, seen cold and small
  windowLit: 0xbfa46b,   // the few that are warm

  neonPink: 0xff4d8d,
  neonPinkDim: 0x7a2649,
  neonCyan: 0x35e0e8,
  neonCyanDim: 0x1a6a72,
  neonAmber: 0xffb03a,
  neonAmberDim: 0x7a5320,
  neonViolet: 0x9a5cff,
  neonVioletDim: 0x4a2b7a,
  hot: 0xfff3d0,         // the middle of a lamp, and the top of the car ramp

  road: 0x16161f,        // asphalt with nothing on it
  // The lit steps of the asphalt run cooler than sodium alone would make them.
  // Wet tarmac under a lamp is not a warm surface: it is a cold surface with a
  // warm light on it, and the sky it is also reflecting pulls every step back
  // towards violet. Warmed the whole way up, the road read as sand rather than
  // as road.
  roadLit: 0x2a2833,     // the outer skirt of a pool
  roadGlow: 0x494049,    // inside a pool
  roadHot: 0x7d6d5e,     // directly under a lamp
  roadSheen: 0x9a8a78,   // the few pixels a head is standing straight over
  lane: 0x6d6a5c,        // paint in the dark
  laneLit: 0xe8dcae,     // paint under a lamp, which is what makes it read

  carDark: 0x1a1526,     // the underside of anything
  carBody: 0x3b2f4e,
  carLit: 0x7a6a86,
  carGlass: 0x25405e,    // glass takes the sky, not the lamps
  beamDim: 0x4a3520,     // the far skirt of a halo, where it meets the sky
  beamFaint: 0x6a5f45,   // the outer skirt of that
  beamGlow: 0xa8813a,
  beam: 0xc9b070,        // air thick enough to see the light in it
  tail: 0xd8324a,
  tailGlow: 0x8f2a2e,
  tailFaint: 0x6e1f2e,
  ink: 0x05050a          // the outline, and the shadow under everything
};

// The four hues a sign is allowed to be lit in, in the order the sign lattice
// indexes them, and the dimmer twin of each. The tube is the hue; everything
// around it is the twin, so that a halo is a colour of its own rather than a
// thinning of the tube's.
export var NEON = [C.neonPink, C.neonCyan, C.neonAmber, C.neonViolet];

export var NEON_DIM = [C.neonPinkDim, C.neonCyanDim, C.neonAmberDim, C.neonVioletDim];

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
export var SHADOW = 11;    // road with something standing over it
export var FARROAD = 12;   // the oncoming carriageway, which is the same road further off

// Steps enough to climb, darkest first. The resolve pass reads one of these
// with a level worked out from how much light landed on the pixel, so every
// material brightens along its own colours: asphalt goes amber, paint goes
// white, glass stays blue, a wheel stays black until it is almost under the
// lamp.
//
// Four steps is the fewest that reads as a ramp and it is what most of these
// have. Three of them have five, and the three are the ones a halo has to
// travel down: the air a beam is crossing, the asphalt under a head, and the
// asphalt behind a tail lamp. On four steps a light ends — one step of skirt
// and then the dark — and a light in a photograph does not end. It has a tight
// core and a long faint edge, and the edge is most of what the eye reads as
// brightness. The fifth step is that edge, and how long a ramp is is read off
// the ramp rather than declared anywhere, so lengthening one is adding a colour
// to it and nothing else.
export var RAMP = [];
RAMP[AIR] = [CLEAR, C.beamDim, C.beamFaint, C.beamGlow, C.beam];
RAMP[ROAD] = [C.road, C.roadLit, C.roadGlow, C.roadHot, C.roadSheen];
RAMP[LANE] = [C.lane, C.lane, C.laneLit, C.laneLit];
RAMP[EDGE] = [C.ink, C.road, C.roadLit, C.roadGlow];
RAMP[CAR] = [C.carDark, C.carBody, C.carLit, C.hot];
RAMP[GLASS] = [C.ink, C.carGlass, C.carGlass, C.carLit];
RAMP[WHEEL] = [C.ink, C.carDark, C.carDark, C.carBody];
RAMP[POLE] = [C.ink, C.carDark, C.carBody, C.carLit];
RAMP[RAIL] = [C.ink, C.carDark, C.carBody, C.carBody];
RAMP[TRAFFIC] = [C.carDark, C.carBody, C.carLit, C.carLit];
RAMP[TAILROAD] = [C.road, C.tailFaint, C.tailGlow, C.tail];

// Shade is not a darker colour laid over the road. It is the same road with a
// rung taken off the bottom of its ladder and the top of it out of reach: it
// starts where lit asphalt starts and stops two rungs below where the road it
// lies on stops, so a car driving through a pool drags a patch that stays
// behind the road it is on however bright that road becomes. Laying a grey over the asphalt
// instead would have needed a colour of its own and would have gone flat the
// moment a lamp passed overhead.
RAMP[SHADOW] = [C.road, C.road, C.roadLit, C.roadGlow];
// The far carriageway borrows it. Distance in a side elevation is which band a
// thing is drawn in, and the cheapest true thing to say about the carriageway
// eighty pixels away is that the same lamps reach it one step less well.
RAMP[FARROAD] = RAMP[SHADOW];

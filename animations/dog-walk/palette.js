"use strict";

// ---------------------------------------------------------------------
// Eight colours, and nothing on the stage may use a ninth. Three of them
// carry the whole coat — a lit top, a body tone and an underside — which is
// the entire shading model: a pixel picks one of the three from which way the
// limb it belongs to is facing.
// ---------------------------------------------------------------------
export var C = {
  night: 0x15131f,    // behind everything
  earth: 0x241f2e,    // the ground the dog is walking on
  ink: 0x0a0810,      // outline, eye, nose, the grit in the ground
  shadow: 0x6a4832,   // undersides, and the two legs on the far side
  coat: 0xa87048,     // the body
  coatLit: 0xd6a468,  // wherever the light lands
  cream: 0xf4e0bc,    // muzzle, chest, the tip of the tail
  bone: 0x58e0c8      // the skeleton, when it is switched on
};

// The three tones the coat is made of, coolest first. A limb pointing away
// from the light takes the first, one facing it takes the last.
export var COAT = [C.shadow, C.coat, C.coatLit];

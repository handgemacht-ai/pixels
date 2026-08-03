"use strict";

// ---------------------------------------------------------------------
// Eight colours, and nothing on the stage may use a ninth. Four of them carry
// the whole animal: the two legs on the far side are painted in one flat tone
// so they sit behind the near ones, and the three left over shade everything
// in front — a lit top, a body tone, and an underside.
// ---------------------------------------------------------------------
export var C = {
  night: 0x15131f,    // behind everything
  earth: 0x241f2e,    // the ground the dog is walking on
  ink: 0x0a0810,      // outline, eye, nose, the grit in the ground
  far: 0x4a3122,      // the two legs on the far side of the animal
  shadow: 0x6a4832,   // undersides, and the lit part of the far legs
  coat: 0xa87048,     // the body
  coatLit: 0xd6a468,  // wherever the light lands
  cream: 0xf4e0bc     // the four white feet
};

// The three tones the near side of the coat is made of, coolest first.
export var COAT = [C.shadow, C.coat, C.coatLit];

// The overlay is instrumentation rather than part of the picture, so it is
// allowed colours the animal is not. Each part of the rig gets its own, which
// is the only way a tangle of thirty bones reads as four legs and a spine.
export var BONE = {
  axial: 0xffd39a,    // spine, neck, skull, tail: the line down the middle
  near: 0x58e0c8,     // the two legs nearest the viewer
  far: 0x2b7e73,      // the two on the far side, dimmer so they stay behind
  solved: 0xffffff,   // the joints that were worked out rather than animated
  planted: 0xff7a4d   // a paw with weight on it
};

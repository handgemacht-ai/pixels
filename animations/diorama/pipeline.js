"use strict";

// The pipeline, said out loud.
//
// Every stage below already exists in this animation: a buffer the model wrote,
// a field a source added into, a frame the resolve produced. What is new here is
// only that they are named, put in the order they actually run in, and told
// apart by how each one should be looked at — a material id is a category and
// wants flat colours, a height is a number and wants a grey, a normal is three
// numbers and wants all three channels, and light from one source is a magnitude
// whose interesting part is the bottom two per cent of its range.
//
// Nothing in this file is read while a frame is being drawn. It is a
// declaration: the panel reads it, the drawing path hands over the buffers it
// names, and neither of them knows anything about the other beyond the ids.

import { C } from "./palette.js";

// What a material id is drawn as. These are the scene's own colours rather than
// a scale invented for the panel, so the material map is recognisably the same
// tower as the stage — the doorway is a hole in the stone, the mound reads as
// earth, and the moss is where the moss is.
var MATERIALS = [C.void, C.stone1, C.earth2, C.moss2, C.timber2];

// The nine faces, in the order model.js numbers them. A face id is a compass
// bearing and nothing else, so what these colours have to be is distinguishable
// from each other — but they are still drawn out of the palette, because a
// twenty-ninth colour on this page would be the panel inventing one.
var FACE_COLOURS = [
  C.void,        // 0 · nothing
  C.stoneHot,    // top
  C.flameMid,    // east
  C.timber3,     // north-east
  C.moss2,       // north
  C.moss1,       // north-west
  C.stone0,      // west
  C.earth1,      // south-west
  C.earth3,      // south
  C.stone2       // south-east
];

export var PIPELINE = {
  nodes: [
    // ------------------------- the rebuild ---------------------------
    { id: "solid", label: "solid()", kind: "code", source: "model.js", when: "rebuild",
      note: "solid(X, Y, Z) — asked once per voxel of two boxes, and it answers stone, rock, " +
        "moss, timber or nothing. There is no image file anywhere behind it.",
      legend: "the whole model is one function and a projection" },

    { id: "mat", label: "material", kind: "index", source: "model.js", when: "rebuild",
      colours: MATERIALS,
      legend: "void · stone · earth · moss · timber" },

    { id: "hgt", label: "height", kind: "scalar", source: "model.js", when: "rebuild",
      legend: "how far each pixel stands above the ground plane, in stage pixels" },

    { id: "dep", label: "depth", kind: "scalar", source: "model.js", when: "rebuild",
      legend: "where it stands along the ground plane · the near rim and the far rim " +
        "of the crest are the same height and a whole tower apart" },

    { id: "face", label: "face", kind: "index", source: "model.js", when: "rebuild",
      colours: FACE_COLOURS,
      legend: "top · e · ne · n · nw · w · sw · s · se" },

    { id: "gain", label: "mottle × AO", kind: "scalar", source: "model.js", when: "rebuild",
      range: [0, 1.3],
      legend: "baked once: the blotching in the stone, the recessed bed joints, " +
        "and the crevice shading every light is then multiplied by" },

    { id: "edge", label: "silhouette top", kind: "mask", source: "model.js", when: "rebuild",
      legend: "the one pixel of each column that stands against the void · " +
        "where a hot crest catches its hard line" },

    // -------------------------- the relief ---------------------------
    { id: "normals", label: "normals", kind: "vector", source: "render/cpu.js", when: "relief",
      legend: "the height field's own gradient plus the face the model says it is, " +
        "shown as (n + 1) / 2 in red, green and blue" },

    // --------------------------- the step ----------------------------
    { id: "lamp", label: "lamp", kind: "record", source: "orbit.js", when: "step",
      legend: "where the lamp is this step, worked out from the step number alone" },

    { id: "lux:sky", label: "ambient fill", kind: "lux", source: "orbit.js", when: "step",
      legend: "the flood everything is read against · shaded against its own axis, " +
        "so what faces up still gets more of it" },

    { id: "lux:sun", label: "sun", kind: "lux", source: "orbit.js", when: "step",
      legend: "a direction and a strength · the gradient it puts across the wall " +
        "is what stops a cylinder reading as a slab" },

    { id: "lux:lamp", label: "lamp pool", kind: "lux", source: "orbit.js", when: "step",
      legend: "the one placed light · the only source here that casts a shadow" },

    { id: "lux:haze", label: "haze", kind: "lux", source: "orbit.js", when: "step",
      legend: "the lit air around the lamp, drawn whether or not the lamp itself can be seen" },

    { id: "lux:bloom", label: "glare", kind: "lux", source: "orbit.js", when: "step",
      legend: "the halo on the lamp, and the flare a strike makes · " +
        "both are blooms, so both land here" },

    { id: "lux", label: "all sources", kind: "lux", source: "render/cpu.js", when: "step",
      legend: "one accumulator · where two pools cross it is brighter than either, " +
        "which is the whole reason for adding rather than taking the brightest" },

    { id: "resolve", label: "resolve", kind: "rgba", source: "render/cpu.js", when: "step",
      legend: "each material's own ramp, read at the level the light landed at " +
        "and multiplied by the gain · the first mention of a colour anywhere" },

    { id: "frame", label: "+ emitters", kind: "rgba", source: "render/cpu.js", when: "step",
      legend: "the lamp, the rim, the motes and the puff, drawn straight to the frame " +
        "because they make light rather than receive it" }
  ],

  edges: [
    { from: "solid", to: "mat" },
    { from: "solid", to: "hgt" },
    { from: "solid", to: "dep" },
    { from: "solid", to: "face" },

    { from: "mat", to: "gain" },
    { from: "hgt", to: "gain" },

    { from: "mat", to: "edge" },

    { from: "hgt", to: "normals" },
    { from: "face", to: "normals" },
    { from: "mat", to: "normals" },

    { from: "lamp", to: "lux:lamp" },
    { from: "normals", to: "lux:lamp" },
    { from: "hgt", to: "lux:lamp" },
    { from: "dep", to: "lux:lamp" },

    // The two floods are shaded against the normals, and the two air sources
    // are placed at the lamp. Both are read by the module rather than by this
    // animation, and leaving them out would draw four sources arriving from
    // nowhere.
    { from: "normals", to: "lux:sky" },
    { from: "normals", to: "lux:sun" },
    { from: "lamp", to: "lux:haze" },
    { from: "lamp", to: "lux:bloom" },

    { from: "lux:sky", to: "lux" },
    { from: "lux:sun", to: "lux" },
    { from: "lux:lamp", to: "lux" },
    { from: "lux:haze", to: "lux" },
    { from: "lux:bloom", to: "lux" },

    { from: "lux", to: "resolve" },
    { from: "gain", to: "resolve" },
    { from: "mat", to: "resolve" },

    { from: "resolve", to: "frame" },
    { from: "edge", to: "frame" },
    { from: "lamp", to: "frame" }
  ]
};

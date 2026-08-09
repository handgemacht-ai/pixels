# Diorama

A ruined stone tower on a rock plinth, seen three quarters from above in a dark void, with one warm
lamp going round it. The stage is 160 × 160 pixels and every frame is worked out at that size,
pixel by pixel, then blown up with nearest-neighbour scaling.

The only thing that moves is the light. The tower is built once, into buffers that say what every
pixel is made of, how high it stands, how far into the picture it is and which face of a block it
is; after that a step clears the light, adds up the sources, and reads the answer back through the
palette. Nothing about the model is worked out twice.

Nothing is stored between one step and the next except a single integer — the step number — and two
transients a strike sets. The lamp's bearing, its height, its flicker, every mote in the air: all of
it is derived from that one number again from scratch on every step. Nothing accumulates, so nothing
can drift.

One lap of the lamp is the loop, and it closes exactly: the bearing is worked out from the step
number reduced into the lap first, so step 48 is the same number as step 0 rather than almost the
same. The animation is filmed straight off the page into a GIF, and "almost" is a pixel at the seam.

## Why one light and no camera

A diorama in a dark room is lit by whatever is carried past it, and everything a viewer learns about
its shape they learn from watching that light move. So the light moves and nothing else does — no
turntable, no drift, no parallax. A tower rotating under a fixed lamp shows the same information and
costs a rebuilt model every step; a lamp orbiting a fixed tower costs one pass over a float field.

That decision is load-bearing twice over. It is why the expensive half of this animation is paid
once and not sixty times a second, and it is why the pointer can be wired to the lamp at all: the
mouse changes where the light comes from, which is a number the light pass already takes, rather
than where the camera stands, which is a thing that would have to be rebuilt.

## What is where

```
index.js       the registration: stage, knobs, palette, stats, drawing path
README.md      this file
state.js       the projection, and the model dimensions latched per lap
maths.js       hash, value noise and ordered dither — this scene's own copy
palette.js     twenty-eight colours, five material ramps
model.js       solid(X, Y, Z), and the splat that turns it into a field
orbit.js       where the lamp is, and every source in the scene
world.js       the clock: one integer, two transients
backdrop.js    the void, the vignette and the specks — drawn once per stage size
render/cpu.js  the drawing path: rebuild, clear, add, resolve, emitters
```

The light pass itself is not here. It is `platform/light/`, shared with anything else that wants it,
and this scene is the first thing to use it. What the scene contributes is the model: it says what
is where and which way it faces, and never what colour that is until the resolve.

## The projection

A voxel is a 2 × 2 block of stage pixels, and the three axes move it by whole numbers:

```
X    two pixels right
Y    one pixel right and one pixel up      (into the picture)
Z    two pixels up
```

That is the half-angle axonometric every isometric tile set is drawn on, and it is chosen so that
there is not a single rounding anywhere between a voxel and its block. Nothing interpolates, nothing
lands on a half pixel, and the same model rebuilt at another stage size is the same model rather
than a resampled one.

The camera the projection implies stands east of the tower, in front of it and above it, so the
faces pointing at +X, −Y and +Z are the ones being looked at.

Two blocks can land on the same pixels, so each one carries its own view depth and the nearest
sample wins. The depth is kept in a buffer of its own rather than inferred from the height, because
two things at the same height are exactly the case a height cannot separate: the far rim of the
crest and the near rim are the same distance up and a whole tower apart.

## The tower is a function

There is no image file in this animation. `solid(X, Y, Z)` answers what stands at one voxel — stone,
rock, moss, timber or nothing — and everything on the stage is that function asked a few tens of
thousands of times and projected. It is built from:

- a **ground disc** with a rock mound on it, flat where the tower stands and falling away before the
  disc's own edge, its rim pulled about by a hash on a coarse lattice so it is a piece of a place
  rather than an object on a table;
- a **hollow cylinder** whose top edge is cut into twenty cells, with one broad collapse facing
  east-south-east rather than an even nibbling all round — a ruin eroded uniformly reads as a wall
  that was built low;
- **merlons** on the cells the collapse did not reach, and only those: merlons on a broken edge are
  the one detail that makes a ruin look like a toy;
- an **arched doorway**, square jambs to the springing line and a half round above, facing the
  camera squarely enough to read as a door rather than as a notch, with a slit above it;
- a **stair fragment** wound up the inside, which stops where the wall it was built into stops;
- two **joists** left in the wall where a floor used to be, poking out of both faces of it — they
  are there to be lit, being the only part of the model that casts a shadow across a flat surface
  behind it;
- **rubble** scattered on a lattice around the foot, so the scatter costs one hash to look up at any
  voxel and the knob can thin it out without the survivors moving.

Every hash is taken on the integer lattice, so the same knobs build the same tower on any machine
and in any order. Nothing anywhere in this animation calls `Math.random`.

**Moss is a material, not a tint.** It holds on the north side and low down out of the weather, and
because it has a ramp of its own it stays green under the lamp instead of going tan with the stone
around it.

## What is baked, and why

Two things are worked out once per rebuild and cost nothing per step.

**A mottle**, from a value noise read on the model's own coordinates, so the blotch sits on the
block rather than on the screen the block landed on. Without it a wall of one material is a wall of
one value, and an ordered dither with nothing to work against resolves into a chequerboard.

**Crevice occlusion**, which is a small blur of the height field minus the height itself. Where a
pixel sits lower than everything around it — the joint between the wall and the rock, the inside of
a broken course — it is in a crack, and a crack is darker than the surface it is in whatever the
lamp is doing. Air is not counted as a neighbour: counting it would put a dark line round the whole
silhouette, which is the opposite of what a crack is.

The courses of masonry are baked into the same map. A bed joint is recessed by about a finger and is
therefore invisible to a height field — the mortar is at the same height as the stone, only further
in — so the courses are darkened as gain rather than cut as shape. That is also the only version of
them that survives the light arriving from any direction at all.

## Material first, light second

A frame is four sweeps over buffers the size of the stage, and only the last three of them run every
step.

The **rebuild** writes what every pixel is made of, how high it stands, how far in and which way it
faces — and never a colour. It runs when the shape or the stage size changes, and not otherwise.
The **light pass** adds up how much light lands on every pixel from every source at once. The
**resolve** turns each pixel into a colour by reading its own material's ramp at a level worked out
from the light that landed on it, multiplied by the baked gain. The **emitters** go down last,
straight to the frame: the lamp, the hard line a lit crest catches, the motes in the air. They are
making light rather than receiving it, and running them back through the ramps would put stone's
colours on a flame.

The order is the point. Stone standing in the lamp's pool climbs its own ramp — cold stone, lit
stone, a hot tan — instead of having the lamp's amber laid over it like a film. There is no colour
mixer anywhere in this animation, and no need of one: every ramp runs cold at the bottom and warm at
the top, so temperature is a property of the material and the light only decides how far up its own
ramp a pixel has climbed. The darkest shade of every lit material is a colour somebody chose, never
black, because a shadow made by turning a material down to nothing is a hole in the picture.

## The eight faces

A height field cannot tell the top of a block from its side: both are flat and both come out facing
the viewer. So the model says which face is being looked at, and the light pass adds that to the
relief it works out for itself.

There are eight of them round the compass rather than four, because the wall is a circle and a
circle quantised to four faces lights up in four flat panels. Each side face also carries a little
upward tilt: a wall that faces exactly sideways takes nothing at all from a lamp standing above it,
and a tower lit from above with no tilt in its walls is a lit disc on a black cylinder.

## Shadows

The lamp casts, by walking from a pixel towards the lamp across the height field and asking whether
anything on the way stands higher than the line between them. It is a screen-space march over a
buffer that is already there, which is what makes it affordable at all — but it is a march, and it
is the only thing in the animation that costs per lit pixel rather than per pixel. Turning the
**cast shadows** knob off is measurably cheaper, and the stats strip shows what it costs.

Nothing else casts. The fill and the sky are floods, and a flood that cast would only be re-drawing
the crevice occlusion that is already baked in.

## Following the pointer

With **follow pointer** on, a mouse over the stage is read back onto the ground plane and the answer
is used as a bearing. The lamp keeps its own radius and its own height, so pointing at the stage
changes where the light is coming from and never how much of it there is.

When the pointer leaves, the lamp snaps back onto its orbit. There is deliberately no easing: an
ease is a state, and a state still running when a film starts is a state that gets filmed. The
platform holds the pointer reading false for the whole of a poster or a film, which is the other
half of the same guarantee and the only reason an animation that follows the mouse can be filmed at
all.

## The knobs

- **stage** — resolution, from 144 to 240 pixels wide; the shape the height is worked out from,
  either square or 16:10; and cadence in visual steps a second.
- **light** — how many steps the lamp takes to go round, how high it hangs above the plinth and how
  far out, how far its light carries, how much fill and how much sky there is behind it, how soft
  the terminator is, whether it casts, how a value between two ramp steps is carried, and whether it
  follows the pointer.
- **model** — how tall the tower is, how much of it has fallen, how much rubble is lying at the
  foot, and how strongly the relief is read.

Four knobs take hold at the top of the next lap rather than at once: steps per lap, and the three
that change the shape. The lap length is one because a lap that changed length halfway through would
leave the lamp somewhere other than where it started; the other three are because a model rebuilt
mid-lap would be two different models inside one film. Everything else applies immediately —
including relief, which is one pass over the field and is the knob you want to be able to move while
looking at it.

The texture knob is the one that shows what the palette is doing. There are twenty-eight colours and
no blending between them, so a light value falling between two steps of a ramp has to be carried
some other way: an ordered dither stipples the two steps together, a scanline dither does it on
alternate rows, and hard bands throw the remainder away and show the banding plain.

## What a strike does

A strike is a short, wide, very bright glare at the place that was clicked, and a puff of dust that
outlasts it. The glare is added as a bloom rather than as a lamp because a bloom needs no geometry:
it lands on the air and the stone alike, in screen pixels, which is what a flash on the far side of
a wall actually does. Left to itself the button strikes the tower about two thirds of the way up,
which is the part of it standing in the dark most of the time.

Both transients decay to exactly zero, and both are gone inside half a lap however long the lap has
been set, so a strike is always over before the lap it began in comes round again.

## The film

The **GIF** button beside the stage films one whole lap: `orbitSteps` steps, once, at four times the
size. Because the length of a lap is read through the knobs rather than fixed, a longer lap films a
longer run and the file still holds exactly one lap and no more.

Filming starts from a reset, and a reset here is deliberately a steady state: step zero, the lamp
due east, no transient running. A warm-up would otherwise sit inside every copy of the file, and the
first frame would not match the last.

The same run can be made ahead of time from the command line. At the declared defaults it is 48
frames, 640 pixels square, and it is written to the repository's `assets/diorama.gif`, which is what
the page at large shows of this animation:

```
node tools/gif.mjs --animation diorama
node tools/poster.mjs --thumbs
```

## Licence

The animation and the code that makes it are original work. It reads no reference material: there is
no image file anywhere in this scene, and every pixel on the stage comes out of `solid(X, Y, Z)` and
the light that lands on it.

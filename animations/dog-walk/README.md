# Dog walk

A pixel-art mastiff with a skeleton inside it. Nothing about the walk is drawn, keyframed or
stored: the stage is 160 × 100 pixels, and on every one of the twelve steps that make up a stride
the rig is rebuilt from scratch out of the knob values and one number — how far through the stride
the dog is. The bones that come out of that are stamped into a mask, and the mask is shaded and
outlined as one shape, so the dog is whatever silhouette the knobs have just made it.

The dog walks on the spot and the ground slides underneath. That keeps it in the middle of the
frame beside the Muybridge plate, which was shot the same way — the camera held still and the
animal walked past it — so the two can be watched side by side without either drifting.

## What is where

```
index.js         everything this animation registers with the platform
state.js         the knob values and the stage size, handed over by the platform
gait.js          the four-beat cycle: where each foot is, and how the body rides on them
skeleton.js      the rig — bones, joints, and the solve that puts the elbow somewhere sensible
dog.js           the animation: two numbers, rebuilt into a skeleton every step
maths.js         small helpers, including the two-bone solve and the ground hash
palette.js       the eight colours, and the five the rig overlay is allowed
backdrop.js      the ruled wall and the earth band, drawn once per stage size
render/cpu.js    the drawing path: three masks, banded by depth, outlined once
assets/          the reference plate, whole and cut into frames
```

## The gait

A walking dog puts its feet down in a four-beat sequence a quarter of a stride apart: near hind,
near fore, far hind, far fore. That is the whole of the pattern — each of the four legs reads the
same stride number through its own offset, so one cycle drives all four without any of them being
animated separately.

While a foot is down it is planted: it slides straight backwards under the dog at a fixed rate, and
the ground slides with it at exactly the same rate, so the paw stays on the mark it was put on.
While it is up it is carried forward on a smoothed curve and lifted on a half sine, which puts the
highest point of the swing in the middle of it. How many feet are on the ground at any instant
follows from the stance knob rather than from any rule written down here: at the default of 0.70 it
is mostly three, and winding the knob down towards 0.55 walks it towards two.

Switching the trot knob on changes the gait rather than labelling it. The legs pair up diagonally
with half a stride between the pairs — two beats rather than four — the stance drops to 0.40 so
there are moments with nothing on the ground at all, the reach shortens, the feet come up higher,
and the body bounces more than twice as hard. The gait is read once at the top of each stride
rather than every step, so flipping the switch cannot drop a paw through the ground halfway through
a step it had already started.

Everything else hangs off the same number. The trunk rises and falls twice a stride, once for each
diagonal pair taking the weight, and pitches forward and back a little as it does. The head nods
once a stride, on the shoulder being loaded. The tail swings on a slower clock than the legs, and
each joint along it arrives a little after the one before, so it follows the dog rather than being
carried by it.

## The skeleton

The rig is a spine with a hip and a shoulder at its ends, a neck and skull off the front, three
tail joints off the back, and four legs of four segments each. The legs are the interesting part.
The gait says where a paw has to be; the pastern is folded under, rolled over the toe, or
straightened to suit; and then the knee is not animated at all but **solved for** — the one place
it can be so that the two segments above it reach from the joint they hang off to the ankle. A
foreleg's elbow folds backwards and a hind leg's stifle folds forwards, and the fore and hind legs
are built from the same three segments in different proportions, which is what stops the two ends
of the dog looking like the same leg twice. It also means the leg knobs are honest: lengthen a
segment and the joint moves to wherever it now has to be, rather than the paw sliding off the
ground.

The trunk on top of that is a set of capsules chosen for what they do to the outline: a topline in
two lengths so the back can sag behind the withers, a croup that rounds the back end into the tail,
a ribcage and a loin that overlap in the middle so the belly bends into a tuck-up instead of
sloping evenly, a brisket that drops past the elbow, and a heavy shoulder. The head hangs at the
withers on a neck that leaves the shoulder running forward and down; lift it and the animal stops
being a mastiff and starts being a deer.

## The drawing

Every capsule is stamped into a coverage buffer, and the buffer is turned into one mask. A chamfer
pass over that mask measures how deep each pixel sits inside the silhouette, and every tone comes
off that depth: the surface normal is the gradient of the distance field, so a pixel is lit by
which way the shape's surface faces at that point, and the coat bands are cut at depths rather than
per capsule. Nothing asks which capsule a pixel came from, which is why a highlight running along a
vertical limb no longer blinks on and off as the capsules underneath it change. A little value
noise on the band boundaries keeps them from being clean arcs.

The animal is drawn as three of these in turn — the two legs on the far side, then the body, then
the two legs nearest the viewer — so the far pair gets a darker tone of its own and a one-pixel ink
separator where it passes behind a near leg. That is the whole of the depth cue, and it is what
makes four legs read as four rather than two.

The **show skeleton** knob is instrumentation, not decoration: the animal dims behind it, the
spine, the near legs and the far legs each get a colour of their own, only the bones that are
really in the rig are drawn, each joint is a single pixel, a ring marks the joints that were solved
rather than posed, and a paw with weight on it goes orange.

## The knobs

- **gait** — cadence, how many steps a stride takes, how far the dog reaches, how high it picks its
  feet up, how much of the stride a foot spends on the ground, and walk or trot.
- **frame** — the length of a leg segment, the back, the chest depth, the limb thickness, the neck,
  the head, and how much lower the hips sit than the shoulders. Chest depth and limb thickness are
  separate on purpose: one deepens the body, the other thickens the legs, and a single girth knob
  could only ever do both at once.
- **motion** — body rise, head bob, tail wag.
- **drawing** — the skeleton overlay, the outline, and the width of the stage. The dog is written
  for a hundred-pixel-tall stage and scaled to whatever the stage actually is, so a wider stage
  shows a bigger dog rather than the same dog with more room around it.

All but the trot apply at once. The trot waits for the end of the stride, for the reason above.

## Reference plate

`assets/muybridge-plate-706-strip.jpg` is the reference the walk is measured against: the twelve
exposures of plate 706, cut out of the mount and laid out as a 6 × 2 grid of 177 × 118 frames, read
left to right, top to bottom. The player beside the stage takes its frame from where the dog is in
its own stride rather than from a clock of its own, so the two cannot drift apart; if the stride is
set to a number of steps other than twelve the player says so under the frames.

Plate 706 is one camera set square to the track, which is what makes it usable: the animal is in
true side view for all twelve exposures, and the wall behind it is ruled into squares so the
distance covered between two frames can be read straight off the backdrop. The stage borrows that
ruled wall. `assets/muybridge-plate-706.jpg` is the whole plate as published, kept in the file
browser so the cut can be checked against the original.

- File: <https://upload.wikimedia.org/wikipedia/commons/8/85/Animal_locomotion._Plate_706_%28Boston_Public_Library%29.jpg>
- Source page: <https://commons.wikimedia.org/wiki/File:Animal_locomotion._Plate_706_(Boston_Public_Library).jpg>
- Author: Eadweard Muybridge, *Animal Locomotion*, plate 706, 1887, captioned *Dog; trotting;
  interrupted; mastiff. Smith*
- Licence: public domain — the file page carries the PD-US and PD-old templates; the photographs
  were published in 1887 and Muybridge died in 1904
- Scan: Boston Public Library
- Downloaded file: 1500 × 1191

## Licence

The animation and the code that makes it are original work. The reference plate is in the public
domain.

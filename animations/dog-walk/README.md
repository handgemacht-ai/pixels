# Dog walk

A pixel-art dog with a skeleton inside it. Nothing about the walk is drawn, keyframed or stored:
the stage is 160 × 100 pixels, and on every one of the twelve steps that make up a stride the rig
is rebuilt from scratch out of the knob values and one number — how far through the stride the dog
is. The bones that come out of that are then stamped into the pixel buffer and the whole silhouette
is outlined in a single pass, so the dog is whatever shape the knobs have just made it.

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
palette.js       the eight colours
backdrop.js      the night and the earth band, drawn once per stage size
render/cpu.js    the drawing path: capsules, shading, outline, skeleton overlay
assets/          the reference plate, whole and cut into frames
```

## The gait

A walking dog puts its feet down in a four-beat lateral sequence — left hind, left fore, right
hind, right fore — a quarter of a stride apart. That is the whole of the pattern: each of the four
legs reads the same stride number through its own offset, so one cycle drives all four without any
of them being animated separately. Because the beats are spread evenly and each foot spends about
five-eighths of the stride on the ground, three feet are down at almost every moment, which is what
makes a walk look unhurried rather than bouncy.

While a foot is down it is planted: it slides straight backwards under the dog at a fixed rate, and
the ground slides with it at exactly the same rate, so the paw stays on the mark it was put on.
While it is up it is carried forward on a smoothed curve and lifted on a half sine, which puts the
highest point of the swing in the middle of it. Switching the trot knob on pairs the legs
diagonally instead and puts half a stride between the pairs — two beats rather than four — and
shortens the stance, because a trot has moments with nothing on the ground at all. The gait is read
once at the top of each stride rather than every step, so flipping the switch cannot drop a paw
through the ground halfway through a step it had already started.

Everything else hangs off the same number. The trunk rises and falls twice a stride, once for each
diagonal pair taking the weight, and pitches forward and back a little as it does. The head nods
once a stride, on the shoulder being loaded. The tail swings on a slower clock than the legs, and
each joint along it arrives a little after the one before, so it follows the dog rather than being
carried by it.

## The skeleton

The rig is a spine with a hip and a shoulder at its ends, a neck and skull off the front, three
tail joints off the back, and four legs of four segments each. The legs are the interesting part.
The gait says where a paw has to be; the pastern is folded under or straightened to suit; and then
the knee is not animated at all but **solved for** — the one place it can be so that the two
segments above it reach from the joint they hang off to the ankle. A foreleg's elbow folds
backwards and a hind leg's stifle folds forwards, and those two opposite folds are most of what
makes a silhouette read as a dog rather than as a table. It also means the leg knobs are honest:
lengthen a segment and the joint moves to wherever it now has to be, rather than the paw sliding
off the ground.

Every bone is drawn as a tapered capsule. A pixel inside one takes its colour from which way the
surface it landed on faces the light, and afterwards two passes run over the whole silhouette
rather than over each capsule: one that lights whatever is at the top of the shape and shades
whatever is at the bottom, and one that traces the outline. That is what makes a stack of capsules
read as one animal instead of a heap of sausages. The two legs on the far side are pushed back a
few pixels and drawn flat in shade, which is all the depth a side view needs.

The **show skeleton** knob draws the rig on top of the dog it produced — every bone as a line and
every joint as a cross, in the palette's one cool colour. It is the quickest way to see that the
elbow really is being solved rather than posed.

## The knobs

- **gait** — cadence, how many steps a stride takes, how far the dog reaches, how high it picks its
  feet up, how much of the stride a foot spends on the ground, and walk or trot.
- **frame** — the length of a leg segment, the back, the girth, the neck, and how much lower the
  hips sit than the shoulders.
- **motion** — body rise, head bob, tail wag.
- **drawing** — the skeleton overlay, the outline, and the width of the stage.

All but the trot apply at once. The trot waits for the end of the stride, for the reason above.

## Reference plate

`assets/muybridge-plate-704-lateral.jpg` is the reference the walk is measured against: twelve
photographs of the mastiff Dread walking, side on, laid out as a 6 × 2 grid of 200 × 200 frames and
read left to right, top to bottom. The player beside the stage runs them at the same cadence the
dog walks at — twelve steps a stride, twelve steps a second, one stride a second — and restarts
them whenever the stride is restarted, so the live dog and the photographs stay in step.

The plate as published is four rows of six. Rows 1 and 3 are the lateral camera and together make
one continuous twelve-frame side view; rows 2 and 4 are the same instants photographed from behind.
The file in `assets/` is those two lateral rows cut out and stacked as a single strip, downscaled
from 400 px cells to 200. `assets/muybridge-plate-704.jpg` is
the whole plate, downscaled, kept in the file browser so the cut can be checked against the
original.

- File: <https://upload.wikimedia.org/wikipedia/commons/8/8d/Animal_locomotion._Plate_704_%28Boston_Public_Library%29.jpg>
- Source page: <https://commons.wikimedia.org/wiki/File:Animal_locomotion._Plate_704_(Boston_Public_Library).jpg>
- Author: Eadweard Muybridge, *Animal Locomotion*, plate 704, 1887
- Licence: public domain — the file page carries `{{PD-old-100}}`; Muybridge died in 1904, so the
  work has been out of copyright worldwide for over a century, and the photographs were published
  in 1887, long before 1930
- Scan: Boston Public Library
- Downloaded file: 2766 × 2476, cropped and downscaled as described above

## Licence

The animation and the code that makes it are original work. The reference plate is in the public
domain.

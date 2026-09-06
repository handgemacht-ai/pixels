---
title: Platform — the page the animations run on
type: reference
summary: platform — the machinery under every animation: the registration API, the clock that steps a scene and hands the panels one object, the pixel surface, the seeded runs a film and a walk share, the shared light module, the UI panels (pipeline panel, player, film), and the GIF writer the page and the tools both use.
owner: pixels
status: current
last_verified: 2026-09-06
tags: [architecture]
---

# Platform

The part of the page that is nobody's animation. An animation is one call to `defineAnimation()`: it
declares what it is, the knobs it wants, the material the platform should show around it, and the
ways it can draw itself. The platform builds the page from that declaration and never reaches into
the animation for anything it was not handed — and everything in the declaration is checked at load
time, so a half-declared animation fails at the door rather than three panels later.

The other half of the bargain is just as load-bearing. Nothing in the platform knows what is being
drawn. It steps a scene at its declared cadence, hands the stage to whichever drawing path is
chosen, and gives the panels one small object to talk to the run through. A drawing path is a
backend: JavaScript or WebGL is the animation's business, and the platform only asks each one for a
canvas, a `draw()`, and a `readFrame()`.

## What is where

```
main.js      the entry point: one animation up at a time, every panel built from its declaration
api.js       the registration: defineAnimation(), knob(), the pipeline declaration, all of it checked
runtime.js   the clock: stage, backends, cadence, pointer, the poster, the film, the player
params.js    the live values of an animation's knobs, and the defaults to reset them to
surface.js   the pixel surface: a PixiJS canvas at whole-number scale, backdrop under the frame
seed.js      FILM_SEED and the generator the tools install over Math.random
metrics.js   METRICS and ENV: wall-clock rings, and -1 for a number this mode does not produce
gif.js       a hand-written GIF89a writer — no browser, no file system, so the page and the tools
             write the same bytes out of the same code
export.js    the GIF button: films the run as it stands, palette first into the file's table
```

## light/ — a light field a scene can borrow

```
light/index.js    the field: buffers in, one float per pixel of light, and the resolve
light/bands.js    bayer4, bandLevel, resolveInto — how a float becomes one of the scene's shades
light/sources.js  the sources: one shape, five things to do with it, and the shadow march
```

The bargain is the one the night highway struck with itself, generalised so more than one
animation can take it: the scene says what every pixel is made of (`mat`), how high it stands
(`hgt`), where it sits along the ground plane if it keeps its own depth (`dep`), which face of a
block it is if it wants crisp cube normals (`face`), and one list of shades per material
(`ramps`); the module says how much light lands there; and only then — in one pass that reads the
scene's own ramps — does either side mention a colour. `createLighting()` returns the field, the
scene fills its buffers, `field.normals()` works the normals out of the height field once per
model, `field.add(source)` drops a source in, and `field.resolve(out)` spends the field into an
RGBA buffer, handing back how many pixels were written.

There are five kinds of source — `point`, `ambient`, `sun`, `bloom`, `haze` — and they are all
added into the same accumulator rather than compared, which is why a thing standing where two
pools overlap comes out brighter than either would make it alone. A source is quoted by the
distance at which it has fallen to about a band and carried three of those, so the reach knob
widens and brightens together rather than scissoring a pool off at a circle.

The module never invents a colour, reads the DOM, draws on a random source, or imports anything
from an animation: every byte it writes came out of a ramp the scene handed it, and a run filmed
twice comes out byte for byte the same. The normals are taken from the height field with the
differences made one-sided at the silhouette — a gradient taken across the edge of a raised thing
measures the drop to the floor beside it, not the shape of the thing — and where the scene keeps
face ids the face normal is added to the relief rather than swapped for it, so the relief still
shows on a face that has one. Between two shades of a ramp the in-between value is carried by the
ordered dither, the scanline, or nothing, whichever the scene's texture knob says; the resolve
also takes an optional gain map (per-pixel, baked) and a bias (per-material, a whole band offset
clamped into the ramp, which is how sodium becomes white lamps without a brightness slider).

## ui/ — the panels

```
ui/buffers.js    six painters for the eight tap kinds — code and record are drawn as text by
                 taps.js itself, no canvas — buffer in, ImageData out; no DOM, no clock
ui/taps.js       the pipeline panel: the declared stages as a graph, each drawn on its own node
ui/player.js     hold the run, one step back, one step on — an inspection tool, not a transport
ui/film.js       the GIF button, on what export.js films
ui/controls.js   the knob rows, built out of the declarations
ui/stats.js      the stats readout and the switch between drawing paths; measured numbers only
ui/explorer.js   the file browser: exactly the files the animation registered, fetched from the server
ui/sheet.js      the reference plate beside the stage, stepped from the animation's own cycle
ui/sidebar.js    the switcher: every animation in the registry, its thumb a real frame
ui/shell.js      the furniture the declaration fills in: title, button, palette strip, notes
ui/fit.js        the whole-device-pixel magnification that keeps stage pixels square
ui/highlight.js  hand-rolled syntax highlighting, one line at a time
ui/markdown.js   minimal markdown, enough to read a README in the browser
```

Every panel is handed the declaration and the runtime's one object, and every panel hands back a
way to undo itself, because the page outlives the animation showing in it — `main.js` mounts one
animation at a time and takes the panels down in reverse before the next one arrives.

The **pipeline panel** (`ui/taps.js` over `ui/buffers.js`) is opt-in twice over. An animation that
declares no pipeline never sees the panel, and one that does still pays nothing until somebody
opens it: the graph library (cytoscape and dagre, pinned with Subresource Integrity hashes) is
fetched on that first click, and the drawing path is only asked which stages to capture while the
panel is open. The declared kinds are a closed set — `code`, `index`, `scalar`, `mask`, `vector`,
`lux`, `rgba`, `record` — and `ui/buffers.js` holds a painter for each kind that draws on a
canvas — `code` and `record` are rendered as text by `ui/taps.js` itself — so a stage the panel
could not draw would be a hole in the graph nobody notices until they open it. The painters
only ever read: the frame on the stage is the same frame with the panel open or shut, and holding
the clock still to pose a poster or film a run hands the captures back whether the panel noticed
or not. Clicking a stage pins it — enlarged, with its reading printed — and opens the file it
comes out of in the file browser.

The **player** under the stage holds a run and walks it a step at a time, forwards and back. The
animation is only ever asked to go forwards, so a step back is the run walked again from its start
to the step before, which lands on the same frame for the same reason a filmed run is the same
file twice running: the same seed (the one the command-line tools install, `FILM_SEED` in
`seed.js`), the same strikes replayed at the steps they landed on, and the same number of steps.
While the player holds the run the clock does not step it, and a strike given to a held run is
written down at its step so a walk can put it back. The keys answer only where they are plainly
aimed — the pointer resting on the preview panel, or the focus inside it — and nowhere else.

The **GIF button** films the animation as it stands, with the knobs at whatever the visitor has
moved them to. The run is recorded step by step off a seeded source, and the palette goes straight
into the file's colour table: an animation that declares one gets exactly those colours in their
declared order, and a colour that turns up outside them is counted and drawn as the first entry
rather than silently adding a ninth. One drawn pixel becomes a whole number of file pixels, never
a fraction, and the scale is the largest whole number that brings the stage to about 640 wide.

## The seeded runs

A run has to come out the same twice when it is being filmed or walked, and it does not otherwise.
`seed.js` holds one seed (`1234567`) and one generator, both the ones the command-line tools
install over `Math.random` before they open the page, so a film of a run and a walk of it are the
same run: the frame the player holds at step *n* is the frame the film holds at step *n*. The
export and the player each borrow the source and hand it back; a page served through the tools
resets it with `window.__reseed()` instead.

## Licence

The platform and everything under it are original work.

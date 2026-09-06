---
title: Pixels — architecture
type: architecture
summary: How a static, no-build pixel-art platform is built from one registration call — the run/player clock, the shared light field, and the pipeline panel that taps it.
owner: pixels
status: current
tags: [architecture]
last_verified: 2026-09-06
---

# Pixels — architecture

Pixels is a static, no-build site: the platform is plain ES modules served as
files, and the page is built entirely from what each animation declares in one
call to `defineAnimation()` (`platform/api.js`). The registry imports every
animation once (`animations/index.js`), `platform/main.js` mounts one at a time,
and every panel is constructed from that animation's declaration and torn down
again before the next arrives (`platform/main.js`). There is no framework, no
build step, and nothing on the page the animation did not hand over.

This doc covers four boundaries: the registration contract, the run and its
player, the shared light module, and the pipeline panel that taps it.

## The registration contract

An animation is one call to `defineAnimation(spec)` (`platform/api.js:185`),
which validates the spec at load time and throws on any mistake so a
half-declared animation fails at the door rather than three panels later
(`platform/api.js:9-10`, the throw itself being `must()` at `platform/api.js:12`). A declaration says, at minimum: an `id`, `title`, `base`
(the module's own URL, so the platform can find its files), a `create(ctx)`
factory, and one or more `backends` — the drawing paths (`platform/api.js:211-224`).

The platform never reaches into an animation for anything it was not handed.
What it builds is read off the normalised return value of `defineAnimation()`:

- **Knobs** → the control panel. `normaliseKnob` (`platform/api.js:48`) accepts
  `slider`, `toggle`, and `choice` types, each `live` or `next`-run. Anywhere
  the platform takes a number — stage width/aspect, cadence, replay gap, film
  length — it also takes `knob("someKey")` (`platform/api.js:19`, resolved by
  `readBinding` at `platform/api.js:24`). `platform/ui/controls.js` builds one
  widget per declared knob and nothing else.
- **Files** → the file explorer (`normaliseFile`, `platform/api.js:95`).
- **Pipeline** → the taps panel (`normalisePipeline`, `platform/api.js:125`).
  The node `kind`s are a closed list (`TAP_KINDS`, `platform/api.js:123`)
  because each one is a way of looking at a buffer and every declared kind has
  exactly one way of being drawn — six canvas painters in
  `platform/ui/buffers.js`, the `code` and `record` kinds drawn as text by
  `platform/ui/taps.js`.
- **Reference** → the reference sheet (`platform/api.js:246`).
- **Poster / film** → the share image and the GIF export (`platform/api.js:288`).

The registry (`animations/index.js`) imports every entry once and lists them in
display order; `?animation=` picks one by id and the first is the default
(`animations/index.js:31`). A folder is not an entry — `highway-night`
registers six of them under one directory (`animations/index.js:1`).

## The run and the player

`startAnimation(spec, stageEl)` (`platform/runtime.js:18`) is the clock. It
builds the stage the animation asked for, starts every drawing path the
animation offers, steps the animation at its declared cadence, and hands the
panels one object (`api`, built at `platform/runtime.js:557`, returned at
`:729`) to talk to it through. Nothing in the clock knows what is being drawn (`platform/runtime.js:1`).

**Seeded runs.** A run that has to come out the same twice — a film and a
walk — draws on one seeded random source, `FILM_SEED = 1234567`
(`platform/seed.js:15`, generator at `platform/seed.js:17`). That is the number
the command-line tools install over `Math.random` before the page opens
(`platform/seed.js:3`); when the page seeds itself, it borrows `Math.random`
the same way and hands it back when the clock takes the run again
(`seedWalk`/`giveSourceBack`, `platform/runtime.js:370`/`376`). The committed
films were made through the tools, so a walk uses their seed wherever it is
there (`platform/runtime.js:362`).

**The drawing-path switch.** An animation may declare several backends (e.g. a
GPU and a CPU path). `setMode(id)` (`platform/runtime.js:602`) swaps the current
backend, hides the other canvases, clears the per-path metric rings, restarts
the scene, and marks a held run stale so it re-walks under the new path.

**Stage rebuilds.** When a knob changes the stage size, `apply()`
(`platform/runtime.js:588`) calls `rebuild()` (`platform/runtime.js:459`):
new width/height, the pointer reset to centre, `scene.resize`, `surface.resize`,
every backend's `resize`, a fresh backdrop, a fresh fit, and `restart()`. What
is on screen is never the other size's leftovers.

**Frame-stepping through a run, forwards and back** (commit `f0b67d4`). The
player under the stage takes the run off the clock and walks it a press at a
time (`platform/ui/player.js`). A step is taken the way a film takes it: the
state the run stands in is drawn, then stepped on, then the next is drawn, so
the frame the player holds at step n is the frame the film holds at step n
(`platform/runtime.js:351`). While held, the clock does not step the run and
carries nothing (`platform/runtime.js:498`), so time spent looking is not paid
back in a burst of steps afterwards.

An animation is only ever asked to go forwards, so a step back is the run made
again from its start to the step before (`platform/runtime.js:351`). `seek(target)`
(`platform/runtime.js:449`):

- forwards (`want >= mark`, not stale): `walkOn()` one step at a time —
  `scene.advance()`, `mark += 1`, `restrike(mark)`, `holdFrame()`
  (`platform/runtime.js:441`). Cost: one step.
- backwards (`want < mark`) or after a knob change (`stale`): `walkTo(target)`
  (`platform/runtime.js:400`) — re-seed, `restart()`, and loop `advance()` from
  0 to `target`, replaying the recorded strikes at the steps they landed on
  (`restrike`, `platform/runtime.js:394`). Cost: a full re-walk of `target`
  steps.

That asymmetry is the cost of the player. Holding a run also forces
`pointer.inside = false` (`platform/runtime.js:416`) so a mouse-following
animation holds the same frame any other machine would, and it borrows the
seeded source so the walk is the run the film was made from (commit `9b21244`).

**What the player does to a run, and what it costs** (commits `cd50417`,
`9b21244`). While held the clock stands still; a strike given to a held run
lands on the frame on the stage, is written down at its step, and any strikes
recorded past the current mark are discarded — a strike halfway back through a
walk is the run taking a different turning (`detonate`, `platform/runtime.js:185`).
On release (`freeRun`, `platform/runtime.js:424`) the seed is handed back and
the clock steps past the held frame so its next tick shows the next frame
rather than this one again. The keyboard is scoped: space and the arrows answer
only where the player is plainly aimed — the pointer over its panel, or the
focus inside it — so the space bar still scrolls the page everywhere else
(`platform/ui/player.js`, commit `9b21244`).

## The shared light module

`platform/light/` (commit `e4bf3f1`) is a light field a scene can borrow
instead of writing its own. A scene brings a material id per pixel (`mat`), a
height (`hgt`), an optional depth (`dep`) and face id (`face`), and one ramp of
shades per material, darkest first; the module works out the normals and how
much light lands, and only then — in one pass that reads the scene's own ramps —
does either side mention a colour (`platform/light/index.js:1`). `diorama` is
the first scene lit by it (commit `4d4512b`, wired at
`animations/diorama/render/cpu.js:24`).

The field is one object, sized once and never resized — a stage that changes
size rebuilds its lighting anyway (`platform/light/index.js:46`). Normals are
worked out from the height field once, whenever the model changes, never per
step (`platform/light/index.js:108`). The one place a float becomes a colour is
`resolveInto` (`platform/light/bands.js:70`): every byte written comes out of a
ramp the scene handed over, and the module has no palette of its own
(`platform/light/bands.js:62`).

**The rule that makes the pipeline panel possible.** Every source kind only
ever *adds* into `field.lux`, and none of them reads it
(`platform/light/index.js:233`). The five source kinds — `ambient`, `sun`,
`point`, `bloom`, `haze` (`platform/light/sources.js:295`/`304`/`316`/`382`/`410`)
— each end in `lux[i] += …` (`platform/light/sources.js:286`/`372`/`448`, and
the bloom/haze adds inline). `field.clear()` only zeroes `lux`, leaving the
model in place between steps (`platform/light/index.js:208`).

That add-only rule is what lets a caller see a single source on its own by
watching the accumulator grow and taking the difference. `diorama` does exactly
this: before each source it snapshots `running = lux`, and the per-source tap is
`slice[i] += lux[i] - running[i]` — what the accumulator gained while that
source was being added (`animations/diorama/render/cpu.js:167`, snapshot at
`:169`). It reads the accumulator and never touches it, so a frame drawn with
the panel open is the same frame byte for byte (`animations/diorama/render/cpu.js:86`).
(Commit `2ef0c78` later renamed the field's `tilt` parameter where tilt was
meant and closed the gaps the verifier found.)

## The pipeline panel

`platform/ui/taps.js` (commit `849d7a4`) draws an animation's declared stages
live as the graph they form: one Cytoscape node per pipeline node, one edge per
declared `from`/`to` (`cy.add(elements)`, `platform/ui/taps.js:380`). Each node carries a canvas
that a painter in `platform/ui/buffers.js` repaints from the drawing path's own
buffers — nothing here draws anything the animation did not already draw
(`platform/ui/taps.js:15`).

The panel is opt-in twice over:

1. An animation that declares no pipeline gets no panel at all
   (`platform/ui/taps.js:130`).
2. An animation that does declare one pays nothing until somebody opens it. The
   graph library is three pinned CDN files (`LIBS`, `platform/ui/taps.js:31`),
   each with a Subresource Integrity hash, injected by `script()`
   (`platform/ui/taps.js:51`) on the first `toggle` of the `<details>`
   (`opened`, `platform/ui/taps.js:415` → `loadGraphLibrary` at `:65`). One
   fetch attempt is kept for the life of the page, success or failure
   (`fetching`, `platform/ui/taps.js:49`) — a CDN that is down is not turned
   into a page hammering it.

While open, the panel asks the clock for every declared stage in one call
(`api.taps(WANT)`, `platform/ui/taps.js:267`) and repaints at the animation's
own cadence, not a clock of its own (`platform/ui/taps.js:265`). The clock only
captures the named stages while the panel is open, and `stop()` (`platform/ui/taps.js:409`) calls
`taps(null)` to end it. When the clock is held still to pose a poster or
film a run, `hushTaps()` (`platform/runtime.js:173`) calls `taps(null)` whether
the panel noticed or not — a poster or a film is the frame any other machine
would draw, drawn with nothing watching (`platform/runtime.js:627`).

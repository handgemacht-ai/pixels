# Pixel-art explosion

A procedural pixel-art explosion rendered with [PixiJS](https://pixijs.com) 8.19.0 (loaded from
jsDelivr, pinned with a Subresource Integrity hash). Everything is generated at runtime: the
stage is 160 × 100 pixels by default, every frame is worked out pixel by pixel at that size, and
the canvas is blown up with nearest-neighbour scaling so one drawn pixel becomes one chunky pixel
on screen. Nothing is pre-rendered and no frame of any image is ever drawn into the effect.

Two implementations do that work — JavaScript walking the buffer a pixel at a time, and fragment
shaders working out the same pixels on the graphics card — and the page switches between them
while it runs. They are described below.

Three rules keep it looking hand-drawn rather than simulated. Only the eight colours of the
sprite sheet are ever written into the buffer, so no shading or blending can smuggle in a ninth.
Nothing is faded: a pixel is one of the eight colours or it is not drawn at all. And the picture
only changes twelve times a second, on whole steps, so it steps the way an animator's frames do.

The shape is not assembled out of sprites. Each step the whole fireball is laid down as a single
silhouette — a body with lumps riding on its shoulder, its outline pushed about by noise — and
then every covered pixel is measured for how deep inside that outline it sits. The colour bands
are cut from those depths, so they hug the silhouette however crooked it is, and jittering each
measurement by a pixel breaks the boundary between two bands into a stipple. The same measurement
drives the fraying: as a blast ages, pixels near the outline are dropped at random and holes are
torn through the body, so the fire comes apart in scraps and the smoke tears into wisps rather
than shrinking evenly.

A blast runs for fifty steps, one per frame of the sheet, and follows the sheet's arc: a flat
white flash with spikes shooting off it, a ball that rolls open and cools band by band from white
through yellow and orange to dark red, a shadowed hollow opening under the rolling mass, a
break-up that throws grit clear, and grey smoke tearing itself apart. Dust is shoved outwards
along the ground and the picture shakes in whole pixels.

## Run it locally

The page is plain static files, but it loads ES modules and fetches its own source for the file
browser, so it needs a server rather than a double-click. Any static server will do:

```
npx serve .
```

Then open the address it prints. Click the canvas to detonate; it also auto-replays every 5.2
seconds. An internet connection is needed for the PixiJS CDN script.

## What is where

```
index.html            the page: stage, sheet playback, stats, controls, file browser
css/styles.css        the whole look
js/main.js            boot — starts PixiJS and drives both paths off one clock
js/api.js             the only object the panels talk to the animation through
js/params.js          the seventeen tuned numbers, and the list the panel builds itself from
js/palette.js         the sprite sheet's eight colours
js/curves.js          the fifty-step arc, read off the sheet
js/maths.js           the hash and value noise both drawing paths share
js/stage.js           stage size, ground line, length of a step
js/blast.js           one detonation, laid out
js/metrics.js         the numbers a page can actually measure
js/render/cpu.js      the JavaScript drawing path, pixel by pixel
js/render/gpu.js      the same picture in WebGL 2 passes
js/render/shaders.js  the GLSL, as strings
js/ui/                controls, stats strip, file browser, sheet player, page furniture
assets/               the two reference images
```

The page is laid out like a CodePen: the live animation and the sprite sheet's own playback sit
side by side at the same pixel scale and the same twelve steps a second, a stats strip and a
collapsed panel of controls sit under them, the sheet itself is below that, and a file browser
underneath lists the files above and fetches each one from the server, so what is on screen is
what is being run.

## Two ways to draw it

The same picture is produced twice over, and the switch in the stats strip moves between the two
without reloading.

The JavaScript path walks the pixel buffer itself. Each step it clears the buffer and then, for
every blast alive, lays down the silhouette, measures how deep each covered pixel sits with two
chamfer sweeps over the mask, paints the colour bands out of those depths, and writes the sparks,
scraps and dust on top. The finished buffer is uploaded to a texture and PixiJS puts it on
screen.

The shader path does the same work in fragment shaders on a second WebGL 2 canvas. Seven small
programs stand in for the stages of the JavaScript version: a silhouette mask for fire and one
for smoke, a distance sweep, a band painter for fire and one for smoke, the extras, and a final
pass that puts the frame on screen with the camera shake applied. The distance measurement is
what makes this awkward: a shader cannot carry a running total across pixels the way a loop can,
so the sweep is re-run until the depth it has pushed outwards reaches as far as the deepest band
needs, and how many runs that takes is worked out from the current settings.

Both paths read the same random number source, and the shader version repeats JavaScript's
arithmetic exactly, down to the rounding of one multiplication whose result does not fit in a
double. On the machines this was tested on the two produce byte-identical frames at every setting
tried, so the switch changes the cost and nothing else. Other graphics hardware could round a
float differently somewhere; that would show as a stray pixel, not as a different shape.

Which path starts is decided by the browser. If WebGL 2 is available and the programs build, the
shaders draw; otherwise the switch is disabled, JavaScript draws, and the note under the stats
says what went wrong. All seventeen controls work either way.

## Controls

The page opens with the animation exactly as it was tuned; every knob starts on the value the
effect was built around. The panel builds itself out of the same list the animation reads, so a
control cannot drift away from the number it moves, and `Reset to defaults` puts each one back on
its tuned value exactly.

- **stage** — resolution, from 96 to 320 pixels wide with the height following at 16:10; cadence
  in visual steps a second, which the sheet playback follows so the two stay comparable; and how
  many steps a blast runs for. The fifty-frame arc is stretched onto whatever length is set
  rather than cut short at the end.
- **fireball** — size; how many lobes ride on its shoulder and how big they are; how hard noise
  pushes the silhouette about; how far the colour bands stipple into each other; how fast the
  mass tears open and frays; and a colour shift for the whole flame, measured in bands.
- **smoke** — how many puffs are left behind, and how long they hang about.
- **flash** — how many spikes shoot off the opening frames, and how far they reach.
- **scene** — camera shake in pixels, the gap between automatic blasts, and the palette lock.

The palette lock is what holds the picture to the sheet's eight colours. Switched off, the fire's
bands are mixed rather than snapped and the same shapes come out airbrushed, which is the
plainest demonstration of what the palette is doing for the look.

Resolution, cadence, replay gap, outline noise, dither, break-up, heat and the palette lock apply
at once. Size, counts, blast length and shake take hold on the next blast, because a blast keeps
the shape and length it was born with until it burns out.

## What the stats panel measures

The strip above the controls is read four times a second. A number the drawing path in use cannot
produce is shown as `n/a` rather than as a zero:

- frames a second, both current and averaged over the last second
- frame time in milliseconds, average and worst, over the last second
- the cost of one visual step: the JavaScript that produces it, the upload of the finished buffer
  to a texture, and the gap that covers handing the frame to the GPU
- in shader mode, the time the graphics card spent on the passes, measured with
  `EXT_disjoint_timer_query_webgl2` where the browser offers it, and how many draw calls the step
  issued
- the last step cost measured on each path, side by side, so the two can still be compared after
  switching
- live counts — blasts, lobes, particles, and pixels written per step; the pixel count belongs to
  the JavaScript path, as the shaders do not count what they touch
- the environment: which path is drawing, stage size, renderer, whether the shader programs
  built, device pixel ratio, the JavaScript heap where the browser offers one (Chrome only),
  whether the timer extension is there, and the GPU name where the driver allows it to be read,
  via `WEBGL_debug_renderer_info`

In shader mode the step cost covers only setting uniforms and issuing draw calls; the drawing
itself happens on the card afterwards, so that number is small by construction and is not the
JavaScript path's step cost with the work removed. The pass time is the figure to hold against
it, and it exists only where the timer extension does — software renderers usually do not have
it, and there the cell reads `n/a` and frames a second is the honest comparison.

No browser reports GPU utilisation, VRAM or driver queue depth to a web page, and nothing here
guesses at them. These are the classic obtainable numbers: wall-clock timing around the demo's
own code, plus counts of its own work. Anything the driver defers shows up only indirectly, as
time the next frame has to wait for. The measurement itself is a handful of clock reads a frame
and one counter, and the readout updates on a timer rather than every frame, so it does not
meaningfully cost what it is reporting.

## Deploying

The site is served from Cloudflare Pages at <https://pixels.handgemacht.ai>. A deploy is a direct
upload of the repository root:

```
npx wrangler pages deploy . --project-name pixels
```

## Reference sprite sheet

`assets/reference-sheet.png` is a hand-drawn explosion sprite sheet: 50 frames of 100 × 100 on a
10 × 5 grid, read left to right and top to bottom. It is the only thing the animation is tuned
against. Counting its pixels gives exactly eight opaque colours, and those eight are the
animation's whole palette:

`#ffffff` `#fffda5` `#ffba38` `#fb642f` `#750000` `#3a0606` `#2c2626` `#080808`

Measuring its frames gives the timing: the flash covers frames 0–8, the ball fills out by frame
24, the fire is gone by frame 40 and the last smoke by frame 50. The page plays the sheet back
beside the live blast, one frame at a time, and restarts it whenever a blast goes off, so the two
can be compared step for step. That playback only blits frames into a canvas of its own — no
frame of the sheet is ever drawn into the effect.

- File: <https://opengameart.org/sites/default/files/explosion1_5.png>
- Source page: <https://opengameart.org/content/explosion-7>
- Author: BenHickling
- License: CC0 1.0 Universal — <https://creativecommons.org/publicdomain/zero/1.0/>
- Downloaded file: `explosion1_5.png`, 1000x500, unmodified

## Reference photo

`assets/reference.jpg` is background material, kept in the file browser. It shaped an earlier,
painterly version of this demo, which sampled its palette out of the photograph's brightness
bands. The pixel-art version takes both palette and timing from the sprite sheet instead, so the
photo no longer feeds the animation.

- Source: <https://commons.wikimedia.org/wiki/File:BLU-82_Daisy_Cutter_Fireball.JPG>
- Author: U.S. Air Force photo / Capt. Patrick Nichols
- License: Public domain (work of the U.S. federal government)
- Downloaded file: the 1920px rendition of the original 3872x2592 photograph

## Licence

The animation and the code that makes it are original work. The two reference images carry the
licences named above: the sprite sheet is CC0 1.0, the photograph is public domain as a work of
the U.S. federal government.

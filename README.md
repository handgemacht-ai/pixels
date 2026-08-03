# pixels

A small platform for procedural pixel-art animations, and the animations themselves. Each
animation is a self-contained folder that registers what it is and what it needs; the platform
builds the page around it — stage, control panel, stats strip, reference playback and file browser
— out of that registration and nothing else.

There is one animation so far: [`animations/fire-explosion`](animations/fire-explosion), a
procedural explosion drawn twice over, once in JavaScript and once in fragment shaders.

PixiJS 8.19.0 is loaded from jsDelivr, pinned with a Subresource Integrity hash, and used for one
thing: presenting a pixel buffer at nearest-neighbour scale.

## What is where

```
index.html              the page shell: empty panels the platform fills in
css/styles.css          the whole look
platform/main.js        picks an animation out of the registry and starts it
platform/api.js         the registration API: defineAnimation(), knob()
platform/runtime.js     the clock, the drawing-path switch, stage rebuilds
platform/params.js      the live knob values, built from the declarations
platform/surface.js     the PixiJS pixel surface offered to drawing paths
platform/metrics.js     the numbers a page can actually measure
platform/ui/            controls, stats strip, file browser, sheet player, furniture
animations/index.js     the registry
animations/<id>/        one animation, everything it needs and nothing else
tools/poster.mjs        writes the share image and the icons from a real frame
assets/                 those generated images, committed
```

`?animation=<id>` picks one out of the registry; without it the first is used.

## Run it locally

The page is plain static files, but it loads ES modules and fetches its own source for the file
browser, so it needs a server rather than a double-click. Any static server will do:

```
npx serve .
```

Then open the address it prints. An internet connection is needed for the PixiJS CDN script.

## Adding an animation

An animation is a folder under `animations/` holding its own code, its own defaults and its own
assets. It never imports from another animation, and the platform never reaches into it for
anything it was not handed.

```
animations/<id>/
  index.js       the registration — the only file the platform imports
  README.md      shown in the file browser
  assets/        reference images, if any
  …              whatever else the animation is made of
```

Add the folder, then import it in `animations/index.js` and put it in the `ANIMATIONS` array.

### The registration

`index.js` is one call to `defineAnimation()`. Everything is checked when the page loads and a
mistake throws immediately, rather than showing up three panels later.

```js
import { defineAnimation, knob } from "../../platform/api.js";

export default defineAnimation({
  id: "drifting-dot",
  title: "A drifting dot",
  tagline: "one pixel, going right",
  base: new URL(".", import.meta.url).href,     // so the platform can find this folder
  action: { verb: "Restart", noun: "run" },     // the button, and the word used in notes

  stage: { width: 160, aspect: 10 / 16, background: 0x000000, legend: "one dot" },
  cadence: knob("stepsPerSec"),                 // visual steps a second
  replay: 4,                                    // seconds between automatic runs, 0 for none

  knobs: [
    { group: "stage", key: "stepsPerSec", label: "cadence", default: 12,
      min: 4, max: 30, step: 1, unit: "steps/s", applies: "live" },
    { group: "dot", key: "speed", label: "speed", default: 2,
      min: 1, max: 8, step: 1, unit: "px/step", applies: "next" }
  ],

  stats: [{ key: "x", label: "x" }],
  files: [
    { path: "index.js", open: true, sub: "the registration", meta: "everything in one place" },
    { path: "README.md", sub: "what this is", meta: "fetched and rendered here" }
  ],

  backends: [
    { id: "javascript", label: "JavaScript", note: "JavaScript is drawing the frame",
      stats: [{ key: "pixels", label: "px / step" }], create: createJavascriptBackend }
  ],

  create: function (ctx) { return createDot(ctx); }
});
```

Anywhere the platform takes a number — `stage.width`, `cadence`, `replay` — it also takes
`knob("someKey")`, and then reads that knob every time it needs the number.

### Knobs

Each knob declares its own group heading, label, type (`slider` or `toggle`), range, unit, default
and when it takes effect: `applies: "live"` for at once, `applies: "next"` for on the next run.
The control panel is built from these declarations, `Reset to defaults` puts each back on its
declared default exactly, and the note under the panel is written from the `applies` fields. A
slider with a fractional step is driven as a whole number and divided down, so a reset lands on
the default and not a hair either side of it.

The values live in one object. The panel writes into it and the animation reads from it; nothing
is copied, so a knob moved on screen is read on the next step.

### Lifecycle

`create(ctx)` is called once, with `ctx = { params, width, height }`, and returns the animation:

```js
{
  detonate(spot),   // start a run — spot is {x, y} in stage pixels, or nothing for its own choice
  reset(spot),      // clean start: at boot, after a resize, after a change of drawing path
  advance(),        // one step forward
  offset(),         // optional — {x, y}, a whole-pixel shift the frame is laid down at
  stats(),          // optional — the numbers declared in `stats`
  resize(w, h),     // optional — the stage size changed
  backdrop()        // optional — a canvas drawn behind every frame, remade on each resize
}
```

The platform calls `advance()` at the declared cadence, `detonate()` when the replay gap runs out
or the stage is clicked, and `reset()` whenever the picture has to start over.

### Drawing paths

An animation registers one backend or several. With more than one the platform renders the switch
in the stats strip; with one it renders nothing. A backend's `create(ctx)` is given
`ctx = { params, scene, surface, width, height }` — `scene` is what `create()` returned above, so
a backend and its animation can share whatever they like — and returns:

```js
{
  canvas,               // the element shown while this path is drawing
  draw(),               // build the frame from the scene
  present(dx, dy),      // put it on screen, shifted by whole pixels
  readFrame(),          // Uint8Array of RGBA, for frame-by-frame comparison
  upload(),             // optional — hand a finished buffer to the surface
  setBackdrop(canvas),  // optional
  resize(w, h),         // optional
  stats(),              // optional — the numbers declared in the backend's `stats`
  gpuMs(),              // optional — measured GPU time for the last step, or -1
  env                   // optional — {label: value} rows for the environment strip
}
```

`surface` is a PixiJS-backed pixel surface: a canvas the size of the stage, blown up with
nearest-neighbour scaling, with a backdrop behind the frame. A path that produces a pixel buffer
in JavaScript uses it and does not touch PixiJS itself; a path that owns its own canvas ignores
it.

If a path cannot start, its `create()` throws with the reason. The platform disables its button,
says why under the stats, and carries on with the others. If none start, the page says so.

### Optional extras

- **`palette`** — `{ colours, lockKnob, title }`. Draws the swatch strip under the reference
  playback and names the colours the animation holds itself to.
- **`reference`** — a sprite sheet the platform plays back beside the stage at the same cadence,
  restarted on every run: `{ image, columns, rows, frames, frameSize, alt, credit, links, legend,
  sourceLegend }`.
- **`stats`** — `[{ key, label, format }]`, read from `scene.stats()` each step and shown in the
  strip. A backend declares its own the same way and they show as `n/a` while another path draws.
- **`files`** — `[{ path, sub, meta, open, alt, caption, pixelated }]`, the list the file browser
  shows. Paths are relative to the animation's folder and are fetched from the server, so what is
  on screen is what is being run. Only these files appear; nothing of the platform does.
- **`poster`** — which frame stands in for the animation as a still:
  `{ step, spot, backend, icon: { x, y, size } }`. `step` is how many steps into a run the frame
  is taken, `spot` where to start that run, `backend` which path draws it, and `icon` a square cut
  out of the same frame for the favicons, in stage pixels. All four are optional; without them the
  platform takes a dozen steps into a centred run on the default path and cuts the middle of the
  stage. The runtime exposes it as `window.pixels.poster({ step })`, which holds the clock still,
  runs the animation forward by hand and hands back a canvas.

## The share image and the icons

`assets/og.png`, the favicons and `favicon.ico` are frames of the animation, not artwork and not
reference material: the generator boots the real page with a seeded random source, poses the
declared poster frame, and cuts the images out of it at whole-number scales so no pixel is
softened. They are committed, because the site is static.

```
node tools/poster.mjs                              regenerate everything
node tools/poster.mjs --contact sheet.png          contact sheet of candidate steps
node tools/poster.mjs --step 26                    try a step without changing the declaration
```

It needs Playwright with Chromium (`npm i playwright && npx playwright install chromium`) and
serves the repository itself on a loopback port. The same seed and the same step give the same
bytes every run. The `og:` and `twitter:` tags in `index.html` point at the result; they are
site-level, so one animation's poster stands for the site.

## What the stats panel measures

The strip is read four times a second. A number the drawing path in use cannot produce is shown as
`n/a` rather than as a zero:

- frames a second, both current and averaged over the last second
- frame time in milliseconds, average and worst, over the last second
- the cost of one visual step, the upload of a finished buffer to a texture where there is one,
  and the gap that covers handing the frame to the GPU
- where a path measures it, the time the graphics card spent on its passes, via
  `EXT_disjoint_timer_query_webgl2` where the browser offers it
- the last step cost measured on each path, side by side, so the two can still be compared after
  switching
- whatever counts the animation and its paths declare
- the environment: which path is drawing, stage size, renderer, device pixel ratio, the JavaScript
  heap where the browser offers one (Chrome only), whatever the paths report about themselves, and
  the GPU name where the driver allows it to be read, via `WEBGL_debug_renderer_info`

A step cost measured on a path that only sets uniforms and issues draw calls is small by
construction: the drawing happens on the card afterwards. The pass time is the figure to hold
against it, and it exists only where the timer extension does — software renderers usually do not
have it, and there the cell reads `n/a` and frames a second is the honest comparison.

No browser reports GPU utilisation, VRAM or driver queue depth to a web page, and nothing here
guesses at them. These are the classic obtainable numbers: wall-clock timing around the page's own
code, plus counts of its own work. Anything the driver defers shows up only indirectly, as time
the next frame has to wait for. The measurement itself is a handful of clock reads a frame, and
the readout updates on a timer rather than every frame, so it does not meaningfully cost what it
is reporting.

## Deploying

The site is served from Cloudflare Pages at <https://pixels.handgemacht.ai>. A deploy is a direct
upload of the repository root:

```
npx wrangler pages deploy . --project-name pixels
```

## Licence

The platform and the animations are original work. Reference material carries its own licence,
named in each animation's own README — for `fire-explosion`, a CC0 1.0 sprite sheet and a
public-domain photograph.

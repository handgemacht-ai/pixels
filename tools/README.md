---
title: Tools — the command-line generators
type: reference
summary: tools — the generators that drive the real page in seeded Chromium: gif.mjs films a declared run, poster.mjs writes the share image, favicons and switcher thumbs, grid.mjs renders contact sheets to compare against, and lib/page.mjs serves the repository and opens it.
owner: pixels
status: current
last_verified: 2026-09-06
tags: [workflow]
---

# Tools

The command-line half of the rig. Every tool here serves the repository itself on a loopback port
and opens the real page in Chromium through Playwright, with the random source seeded before any
of the page's own code runs — so a run posed from the command line is the run that would be posed
anywhere else, and the same command gives the same bytes every time. What they write is what the
page draws: the films, the stills and the sheets are all frames of the animation itself, posed by
the platform's own poster path, and no reference material is read into any of them.

## What is where

```
gif.mjs        films a whole declared run and writes it out as an animated GIF
poster.mjs     the share image and the favicons from one posed frame, and the switcher thumbs
grid.mjs       a contact sheet of a run's own frames, optionally beside its reference sheet
lib/page.mjs   shared: serve the repo, open the page seeded, collect whatever goes wrong on the way
out/           where the sheets land — working artifacts, gitignored, never part of the site
```

## Filming a run

`tools/gif.mjs` films the run the animation declares as its film, from a detonation dead centre
stepped forward one frame at a time out of the seeded source, and writes it where the animation
says its film lives (`assets/<id>.gif` by default), which is also where the page links to it
from:

```
node tools/gif.mjs --animation diorama
node tools/gif.mjs --animation highway-night --scale 4 --out /tmp/try.gif
```

Every frame is magnified by a whole number and every pixel in the file is one of the animation's
own colours — the declared palette goes straight into the file's colour table, through the same
`platform/gif.js` encoder the page's GIF button uses. A colour that turns up outside the palette
is counted and reported as `coloursOutsideThePalette`, and the tool exits nonzero rather than
pretending nothing happened. `--scale`, `--fps` and `--steps` override what the animation
declared; without them the film is as long a run as the animation's own defaults make it.

## The poster and the thumbs

`tools/poster.mjs` cuts the site's public face out of a real frame of the animation — the poster
step the animation declares, drawn by the animation itself, with the random source reseeded
before every pose:

```
node tools/poster.mjs              writes assets/og.png, icon-16/32.png, apple-touch-icon.png, favicon.ico
node tools/poster.mjs --thumbs     a still for every animation in the registry, for the switcher
node tools/poster.mjs --contact out.png --steps 4,8,12   a contact sheet of candidate steps
```

The share image is the frame at eight times its size on the site's own card, cropped so the
ground line sits near the bottom; the favicons are a square cut out of the same frame, and the
`.ico` is a tiny directory in front of the PNGs it carries. `--thumbs` opens each animation on
its own — the switcher's registry is read out of the page, so the still each row expects is the
still this run writes — and `--step` overrides the declared poster step when hunting for a better
one, with the contact sheet to pick from.

## Sheets, for looking at a run

`tools/grid.mjs` renders one PNG holding a grid of a run's own frames, so a whole run can be
looked at in one go rather than watched:

```
node tools/grid.mjs --animation dog-walk --steps 0-49:2 --columns 5
node tools/grid.mjs --animation fire-explosion --set life=60,paletteLock=0 --compare
```

`--set` moves knobs before anything is drawn (complaining about any it does not recognise rather
than quietly drawing the defaults), `--backend` picks the drawing path, `--seed` changes the seed
the run starts from, and `--steps` takes a range with a stride (`0-49:2`) or a list (`0,4,8`).
In `--compare` mode the animation's registered reference sheet is laid out above the live frames,
column for column, stepped the way the player beside the stage steps it. Sheets are working
artifacts: they land in `tools/out/`, which is gitignored and never part of the site.

## lib/page.mjs

The one place the generators' machinery lives. It serves the repository on a loopback port with
plain `http` (no build, no bundler — the site is static), launches Chromium with a software GL
so WebGL paths draw the same picture everywhere, installs the seeded `Math.random` and
`window.__reseed()` before any of the page's own code runs, waits for the animation to start,
and collects page errors and console errors as `problems` so every tool can report what went
wrong on the way to the frame it came for. The seed it installs by default is the same
`FILM_SEED` the platform's own filming and walking use, which is the whole reason a posed frame
from here matches the committed films.

## Licence

The tools and everything under them are original work.

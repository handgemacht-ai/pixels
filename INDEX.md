---
type: index
last_verified: 2026-09-06
upstream_commit: 194a0723385675a7cd33ce82379d3b8751dac829
sources:
  - README.md
  - animations/diorama/README.md
  - animations/dog-walk/README.md
  - animations/fire-explosion/README.md
  - animations/highway-night/README.md
  - platform/README.md
  - tools/README.md
  - docs/architecture.md
---

# pixels — index

The pixels rig in one place: the platform and its one registration call, the four animations it carries, the command-line generators that pose them, and the architecture doc that ties the lot together.

- [pixels — a platform for procedural pixel-art animations](README.md) — The pixels rig — a static page that builds itself around each animation's registration, and the four animations it carries; running, extending, walking and filming them, and deploying the site.; read when adding an animation to pixels, walking or filming a run, or deploying the site
- [Diorama — one orbiting lamp over a ruined tower](animations/diorama/README.md) — animations/diorama — a ruined stone tower under one orbiting lamp, the first scene lit by the shared light module; the model as solid(X, Y, Z), the four sweeps of a frame, the pipeline panel, and the knobs that drive them.
- [Dog walk — a mastiff solved from a skeleton](animations/dog-walk/README.md) — animations/dog-walk — a pixel-art mastiff whose walk is solved, not animated: the gait, the two-bone rig, the depth-banded drawing, and Muybridge plate 706 held beside it.
- [Fire explosion — eight colours, drawn twice over](animations/fire-explosion/README.md) — animations/fire-explosion — a procedural pixel-art explosion in its sprite sheet's eight colours, produced identically by a JavaScript path and a WebGL one; the fifty-step arc, the depth-cut bands, and the fraying.
- [Highway night — a lit corridor, from two places to stand](animations/highway-night/README.md) — animations/highway-night — a car driving a lit corridor at night, drawn as six stages: two whole-road assemblies and four solos; the ground ladder, the camera, the loop-closed lattice, the forty-colour palette, and what a strike does in each picture.
- [Platform — the page the animations run on](platform/README.md) — platform — the machinery under every animation: the registration API, the clock that steps a scene and hands the panels one object, the pixel surface, the seeded runs a film and a walk share, the shared light module, the UI panels (pipeline panel, player, film), and the GIF writer the page and the tools both use.
- [Tools — the command-line generators](tools/README.md) — tools — the generators that drive the real page in seeded Chromium: gif.mjs films a declared run, poster.mjs writes the share image, favicons and switcher thumbs, grid.mjs renders contact sheets to compare against, and lib/page.mjs serves the repository and opens it.
- [Pixels — architecture](docs/architecture.md) — How a static, no-build pixel-art platform is built from one registration call — the run/player clock, the shared light field, and the pipeline panel that taps it.

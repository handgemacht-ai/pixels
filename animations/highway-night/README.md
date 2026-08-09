# Highway night

A car driving through a lit corridor at night, seen from the side: sodium lamps on mast arms,
their cones crossing the carriageway, a skyline and its neon behind, oncoming traffic drawing red
across the far side. The stage is 192 × 120 pixels and every frame is worked out at that size,
pixel by pixel, then blown up with nearest-neighbour scaling.

Nothing is stored between one step and the next except a single integer — the step number — and
three transients a strike sets. Where the lamps are, where the lane dashes are, which sign is
flickering, which oncoming car is in shot: all of it is derived from that one number again from
scratch on every step. Nothing accumulates, so nothing can drift.

The loop is four seconds long and closes exactly. It has to: the animation is filmed straight off
the page into a GIF, and a seam that shifts by one pixel is the difference between a loop and a
stutter.

## Five stages

This folder registers five entries rather than one. The assembled highway is the animation; the
other four take one part of it out, stand it on a stage of its own and hand it the knobs that part
answers to. Everything else is turned off, which is the whole value of them: a decision about a
four-pixel car or a one-pixel shadow is impossible to see inside a picture with a lit city in it.

- **Night highway, lit by its own lamps** — the assembly, and the only one of the five that is
  filmed into the repository.
- **The car, and nothing else on the road** — the shell, its two lamps and the shade it takes off
  the road, under a light with no fitting so it can be looked at lit rather than in silhouette.
- **One lamp, and the pool it lays** — the line of masts, with the cone, the spill, the haze and
  the bloom each on a control of its own: three switches, and a dial for the haze, because haze is
  a quantity rather than a thing that is or is not being cast. Turn all four down and what is left
  is the road on its own, which is why there is no separate stage for that.
- **The far carriageway** — the two rows of small cars, their tail lamps, the streaks they drag,
  and a switch for the street lamps, because a lit carriageway and an unlit one are two different
  problems.
- **The skyline, and which signs are on** — twenty-four housings, four tube colours and the
  flicker, with nothing scrolling underneath.

They share every module in the folder and they share this file. What each declares for itself is a
stage, a set of knobs and a drawing order, in one file apiece. A knob one of the shared modules
reads and the stage has not declared is an error at the door rather than a picture that quietly
goes black: `useParams()` is handed the list of keys the stage is going to need and checks it
before anything is drawn.

None of the four is filmed into the repository. The GIF button on their pages works and films
whatever is on screen; there is simply no committed copy, because what the site shows of this
animation is the assembly.

## Why a side elevation

The obvious shot is down the road, with the lamps receding to a vanishing point. At 192 pixels
across that shot leaves the car about six pixels tall and turns every cone of light into a smear
near the horizon — and the cones are the whole reason for the picture. Seen square from the side
the cone is a wedge the width of a hand, the car is a shape rather than a smudge, and depth is
carried by which horizontal band a thing is drawn in.

That decision is load-bearing. There is no per-pixel depth anywhere in this animation and no
camera: the ground is a fixed ladder of six bands, and a thing is far away because it is drawn in
a high band and moves in a high band's colours.

## What is where

```
index.js          the assembly's registration: stage, knobs, palette, plate, stats, path
solo-car.js       the car alone: registration and drawing path in one file
solo-lamp.js      the lamps alone, four sources on four switches
solo-traffic.js   the far carriageway alone
solo-city.js      the skyline alone, and nothing that scrolls
state.js          the stage size, the ground ladder, and the constants latched per loop
world.js          the scroll clock and the lattice — where the loop is guaranteed
palette.js        twenty-nine colours, thirteen material ramps
maths.js          hash, value noise and the ordered dither
road.js           the bands, the rail, the median, the paint and the grit
pole.js           the mast, the arm and the cobra head
light.js          the light field: cones, haze, bloom, and the banding that reads it
lightcone.js      where each cone points, how wide it opens and how far it carries
car.js            the hero car's silhouette and the shade it takes off the road
traffic.js        the other carriageway — two rows, on their own lattice
neon.js           which signs are lit, which are flickering, and how a lit one reads
skyline.js        the towers, their windows and the sign housings
backdrop.js       sky, stars, city glow, both skylines — drawn once per stage size
render/buffers.js the buffers, the resolve and the backend all five stages share
render/cpu.js     the assembly's path: material pass, light pass, resolve, emitters
assets/           reference material, read and never drawn
```

## The ground ladder

The ground is 63 units of a 192-wide stage, split into six bands: skirt 6, rail 4, far carriageway
12, median 5, near carriageway 24, shoulder 12. The near carriageway takes up the rounding at other
stage sizes, because it is the widest band and a pixel either way is invisible there, whereas the
rail band is four pixels and cannot spare one.

The ladder is pinned to the stage width, not the height, so the square stage setting adds sky and
never touches the road.

## The loop

One lamp spacing divided by the steps it takes to cross it is the scroll speed. The loop is four
spacings long — `poleSteps × 4` steps — so the scroll over one loop is exactly four spacings
however either knob is set, and the lattice comes back onto itself to the pixel.

Every hash is taken on a lattice cell counted modulo the number of cells in one loop, never on a
running index. That is what makes the detail on the lamp arriving at the right edge the same detail
that has just left on the left.

At the defaults: 48 pixels between lamps, 12 steps between them, 12 steps a second. That is 4
pixels a step, 48 steps to the loop, four seconds — and, at the scale the lamp spacing fixes
(33.3 metres to 48 pixels), 120 km/h. The speed on the stats strip is worked out from those
numbers rather than declared, so moving either knob moves it.

## Material first, light second

A frame is built in four sweeps over two buffers the size of the stage.

The **material pass** writes what every pixel is made of — asphalt, paint, gravel, glass, sheet
metal, air — back to front, and never a colour. The **light pass** adds up how much light lands on
every pixel from every source at once. The **resolve** turns each pixel into a colour by reading
its own material's four-step ramp at a level worked out from the light that landed on it. The
**emitters** go down last, straight to the frame: neon, filaments, tail lamps and the red they drag
are making light rather than receiving it, and putting them back through the ramps would lay a
street lamp's amber over a pink sign.

The order is the point. A car standing inside a lamp's pool climbs its own ramp — dark paint, lit
paint, a hot rim — instead of having the pool's amber laid over it like a film. And adding the
light rather than taking the brightest source is what gives a line of lamps its bright / dark /
bright rhythm: where two pools overlap, they are brighter.

## What the light pass knows

Distance is measured twice, because the vertical axis is carrying two jobs at once. For anything
standing on the ground, a pixel a step down the screen is a long way further off than a pixel a
step across it, so the vertical is divided by 1.8 before the falloff is taken — which is why a pool
comes out as a wide flat ellipse rather than a circle. For light in the air — the haze in a beam,
the bloom around a filament — the screen is taken at face value, because a halo is a halo from
wherever you stand.

Each lamp contributes four things: the cone proper, a short wide spill around its own foot, the
haze in the air beneath it, and the bloom on the head. The spill exists because a cone is still
only a few pixels wide just below the head, and without it a lamp cuts a hard-edged rectangle out
of the far carriageway. It is deliberately given a shorter reach than the cone: made long enough to
look soft it also reaches the next lamp, and the dark stretch between lamps — the thing the whole
picture is about — disappears.

Between the four steps of a ramp there is nothing to fade through, so the in-between values are
carried by the ordered dither, a scanline dither, or thrown away, whichever the texture knob says.
Over a wide flat band of asphalt a dither with nothing to work against resolves into a chequerboard
and reads as static, so the road's light is multiplied by a wrapped value noise first — patched
surfacing, sixteen blotches to a loop, so the grid closes at the seam like everything else.

## The knobs

- **stage** — resolution, from 144 to 240 pixels wide; the shape the height is worked out from,
  either 16:10 or square; and cadence in visual steps a second.
- **drive** — lamp spacing in pixels and steps from one lamp to the next, which between them are
  the speed, plus how tall the masts stand.
- **light** — how far a cone carries, how wide it opens, how much haze hangs in it, how a value
  between two ramp steps is carried, and a warmth offset that shifts the road and its paint along
  their ramps without touching anything else on the stage.
- **traffic** — how many oncoming cars are on the far carriageway, and how long a tail-light trail
  is drawn behind each of them.
- **neon** — how many of the sign housings are lit, how far up their ramp they burn, and how much
  they flicker.
- **car** — how far the headlight beams reach and how wide they open. The car itself has nothing
  else to argue about: it rides level, because a car at motorway speed on a laid carriageway does,
  and it is the one module in the folder that reads no knob at all.
- **scene** — the gap between automatic strikes.

Four knobs take hold at the top of the next loop rather than at once: lamp spacing, steps per lamp,
the number of oncoming cars and the number of lit signs. All four re-cut a lattice, and a lattice
re-cut halfway through a loop leaves the scroll out of step with itself and tears the seam open.
Everything else applies immediately.

The cone texture knob is the one that shows what the palette is doing. There are twenty-nine
colours and no blending between them, so a light value that falls between two steps of a ramp has
to be carried some other way: an ordered dither stipples the two steps together, a scanline dither
does it on alternate rows, and hard bands throw the remainder away and show the banding plain.

## What a strike does

A strike reads the band that was clicked, because in a side elevation the bands are the only depth
there is.

- **The sky** belongs to the signs: the nearest sign on the near block strikes on and comes up to
  full over twelve steps.
- **The rail, the far carriageway and the median** belong to the lamps: the nearest lamp strikes
  and its cone blooms open. So does the lamp itself, wherever it stands — the arm and the head are
  up in the sky band, and the head is the part that is lit and therefore the part that is aimed at,
  so each lamp is asked for its own silhouette before the bands are read at all.
- **The near carriageway and the shoulder** belong to the car: the high beams flash and the car
  pulls forward out of its resting place and eases back over twenty-four steps.
- **The button and the automatic replay** strike the whole lamp line, and the headlights answer
  it.

Every transient decays to exactly zero, and all three are inside half a loop, so a strike is always
over before the loop it began in comes round again.

## The film

The **GIF** button beside the stage films one whole loop: `poleSteps` steps, four times over, at
three times the size. Because the length of a loop is read through the knobs rather than fixed, a
slower lamp cadence films a longer run and the file still holds exactly one lap and no more.

Filming starts from a reset, and a reset here is deliberately a steady state: step zero, no
transient running, every lamp already lit. A warm-up would otherwise sit inside every copy of the
file, and the first frame would not match the last.

The same run can be made ahead of time from the command line. At the declared defaults it is 48
frames, 576 pixels wide, and it is written to the repository's `assets/highway-night.gif`, which is
what the page at large shows of this animation:

```
node tools/gif.mjs --animation highway-night
node tools/poster.mjs --thumbs
```

## Reference plate

`assets/tel-aviv-long-exposure.jpg` is the Ayalon corridor in Tel Aviv on a long exposure. It is
where the band ladder comes from — sky, skyline, lamp line, carriageway, shoulder — along with the
palette's split between a cool sky above and warm ground below, and the shape a sodium pool makes
on wet asphalt. It plays beside the stage as a single held frame: the animation's loop is four
seconds and a still photograph has nothing to step through.

- File: `assets/tel-aviv-long-exposure.jpg`
- Source page: <https://commons.wikimedia.org/wiki/File:Tel_aviv_long_exposure_public_domain_1.jpg>
- Author: Equalhuman
- Licence: CC0 1.0 Universal — <https://creativecommons.org/publicdomain/zero/1.0/>
- Downloaded file: `Tel_aviv_long_exposure_public_domain_1.jpg`, 4928 × 3264, 7,613,726 bytes
- Committed file: 1600 × 1060, downscaled and re-encoded, nothing else changed. The player fits
  the plate into 480 × 191 and the file browser shows it no larger, so the original resolution
  was seven and a half megabytes nobody could see.

## Reference car

`assets/car-sprite-vintage.png` is a side-elevation pixel-art car at roughly the size this one is
drawn at. It settled two questions: how many pixels a readable car needs from wheel to roof, and
where the glass sits in that height. The hero car is drawn from this animation's own silhouette
rules and takes nothing else from it.

- File: `assets/car-sprite-vintage.png`
- Source page: <https://opengameart.org/content/2d-car-sprite-8>
- Author: Chasersgaming
- Licence: CC0 1.0 Universal — <https://creativecommons.org/publicdomain/zero/1.0/>
- Downloaded file: `spr_vintage_0.png`, 288 × 192, 1,353 bytes, unmodified; committed under the
  name it is listed by here

## Reference falloff

`assets/street-at-night-bw.jpg` is a street lamp at night in black and white, which is the useful
part: with colour taken away what is left is how fast the light falls off with distance and how
sharp the edge of the pool is. That curve is what the light field is tuned against.

- File: `assets/street-at-night-bw.jpg`
- Source page: <https://commons.wikimedia.org/wiki/File:Street_at_night,_black_and_white.jpg>
- Author: www.Pixel.la Free Stock Photos
- Licence: CC0 1.0 Universal — <https://creativecommons.org/publicdomain/zero/1.0/>
- Downloaded file: 1560 × 2340, 681,330 bytes, unmodified

## Reference neon, drawn

`assets/neon-city.gif` is pixel-art neon at a small size. It was read for two things: which hues
stay legible against a dark sky at this resolution, and how wide a halo has to be before a lit sign
reads as lit rather than as a coloured box.

- File: `assets/neon-city.gif`
- Source page: <https://opengameart.org/content/neon-city-0>
- Author: cottonball
- Licence: CC0 1.0 Universal — <https://creativecommons.org/publicdomain/zero/1.0/>
- Downloaded file: 150 × 150, 128,347 bytes, unmodified

## Reference neon, photographed

`assets/vegas-neon-fremont-banner.jpg` is a long strip of working neon on Fremont Street. The four
sign hues come from it — pink, cyan, amber, violet — along with the observation that a neon sign at
night is a bright core with a coloured ring around it rather than a flat shape.

- File: `assets/vegas-neon-fremont-banner.jpg`
- Source page: <https://commons.wikimedia.org/wiki/File:WV_banner_Downtown_Las_Vegas_Neon_on_Fremont_Street.jpg>
- Author: Ypsilon from Finland
- Licence: CC0 1.0 Universal — <https://creativecommons.org/publicdomain/zero/1.0/>
- Downloaded file: 3150 × 450, 498,537 bytes, unmodified

## The lamp, which has no reference

None of the reference files shows a mast-arm cobra-head lamp, and no freely-licensed photograph of
one was found to add. The lamp's silhouette is therefore invented: the mast, the arm and the head
are three rectangles and a chamfer, following the same 2-1 stepped rule as the tower tops and the
car roof, at published proportions — a mast about ten metres tall carrying an arm of about two and
a half. The street-lamp photograph above informs how the lamp's light falls off, and nothing at all
about how the lamp looks.

## Licence

The animation and the code that makes it are original work. All five reference files carry the
licence named above: CC0 1.0 Universal, the public-domain dedication.

They are read for palette, proportion, silhouette and timing. No pixel of any of them is ever drawn
on the stage: the plate beside it plays into a canvas of its own, and the file browser shows the
files as files.

# Highway night

A car driving through a lit corridor at night, drawn twice from the same measurements: once
square from the side, with sodium lamps on mast arms and their cones crossing the carriageway,
and once down the length of the road, with the lamp line running away to a vanishing point. The
stage is 192 × 120 pixels either way, every frame is worked out at that size pixel by pixel, and
what is blown up afterwards is the finished buffer.

Nothing is stored between one step and the next except a single integer — the step number — and
three transients a strike sets. Where the lamps are, where the lane dashes are, which sign is
flickering, which oncoming car is in shot: all of it is derived from that one number again from
scratch on every step. Nothing accumulates, so nothing can drift.

The loop is four seconds long and closes exactly. It has to: the animation is filmed straight off
the page into a GIF, and a seam that shifts by one pixel is the difference between a loop and a
stutter.

## Two assemblies and four solos

This folder registers six entries rather than one. Two of them are the whole road, drawn from two
places to stand: the shot down its length and the elevation across it. The other four take one
part of the elevation out, stand it on a stage of its own and hand it the knobs that part answers
to. Everything else is turned off, which is the whole value of them: a decision about a four-pixel
car or a one-pixel shadow is impossible to see inside a picture with a lit city in it.

- **Night highway, lit by its own lamps** — the shot down the road: one horizon, one vanishing
  point, and depth on every row.
- **The same road, seen from the side** — the elevation: no vanishing point at all, and depth
  carried by which horizontal band a thing is drawn in.
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

They share every module in the folder that both pictures can use, and they share this file. What
each declares for itself is a stage, a set of knobs and a drawing order, in one file apiece. A
knob one of the shared modules reads and the stage has not declared is an error at the door rather
than a picture that quietly goes black: `useParams()` is handed the list of keys the stage is
going to need and checks it before anything is drawn.

The two assemblies are filmed into the repository; the four solos are not. The GIF button on a
solo's page works and films whatever is on screen, but there is no committed copy, because what
the site shows of this animation is the road.

## Why a side elevation

The obvious shot is down the road, with the lamps receding to a vanishing point. At 192 pixels
across that shot leaves a car ahead about six pixels tall if it is far enough away to be worth
calling far, and turns every cone of light into a smear near the horizon — and the cones are the
whole reason for that picture. Seen square from the side the cone is a wedge the width of a hand,
the car is a shape rather than a smudge, and depth is carried by which horizontal band a thing is
drawn in.

That decision is load-bearing in the elevation. There is no per-pixel depth anywhere in it and no
camera: the ground is a fixed ladder of six bands, and a thing is far away because it is drawn in
a high band and moves in a high band's colours.

## Why also a shot down the road

The elevation answers the question a driver never asks. What a long exposure of a motorway
actually records — and what the plate this animation is measured against shows — is the corridor
seen down its own length: a lamp line converging, headlight trails drawn towards the eye, and a
road that opens out from a point.

Three things only exist in that shot. Foreshortening is the first: a lamp's pool is a circle of
tarmac about twelve metres across whether it is beside the camera or two hundred metres away, and
what changes is the shape it projects to — twenty rows deep near the eye and two rows deep at the
far end. The second is the point where a lattice stops resolving: the gaps between one lamp and
the next are 7.75, 2.58, 1.29 and 0.77 rows, so four spacings come out as four masts and the rest
close into a smear. The third is the streak: everything moving relative to the camera draws a line
towards the vanishing point, and everything moving with it draws nothing.

None of the three can be shown in an elevation, and none of them needs an extra colour, an extra
buffer or a second kind of frame. The two pictures are the same road at the same scale — 33.3
metres between lamps, 2.775 metres of travel per step, 120 km/h — drawn by the same four sweeps
over the same two buffers.

## What is where

```
index.js          the shot down the road: stage, knobs, palette, plate, stats, world
side.js           the elevation: the same, for the picture across the road
solo-car.js       the car alone: registration and drawing path in one file
solo-lamp.js      the lamps alone, four sources on four switches
solo-traffic.js   the far carriageway alone
solo-city.js      the skyline alone, and nothing that scrolls

state.js          the stage size, the ground ladder, and the constants latched per loop
world.js          the scroll clock, the lattice and the transients
palette.js        forty colours, thirteen material ramps
maths.js          hash, value noise and the ordered dither
light.js          the light field: cones, haze, bloom, and the banding that reads it
neon.js           which signs are lit, which are flickering, and how a lit one reads
skyline.js        the towers at three depths, their windows, beacons and sign housings
backdrop.js       sky, stars, the pollution band, every skyline — drawn once per stage size
render/buffers.js the buffers, the resolve and the backend all six stages share

road.js           the elevation's bands, rail, median, paint and grit
pole.js           the elevation's mast, arm and cobra head
lightcone.js      where each cone points, how wide it opens and how far it carries
car.js            the elevation's hero car and the shade it takes off the road
traffic.js        the elevation's far carriageway — two rows, on their own lattice
render/side.js    the elevation's path: material pass, light pass, resolve, emitters

camera.js         the projection: one horizon, one vanishing column, row to metres
carriageway.js    the road down its length, a cross-section projected row by row
masts.js          the lamp line, on a lattice measured in metres ahead
chase.js          the car ahead, fixed in z and therefore fixed on the screen
approach.js       oncoming traffic as headlamps and exposure, with no bodywork
groundlight.js    pools measured on the road plane, and the light behind the camera
render/deep.js    the shot down the road: the same four sweeps, sorted in depth

assets/           reference material, read and never drawn
```

The middle block is shared by every stage in the folder. The two blocks under it are not: an
elevation has bands and no camera, a shot down the road has a camera and no bands, and neither
set of numbers means anything in the other picture. Trying to make one road module serve both
would have produced a module with a mode switch through the middle of it and two pictures that
were each a little wrong.

## The ground ladder

The ground is 63 units of a 192-wide stage, split into six bands: skirt 6, rail 4, far carriageway
12, median 5, near carriageway 24, shoulder 12. The near carriageway takes up the rounding at other
stage sizes, because it is the widest band and a pixel either way is invisible there, whereas the
rail band is four pixels and cannot spare one.

The ladder is pinned to the stage width, not the height, so the square stage setting adds sky and
never touches the road.

## The camera

The shot down the road has no ladder and nothing for one to hold. It has a horizon, a vanishing
column, and one number that turns a screen row into a distance.

The road is 0.3125 of the stage width deep — 60 rows at 192 across — which puts the horizon
halfway down a 16:10 stage and a little over two thirds of the way down a square one. Pinning it
to the width rather than the height is the same decision the ladder makes, and for the same
reason: the square setting adds sky and never touches the carriageway. The vanishing column is
0.619 of the width, column 119, which is where it sits in the plate.

The camera stands 4.5 metres above the carriageway and 12 metres behind the car it is following.
Both are knobs. The focal length is folded into a single constant — 516 metre-rows at the design
scale — so a row `d` below the horizon is `516 / d` metres away, and a metre at that row is
`d / 4.5` pixels across. Everything else in the picture is those two lines:

```
row    d    z (m)   px per metre
 61    1    516.0     0.22
 65    5    103.2     1.11
 70   10     51.6     2.22
 80   20     25.8     4.44
 90   30     17.2     6.67
103   43     12.0     9.56
119   59      8.7    13.11
```

The corridor is a cross-section in metres, measured off the plate and held at every depth: far
shoulder at −15.1, oncoming carriageway from −12.6 to −5.4 with its divider at −9.0, median from
−5.4 to −1.8 carrying a 0.9-metre barrier, the camera's own carriageway from −1.8 to +5.4 with its
divider at +1.8, and the right shoulder out to +7.9. The masts stand at −14.6 and +7.4 and reach
their heads in to −12.2 and +5.0. Each row of the road is that cross-section projected at the row's
own depth, which is why the lane lines converge without anything being told to converge, and why
the barrier gets shorter as it goes.

Lamps every 33.3 metres land at these rows below the horizon:

```
lamp   z (m)   rows below horizon   gap from the one before
  1     33.3         15.50            —
  2     66.6          7.75          7.75
  3     99.9          5.17          2.58
  4    133.2          3.87          1.29
  5    166.5          3.10          0.77
  6    199.8          2.58          0.52
```

Four spacings resolve as four masts. The fifth is three quarters of a row from the fourth and the
sixth is half a row from the fifth, which is not a lamp line any more but aliasing, so the picture
stops drawing masts past two hundred and fifty metres and lets a band of light along the horizon
carry the rest of the line — which is what the plate shows there too.

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

## The loop, in z

The shot down the road runs the same clock with the same knobs, and the lattice it hangs things on
is the same lattice with its units changed: metres ahead of the camera where the elevation has
pixels across the stage. The lamp spacing knob is still read in design pixels and is still
converted at 33.3 metres to 48 of them, because a spacing that differed between the two pictures
would make one of them a lie about the other.

At the defaults the camera covers 2.775 metres a step, a lamp spacing every twelve steps, four
spacings to a loop. Every hash is taken on a cell index counted modulo the cells in a loop, exactly
as across the stage, so the mast arriving at the horizon carries what the mast that has just swept
past the camera was carrying.

The road markings hang on halvings of the same lattice: the dashes on a quarter of the spacing,
which is sixteen cells to a loop, and the two rows of oncoming traffic at three quarters and five
quarters over the camera's own speed, which is seven and nine cells. Whole numbers in every case —
a row that covered a fraction of its own spacing in a loop would not come back onto itself, and the
seam would show as a car appearing out of nothing.

## What streaks and what does not

A long exposure draws a line for everything that moved while the shutter was open, and the length
of the line is how fast the thing was going relative to the camera. That sentence is the whole of
the picture's motion rule, and both halves of it are drawn.

Oncoming traffic streaks. Each car is a pair of headlamps and nothing else — at a hundred metres
there is no bodywork to draw and a photograph of one has none — and behind each lamp the same lamp
is drawn again at where it was one step ago, two steps ago, and so on for as many steps as the
exposure knob asks for. It is not a streak drawn along the screen: it is the same piece of
geometry evaluated at earlier distances, so it converges on the vanishing point, thins as it goes
and bends the way the road bends, none of which it had to be told.

The car ahead does not streak, and cannot. It is being followed at a fixed distance, so relative to
the camera it is not moving, so the shutter has nothing to smear. For the same reason it never
changes size: a fixed distance projects to a fixed rectangle, and the shell is the same nineteen
pixels by eighteen on every step of the loop. There is no surge and no wobble in this picture —
striking the road flashes the brake lamps and pushes the red further down the tarmac, and the body
does not move at all. A car ahead that surged would get smaller, and at this scale a tenth of a
metre is a pixel appearing on one side of it and not the other.

The road between the two streaks and does so quietly: the lane dashes, the barrier and the paint
are all fixed to the world rather than to the camera, so they run past at the camera's own speed
and the pools of the lamps run with them.

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
and reads as static, so in the elevation the road's light is multiplied by a wrapped value noise
first — patched surfacing, sixteen blotches to a loop, so the grid closes at the seam like
everything else.

Down the road the sources are the same idea measured somewhere else. A lamp lays a circle on the
road plane: nine metres up, twelve metres of reach, inverse square with a cosine term, all of it in
metres, and only then projected. Nothing works out the foreshortening — a near pool coming out
twenty rows deep and a far one two is what happens when a circle of tarmac is drawn where the
camera says it is. For the same reason a pool is allowed to land on the road and on nothing else: a
mast and the car ahead stand out of the plane and are not inside the circle however many of their
pixels it covers, so they stay silhouettes against it, which at night is what they are.

Two flat sources hold the picture up underneath all that. A city on the horizon puts a little light
on everything, which is the difference between a road that fades into the dark and one that ends at
a hard edge; and a band along the horizon carries the part of the lamp line the geometry has
stopped drawing. One source points the other way: the camera is in a car, that car has its lamps
on, and while its beams add nothing to a road they strike at a grazing angle, they fall square on
the one vertical surface aimed straight back at them. That is why there is anything to see on the
back of the car ahead at all, and why moving the chase knob changes how well lit it is as well as
how big.

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

The shot down the road takes the same groups and changes three things in them. It gains a
**camera** group — height above the carriageway, from 3 to 8 metres, and chase distance, from 8 to
20 — which between them decide where the horizon falls, how fast the road opens out below it, and
how big the one object in shot with a size the eye already knows is drawn. Mast height is in
metres there rather than pixels, because a mast in that picture is a different number of pixels at
every distance. And the trail knob becomes an exposure in steps, because what is drawn is not a
length but a number of earlier positions.

Two knobs the elevation offers are absent. Cone spread has nothing to open: a cone seen end on has
no width to argue about, and what the lamp lays is a pool on the ground rather than a wedge across
the picture. Patched asphalt is off, because the patch grid is scrolled sideways by a
pixels-per-step that only an elevation has, and a fixed grid laid over a road that recedes is a
texture standing still on a moving surface.

Four knobs take hold at the top of the next loop rather than at once: lamp spacing, steps per lamp,
the number of oncoming cars and the number of lit signs. All four re-cut a lattice, and a lattice
re-cut halfway through a loop leaves the scroll out of step with itself and tears the seam open.
Everything else applies immediately.

The cone texture knob is the one that shows what the palette is doing. There are forty colours
and no blending between them, so a light value that falls between two steps of a ramp has
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

The shot down the road reads depth instead, because that is the only thing it has. Each mast is
asked first and answers for the two rectangles it actually drew — its own column and its own arm —
so the road under an arm stays road; above the horizon belongs to the signs; and everything else is
road, where a strike puts the brake lamps on and floods the tarmac behind the car with red. A
strike in the sky takes the column it was aimed at and then steps out to the nearest housing in it
that is dark, because striking a tube that is already running can only interrupt it, and what the
hint beside the stage promises is a sign coming on. The
button and the automatic replay run the lamp line from the horizon towards the eye, one pair at a
time, and the ripple is stretched to whatever length the spacing knob has made the line so that it
always reaches the near end before the transient that started it has run out.

Every transient decays to exactly zero, and all of them are inside half a loop, so a strike is
always over before the loop it began in comes round again.

## The film

The **GIF** button beside the stage films one whole loop: `poleSteps` steps, four times over, at
three times the size. Because the length of a loop is read through the knobs rather than fixed, a
slower lamp cadence films a longer run and the file still holds exactly one lap and no more.

Filming starts from a reset, and a reset here is deliberately a steady state: step zero, no
transient running, every lamp already lit. A warm-up would otherwise sit inside every copy of the
file, and the first frame would not match the last.

The same run can be made ahead of time from the command line. At the declared defaults each is 48
frames, 576 pixels wide, and the two are written to `assets/highway-night.gif` and
`assets/highway-side.gif`, which is what the page at large shows of this animation:

```
node tools/gif.mjs --animation highway-night
node tools/gif.mjs --animation highway-side
node tools/poster.mjs --thumbs
```

## Reference plate

`assets/tel-aviv-long-exposure.jpg` is the Ayalon corridor in Tel Aviv on a long exposure. It is
where the band ladder comes from — sky, skyline, lamp line, carriageway, shoulder — along with the
palette's split between a cool sky above and warm ground below, and the shape a sodium pool makes
on wet asphalt. It plays beside the stage as a single held frame: the animation's loop is four
seconds and a still photograph has nothing to step through.

The two assemblies crop it differently, because they read it for different things. The elevation
takes the widest strip it can, 1600 × 636 from 81 pixels down, which is the band structure and
nothing else. The shot down the road takes 1600 × 1000 from 30 pixels down, because a projection
needs the height: the corridor runs away to a point about 62 per cent across the crop and halfway
down it, the lamp line converges on that point, and the skyline stacks to the left of it. Those
three observations are the vanishing column, the horizon, and where the towers stand — and they
were measured off the crop by eye, at the crop's own scale, rather than derived from a lens.

- File: `assets/tel-aviv-long-exposure.jpg`
- Source page: <https://commons.wikimedia.org/wiki/File:Tel_aviv_long_exposure_public_domain_1.jpg>
- Author: Equalhuman
- Licence: CC0 1.0 Universal — <https://creativecommons.org/publicdomain/zero/1.0/>
- Downloaded file: `Tel_aviv_long_exposure_public_domain_1.jpg`, 4928 × 3264, 7,613,726 bytes
- Committed file: 1600 × 1060, downscaled and re-encoded, nothing else changed. The players fit
  their crops into 480 × 200 and 480 × 300 and the file browser shows the plate no larger, so the
  original resolution was seven and a half megabytes nobody could see.

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

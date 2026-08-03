"use strict";

// Plays the animation's registered reference sheet a frame at a time next to
// the live stage, so the two can be watched side by side. The sheet is only
// ever blitted into this canvas: nothing here touches the animation.
//
// The two sides are held together by the animation's own cycle rather than by
// a second clock. An animation that says where it is in its stride hands over
// a number between 0 and 1, and the plate frame is read straight off it — so a
// knob that makes the stride longer stretches the plate over the same stride
// instead of letting the two drift apart a frame at a time.

export function initSheet(spec, api) {
  var canvas = document.getElementById("sheet-canvas");
  if (canvas && canvas.getContext) {
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }
  if (!spec.reference) return function () {};

  var reference = spec.reference;
  var sheet = document.getElementById("sheet-img");
  var label = document.getElementById("sheet-meta");
  if (!sheet || !canvas || !canvas.getContext) return function () {};

  var COLS = reference.columns;
  var FRAMES = reference.frames;
  // a plate is not always a square grid flush with its own corner
  var CELL_W = reference.frameSize;
  var CELL_H = reference.frameHeight;
  var ORIGIN = reference.origin;
  var GAP = reference.gap;

  canvas.width = reference.player.width;
  canvas.height = reference.player.height;
  canvas.style.imageRendering = reference.pixelated ? "pixelated" : "auto";
  var VIEW_W = canvas.width;
  var VIEW_H = canvas.height;

  // Pixel art is shown at a whole-number magnification so it stays crisp. A
  // photograph is not pixel art: rounding a plate down to 2x throws away a
  // third of the canvas for nothing, so it is fitted to the room it has.
  var fit = Math.min(VIEW_W / CELL_W, VIEW_H / CELL_H);
  var SCALE = reference.pixelated ? Math.max(1, Math.floor(fit)) : fit;
  var DRAW_W = Math.round(CELL_W * SCALE);
  var DRAW_H = Math.round(CELL_H * SCALE);

  // the animation's cadence, so a sheet with no phase to follow still runs at
  // the rate the animation is stepping
  var FPS = 12;

  var ctx = canvas.getContext("2d");
  var frame = 0;
  var carried = 0;
  var last = 0;
  var ready = false;
  var going = true;
  var phase = api && api.phase;

  // How long the animation's own cycle is, if it declares one. When that
  // disagrees with the number of frames on the plate the two are still in step
  // — the plate is stretched across the stride — but it is worth saying so,
  // because the plate is then no longer frame for frame with the animation.
  function cycleSteps() {
    return api && api.filmSteps && spec.poster.film
      ? Math.round(api.filmSteps() / spec.poster.film.cycles)
      : 0;
  }

  function note() {
    var steps = cycleSteps();
    var text = "frame " + (frame + 1) + " / " + FRAMES;
    if (!phase) return text + " · " + FPS + " fps";
    text += " · locked to the stride";
    if (steps && steps !== FRAMES) {
      text += " · " + steps + " steps against " + FRAMES + " plates";
    }
    return text;
  }

  function draw() {
    ctx.imageSmoothingEnabled = SCALE < 1 || !reference.pixelated;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    var col = frame % COLS;
    var row = (frame / COLS) | 0;
    ctx.drawImage(sheet,
      ORIGIN.x + col * (CELL_W + GAP.x), ORIGIN.y + row * (CELL_H + GAP.y),
      CELL_W, CELL_H,
      Math.round((VIEW_W - DRAW_W) / 2), VIEW_H - DRAW_H,
      DRAW_W, DRAW_H);
    label.textContent = note();
  }

  function tick(now) {
    if (!going) return;
    window.requestAnimationFrame(tick);
    if (!ready) return;

    var wanted;
    if (phase) {
      // read straight off the animation: no second clock, nothing to drift
      var at = phase();
      wanted = Math.floor(((at % 1) + 1) % 1 * FRAMES) % FRAMES;
    } else {
      var dt = last ? Math.min((now - last) / 1000, 0.25) : 0;
      last = now;
      carried += dt * FPS;
      var step = carried | 0;
      if (!step) return;
      carried -= step;
      wanted = (frame + step) % FRAMES;
    }
    if (wanted === frame) return;
    frame = wanted;
    draw();
  }

  function begin() {
    ready = true;
    draw();
  }

  // the sheet holds its last frame until the next run restarts it
  function restart(event) {
    if (event.detail && event.detail.fps > 0) FPS = event.detail.fps;
    if (!ready) return;
    frame = 0;
    carried = 0;
    draw();
  }
  document.addEventListener("pixels:detonate", restart);
  document.addEventListener("pixels:apply", draw);

  if (sheet.complete && sheet.naturalWidth) begin();
  else sheet.addEventListener("load", begin);
  window.requestAnimationFrame(tick);

  return function () {
    going = false;
    document.removeEventListener("pixels:detonate", restart);
    document.removeEventListener("pixels:apply", draw);
    sheet.removeEventListener("load", begin);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  };
}

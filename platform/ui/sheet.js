"use strict";

// Plays the animation's registered reference sheet a frame at a time next to
// the live stage, at the same cadence, so the two can be watched side by side.
// The sheet is only ever blitted into this canvas: nothing here touches the
// animation.

export function initSheet(spec) {
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

  // Pixel art is shown at a whole-number magnification so it stays crisp; a
  // photographic plate is bigger than the canvas and is fitted into it
  // instead, which is the one place on this page where smoothing belongs.
  var fit = Math.min(VIEW_W / CELL_W, VIEW_H / CELL_H);
  var SCALE = fit >= 1 ? Math.floor(fit) : fit;
  var DRAW_W = Math.round(CELL_W * SCALE);
  var DRAW_H = Math.round(CELL_H * SCALE);

  // the animation's cadence, so the two sides stay comparable; it arrives with
  // every run and follows the knob
  var FPS = 12;

  var ctx = canvas.getContext("2d");
  var frame = 0;
  var carried = 0;
  var last = 0;
  var ready = false;
  var going = true;

  function draw() {
    ctx.imageSmoothingEnabled = SCALE < 1;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    var col = frame % COLS;
    var row = (frame / COLS) | 0;
    ctx.drawImage(sheet,
      ORIGIN.x + col * (CELL_W + GAP.x), ORIGIN.y + row * (CELL_H + GAP.y),
      CELL_W, CELL_H,
      Math.round((VIEW_W - DRAW_W) / 2), VIEW_H - DRAW_H,
      DRAW_W, DRAW_H);
    label.textContent = "frame " + (frame + 1) + " / " + FRAMES + " · " + FPS + " fps";
  }

  function tick(now) {
    if (!going) return;
    window.requestAnimationFrame(tick);
    if (!ready) return;
    var dt = last ? Math.min((now - last) / 1000, 0.25) : 0;
    last = now;
    carried += dt * FPS;
    var step = carried | 0;
    if (!step) return;
    carried -= step;
    // the sheet is shorter than the gap between runs, so it loops on its own
    // and a fresh run snaps it back to the first frame
    frame = (frame + step) % FRAMES;
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

  if (sheet.complete && sheet.naturalWidth) begin();
  else sheet.addEventListener("load", begin);
  window.requestAnimationFrame(tick);

  return function () {
    going = false;
    document.removeEventListener("pixels:detonate", restart);
    sheet.removeEventListener("load", begin);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  };
}

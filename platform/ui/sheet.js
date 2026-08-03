"use strict";

// Plays the animation's registered reference sheet a frame at a time next to
// the live stage, at the same cadence and the same pixel scale, so the two can
// be watched side by side. The sheet is only ever blitted into this canvas:
// nothing here touches the animation.

export function initSheet(spec) {
  if (!spec.reference) return;
  var reference = spec.reference;

  var sheet = document.getElementById("sheet-img");
  var canvas = document.getElementById("sheet-canvas");
  var label = document.getElementById("sheet-meta");
  if (!sheet || !canvas || !canvas.getContext) return;

  var COLS = reference.columns;
  var FRAMES = reference.frames;
  var SIZE = reference.frameSize;
  var VIEW_W = canvas.width;
  var VIEW_H = canvas.height;

  // the animation's cadence, so the two sides stay comparable; it arrives with
  // every detonation and follows the knob
  var FPS = 12;

  var ctx = canvas.getContext("2d");
  var frame = 0;
  var carried = 0;
  var last = 0;
  var ready = false;

  function draw() {
    // no smoothing anywhere: the frame goes across pixel for pixel and the
    // canvas itself is what gets blown up
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.drawImage(sheet, (frame % COLS) * SIZE, ((frame / COLS) | 0) * SIZE,
                  SIZE, SIZE, (VIEW_W - SIZE) / 2, VIEW_H - SIZE, SIZE, SIZE);
    label.textContent = "frame " + (frame + 1) + " / " + FRAMES + " · " + FPS + " fps";
  }

  function tick(now) {
    window.requestAnimationFrame(tick);
    if (!ready) return;
    var dt = last ? Math.min((now - last) / 1000, 0.25) : 0;
    last = now;
    carried += dt * FPS;
    var step = carried | 0;
    if (!step) return;
    carried -= step;
    // the sheet is shorter than the gap between runs, so it loops on its own
    // and a detonation snaps it back to the first frame
    frame = (frame + step) % FRAMES;
    draw();
  }

  function begin() {
    ready = true;
    draw();
  }

  // the sheet holds its last frame until the next run restarts it
  document.addEventListener("pixels:detonate", function (event) {
    if (event.detail && event.detail.fps > 0) FPS = event.detail.fps;
    if (!ready) return;
    frame = 0;
    carried = 0;
    draw();
  });

  if (sheet.complete && sheet.naturalWidth) begin();
  else sheet.addEventListener("load", begin);
  window.requestAnimationFrame(tick);
}

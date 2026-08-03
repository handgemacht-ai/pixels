"use strict";

// Square screen pixels.
//
// A canvas stretched to fill its box lands on a fractional magnification —
// 3.6875 across a 590px panel — and the browser resolves that by making some
// stage pixels seven device pixels wide and their neighbours eight. Straight
// edges then shimmer as the animation moves under them, because which pixels
// get the extra column changes from frame to frame.
//
// So the canvas is not stretched. It is given the largest whole-number
// magnification that still fits, measured in device pixels, and centred in
// whatever room is left over. Every stage pixel is then exactly the same size
// as every other one, which is the whole point of drawing at 160 x 100.

export function initFit(box, canvases, width, height) {
  if (!box || !width || !height) return function () {};

  var going = true;

  function apply() {
    if (!going) return;
    var room = box.getBoundingClientRect();
    if (!room.width || !room.height) return;
    var dpr = window.devicePixelRatio || 1;

    // whole device pixels per stage pixel, which is what keeps them square
    var across = Math.floor((room.width * dpr) / width);
    var down = Math.floor((room.height * dpr) / height);
    var device = Math.max(1, Math.min(across, down));
    var scale = device / dpr;

    var w = width * scale;
    var h = height * scale;
    for (var i = 0; i < canvases.length; i++) {
      var canvas = canvases[i];
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      canvas.style.left = Math.round((room.width - w) / 2) + "px";
      canvas.style.top = Math.round((room.height - h) / 2) + "px";
      canvas.style.right = "auto";
      canvas.style.bottom = "auto";
    }
  }

  apply();

  var observer = null;
  if (typeof ResizeObserver === "function") {
    observer = new ResizeObserver(apply);
    observer.observe(box);
  }
  // the magnification is measured in device pixels, so it has to be worked out
  // again when a window moves to a screen with a different pixel density
  window.addEventListener("resize", apply);

  return function () {
    going = false;
    if (observer) observer.disconnect();
    window.removeEventListener("resize", apply);
    for (var i = 0; i < canvases.length; i++) {
      var canvas = canvases[i];
      canvas.style.width = "";
      canvas.style.height = "";
      canvas.style.left = "";
      canvas.style.top = "";
      canvas.style.right = "";
      canvas.style.bottom = "";
    }
  };
}

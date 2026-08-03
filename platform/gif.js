"use strict";

// A GIF89a writer, written out by hand because the picture asks for so little:
// a handful of colours, whole-pixel blocks, no dithering, no colour reduction.
// Every frame arrives as one byte per pixel — an index into the animation's own
// palette — and comes out the other side as exactly those colours.
//
// Nothing here touches the browser or the file system, so the page and the
// command-line tools write the same bytes out of the same code.

// A growable byte sink. The parts are pushed as arrays or typed arrays and
// joined once at the end, which is cheaper than concatenating as we go.
function byteSink() {
  var parts = [];
  var total = 0;
  return {
    push: function (bytes) {
      parts.push(bytes);
      total += bytes.length;
    },
    ascii: function (text) {
      var out = new Uint8Array(text.length);
      for (var i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xFF;
      parts.push(out);
      total += out.length;
    },
    short: function (value) {
      parts.push(new Uint8Array([value & 0xFF, (value >> 8) & 0xFF]));
      total += 2;
    },
    finish: function () {
      var out = new Uint8Array(total);
      var at = 0;
      for (var i = 0; i < parts.length; i++) {
        out.set(parts[i], at);
        at += parts[i].length;
      }
      return out;
    }
  };
}

// Codes are packed least-significant bit first, and the stream is cut into
// blocks of at most 255 bytes with a length in front of each.
function bitWriter() {
  var bytes = [];
  var acc = 0;
  var held = 0;
  return {
    write: function (code, width) {
      acc |= code << held;
      held += width;
      while (held >= 8) {
        bytes.push(acc & 0xFF);
        acc >>= 8;
        held -= 8;
      }
    },
    finish: function () {
      if (held > 0) bytes.push(acc & 0xFF);
      return bytes;
    }
  };
}

// LZW, in the shape the format's own decoder expects: the code width grows one
// bit at a time as the dictionary fills, and a clear code starts it over when
// the dictionary is full.
function compress(indices, minCodeSize) {
  var CLEAR = 1 << minCodeSize;
  var END = CLEAR + 1;
  var CEILING = 1 << 12;

  var bits = bitWriter();
  var width = minCodeSize + 1;
  var top = (1 << width) - 1;
  var next = CLEAR + 2;
  var cleared = false;
  var dictionary = new Map();

  function emit(code) {
    bits.write(code, width);
    if (cleared) {
      width = minCodeSize + 1;
      top = (1 << width) - 1;
      cleared = false;
    } else if (next > top) {
      width += 1;
      top = width === 12 ? CEILING : (1 << width) - 1;
    }
  }

  emit(CLEAR);
  var run = indices[0];
  for (var i = 1; i < indices.length; i++) {
    var pixel = indices[i];
    var key = (run << 8) | pixel;
    var known = dictionary.get(key);
    if (known !== undefined) { run = known; continue; }
    emit(run);
    if (next < CEILING) {
      dictionary.set(key, next);
      next += 1;
    } else {
      dictionary.clear();
      next = CLEAR + 2;
      cleared = true;
      emit(CLEAR);
    }
    run = pixel;
  }
  emit(run);
  emit(END);

  var raw = bits.finish();
  var out = [minCodeSize];
  for (var at = 0; at < raw.length; at += 255) {
    var chunk = raw.slice(at, at + 255);
    out.push(chunk.length);
    for (var j = 0; j < chunk.length; j++) out.push(chunk[j]);
  }
  out.push(0);
  return new Uint8Array(out);
}

// The smallest rectangle that changed since the frame before. Everything
// outside it is left standing, which is both smaller on disk and the reason
// the loop restarts cleanly: the first frame covers the whole canvas.
function changedBox(previous, current, width, height) {
  var left = width, right = -1, top = height, bottom = -1;
  for (var y = 0; y < height; y++) {
    var row = y * width;
    for (var x = 0; x < width; x++) {
      if (previous[row + x] === current[row + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return { x: 0, y: 0, width: 1, height: 1 };
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function crop(pixels, width, box) {
  var out = new Uint8Array(box.width * box.height);
  for (var y = 0; y < box.height; y++) {
    var from = (box.y + y) * width + box.x;
    out.set(pixels.subarray(from, from + box.width), y * box.width);
  }
  return out;
}

// Twelve frames a second is not a whole number of hundredths, so the delays
// are worked out from a running total: 8, 9, 8, 8, 9 … which averages exactly
// right instead of drifting a frame every few seconds.
export function delaysForRate(count, fps) {
  var out = [];
  for (var i = 0; i < count; i++) {
    out.push(Math.round((i + 1) * 100 / fps) - Math.round(i * 100 / fps));
  }
  return out;
}

// One drawn pixel becomes a square block of them. Whole numbers only, so
// nothing is ever resampled and no ninth colour can appear along an edge.
export function magnify(pixels, width, height, scale) {
  if (scale === 1) return pixels;
  var wide = width * scale;
  var out = new Uint8Array(wide * height * scale);
  var row = new Uint8Array(wide);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      row.fill(pixels[y * width + x], x * scale, x * scale + scale);
    }
    for (var r = 0; r < scale; r++) out.set(row, (y * scale + r) * wide);
  }
  return out;
}

// palette: [[r, g, b], …] up to 256 entries; frames: Uint8Array of indices.
export function encodeGif(options) {
  var width = options.width;
  var height = options.height;
  var palette = options.palette;
  var frames = options.frames;
  var delays = options.delays;

  if (!frames.length) throw new Error("gif: no frames");
  if (!palette.length || palette.length > 256) throw new Error("gif: palette must hold 1 to 256 colours");

  // the colour table is a power of two long, so it is padded rather than
  // trimmed; the padding is never indexed
  var exponent = Math.max(1, Math.ceil(Math.log2(palette.length)));
  var slots = 1 << exponent;
  var table = new Uint8Array(slots * 3);
  palette.forEach(function (colour, i) {
    table[i * 3] = colour[0];
    table[i * 3 + 1] = colour[1];
    table[i * 3 + 2] = colour[2];
  });
  var minCodeSize = Math.max(2, exponent);

  var sink = byteSink();
  sink.ascii("GIF89a");
  sink.short(width);
  sink.short(height);
  sink.push(new Uint8Array([
    0x80 | 0x70 | (exponent - 1),
    options.background === undefined ? 0 : options.background,
    0
  ]));
  sink.push(table);

  // "play it again", for as long as anyone is looking
  sink.push(new Uint8Array([0x21, 0xFF, 0x0B]));
  sink.ascii("NETSCAPE2.0");
  sink.push(new Uint8Array([0x03, 0x01]));
  sink.short(0);
  sink.push(new Uint8Array([0x00]));

  var previous = null;
  var boxes = [];
  frames.forEach(function (pixels, i) {
    var box = previous
      ? changedBox(previous, pixels, width, height)
      : { x: 0, y: 0, width: width, height: height };
    boxes.push(box);

    // disposal 1: leave the frame standing, so the next one only has to paint
    // what moved
    sink.push(new Uint8Array([0x21, 0xF9, 0x04, 0x04]));
    sink.short(delays[i]);
    sink.push(new Uint8Array([0x00, 0x00]));
    sink.push(new Uint8Array([0x2C]));
    sink.short(box.x);
    sink.short(box.y);
    sink.short(box.width);
    sink.short(box.height);
    sink.push(new Uint8Array([0x00]));
    sink.push(compress(crop(pixels, width, box), minCodeSize));

    previous = pixels;
  });

  sink.push(new Uint8Array([0x3B]));
  return { bytes: sink.finish(), boxes: boxes, minCodeSize: minCodeSize, slots: slots };
}

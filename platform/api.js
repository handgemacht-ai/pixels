"use strict";

// The registration API. An animation is one call to defineAnimation(): it
// declares what it is, the knobs it wants, the material the platform should
// show around it, and the ways it can draw itself. The platform builds the
// page from that declaration and never reaches into the animation for
// anything it was not handed.
//
// Everything below is checked at load time and throws on a mistake, so a
// half-declared animation fails at the door rather than three panels later.

function must(condition, message) {
  if (!condition) throw new Error("pixels: " + message);
}

// A number the animation would rather read off one of its own knobs.
// Anywhere the platform takes a number — stage width and shape, cadence,
// replay gap — it also takes knob("someKey").
export function knob(key) {
  must(typeof key === "string" && key, "knob() needs the key of a declared knob");
  return { knob: key };
}

export function readBinding(binding, params) {
  return typeof binding === "number" ? binding : params[binding.knob];
}

function checkBinding(binding, keys, what) {
  if (typeof binding === "number") return binding;
  must(binding && typeof binding.knob === "string", what + " must be a number or knob(key)");
  must(keys.indexOf(binding.knob) >= 0, what + ' names an undeclared knob "' + binding.knob + '"');
  return binding;
}

function inferKind(path) {
  if (/\.md$/i.test(path)) return "markdown";
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(path)) return "image";
  return "code";
}

function inferLang(path) {
  if (/\.js$/i.test(path)) return "js";
  if (/\.css$/i.test(path)) return "css";
  if (/\.html?$/i.test(path)) return "html";
  return "text";
}

function normaliseKnob(raw, index) {
  must(raw && raw.key, "knob " + index + " needs a key");
  must(raw.label, 'knob "' + raw.key + '" needs a label');
  var type = raw.type || "slider";
  must(type === "slider" || type === "toggle" || type === "choice",
    'knob "' + raw.key + '" has an unknown type "' + type + '" (slider, toggle or choice)');
  must(raw.default !== undefined, 'knob "' + raw.key + '" needs a default');
  var applies = raw.applies || "live";
  must(applies === "live" || applies === "next",
    'knob "' + raw.key + '" must say applies: "live" or "next"');
  if (type === "slider") {
    must(typeof raw.min === "number" && typeof raw.max === "number" && typeof raw.step === "number",
      'slider "' + raw.key + '" needs min, max and step');
    must(raw.min <= raw.default && raw.default <= raw.max,
      'slider "' + raw.key + '" has a default outside its range');
  }
  // A knob with a handful of settings rather than a range: each is a number
  // the animation reads exactly as it reads a slider, under a label to pick
  // it by.
  var options = [];
  if (type === "choice") {
    must(Array.isArray(raw.options) && raw.options.length > 1,
      'choice "' + raw.key + '" needs two or more options');
    options = raw.options.map(function (option, at) {
      must(option && typeof option.value === "number",
        'choice "' + raw.key + '" option ' + at + " needs a number value");
      must(option.label, 'choice "' + raw.key + '" option ' + at + " needs a label");
      return { value: option.value, label: option.label };
    });
    must(options.filter(function (o) { return o.value === raw.default; }).length === 1,
      'choice "' + raw.key + '" has a default that is not one of its options');
  }
  return {
    key: raw.key,
    label: raw.label,
    group: raw.group || "settings",
    type: type,
    min: raw.min,
    max: raw.max,
    step: raw.step,
    options: options,
    unit: raw.unit || "",
    default: raw.default,
    applies: applies
  };
}

function normaliseFile(raw, base, index) {
  var file = typeof raw === "string" ? { path: raw } : raw;
  must(file && file.path, "file " + index + " needs a path");
  var kind = file.kind || inferKind(file.path);
  return {
    path: file.path,
    url: new URL(file.path, base).href,
    kind: kind,
    lang: file.lang || (kind === "code" ? inferLang(file.path) : ""),
    sub: file.sub || "",
    meta: file.meta || "",
    caption: file.caption || "",
    alt: file.alt || "",
    pixelated: !!file.pixelated,
    open: !!file.open
  };
}

function normaliseStats(raw, owner) {
  return (raw || []).map(function (cell, i) {
    must(cell && cell.key, owner + " stat " + i + " needs a key");
    must(cell.label, owner + " stat " + i + " needs a label");
    return { key: cell.key, label: cell.label, format: cell.format || "count" };
  });
}

export function defineAnimation(spec) {
  must(spec && typeof spec === "object", "defineAnimation() takes an object");
  must(spec.id, "an animation needs an id");
  must(spec.title, 'animation "' + spec.id + '" needs a title');
  must(spec.base, 'animation "' + spec.id +
    '" needs base: new URL(".", import.meta.url).href, so the platform can find its files');
  must(typeof spec.create === "function", 'animation "' + spec.id + '" needs create(ctx)');
  must(Array.isArray(spec.backends) && spec.backends.length,
    'animation "' + spec.id + '" needs at least one backend');

  var knobs = (spec.knobs || []).map(normaliseKnob);
  var keys = knobs.map(function (k) { return k.key; });
  keys.forEach(function (key, i) {
    must(keys.indexOf(key) === i, 'knob "' + key + '" is declared twice');
  });

  var stage = spec.stage || {};
  must(typeof stage.aspect !== "number" || stage.aspect > 0,
    "stage.aspect must be the height as a fraction of the width");

  var backendIds = [];
  var backends = spec.backends.map(function (backend, i) {
    must(backend && backend.id, "backend " + i + " needs an id");
    must(backend.label, 'backend "' + backend.id + '" needs a label');
    must(typeof backend.create === "function", 'backend "' + backend.id + '" needs create(ctx)');
    must(backendIds.indexOf(backend.id) < 0, 'backend "' + backend.id + '" is declared twice');
    backendIds.push(backend.id);
    return {
      id: backend.id,
      label: backend.label,
      note: backend.note || "",
      stats: normaliseStats(backend.stats, 'backend "' + backend.id + '"'),
      create: backend.create
    };
  });

  var defaultBackend = spec.defaultBackend || backends[0].id;
  must(backendIds.indexOf(defaultBackend) >= 0,
    'defaultBackend "' + defaultBackend + '" is not one of the declared backends');

  var palette = null;
  if (spec.palette) {
    must(spec.palette.colours && Object.keys(spec.palette.colours).length,
      "palette.colours must be a map of name to 0xrrggbb");
    palette = {
      colours: spec.palette.colours,
      lockKnob: spec.palette.lockKnob || "",
      title: spec.palette.title || ""
    };
    if (palette.lockKnob) {
      must(keys.indexOf(palette.lockKnob) >= 0,
        'palette.lockKnob names an undeclared knob "' + palette.lockKnob + '"');
    }
  }

  var reference = null;
  if (spec.reference) {
    var r = spec.reference;
    must(r.image, "reference.image is the file the player reads");
    must(r.columns > 0 && r.frames > 0 && r.frameSize > 0,
      "reference needs columns, frames and frameSize");
    reference = {
      image: r.image,
      url: new URL(r.image, spec.base).href,
      name: r.name || r.image.split("/").pop(),
      columns: r.columns,
      rows: r.rows || Math.ceil(r.frames / r.columns),
      frames: r.frames,
      frameSize: r.frameSize,
      // a grid is square, flush with the corner and gapless unless it says
      // otherwise — which a photographic plate usually does
      frameHeight: r.frameHeight || r.frameSize,
      origin: { x: (r.origin && r.origin.x) || 0, y: (r.origin && r.origin.y) || 0 },
      gap: { x: (r.gap && r.gap.x) || 0, y: (r.gap && r.gap.y) || 0 },
      // the canvas the player runs in: a stage-sized one for pixel art, a
      // roomier one for a photographic plate that has to be shrunk to fit
      player: {
        width: (r.player && r.player.width) || 160,
        height: (r.player && r.player.height) || 100
      },
      pixelated: r.pixelated === undefined ? true : !!r.pixelated,
      alt: r.alt || "",
      credit: r.credit || "",
      links: r.links || [],
      legend: r.legend || "",
      sourceLegend: r.sourceLegend || "",
      caption: r.caption || ""
    };
  }

  var action = spec.action || {};

  // The still that stands in for the animation: a step of a seeded run, drawn
  // by the animation itself. Never a piece of reference material — the poster
  // is the thing the page actually draws.
  var poster = spec.poster || {};
  must(poster.step === undefined || (poster.step >= 0 && poster.step === Math.round(poster.step)),
    "poster.step is a whole number of steps into a run");
  if (poster.backend !== undefined) {
    must(backendIds.indexOf(poster.backend) >= 0,
      'poster.backend "' + poster.backend + '" is not one of the declared backends');
  }
  if (poster.icon) {
    must(poster.icon.size > 0, "poster.icon needs x, y and size, in stage pixels");
  }
  if (poster.film) {
    must(typeof poster.film.steps !== "number" || poster.film.steps > 0,
      "poster.film.steps is how many steps a whole run takes");
    checkBinding(poster.film.steps, keys, "poster.film.steps");
    must(poster.film.cycles === undefined || poster.film.cycles > 0,
      "poster.film.cycles is how many of those runs the film holds");
    must(poster.film.scale > 0 && poster.film.scale === Math.round(poster.film.scale),
      "poster.film.scale is a whole-number magnification");
  }

  return {
    id: spec.id,
    title: spec.title,
    tagline: spec.tagline || "",
    base: spec.base,
    // what the button says, and what one run of the animation is called in the
    // notes the platform writes for itself
    action: { verb: action.verb || "Start", noun: action.noun || "run" },
    knobs: knobs,
    knobKeys: keys,
    stage: {
      width: checkBinding(stage.width === undefined ? 160 : stage.width, keys, "stage.width"),
      aspect: checkBinding(stage.aspect, keys, "stage.aspect"),
      background: stage.background === undefined ? 0x000000 : stage.background,
      legend: stage.legend || "",
      // what the line above the stage tells a visitor they can do to it
      hint: stage.hint || "click the canvas"
    },
    cadence: checkBinding(spec.cadence === undefined ? 12 : spec.cadence, keys, "cadence"),
    replay: checkBinding(spec.replay === undefined ? 0 : spec.replay, keys, "replay"),
    palette: palette,
    reference: reference,
    files: (spec.files || []).map(function (file, i) { return normaliseFile(file, spec.base, i); }),
    stats: normaliseStats(spec.stats, 'animation "' + spec.id + '"'),
    backends: backends,
    defaultBackend: defaultBackend,
    poster: {
      // a dozen steps in — about a second at the usual cadence, by which time
      // most things have something to show
      step: poster.step === undefined ? 12 : poster.step,
      spot: poster.spot || null,
      backend: poster.backend || defaultBackend,
      icon: poster.icon || null,
      // the small still the switcher lists this animation with, cut from the
      // same posed frame
      thumb: poster.thumb || "assets/" + spec.id + "-thumb.png",
      // A whole run, filmed step by step, and where the pre-made copy of it
      // lives. `steps` may be knob("someKey"), which is what lets the export
      // button on the page film exactly as long a run as the knobs now say —
      // `cycles` many of them, for animations whose run is one lap of a loop.
      film: poster.film
        ? {
          steps: checkBinding(poster.film.steps, keys, "poster.film.steps"),
          cycles: poster.film.cycles === undefined ? 1 : poster.film.cycles,
          scale: poster.film.scale,
          file: poster.film.file || "assets/" + spec.id + ".gif"
        }
        : null
    },
    create: spec.create
  };
}

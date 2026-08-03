"use strict";

// A pixel surface: a canvas the size of the stage, blown up with
// nearest-neighbour scaling, with a backdrop behind the frame and the whole
// frame shiftable by whole pixels. Backends that produce a pixel buffer in
// JavaScript hand it here rather than talking to PixiJS themselves.

function textureFrom(canvas) {
  var texture;
  if (PIXI.CanvasSource) {
    texture = new PIXI.Texture({
      source: new PIXI.CanvasSource({ resource: canvas, scaleMode: "nearest" })
    });
  } else {
    texture = PIXI.Texture.from(canvas);
  }
  if (texture.source) texture.source.scaleMode = "nearest";
  return texture;
}

export function surfaceAvailable() {
  return !!window.PIXI;
}

export async function createSurface(options) {
  if (!window.PIXI) throw new Error("PixiJS could not be loaded from the CDN");

  if (PIXI.TextureSource && PIXI.TextureSource.defaultOptions) {
    PIXI.TextureSource.defaultOptions.scaleMode = "nearest";
  }

  var app = new PIXI.Application();
  await app.init({
    width: options.width,
    height: options.height,
    background: options.background,
    antialias: false,
    autoDensity: false,
    resolution: 1,
    roundPixels: true
  });

  // The page keeps the clock, so PixiJS never draws on its own.
  app.stop();

  var backSprite = null;
  var frameSprite = null;

  function environment() {
    var r = app.renderer;
    var gl = r.gl || (r.context && r.context.gl) || null;
    var out = { renderer: r.name ? String(r.name) : "canvas", gpu: "n/a" };
    if (!gl) return out;
    var version = (r.context && r.context.webGLVersion) ||
      ((typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext) ? 2 : 1);
    out.renderer = "WebGL " + version;
    try {
      // the only way a page can name the GPU, and browsers are free to refuse
      var ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) out.gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "n/a");
      else out.gpu = String(gl.getParameter(gl.RENDERER) || "n/a") + " (masked)";
    } catch (err) {
      out.gpu = "n/a";
    }
    return out;
  }

  return {
    canvas: app.canvas,
    env: environment,

    setBackdrop: function (canvas) {
      var old = backSprite ? backSprite.texture : null;
      if (!backSprite) {
        backSprite = new PIXI.Sprite(textureFrom(canvas));
        app.stage.addChildAt(backSprite, 0);
      } else {
        backSprite.texture = textureFrom(canvas);
        old.destroy(true);
      }
    },

    setFrame: function (canvas) {
      var old = frameSprite ? frameSprite.texture : null;
      if (!frameSprite) {
        frameSprite = new PIXI.Sprite(textureFrom(canvas));
        app.stage.addChild(frameSprite);
      } else {
        frameSprite.texture = textureFrom(canvas);
        old.destroy(true);
      }
    },

    // the buffer behind the frame texture has changed
    refresh: function () {
      if (frameSprite) frameSprite.texture.source.update();
    },

    present: function (dx, dy) {
      if (frameSprite) frameSprite.position.set(dx, dy);
      app.render();
    },

    resize: function (width, height) {
      app.renderer.resize(width, height);
    },

    dispose: function () { app.destroy(true); }
  };
}

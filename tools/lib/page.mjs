// Shared by the generators: serve the repository on a loopback port and open
// the real page in Chromium with the random source seeded, so a run posed from
// the command line is the run that would be posed anywhere else.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

var require_ = createRequire(import.meta.url);

export var ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

var TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".md": "text/markdown",
  ".ico": "image/x-icon", ".json": "application/json"
};

export function serve() {
  var server = http.createServer(function (req, res) {
    var name = decodeURIComponent(req.url.split("?")[0]);
    if (name.endsWith("/")) name += "index.html";
    var file = path.join(ROOT, path.normalize(name));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, function (err, body) {
      if (err) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store"
      });
      res.end(body);
    });
  });
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", function () {
      resolve({ server: server, port: server.address().port });
    });
  });
}

export var DEFAULT_SEED = 1234567;

// The seeded random source, installed before any of the page's own code runs.
export function seedScript(seed) {
  var start = (seed || 1234567) >>> 0;
  var state = start;
  Math.random = function () {
    state = (state + 0x6D2B79F5) >>> 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__reseed = function () { state = start; };
}

export function playwright() {
  try {
    // resolved the CommonJS way, so a global install or NODE_PATH is enough
    return require_("playwright");
  } catch (err) {
    console.error("This script needs Playwright: npm i playwright && npx playwright install chromium");
    process.exit(1);
  }
}

// Serves the repository, opens the page, waits for the animation to start.
export async function openSite(options) {
  var served = await serve();
  var browser = await playwright().chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  });
  var page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  var problems = [];
  page.on("pageerror", function (e) { problems.push("pageerror: " + e.message); });
  page.on("console", function (m) { if (m.type() === "error") problems.push("console: " + m.text()); });

  await page.addInitScript(seedScript, (options && options.seed) || DEFAULT_SEED);
  await page.goto("http://127.0.0.1:" + served.port + "/index.html" +
    ((options && options.animation) ? "?animation=" + options.animation : ""), { waitUntil: "load" });
  await page.waitForFunction("!!window.pixels", null, { timeout: 40000 });
  await page.evaluate(function () { window.__reseed(); });

  return {
    page: page,
    problems: problems,
    close: async function () { await browser.close(); served.server.close(); }
  };
}

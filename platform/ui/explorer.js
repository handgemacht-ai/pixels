"use strict";

// The file browser under the demo. It lists exactly the files the animation
// registered — nothing of the platform appears here — and fetches each one
// from the server, so what is on screen is what is being run.

import { escapeHtml, highlighter } from "./highlight.js";
import { renderMarkdown } from "./markdown.js";
import { rootOf } from "./shell.js";

function folderOf(path) {
  var cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut + 1);
}

export function initExplorer(spec) {
  var list = document.getElementById("filelist");
  var viewer = document.getElementById("viewer");
  var viewerMeta = document.getElementById("viewer-meta");
  var codeView = document.getElementById("code-view");
  var readmeView = document.getElementById("readme-view");
  var imageView = document.getElementById("image-view");
  var imageEl = document.getElementById("image-view-img");
  var captionEl = document.getElementById("image-view-caption");
  if (!list || !viewer || !codeView) return function () {};

  list.textContent = "";
  codeView.textContent = "";
  if (readmeView) readmeView.textContent = "";
  if (viewerMeta) viewerMeta.textContent = "";
  if (!spec.files.length) return function () {};

  var root = rootOf(spec);
  var subs = {};
  var buttons = {};
  var cache = {};
  var showing = null;

  function renderCode(file, text) {
    var colour = highlighter(file.lang);
    var lines = text.replace(/\s+$/, "").split("\n");
    var html = "";
    for (var i = 0; i < lines.length; i++) {
      html += '<span class="row"><span class="num">' + (i + 1) + "</span>" +
        '<span class="src">' + (colour(lines[i]) || " ") + "</span></span>";
    }
    subs[file.path].textContent = lines.length + " lines · " + file.sub;
    return html;
  }

  function show(file) {
    codeView.hidden = file.kind !== "code";
    if (readmeView) readmeView.hidden = file.kind !== "markdown";
    if (imageView) imageView.hidden = file.kind !== "image";

    Object.keys(buttons).forEach(function (path) {
      buttons[path].setAttribute("aria-selected", path === file.path ? "true" : "false");
    });
    viewerMeta.textContent = file.meta;
    viewer.scrollTop = 0;
    showing = file.path;

    if (file.kind === "image") {
      if (!imageEl) return;
      imageEl.className = file.pixelated ? "pixels" : "";
      imageEl.alt = file.alt;
      if (imageEl.getAttribute("src") !== file.url) imageEl.src = file.url;
      if (captionEl) captionEl.innerHTML = file.caption;
      return;
    }

    var target = file.kind === "markdown" ? readmeView : codeView;
    if (!target) return;

    if (cache[file.path] !== undefined) {
      target.innerHTML = cache[file.path];
      return;
    }
    target.innerHTML = '<span class="loading">reading ' + escapeHtml(file.path) + " …</span>";
    fetch(file.url, { cache: "no-cache" }).then(function (response) {
      if (!response.ok) throw new Error(response.status + " " + response.statusText);
      return response.text();
    }).then(function (text) {
      cache[file.path] = file.kind === "markdown"
        ? renderMarkdown(text.replace(/^\n+/, "").replace(/\s+$/, ""))
        : renderCode(file, text);
      if (showing === file.path) target.innerHTML = cache[file.path];
    }).catch(function (err) {
      var message = '<span class="loading">could not read ' + escapeHtml(file.path) +
        ": " + escapeHtml(String(err && err.message ? err.message : err)) + "</span>";
      if (showing === file.path) target.innerHTML = message;
    });
  }

  // an image says its own size once the browser has it
  function measured() {
    var file = spec.files.filter(function (f) { return f.url === imageEl.src; })[0];
    if (!file || !imageEl.naturalWidth || !subs[file.path]) return;
    subs[file.path].textContent =
      imageEl.naturalWidth + " × " + imageEl.naturalHeight + " · " + file.sub;
  }
  if (imageEl) imageEl.addEventListener("load", measured);

  var lastFolder = null;
  spec.files.forEach(function (file) {
    var folder = folderOf(file.path);
    if (folder !== lastFolder) {
      var head = document.createElement("div");
      head.className = "dir";
      head.textContent = root + folder;
      list.appendChild(head);
      lastFolder = folder;
    }

    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("data-file", file.path);
    button.innerHTML = escapeHtml(file.path.slice(folder.length)) +
      '<span class="sub">' + escapeHtml(file.sub) + "</span>";
    button.addEventListener("click", function () { show(file); });
    buttons[file.path] = button;
    subs[file.path] = button.querySelector(".sub");
    list.appendChild(button);
  });

  // Another panel asking for a file to be opened here. It names a path and
  // nothing else, so a panel that wants to point at a file does not have to know
  // anything about this one — and a path this animation does not list is
  // ignored rather than half-opened.
  function requested(event) {
    var wanted = event.detail && event.detail.path;
    var file = spec.files.filter(function (f) { return f.path === wanted; })[0];
    if (file) show(file);
  }
  document.addEventListener("pixels:open-file", requested);

  var opening = spec.files.filter(function (f) { return f.open; })[0] || spec.files[0];
  show(opening);

  return function () {
    document.removeEventListener("pixels:open-file", requested);
    if (imageEl) {
      imageEl.removeEventListener("load", measured);
      imageEl.removeAttribute("src");
    }
    showing = null;
    list.textContent = "";
    codeView.textContent = "";
    if (readmeView) readmeView.textContent = "";
    if (imageView) imageView.hidden = true;
    if (viewerMeta) viewerMeta.textContent = "";
  };
}

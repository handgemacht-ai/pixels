"use strict";

// Minimal markdown: headings, lists, fenced code, and the inline bits the
// README actually uses. Enough to read the repository's own README in the
// file browser without pulling in a library.

import { escapeHtml } from "./highlight.js";

function inline(text) {
  var out = escapeHtml(text);
  out = out.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

export function renderMarkdown(src) {
  var out = [];
  var para = [];
  var list = null;
  var fence = null;

  function flushPara() {
    if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; }
  }
  function flushList() {
    if (list) { out.push("<ul>" + list.join("") + "</ul>"); list = null; }
  }

  var rows = src.replace(/\r/g, "").split("\n");
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];

    if (fence !== null) {
      if (/^```/.test(row)) {
        out.push("<pre><code>" + escapeHtml(fence.join("\n")) + "</code></pre>");
        fence = null;
      } else {
        fence.push(row);
      }
      continue;
    }
    if (/^```/.test(row)) { flushPara(); flushList(); fence = []; continue; }

    if (!row.trim()) { flushPara(); flushList(); continue; }

    var heading = /^(#{1,4})\s+(.*)$/.exec(row);
    if (heading) {
      flushPara(); flushList();
      var level = Math.min(heading[1].length + 1, 6);
      out.push("<h" + level + ">" + inline(heading[2]) + "</h" + level + ">");
      continue;
    }

    var item = /^[-*]\s+(.*)$/.exec(row);
    if (item) {
      flushPara();
      if (!list) list = [];
      list.push("<li>" + inline(item[1]) + "</li>");
      continue;
    }

    flushList();
    para.push(row.trim());
  }
  if (fence !== null) out.push("<pre><code>" + escapeHtml(fence.join("\n")) + "</code></pre>");
  flushPara();
  flushList();
  return out.join("");
}

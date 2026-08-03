"use strict";

// Hand-rolled highlighting, one line at a time. Enough to read a file by;
// nothing here is a parser.

export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrap(cls, text) {
  return '<span class="' + cls + '">' + escapeHtml(text) + "</span>";
}

// Walks a line with one regex: whatever the regex does not claim is escaped
// and passed through, and each capture group carries its own colour class.
function tokenise(line, re, classes) {
  var out = "";
  var last = 0;
  var match;
  re.lastIndex = 0;
  while ((match = re.exec(line)) !== null) {
    out += escapeHtml(line.slice(last, match.index));
    var cls = classes[classes.length - 1];
    for (var g = 1; g < match.length; g++) {
      if (match[g] !== undefined) { cls = classes[g - 1]; break; }
    }
    out += wrap(cls, match[0]);
    last = match.index + match[0].length;
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return out + escapeHtml(line.slice(last));
}

// Comments that run past the end of a line need the highlighter to remember
// where it is, so each file gets its own instance of this.
function blockAware(open, close, inner) {
  var inside = false;
  return function (line) {
    var out = "";
    var rest = line;
    while (rest.length) {
      if (inside) {
        var end = rest.indexOf(close);
        if (end < 0) { out += wrap("c", rest); break; }
        out += wrap("c", rest.slice(0, end + close.length));
        rest = rest.slice(end + close.length);
        inside = false;
      } else {
        var start = rest.indexOf(open);
        if (start < 0) { out += inner(rest); break; }
        out += inner(rest.slice(0, start));
        rest = rest.slice(start);
        inside = true;
      }
    }
    return out;
  };
}

var JS_TOKENS = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\/\/.*|\/\*.*?\*\/)|\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\b|\b(var|let|const|function|return|if|else|for|while|new|this|typeof|break|continue|true|false|null|undefined|catch|try|throw|in|of|import|export|from|default)\b/g;
var JS_CLASSES = ["s", "c", "n", "k"];

var CSS_TOKENS = /("[^"]*"|'[^']*')|(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|vh|vw|ch|s|ms|%)?\b)|(@[a-zA-Z-]+|![a-zA-Z-]+)/g;
var CSS_CLASSES = ["s", "n", "k", "k"];

var HTML_TOKENS = /("[^"]*")|(<\/?[a-zA-Z][a-zA-Z0-9-]*|\/?>)|(&[a-zA-Z#0-9]+;)/g;
var HTML_CLASSES = ["s", "t", "n", "t"];

export function highlighter(lang) {
  if (lang === "css") {
    return blockAware("/*", "*/", function (part) {
      return tokenise(part, CSS_TOKENS, CSS_CLASSES);
    });
  }
  if (lang === "html") {
    return blockAware("<!--", "-->", function (part) {
      return tokenise(part, HTML_TOKENS, HTML_CLASSES);
    });
  }
  if (lang === "js") {
    return function (line) { return tokenise(line, JS_TOKENS, JS_CLASSES); };
  }
  return escapeHtml;
}

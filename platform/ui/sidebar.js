"use strict";

// The switcher. It lists every animation in the registry — title, tagline and
// the small still each one declares — and hands the id of the one that was
// picked back to the page. It knows nothing about any of them beyond what they
// registered.

export function initSidebar(list, onPick) {
  var root = document.getElementById("switcher");
  if (!root) return { mark: function () {} };

  root.textContent = "";
  var buttons = {};

  list.forEach(function (spec) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "switch";
    button.setAttribute("data-animation", spec.id);

    // The still is a real frame of the animation, written by tools/poster.mjs.
    // If it has not been generated yet the row simply loses its picture.
    var shot = document.createElement("img");
    shot.className = "switch-shot";
    shot.alt = "";
    shot.loading = "lazy";
    shot.src = spec.poster.thumb;
    shot.addEventListener("error", function () { shot.hidden = true; });

    var words = document.createElement("span");
    words.className = "switch-words";
    var name = document.createElement("b");
    name.textContent = spec.title;
    var sub = document.createElement("span");
    sub.textContent = spec.tagline;
    words.appendChild(name);
    words.appendChild(sub);

    button.appendChild(shot);
    button.appendChild(words);
    button.addEventListener("click", function () { onPick(spec.id); });

    root.appendChild(button);
    buttons[spec.id] = button;
  });

  var count = document.getElementById("switcher-meta");
  if (count) {
    count.textContent = list.length + (list.length === 1 ? " animation" : " animations");
  }

  return {
    mark: function (id) {
      Object.keys(buttons).forEach(function (key) {
        var here = key === id;
        buttons[key].setAttribute("aria-current", here ? "true" : "false");
        buttons[key].disabled = here;
      });
    }
  };
}

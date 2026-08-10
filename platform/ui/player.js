"use strict";

// The player under the stage: hold the run still, walk it a step at a time, and
// say which step is on the stage. It is an inspection tool rather than a
// transport — there is nothing to scrub through, only the frame you are on and
// the two either side of it — so it is three small buttons and a number.
//
// The keys are the ones a player has, and they only answer while the preview is
// what they are plainly aimed at. They are ignored while something is being
// typed into, so the arrows still nudge whichever slider has the focus.

// Held or running, kept across a change of animation: somebody walking one run
// a frame at a time is usually about to walk the next one the same way.
var wanted = false;

function typing(node) {
  if (!node) return false;
  var name = node.tagName;
  return name === "INPUT" || name === "SELECT" || name === "TEXTAREA" ||
    !!node.isContentEditable;
}

export function initPlayer(spec, api) {
  var row = document.getElementById("player");
  var holdButton = document.getElementById("player-hold");
  var backButton = document.getElementById("player-back");
  var onButton = document.getElementById("player-on");
  var readout = document.getElementById("player-frame");
  if (!row || !holdButton || !backButton || !onButton || !readout) return function () {};

  // The panel the stage and the player share: what the keys below are scoped to.
  var panel = row.parentElement || row;
  var over = false;

  var going = true;
  var said = "";
  var was = null;

  // The step, and how long a whole run is where the animation says. Written
  // only when it changes, because this is read on every screen refresh.
  function paint() {
    var held = api.player.held();
    var length = api.player.length();
    var step = api.player.at();
    var words = "step " + (step < 0 ? 0 : step) + (length ? " / " + length : "");
    if (words !== said) {
      said = words;
      readout.textContent = words;
    }
    if (held === was) return;
    was = held;
    holdButton.textContent = held ? "play" : "pause";
    holdButton.title = held
      ? "let the clock take the " + spec.action.noun + " on · space"
      : "hold the " + spec.action.noun + " still · space";
  }

  function tick() {
    if (!going) return;
    window.requestAnimationFrame(tick);
    paint();
  }

  function toggle() {
    wanted = !api.player.held();
    if (wanted) api.player.hold();
    else api.player.release();
    paint();
  }

  // A press walks the run whether or not it was being held, because asking for
  // one step is asking for the run to stand still on it.
  function walk(by) {
    wanted = true;
    api.player.step(by);
    paint();
  }

  function back() { walk(-1); }
  function on() { walk(1); }

  function entered() { over = true; }
  function left() { over = false; }

  // Whether a press is the player's to answer. The space bar scrolls a page
  // taller than the window, and a page-wide claim on it would take that away
  // from every visitor to buy a hold nobody asked for — so the keys only carry
  // while the preview is what they are being aimed at: the pointer resting on
  // the panel, or something inside it holding the focus. Anywhere else the
  // press stays the page's, and space scrolls as it always did.
  //
  // The arrows are scoped the same way rather than left global, although they
  // scroll less often. A player whose space bar works in one place and whose
  // arrows work everywhere is two rules to learn instead of one, and the arrows
  // move other things on this page — a slider, a switcher — that have at least
  // as good a claim on them as a run being walked does.
  function aimed(target) {
    if (over) return true;
    if (target && panel.contains(target)) return true;
    return panel.contains(document.activeElement);
  }

  function onKey(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (typing(event.target)) return;
    if (!aimed(event.target)) return;
    if (event.key === " " || event.key === "Spacebar") {
      // a button with the focus is pressed by the space bar already, and doing
      // it twice would put the run straight back where it was
      if (event.target && event.target.tagName === "BUTTON") return;
      event.preventDefault();
      toggle();
      return;
    }
    if (event.key === "ArrowRight") { event.preventDefault(); on(); return; }
    if (event.key === "ArrowLeft") { event.preventDefault(); back(); }
  }

  backButton.title = "one step back · left arrow";
  onButton.title = "one step on · right arrow";
  holdButton.addEventListener("click", toggle);
  backButton.addEventListener("click", back);
  onButton.addEventListener("click", on);
  panel.addEventListener("pointerenter", entered);
  panel.addEventListener("pointerleave", left);
  document.addEventListener("keydown", onKey);

  if (wanted) api.player.hold();
  paint();
  window.requestAnimationFrame(tick);

  return function () {
    going = false;
    holdButton.removeEventListener("click", toggle);
    backButton.removeEventListener("click", back);
    onButton.removeEventListener("click", on);
    panel.removeEventListener("pointerenter", entered);
    panel.removeEventListener("pointerleave", left);
    document.removeEventListener("keydown", onKey);
    readout.textContent = "";
  };
}

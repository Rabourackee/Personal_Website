// Homepage: the selected-works stage. One featured project at a time, edge to
// edge. It moves on by itself when the dash under the counter fills, and
// pauses while you point at it. Each half of the stage is a button (previous /
// next); with a mouse, a small disc follows the pointer and says which way a
// click goes. Arrow keys and a swipe work too. A new project wipes in from
// the side it comes from.
(function () {
  "use strict";
  var hv = document.querySelector(".hv");
  if (!hv) return;
  var slides = hv.querySelectorAll(".hv-slide");
  var n = slides.length;
  if (n < 2) return;

  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  var stage = hv.querySelector(".hv-stage");
  var caps = hv.querySelectorAll(".hv-cap");
  var dash = hv.querySelector(".hv-dash");
  var dashes = dash.querySelectorAll("button");
  var countEl = hv.querySelector(".hv-i");
  var cursor = hv.querySelector(".hv-cursor"), cursorLabel = cursor.querySelector("span");
  var prevBtn = hv.querySelector(".hv-half--prev"), nextBtn = hv.querySelector(".hv-half--next");
  var current = 0, settle = 0;

  function pad(i) {
    return String(i).padStart(2, "0");
  }

  function show(i, dir) {
    i = (i + n) % n;
    if (i === current) return;
    if (dir === undefined) dir = i > current ? 1 : -1;
    var from = slides[current], to = slides[i];

    // finish any wipe still running
    clearTimeout(settle);
    slides.forEach(function (s) {
      s.classList.remove("is-leaving", "is-moving", "enter-l", "enter-r");
    });

    from.classList.remove("is-on");
    from.setAttribute("aria-hidden", "true");
    to.removeAttribute("aria-hidden");
    if (reduceMotion) {
      to.classList.add("is-on");
    } else {
      from.classList.add("is-leaving");
      to.classList.add(dir > 0 ? "enter-r" : "enter-l", "is-on");
      void to.offsetWidth;
      to.classList.add("is-moving");
      to.classList.remove("enter-r", "enter-l");
      settle = setTimeout(function () {
        from.classList.remove("is-leaving");
        to.classList.remove("is-moving");
      }, 1150);
    }

    caps.forEach(function (c, j) {
      var on = j === i;
      c.classList.toggle("is-on", on);
      if (on) c.removeAttribute("aria-hidden");
      else c.setAttribute("aria-hidden", "true");
      c.querySelectorAll("a").forEach(function (a) {
        a.tabIndex = on ? 0 : -1;
      });
    });
    dashes.forEach(function (d, j) {
      if (j === i) d.setAttribute("aria-current", "true");
      else d.removeAttribute("aria-current");
    });
    countEl.textContent = pad(i + 1);
    current = i;
  }

  prevBtn.addEventListener("click", function () {
    show(current - 1, -1);
  });
  nextBtn.addEventListener("click", function () {
    show(current + 1, 1);
  });
  dashes.forEach(function (d, j) {
    d.addEventListener("click", function () {
      show(j);
    });
  });
  hv.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") show(current - 1, -1);
    else if (e.key === "ArrowRight") show(current + 1, 1);
    else return;
    e.preventDefault();
  });

  // the clock: when the current dash has filled, move on
  dash.addEventListener("animationend", function (e) {
    if (e.animationName === "hv-fill") show(current + 1, 1);
  });
  document.addEventListener("visibilitychange", function () {
    hv.classList.toggle("is-hidden", document.hidden);
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      hv.classList.toggle("is-away", !entries[0].isIntersecting);
    }, { threshold: 0.35 }).observe(stage);
  }

  // the cursor disc
  if (finePointer) {
    var label = "";
    stage.addEventListener("pointermove", function (e) {
      var r = stage.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      cursor.style.transform = "translate3d(" + x + "px," + y + "px,0)";
      var next = x > r.width / 2 ? "next" : "prev";
      if (next !== label) cursorLabel.textContent = label = next;
      stage.classList.add("has-cursor");
      hv.classList.add("is-paused");
    });
    stage.addEventListener("pointerleave", function () {
      stage.classList.remove("has-cursor", "is-pressed");
      hv.classList.remove("is-paused");
    });
    stage.addEventListener("pointerdown", function () {
      stage.classList.add("is-pressed");
    });
    stage.addEventListener("pointerup", function () {
      stage.classList.remove("is-pressed");
    });
  }

  // swipe
  var startX = null, swiped = false;
  stage.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "mouse") startX = e.clientX;
  });
  stage.addEventListener("pointerup", function (e) {
    if (startX === null) return;
    var dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) {
      swiped = true;
      show(current + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      setTimeout(function () {
        swiped = false;
      }, 400);
    }
  });
  stage.addEventListener("click", function (e) {
    if (swiped) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  // fetch the other images once the page has loaded, so a wipe never shows an empty panel
  addEventListener("load", function () {
    slides.forEach(function (s) {
      var img = s.querySelector("img");
      if (img && img.loading === "lazy") img.loading = "eager";
    });
  });

  prevBtn.hidden = nextBtn.hidden = dash.hidden = false;
  if (reduceMotion) hv.classList.add("is-static");
  hv.classList.add("is-live");
})();

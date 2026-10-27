// Homepage highlights carousel. The slides are a native horizontal scroller,
// so swiping, trackpads and arrow keys work even without this script. This
// adds autoplay, prev/next, the progress bars and the counter.
//
// Autoplay is driven by the CSS progress-bar animation: when the active bar
// finishes filling, we move on. Pausing the animation (hover, keyboard focus,
// hidden tab, pause button) therefore pauses the slideshow too.
(function () {
  var hero = document.querySelector(".hero");
  if (!hero) return;
  var track = hero.querySelector(".hero-track");
  var slides = hero.querySelectorAll(".hero-slide");
  var bars = hero.querySelectorAll(".hero-progress button");
  var count = hero.querySelector(".hero-count");
  var toggle = hero.querySelector(".hero-toggle");
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var current = 0;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function show(i, scroll) {
    current = (i + slides.length) % slides.length;
    bars.forEach(function (bar, j) {
      bar.setAttribute("aria-current", j === current ? "true" : "false");
    });
    count.textContent = pad(current + 1) + " / " + pad(slides.length);
    if (scroll) {
      track.scrollTo({ left: current * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }

  function setPaused(paused) {
    hero.classList.toggle("is-paused", paused);
    toggle.setAttribute("aria-label", paused ? "Play slideshow" : "Pause slideshow");
    track.setAttribute("aria-live", paused ? "polite" : "off");
  }

  // Keep the counter and bars in sync when people swipe or scroll by hand.
  function onScrollEnd() {
    var i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== current) show(i, false);
  }
  if ("onscrollend" in window) {
    track.addEventListener("scrollend", onScrollEnd);
  } else {
    var settle;
    track.addEventListener("scroll", function () {
      clearTimeout(settle);
      settle = setTimeout(onScrollEnd, 120);
    });
  }

  hero.querySelector(".hero-progress").addEventListener("animationend", function (e) {
    if (e.animationName === "hero-fill") show(current + 1, true);
  });
  bars.forEach(function (bar, j) {
    bar.addEventListener("click", function () {
      show(j, true);
    });
  });
  hero.querySelector(".hero-prev").addEventListener("click", function () {
    show(current - 1, true);
  });
  hero.querySelector(".hero-next").addEventListener("click", function () {
    show(current + 1, true);
  });
  toggle.addEventListener("click", function () {
    setPaused(!hero.classList.contains("is-paused"));
  });
  document.addEventListener("visibilitychange", function () {
    hero.classList.toggle("is-hidden", document.hidden);
  });
  addEventListener("resize", function () {
    track.scrollTo({ left: current * track.clientWidth });
  });

  if (reduceMotion) {
    hero.classList.add("is-static");
    toggle.hidden = true;
    track.setAttribute("aria-live", "polite");
  } else {
    setPaused(false);
  }
  hero.querySelector(".hero-controls").hidden = false;
  show(0, false);
})();

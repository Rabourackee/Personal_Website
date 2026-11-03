// Shared behaviour for the project index (cards.njk): the field keys, the
// grid / list switch and, in the list, a preview of the project you point at.
// Links with data-field (the homepage statement) filter the index on the same
// page; elsewhere they go to /project-categories/?field=…, which opens filtered.
(function () {
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {
      return null;
    }
  }

  var indexes = [];
  document.querySelectorAll("[data-index]").forEach(function (px) {
    indexes.push(initIndex(px));
  });

  function initIndex(px) {
    var keys = px.querySelectorAll(".px-keys [data-field]");
    var viewKeys = px.querySelectorAll(".px-view [data-view]");
    var cards = px.querySelectorAll(".card");
    var groups = px.querySelectorAll(".px-group");
    var status = px.querySelector(".px-status");
    var names = {};
    keys.forEach(function (k) {
      names[k.dataset.field] = k.textContent.replace(/\d+\s*$/, "").trim();
    });

    function setField(field, animate) {
      if (!names[field]) field = "all";
      keys.forEach(function (k) {
        k.setAttribute("aria-pressed", k.dataset.field === field ? "true" : "false");
      });
      var shown = 0;
      cards.forEach(function (card) {
        var on = field === "all" || card.dataset.fields.split(" ").indexOf(field) >= 0;
        card.hidden = !on;
        card.classList.remove("is-in");
        if (on && animate && !reduceMotion) {
          card.style.setProperty("--i", shown);
          void card.offsetWidth;
          card.classList.add("is-in");
        }
        if (on) shown++;
      });
      groups.forEach(function (g) {
        var n = g.querySelectorAll(".card:not([hidden])").length;
        g.hidden = !n;
        g.querySelector(".px-count").textContent = n;
      });
      status.textContent = field === "all" ? "Showing all projects" : shown + " projects in " + names[field];
    }

    function setView(view) {
      px.dataset.view = view;
      viewKeys.forEach(function (k) {
        k.setAttribute("aria-pressed", k.dataset.view === view ? "true" : "false");
      });
      store("index-view", view);
      peekOff();
    }

    keys.forEach(function (k) {
      k.addEventListener("click", function () {
        var again = k.getAttribute("aria-pressed") === "true";
        setField(again ? "all" : k.dataset.field, true);
      });
    });
    viewKeys.forEach(function (k) {
      k.addEventListener("click", function () {
        setView(k.dataset.view);
      });
    });

    // In the list, the hovered row's image follows the pointer.
    var peek = px.querySelector(".px-peek");
    var peekImg = peek.querySelector("img");
    var pos = { x: 0, y: 0 }, shownAt = { x: 0, y: 0 }, raf = 0, current = null;

    function peekOff() {
      current = null;
      peek.classList.remove("is-on");
    }

    function follow() {
      shownAt.x += (pos.x - shownAt.x) * 0.22;
      shownAt.y += (pos.y - shownAt.y) * 0.22;
      peek.style.transform = "translate3d(" + shownAt.x + "px," + shownAt.y + "px,0)";
      raf = Math.abs(pos.x - shownAt.x) + Math.abs(pos.y - shownAt.y) > 0.5 ? requestAnimationFrame(follow) : 0;
    }

    function place(e) {
      var w = peek.offsetWidth, h = peek.offsetHeight;
      var x = e.clientX + 28, y = e.clientY - h / 2;
      if (x + w > innerWidth - 12) x = e.clientX - w - 28;
      pos.x = x;
      pos.y = Math.max(12 + 60, Math.min(innerHeight - h - 12, y));
    }

    if (finePointer) {
      px.addEventListener("pointermove", function (e) {
        if (px.dataset.view !== "list") return;
        var link = e.target.closest(".card-link");
        if (!link) return peekOff();
        place(e);
        if (link !== current) {
          if (!current) {
            shownAt.x = pos.x;
            shownAt.y = pos.y;
          }
          current = link;
          peekImg.src = link.dataset.peek;
          peek.classList.add("is-on");
        }
        if (!raf) raf = requestAnimationFrame(follow);
      });
      px.addEventListener("pointerleave", peekOff);
      addEventListener("scroll", peekOff, { passive: true });
    }

    var saved = store("index-view");
    if (saved === "list" || saved === "grid") setView(saved);
    var asked = new URLSearchParams(location.search).get("field");
    if (asked) setField(asked, false);

    return { el: px, setField: setField };
  }

  // The homepage statement: filter the index below instead of leaving the page.
  document.querySelectorAll("a[data-field]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var index = indexes[0];
      if (!index) return;
      e.preventDefault();
      index.setField(a.dataset.field, true);
      index.el.closest("section, main").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    });
  });
})();

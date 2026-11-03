// Shared behaviour for the project index (cards.njk): the field filter and the
// grid / list switch (the choice is remembered). Links with data-field (the homepage statement) filter the
// index on the same page; elsewhere they go to /project-categories/?field=…,
// which opens filtered.
(function () {
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

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
      names[k.dataset.field] = k.firstChild.textContent.trim();
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

    function setView(view, animate) {
      px.dataset.view = view;
      viewKeys.forEach(function (k) {
        k.setAttribute("aria-pressed", k.dataset.view === view ? "true" : "false");
      });
      store("index-layout", view);
      if (animate) setField(px.querySelector('.px-keys [aria-pressed="true"]').dataset.field, true);
    }

    keys.forEach(function (k) {
      k.addEventListener("click", function () {
        var again = k.getAttribute("aria-pressed") === "true";
        setField(again ? "all" : k.dataset.field, true);
      });
    });
    viewKeys.forEach(function (k) {
      k.addEventListener("click", function () {
        if (px.dataset.view !== k.dataset.view) setView(k.dataset.view, true);
      });
    });

    var saved = store("index-layout");
    if (saved === "list" || saved === "grid") setView(saved, false);
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

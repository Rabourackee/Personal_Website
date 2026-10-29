// Roulettective page (src/projects/roulettective.html): every interactive
// part. Each block looks for its own markup and quietly skips if it's absent;
// without JavaScript the page still reads as a complete, static document.
(function () {
  "use strict";
  if (!document.querySelector(".rt")) return;

  var SVGNS = "http://www.w3.org/2000/svg";
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------ helpers

  function el(tag, attrs, parent) {
    var node = document.createElementNS(SVGNS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  var ease = {
    inOut: function (t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    outBack: function (t) {
      var c1 = 1.4, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    linear: function (t) {
      return t;
    },
  };

  // Animates a number from `from` to `to`; returns a cancel function.
  function tween(from, to, ms, easing, step, done) {
    if (reduceMotion || ms <= 0) {
      step(to);
      if (done) done();
      return function () {};
    }
    var start = null, raf;
    function frame(now) {
      if (start === null) start = now;
      var t = Math.min((now - start) / ms, 1);
      step(from + (to - from) * easing(t));
      if (t < 1) raf = requestAnimationFrame(frame);
      else if (done) done();
    }
    raf = requestAnimationFrame(frame);
    return function () {
      cancelAnimationFrame(raf);
    };
  }

  function onVisible(target, cb) {
    if (!("IntersectionObserver" in window)) return cb(true);
    new IntersectionObserver(function (entries) {
      cb(entries[0].isIntersecting);
    }, { rootMargin: "100px" }).observe(target);
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // Radial fins for the carousel rings (wordmark "o" and others).
  document.querySelectorAll(".rt-fins").forEach(function (g) {
    var n = +g.dataset.count, r1 = +g.dataset.r1, r2 = +g.dataset.r2;
    for (var i = 0; i < n; i++) {
      el("line", { x1: 0, y1: -r1, x2: 0, y2: -r2, transform: "rotate(" + (i * 360) / n + ")" }, g);
    }
  });

  // ------------------------------------------------------------ hero: the "o" indexes like the tray

  (function () {
    var fins = document.querySelector(".rt-wordmark .rt-fins");
    if (!fins || reduceMotion) return;
    var step = 360 / +fins.dataset.count, angle = 0, visible = true;
    onVisible(fins.closest("section"), function (v) {
      visible = v;
    });
    setInterval(function () {
      if (!visible || document.hidden) return;
      var from = angle;
      angle += step;
      tween(from, angle, 380, ease.inOut, function (a) {
        fins.setAttribute("transform", "rotate(" + a + ")");
      });
    }, 1400);
  })();

  // ------------------------------------------------------------ anatomy hotspots

  (function () {
    var grid = document.querySelector(".rt-anatomy__grid");
    if (!grid) return;
    var parts = grid.querySelectorAll("[data-part]");
    var pinned = null;
    function set(id) {
      grid.classList.toggle("has-active", !!id);
      parts.forEach(function (p) {
        p.classList.toggle("is-active", p.dataset.part === id);
      });
    }
    parts.forEach(function (p) {
      var id = p.dataset.part;
      p.addEventListener("mouseenter", function () {
        set(id);
      });
      p.addEventListener("mouseleave", function () {
        set(pinned);
      });
      p.addEventListener("focus", function () {
        set(id);
      });
      p.addEventListener("blur", function () {
        set(pinned);
      });
      p.addEventListener("click", function () {
        pinned = pinned === id ? null : id;
        set(pinned);
      });
    });
  })();

  // ------------------------------------------------------------ simulator

  (function () {
    var sim = document.querySelector(".rt-sim");
    if (!sim) return;

    var slideEl = sim.querySelector(".rt-sim__slide");
    var statusEl = sim.querySelector(".rt-sim__status");
    var tray = sim.querySelector(".rt-car__tray");
    var bulb = sim.querySelector(".rt-bulb");
    var phaseEls = sim.querySelectorAll(".rt-sim__phases li");
    var tokenEls = sim.querySelectorAll(".rt-token");
    var soundBtn = sim.querySelector(".rt-sound");

    var N = 40, STEP = 360 / N, CASE = "61-04";
    var LABEL = { mystery: "mystery", evidence: "evidence", character: "character", location: "location", action: "action", reveal: "reveal" };
    var KEYS = { m: "mystery", e: "evidence", c: "character", l: "location", a: "action", v: "reveal" };
    var START = { mystery: 1, evidence: 3, character: 3, location: 2, action: 2, reveal: 1 };

    // A pre-written case, following the same rules the machine gives GPT-4o.
    var MYSTERY =
      "Arthur Vane, projectionist of the Odeon Palace, was found slumped over his projector at midnight, and it was no accident. " +
      "The booth door was locked from the inside, the key still in it. " +
      "The carousel had stopped at slot 13, its lamp still burning. " +
      "A cup of coffee had gone cold beside the screening ledger.";
    var POOLS = {
      evidence: [
        { id: "E1", text: "Slot 13 of the carousel is empty. The slide that belonged there was taken after the final show." },
        { id: "E2", text: "The ledger's last entry is initialled twice: A.V. in pencil, and M.H. in green ink." },
        { id: "E3", text: "A brass theatre key on a red fob, found under seat F7." },
      ],
      character: [
        { id: "C1", text: "Margot Hale, box-office cashier. Signs every receipt in green ink. Says she left at eleven." },
        { id: "C2", text: "Eddie Cole, night usher. Keeps the spare keys on red fobs, and one is missing." },
        { id: "C3", text: "Dr. Leon Weiss, film critic. Watched the late show alone, from seat F7." },
      ],
      location: [
        { id: "L1", text: "A ventilation hatch in the booth ceiling opens onto the roof. Small, but not too small." },
        { id: "L2", text: "Row F of the stalls: the only seats with a clear view into the booth window." },
      ],
      action: [
        { id: "A1", text: "Dust the projector gate for prints. Two sets: Arthur's, and a smaller hand." },
        { id: "A2", text: "Thread the stopped reel and run it. The last minute was spliced in after the show." },
      ],
    };
    // Strong links (rated ≥ 0.75). The earlier card of the pair gets rewritten.
    var LINKS = [
      { a: "C1", b: "E2", score: 0.86, kind: "witness recants", note: { E2: "The green ink is Margot Hale's. She signed the ledger after she said she'd gone home.", C1: "Margot recants: she came back at 11:40 to return the ledger." } },
      { a: "E3", b: "C2", score: 0.81, kind: "evidence upgraded", note: { E3: "It's Eddie's missing spare. Someone borrowed it, then hid it in row F.", C2: "His missing key turned up under seat F7." } },
      { a: "L1", b: "A1", score: 0.79, kind: "evidence upgraded", note: { L1: "The hatch latch carries the same small prints as the gate.", A1: "The smaller hand fits the roof hatch. Someone left that way." } },
      { a: "A2", b: "E1", score: 0.77, kind: "evidence destroyed", note: { E1: "Slide 13 held the box-office tally. The splice erased the frame it would have matched.", A2: "The spliced frame was the one slide 13 would have matched." } },
    ];
    var THEORIES = [
      "The booth was locked from the inside, with the key still in the door.",
      "Someone left the booth through the roof hatch.",
      "The last reel was altered after the final show.",
      "Margot Hale left at eleven and never came back.",
      "Whoever took slide 13 wanted the box-office tally hidden.",
    ];
    var FALSE_N = 4;
    var VERDICT = {
      right: "Margot Hale came back at 11:40 with the ledger. Arthur had caught her skimming the box office, and slide 13 held the proof. She left by the roof, took the slide and spliced the reel to cover the gap. The carousel kept count anyway.",
      wrong: "You exposed a true statement. The real lie stays on the record, slot 13 stays empty, and MAD reopens the file.",
    };
    var GUIDE = [
      "You are a member of the Mystery Analysis Division. Before you lies a dossier of official files and fragmented photographs. Your mission: uncover the truth concealed within them. Use ▶▶ and ◀◀ to move between slides.",
      "Detective's guide. EVIDENCE uncovers clues. CHARACTER brings in a witness. LOCATION inspects a scene. ACTION puts your methods to work. With enough leads, insert REVEAL to open the trial, and choose the false testimony.",
      "Top secret device: Roulettective, mastermind of MAD. It helps you collect and associate fragments of truth. When the bulb lights, retrace your steps: an earlier slide now hides new evidence.",
    ];

    var STAR = "M0 -6 1.4 -1.9 5.7 -1.9 2.3 0.7 3.5 4.9 0 2.4 -3.5 4.9 -2.3 0.7 -5.7 -1.9 -1.4 -1.9Z";
    var EMBLEM =
      '<svg class="rt-emblem" viewBox="-60 -60 120 120" aria-hidden="true">' +
      '<defs><path id="rt-em-path" d="M-47 0a47 47 0 1 1 94 0a47 47 0 1 1-94 0"/></defs>' +
      '<g fill="none" stroke="currentColor" stroke-width="1.4"><circle r="57"/><circle r="38"/>' +
      '<path stroke-width="2" d="M-26 4C-14-12 14-12 26 4C14 20-14 20-26 4Z"/></g>' +
      '<circle cy="4" r="8" fill="currentColor"/><circle cy="4" r="3" fill="#050506"/>' +
      '<path fill="currentColor" transform="translate(0 -24)" d="' + STAR + '"/>' +
      '<text fill="currentColor" font-size="8.2" letter-spacing="2.4" font-family="Geist Mono Variable, monospace"><textPath href="#rt-em-path">MYSTERY ANALYSIS DIVISION ★ M·A·D ★</textPath></text>' +
      "</svg>";

    function icon(paths) {
      return '<svg viewBox="0 0 100 100" aria-hidden="true">' + paths + "</svg>";
    }
    var ICONS = {
      mystery: icon('<rect x="14" y="30" width="72" height="50" rx="2"/><path d="M14 30v-6h24l5 6M24 44h40M24 54h52M24 64h26"/><rect x="58" y="58" width="22" height="13" transform="rotate(-10 69 64)"/>'),
      evidence: icon('<circle cx="44" cy="44" r="22"/><path d="M60 60 80 80" stroke-width="7"/><circle cx="37" cy="44" r="6"/><path d="M43 44h14M52 44v6M56 44v4"/>'),
      character: icon('<ellipse cx="50" cy="52" rx="33" ry="40"/><path class="fill" d="M50 37c-7 0-10 6-10 12 0 8 4 14 10 14s10-6 10-14c0-6-3-12-10-12zM30 40h40v3H30zM38 40c0-10 3-14 12-14s12 4 12 14zM27 87c3-15 12-21 23-21s20 6 23 21z"/>'),
      location: icon('<path d="M28 86V16h44v70"/><path class="fill" d="M28 86V16l22 8v68z"/><path d="M50 92 72 86M60 86l26 10M66 86l22 4" opacity=".6"/>'),
      action: icon('<path d="M50 20c-16 0-27 13-27 29v11M50 20c16 0 27 13 27 29v17M50 31c-10 0-17 8-17 18v18c0 6 2 12 6 17M50 31c10 0 17 8 17 18v13c0 8-2 16-6 22M50 42c-4 0-7 3-7 7v19c0 6 2 12 6 17M50 42c4 0 7 3 7 7v15c0 8-2 14-4 20M50 52v34"/>'),
      reveal: icon('<path d="M50 16v66M34 84h32M18 30h64M18 30 8 54h20zM82 30 72 54h20z"/><circle class="fill" cx="50" cy="16" r="3.5"/>'),
    };

    var st, stopTurn = function () {};

    function fresh() {
      st = {
        mode: "standby", // standby | guide | play
        guide: 0,
        current: 0,
        slots: {},
        counts: Object.assign({}, START),
        used: { evidence: 0, character: 0, location: 0, action: 0 },
        links: 0,
        linked: {},
        busy: false,
        chosen: null,
        angle: st ? st.angle : 0,
        msg: "",
        shown: "",
      };
    }

    // ---- carousel (top view) ----
    el("circle", { r: 97, class: "rim" }, tray);
    el("circle", { r: 58, class: "rim" }, tray);
    el("circle", { r: 50, class: "hub" }, tray);
    var tabs = [];
    for (var i = 0; i < N; i++) {
      var g = el("g", { transform: "rotate(" + i * STEP + ")" }, tray);
      el("line", { x1: 0, y1: 60, x2: 0, y2: 95, class: "fin", transform: "rotate(" + STEP / 2 + ")" }, g);
      tabs.push(el("rect", { x: -3.4, y: 77, width: 6.8, height: 17, rx: 1.2, class: "tab" }, g));
      if (i % 5 === 0) el("text", { x: 0, y: 46, class: "num" }, g).textContent = pad(i);
    }

    function turnTo(index, ms) {
      stopTurn();
      var from = st.angle, to = -index * STEP;
      st.angle = to;
      stopTurn = tween(from, to, ms, ease.inOut, function (a) {
        tray.setAttribute("transform", "rotate(" + a + ")");
      });
    }

    // ---- sound (off by default) ----
    var audio = null, soundOn = false;
    function click(gain) {
      if (!soundOn) return;
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var len = Math.floor(audio.sampleRate * 0.035), buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
      for (var j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 5);
      var src = audio.createBufferSource(), f = audio.createBiquadFilter(), v = audio.createGain();
      src.buffer = buf;
      f.type = "bandpass";
      f.frequency.value = 1900;
      f.Q.value = 0.9;
      v.gain.value = gain || 0.6;
      src.connect(f).connect(v).connect(audio.destination);
      src.start();
    }
    function chime() {
      if (!soundOn || !audio) return;
      var o = audio.createOscillator(), v = audio.createGain(), t = audio.currentTime;
      o.frequency.value = 880;
      v.gain.setValueAtTime(0.0001, t);
      v.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      v.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(v).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.9);
    }
    soundBtn.addEventListener("click", function () {
      soundOn = !soundOn;
      soundBtn.setAttribute("aria-pressed", soundOn);
      soundBtn.textContent = soundOn ? "sound on" : "sound off";
      if (soundOn) click(0.5);
    });

    // ---- state queries ----
    function indices() {
      return Object.keys(st.slots).map(Number);
    }
    function has(type) {
      return indices().some(function (k) {
        return st.slots[k].type === type;
      });
    }
    function cardsIn() {
      return indices().filter(function (k) {
        return st.slots[k].type !== "reveal";
      }).length;
    }
    function nextFree() {
      return Math.max.apply(null, indices().concat([st.current])) + 1;
    }
    function slotOf(id) {
      var hit = null;
      indices().forEach(function (k) {
        if (st.slots[k].id === id && st.slots[k].played) hit = k;
      });
      return hit;
    }
    function caseOpen() {
      return indices().some(function (k) {
        return st.slots[k].type === "mystery" && st.slots[k].played;
      });
    }
    function bulbOn() {
      return indices().some(function (k) {
        return st.slots[k].update && !st.slots[k].seen;
      });
    }
    function phase() {
      if (st.mode === "guide" || !caseOpen()) return "standby";
      if (st.chosen) return "closed";
      var s = st.slots[st.current];
      if (s && s.type === "reveal" && s.played) return "reveal";
      if (bulbOn()) return "associate";
      if (s && s.type === "mystery") return "case";
      return "explore";
    }

    // ---- what the projector shows ----
    function bar(type, k) {
      return '<div class="rt-proj__bar"><span class="rt-proj__type">' + LABEL[type] + "</span><span>slot " + pad(k) + "</span><span>case " + CASE + "</span></div>";
    }
    function card(s, k) {
      var extra = "";
      if (s.update) extra += '<p class="rt-proj__text rt-proj__note"><b>UPDATED ▲</b> ' + esc(s.update) + "</p>";
      if (s.insight && st.slots[s.insight.slot] && !st.slots[s.insight.slot].seen) {
        extra += '<p class="rt-proj__text rt-proj__insight">● The bulb is lit. Slot ' + pad(s.insight.slot) + " has changed: " + s.insight.kind + " (" + s.insight.score.toFixed(2) + "). Go back ◀◀.</p>";
      }
      return '<div class="rt-proj rt-proj--card" style="--c: var(--rt-' + s.type + ')">' + bar(s.type, k) +
        '<div class="rt-proj__body"><div class="rt-proj__still">' + ICONS[s.type] + '</div><div><p class="rt-proj__text">' + esc(s.text) + "</p>" + extra + "</div></div></div>";
    }
    function theories(k) {
      return '<div class="rt-proj rt-proj--card" style="--c: var(--rt-reveal)">' + bar("reveal", k) +
        '<div class="rt-proj__body rt-proj__body--wide"><div><p class="rt-proj__text">Five theories. Four are true. Which one is false?</p><div class="rt-theories">' +
        THEORIES.map(function (t, j) {
          return '<button type="button" data-choose="' + (j + 1) + '">' + esc(t) + "</button>";
        }).join("") + "</div></div></div></div>";
    }
    function verdict(k) {
      var right = st.chosen === FALSE_N;
      return '<div class="rt-proj rt-proj--card" style="--c: var(--rt-reveal)">' + bar("reveal", k) +
        '<div class="rt-proj__body rt-proj__body--wide"><div><p class="rt-proj__text"><b>You chose theory ' + st.chosen + ".</b> The false one was " + FALSE_N + ": “" + esc(THEORIES[FALSE_N - 1]) + "”</p>" +
        '<p class="rt-proj__text" style="margin-top: .9em">' + esc(right ? VERDICT.right : VERDICT.wrong) + "</p></div></div>" +
        '<span class="rt-stamp rt-proj__stamp">' + (right ? "case closed" : "case misfiled") + "</span></div>";
    }
    function projection() {
      var k = st.current, s = st.slots[k];
      if (st.mode === "guide") {
        return '<div class="rt-proj rt-proj--guide"><p class="rt-proj__title">detective\'s guide · ' + (st.guide + 1) + " / " + GUIDE.length + '</p><p class="rt-proj__text">' + esc(GUIDE[st.guide]) + "</p></div>";
      }
      if (k === 0) {
        var text = caseOpen() ? "Case " + CASE + " is open. Press forward ▶▶ to continue." : "Insert a MYSTERY slide, then press forward ▶▶.<br>Press back ◀◀ for the detective's guide.";
        return '<div class="rt-proj rt-proj--standby">' + EMBLEM + '<p class="rt-proj__title">mystery analysis division</p><p class="rt-proj__text">' + text + "</p></div>";
      }
      if (!s) {
        return '<div class="rt-proj rt-proj--empty"><p class="rt-proj__title">slot ' + pad(k) + ' · empty</p><p class="rt-proj__text">Nothing in the gate. Load a slide from the archive box.</p></div>';
      }
      if (!s.played) {
        return '<div class="rt-proj rt-proj--leader"><div class="rt-leader"><b>3</b></div><p class="rt-proj__title">developing</p><p class="rt-proj__text rt-mono">gpt-4o is writing · dall·e 3 is printing</p></div>';
      }
      if (s.type === "reveal") return st.chosen ? verdict(k) : theories(k);
      return card(s, k);
    }

    function render() {
      var k = st.current, s = st.slots[k];
      var key = [st.mode, st.guide, k, s && s.played, s && s.update, s && s.insight && st.slots[s.insight.slot].seen, st.chosen, caseOpen()].join("|");
      if (key !== st.shown) {
        slideEl.innerHTML = projection();
        st.shown = key;
      }
      if (s && s.played && s.update && !s.seen) s.seen = true;

      var p = phase();
      phaseEls.forEach(function (li) {
        li.classList.toggle("is-on", li.dataset.phase === p);
      });
      var lit = bulbOn();
      bulb.classList.toggle("is-on", lit);
      bulb.setAttribute("aria-label", "indicator bulb: " + (lit ? "on" : "off"));
      sim.classList.toggle("is-projecting", k > 0 && !!s);

      tabs.forEach(function (tab, j) {
        var slot = st.slots[j];
        tab.setAttribute("class", "tab" + (slot ? (slot.played ? " is-played" : " is-loaded") : ""));
        if (slot) tab.style.fill = "var(--rt-" + slot.type + ")";
      });
      tokenEls.forEach(function (t) {
        var type = t.dataset.type;
        t.querySelector("small").textContent = st.counts[type];
        t.disabled = !st.counts[type] || !!st.chosen;
      });

      var label = k === 0 ? (st.mode === "guide" ? "guide" : "standby") : s ? (s.played ? LABEL[s.type] : LABEL[s.type] + " loaded") : "empty";
      statusEl.textContent = st.msg || "slot " + pad(k) + " · " + label;
    }

    // ---- actions ----
    function develop(s) {
      s.played = true;
      if (s.type === "mystery") s.text = MYSTERY;
      if (!POOLS[s.type]) return;
      var c = POOLS[s.type][st.used[s.type]++];
      s.id = c.id;
      s.text = c.text;
      if (st.links >= 3) return;
      for (var j = 0; j < LINKS.length; j++) {
        var L = LINKS[j], other = L.a === s.id ? L.b : L.b === s.id ? L.a : null;
        if (!other || st.linked[j]) continue;
        var target = slotOf(other);
        if (target === null) continue;
        st.slots[target].update = L.note[other];
        st.slots[target].seen = false;
        st.linked[j] = true;
        st.links++;
        s.insight = { slot: target, kind: L.kind, score: L.score };
        st.msg = "● link found (" + L.score.toFixed(2) + "). the bulb is lit: go back to slot " + pad(target) + ".";
        setTimeout(chime, 200);
        return;
      }
    }

    function play(k) {
      var s = st.slots[k];
      st.busy = true;
      render();
      var count = slideEl.querySelector(".rt-leader b"), n = 3;
      var iv = setInterval(function () {
        if (--n > 0 && count) count.textContent = n;
      }, 430);
      setTimeout(function () {
        clearInterval(iv);
        develop(s);
        st.busy = false;
        render();
      }, reduceMotion ? 300 : 1300);
    }

    function forward() {
      if (st.busy) return;
      st.msg = "";
      if (st.mode === "guide") {
        if (++st.guide >= GUIDE.length) {
          st.mode = "standby";
          st.guide = 0;
        }
        return render();
      }
      if (st.current >= N - 1) {
        st.msg = "end of the tray. press reset.";
        return render();
      }
      st.current++;
      click();
      turnTo(st.current, 420);
      var s = st.slots[st.current];
      if (s && !s.played) play(st.current);
      else render();
    }

    function back() {
      if (st.busy) return;
      st.msg = "";
      if (st.mode === "guide") {
        if (--st.guide < 0) {
          st.mode = "standby";
          st.guide = 0;
        }
        return render();
      }
      if (st.current === 0) {
        if (caseOpen()) st.msg = "already at slot 00.";
        else st.mode = "guide";
        return render();
      }
      st.current--;
      click();
      turnTo(st.current, 420);
      render();
    }

    function reset() {
      if (st.busy) return;
      var n = st.current, ms = reduceMotion ? 0 : Math.min(1800, 300 + n * 70);
      st.busy = true;
      for (var j = 0; j < Math.min(n, 14); j++) setTimeout(click, (j * ms) / Math.min(n, 14), 0.35);
      turnTo(0, ms);
      setTimeout(function () {
        fresh();
        st.msg = n ? "wound back " + n + " slot" + (n === 1 ? "" : "s") + ". ready for a new case." : "ready for a new case.";
        render();
      }, ms + 60);
    }

    function insert(type) {
      if (st.busy) return;
      st.msg = "";
      if (st.chosen) st.msg = "case closed. press reset for a new one.";
      else if (!st.counts[type]) st.msg = "no " + type + " slides left in the archive.";
      else if (type === "mystery" && has("mystery")) st.msg = "a case is already open. reset to start another.";
      else if (type !== "mystery" && !has("mystery")) st.msg = "open a case first: load a MYSTERY slide.";
      else if (type === "reveal" && cardsIn() < 4) st.msg = "reveal needs 4 cards in play. there " + (cardsIn() === 1 ? "is 1." : "are " + cardsIn() + ".");
      else {
        var k = nextFree();
        if (k >= N) st.msg = "the tray is full.";
        else {
          st.slots[k] = { type: type, played: false };
          st.counts[type]--;
          if (st.mode === "guide") st.mode = "standby";
          st.msg = type.toUpperCase() + " loaded into slot " + pad(k) + ". press forward ▶▶.";
          click(0.3);
        }
      }
      render();
    }

    function choose(n) {
      var s = st.slots[st.current];
      if (st.busy || st.chosen || !s || s.type !== "reveal" || !s.played) return;
      st.chosen = n;
      st.msg = n === FALSE_N ? "case closed. well read, detective." : "case misfiled. press reset to try again.";
      click(0.8);
      render();
    }

    function pressKey(act) {
      var btn = sim.querySelector('[data-act="' + act + '"]');
      if (btn) {
        btn.classList.add("is-pressed");
        setTimeout(function () {
          btn.classList.remove("is-pressed");
        }, 130);
      }
      ({ forward: forward, back: back, reset: reset })[act]();
    }

    sim.addEventListener("click", function (e) {
      var t = e.target.closest("[data-act], .rt-token, [data-choose]");
      if (!t) return;
      if (t.dataset.act) ({ forward: forward, back: back, reset: reset })[t.dataset.act]();
      else if (t.dataset.type) insert(t.dataset.type);
      else choose(+t.dataset.choose);
    });

    sim.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k === "f") pressKey("forward");
      else if (k === "b") pressKey("back");
      else if (k === "r") pressKey("reset");
      else if (KEYS[k]) insert(KEYS[k]);
      else if (/^[1-5]$/.test(k)) choose(+k);
      else return;
      e.preventDefault();
    });

    fresh();
    render();
  })();

  // ------------------------------------------------------------ association gauge

  (function () {
    var gauge = document.querySelector(".rt-gauge");
    if (!gauge) return;
    var ticks = gauge.querySelector(".rt-gauge__ticks");
    var needle = gauge.querySelector(".rt-gauge__needle");
    var scoreEl = gauge.querySelector(".rt-gauge__score");
    var kindEl = gauge.querySelector(".rt-gauge__kind");
    var noteEl = gauge.querySelector(".rt-gauge__note");
    var bulb = gauge.querySelector(".rt-bulb");
    var buttons = document.querySelectorAll(".rt-pairs button");
    for (var v = 0; v <= 1.0001; v += 0.05) {
      var major = Math.abs((v * 4) % 1) < 0.001 || Math.abs((v * 4) % 1) > 0.999;
      var r1 = major ? 84 : 91, ang = Math.PI * v;
      el("line", { x1: -r1 * Math.cos(ang), y1: -r1 * Math.sin(ang), x2: -98 * Math.cos(ang), y2: -98 * Math.sin(ang), class: major ? "major" : "" }, ticks);
    }
    var value = 0, cancel = function () {};
    function draw(x) {
      needle.setAttribute("transform", "rotate(" + (x - 0.5) * 180 + ")");
    }
    draw(0);
    buttons.forEach(function (b) {
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        buttons.forEach(function (o) {
          o.setAttribute("aria-pressed", o === b);
        });
        var target = +b.dataset.score, hot = target >= 0.75;
        gauge.classList.remove("is-hot");
        bulb.classList.remove("is-on");
        kindEl.textContent = "rating…";
        noteEl.textContent = "";
        cancel();
        cancel = tween(value, target, 1100, ease.outBack, function (x) {
          value = x;
          draw(x);
          scoreEl.textContent = Math.max(0, x).toFixed(2);
        }, function () {
          value = target;
          scoreEl.textContent = target.toFixed(2);
          kindEl.textContent = hot ? "≥ 0.75 · " + b.dataset.kind : "< 0.75 · " + b.dataset.kind;
          noteEl.textContent = hot ? "Linked. The earlier slide is rewritten: " + b.dataset.note : b.dataset.note + " The bulb stays dark.";
          gauge.classList.toggle("is-hot", hot);
          bulb.classList.toggle("is-on", hot);
        });
      });
    });
  })();

  // ------------------------------------------------------------ system schematic

  (function () {
    var sch = document.querySelector(".rt-schematic");
    if (!sch) return;
    var info = document.querySelector(".rt-node-info");
    var INFO = {
      tok: ["slide token", "Each slide carries an RFID tag naming its kind: evidence, character, location, action, reveal or a choice."],
      btn: ["buttons", "Back, forward and reset. Each press is typed into the game as B, F or R, and starts a turn of the tray."],
      lim: ["limit switch", "An optical switch marks the end of every turn, so the tray can never drift off the gate."],
      rfid: ["rc522 reader", "Reads the tag of whichever slide has just dropped into the gate."],
      ard: ["arduino pro micro", "The machine's spine. It drives the servo and stepper, reads the tag, types one letter per event, and listens on Web Serial for the bulb."],
      servo: ["servo", "Lifts the slide clear of the gate before the tray turns, and lowers it after."],
      step: ["nema-17 + geneva", "Turns the Geneva crank once per press: one turn, one slot, locked in between."],
      game: ["game", "Runs in the browser with p5.js. Keeps the whole case in memory, filters and summarises image prompts, and asks GPT-4o whether a new card links to an old one."],
      gpt: ["gpt-4o", "Writes the four-sentence case, every clue, the association ratings, the five theories and the verdict."],
      dalle: ["dall·e 3", "Develops a black-and-white, film-noir still for every slide."],
      proj: ["projector", "Shows each slide, image and text, one at a time, like the original."],
      spk: ["speaker", "Plays period jazz in standby, and music while the images develop."],
      bulb: ["indicator bulb", "Switched by the game over Web Serial when two clues connect. Retrace your steps."],
    };
    var nodes = sch.querySelectorAll("[data-node]");
    var edges = sch.querySelectorAll("[data-e]");
    var idle = info.innerHTML;
    function hot(id) {
      sch.classList.toggle("has-hot", !!id);
      var linked = {};
      edges.forEach(function (e) {
        var ends = e.dataset.e.split(" "), on = !!id && ends.indexOf(id) > -1;
        e.classList.toggle("is-hot", on);
        if (on) ends.forEach(function (n) {
          linked[n] = true;
        });
      });
      nodes.forEach(function (n) {
        n.classList.toggle("is-hot", !!linked[n.dataset.node] || n.dataset.node === id);
      });
      info.innerHTML = id ? "<b>" + INFO[id][0] + ".</b> " + INFO[id][1] : idle;
    }
    nodes.forEach(function (n) {
      n.setAttribute("tabindex", "0");
      n.setAttribute("role", "button");
      n.setAttribute("aria-label", INFO[n.dataset.node][0]);
      n.addEventListener("mouseenter", function () {
        hot(n.dataset.node);
      });
      n.addEventListener("focus", function () {
        hot(n.dataset.node);
      });
      n.addEventListener("mouseleave", function () {
        hot(null);
      });
      n.addEventListener("blur", function () {
        hot(null);
      });
    });

    // An illustrative event log for one press of forward on an evidence slide.
    var log = document.querySelector(".rt-serial");
    var LINES = [
      "btn A0 ............. key F",
      "servo 90 → 32 ...... lift slide",
      "step fwd ≥100 ...... limit ✓ · +15",
      "servo 32 → 90 ...... drop slide",
      "rfid 04:49:B8:84:73  key E",
      "gpt-4o ............. evidence, 2 sentences",
      "dall·e 3 ........... 1024×1024 · noir",
      "assoc .............. 0.82 ≥ 0.75",
      "serial ............. \"1\" · lamp on",
      "btn A1 ............. key B",
      "step rev ........... limit ✓ · +15",
      "rfid 04:83:66:85:73  key C · updated",
      "serial ............. \"0\" · lamp off",
    ];
    var shown = [], li = 0, t = 0, visible = false;
    onVisible(log, function (v) {
      visible = v;
    });
    function tick() {
      if (visible && !document.hidden) {
        t += 0.6 + Math.random() * 0.7;
        var secs = t.toFixed(1).padStart(5, "0");
        shown.push("[" + secs + "] " + LINES[li]);
        li = (li + 1) % LINES.length;
        if (shown.length > 6) shown.shift();
        log.textContent = shown.join("\n");
      }
      setTimeout(tick, reduceMotion ? 2500 : 900);
    }
    tick();
  })();

  // ------------------------------------------------------------ geneva drive

  (function () {
    var root = document.querySelector(".rt-geneva");
    if (!root) return;
    var n = 6, c = 100, a = c * Math.sin(Math.PI / n), SLOT = 360 / n, HALF = 90 - 180 / n;
    var wheel = root.querySelector(".rt-gw"), drive = root.querySelector(".rt-gd");
    var cuts = root.querySelector(".rt-gw-cuts");
    var range = root.querySelector('input[type="range"]');
    var crankEl = root.querySelector(".g-crank"), trayEl = root.querySelector(".g-tray"), stateEl = root.querySelector(".g-state");
    var cursor = root.querySelector(".rt-plot__cursor");

    // Wheel: slots where the pin enters, concave arcs where the locking disc rests.
    for (var k = 0; k < n; k++) {
      var slotAng = k * SLOT + SLOT / 2, arcAng = (k * SLOT * Math.PI) / 180;
      el("rect", { x: 42, y: -6.5, width: 60, height: 13, rx: 6.5, transform: "rotate(" + slotAng + ")" }, cuts);
      el("circle", { cx: c * Math.cos(arcAng), cy: c * Math.sin(arcAng), r: 34.5 }, cuts);
    }

    // Tray angle for a total crank angle A (degrees). The pin engages for
    // 180 ± HALF degrees of every turn; the rest of the turn the tray is locked.
    function trayAngle(A) {
      var rev = Math.floor(A / 360), al = A - rev * 360, s;
      if (al < 180 - HALF) s = 0;
      else if (al > 180 + HALF) s = -SLOT;
      else {
        var r = (al * Math.PI) / 180;
        s = (Math.atan2(a * Math.sin(r), c + a * Math.cos(r)) * 180) / Math.PI - SLOT / 2;
      }
      return -SLOT * rev + s;
    }

    var d = "";
    for (var x = 0; x <= 720; x += 3) d += (x ? "L" : "M") + x / 2 + " " + (85 - (-trayAngle(x) / (2 * SLOT)) * 78).toFixed(2);
    root.querySelector(".rt-plot__line").setAttribute("d", d);

    var A = 0;
    function draw() {
      var b = trayAngle(A), al = A % 360, moving = al > 180 - HALF && al < 180 + HALF;
      drive.setAttribute("transform", "rotate(" + A + ")");
      wheel.setAttribute("transform", "rotate(" + b + ")");
      crankEl.textContent = Math.round(al) + "°";
      trayEl.textContent = (((-b % 360) + 360) % 360).toFixed(1) + "°";
      stateEl.textContent = moving ? "indexing" : "locked";
      stateEl.classList.toggle("is-moving", moving);
      var px = (A % 720) / 2;
      cursor.setAttribute("x1", px);
      cursor.setAttribute("x2", px);
      range.value = A % 720;
    }
    draw();

    var auto = !reduceMotion, visible = false, cancel = function () {};
    onVisible(root, function (v) {
      visible = v;
    });
    function spin() {
      if (auto && visible && !document.hidden) {
        A += 0.7;
        draw();
      }
      requestAnimationFrame(spin);
    }
    requestAnimationFrame(spin);

    root.querySelector('[data-geneva="step"]').addEventListener("click", function () {
      auto = false;
      cancel();
      var target = (Math.floor(A / 360) + 1) * 360;
      cancel = tween(A, target, 1500, ease.linear, function (x) {
        A = x;
        draw();
      });
    });
    range.addEventListener("input", function () {
      auto = false;
      cancel();
      A = +range.value;
      draw();
    });
  })();

  // ------------------------------------------------------------ case file tabs

  (function () {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.rt-file__tabs [role="tab"]'));
    if (!tabs.length) return;
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on);
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
      if (focus) tab.focus();
      tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () {
        select(t);
      });
      t.addEventListener("keydown", function (e) {
        var j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (j === undefined) return;
        e.preventDefault();
        select(tabs[(j + tabs.length) % tabs.length], true);
      });
    });
  })();
})();

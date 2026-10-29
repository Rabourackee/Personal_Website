// Dream Brush page (src/projects/dreambrush.html): the drying-water trail on
// the hero paper, and the writing canvas. Both skip quietly if their markup
// is absent; the page reads as a static document without JavaScript.
(function () {
  "use strict";
  if (!document.querySelector(".db")) return;

  var SVGNS = "http://www.w3.org/2000/svg";
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function html(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------ hero: water that dries

  (function () {
    var hero = document.querySelector(".db-hero");
    var cv = hero && hero.querySelector(".db-trace");
    if (!cv || reduceMotion) return;
    var ctx = cv.getContext("2d"), dpr = Math.min(devicePixelRatio || 1, 2), last = null, raf = 0, lastInk = 0;
    function size() {
      var r = hero.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
    }
    size();
    addEventListener("resize", size);
    function fade(now) {
      // each frame removes a little of every mark: the water drying
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.028)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = "source-over";
      raf = now - lastInk < 5000 ? requestAnimationFrame(fade) : 0;
    }
    hero.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      var r = hero.getBoundingClientRect(), p = { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr, t: performance.now() };
      if (last && p.t - last.t < 80) {
        var dx = p.x - last.x, dy = p.y - last.y, d = Math.hypot(dx, dy), v = d / Math.max(1, p.t - last.t);
        var w = Math.max(3, 22 - v * 6) * dpr; // slow strokes lay down more water
        ctx.strokeStyle = "rgba(70, 60, 45, 0.07)";
        ctx.lineCap = "round";
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      last = p;
      lastInk = p.t;
      if (!raf) raf = requestAnimationFrame(fade);
    });
    hero.addEventListener("pointerleave", function () {
      last = null;
    });
  })();

  // ------------------------------------------------------------ the writing canvas

  (function () {
    var studio = document.querySelector(".db-studio");
    if (!studio) return;
    var svg = studio.querySelector(".db-canvas");
    var charsEl = studio.querySelector(".db-chars");
    var stepsEl = studio.querySelector(".db-steps");
    var suggestEl = studio.querySelector(".db-suggest");
    var suggestRow = studio.querySelector(".db-suggest__row");
    var soundBtn = studio.querySelector('[data-db="sound"]');
    var W = 600, H = 800, INK = "#1d1b18", SEAL = "#b8352a";

    var CHARS = [
      { c: "山", py: "shān", en: "mountain", sound: "wind across high peaks", next: ["水", "云", "松"], note: 0 },
      { c: "日", py: "rì", en: "sun", sound: "a single bright bell", next: ["山", "鸟", "云"], note: 4 },
      { c: "月", py: "yuè", en: "moon", sound: "one quiet guqin note", next: ["夜", "舟", "水"], note: 7 },
      { c: "水", py: "shuǐ", en: "water", sound: "a stream over stones", next: ["舟", "鸟", "月"], note: 2 },
      { c: "云", py: "yún", en: "cloud", sound: "a soft breath of wind", next: ["山", "雨", "鸟"], note: 5 },
      { c: "雨", py: "yǔ", en: "rain", sound: "rain on leaves", next: ["舟", "松", "云"], note: 1, global: true },
      { c: "松", py: "sōng", en: "pine", sound: "pines in the wind", next: ["鸟", "山", "月"], note: 3 },
      { c: "鸟", py: "niǎo", en: "birds", sound: "birdsong, far off", next: ["日", "松", "云"], note: 8 },
      { c: "舟", py: "zhōu", en: "boat", sound: "oars in water", next: ["水", "月", "雨"], note: 6 },
      { c: "夜", py: "yè", en: "night", sound: "crickets in the dark", next: ["月", "舟", "松"], note: 9, global: true },
    ];
    var BY = {};
    CHARS.forEach(function (d) {
      BY[d.c] = d;
    });

    // ---- canvas layers ----
    var defs = el("defs", {}, svg);
    var f1 = el("filter", { id: "db-ink", x: "-10%", y: "-10%", width: "120%", height: "120%" }, defs);
    el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.035", numOctaves: "2", seed: "3", result: "n" }, f1);
    el("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "7", xChannelSelector: "R", yChannelSelector: "G" }, f1);
    var f2 = el("filter", { id: "db-wash", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
    el("feGaussianBlur", { stdDeviation: "6" }, f2);
    var f3 = el("filter", { id: "db-wet", x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
    el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "3", result: "b" }, f3);
    var fm = el("feMerge", {}, f3);
    el("feMergeNode", { in: "b" }, fm);
    el("feMergeNode", { in: "SourceGraphic" }, fm);
    var paper = el("filter", { id: "db-paper" }, defs);
    el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.8", numOctaves: "3", seed: "9" }, paper);
    el("feColorMatrix", { values: "0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0.07 0" }, paper);
    el("rect", { width: W, height: H, fill: "#f7f3ea" }, svg);
    el("rect", { width: W, height: H, filter: "url(#db-paper)" }, svg);
    var gPaint = el("g", {}, svg);
    var gGlobal = el("g", {}, svg);
    var gWet = el("g", {}, svg);
    var gGuide = el("g", {}, svg);
    var gSeal = el("g", { opacity: 0 }, svg);
    el("rect", { x: 28, y: H - 92, width: 34, height: 64, rx: 3, fill: SEAL }, gSeal);
    el("text", { x: 45, y: H - 74, "font-size": 24, fill: "#f2eee5", "text-anchor": "middle", "dominant-baseline": "central", "font-family": "Ma Shan Zheng, KaiTi, serif" }, gSeal).textContent = "夢";
    el("text", { x: 45, y: H - 46, "font-size": 24, fill: "#f2eee5", "text-anchor": "middle", "dominant-baseline": "central", "font-family": "Ma Shan Zheng, KaiTi, serif" }, gSeal).textContent = "筆";

    function grad(id, stops, vertical) {
      var g = el("linearGradient", { id: id, x1: 0, y1: 0, x2: vertical ? 0 : 1, y2: vertical ? 1 : 0 }, defs);
      stops.forEach(function (s) {
        el("stop", { offset: s[0], "stop-color": s[1], "stop-opacity": s[2] }, g);
      });
      return "url(#" + id + ")";
    }
    var uid = 0;

    // ---- motifs: each draws into a region and returns its group ----
    var MOTIFS = {
      山: function (g, r, rand) {
        for (var L = 0; L < 3; L++) {
          var tone = [0.32, 0.55, 0.86][L], top = r.y + r.h * [0.02, 0.22, 0.42][L];
          var peaks = [];
          for (var k = 0; k < 2 + Math.floor(rand() * 2); k++) peaks.push({ x: r.x + r.w * (0.15 + rand() * 0.7), s: r.w * (0.12 + rand() * 0.16), a: 0.55 + rand() * 0.45 });
          var d = "M" + r.x + " " + (r.y + r.h);
          for (var i = 0; i <= 40; i++) {
            var x = r.x + (r.w * i) / 40, hgt = 0;
            peaks.forEach(function (p) {
              hgt = Math.max(hgt, p.a * Math.exp(-Math.pow((x - p.x) / p.s, 2)));
            });
            var y = top + (r.y + r.h - top) * (1 - hgt) + (rand() - 0.5) * r.h * 0.012;
            d += " L" + x.toFixed(1) + " " + y.toFixed(1);
          }
          d += " L" + (r.x + r.w) + " " + (r.y + r.h) + " Z";
          el("path", { d: d, fill: grad("m" + ++uid, [[0, INK, tone], [0.55, INK, tone * 0.45], [1, INK, 0]], true), filter: "url(#db-ink)" }, g);
          if (L === 2) {
            for (var c = 0; c < 6; c++) {
              var cx = r.x + r.w * (0.2 + rand() * 0.6), cy = r.y + r.h * (0.5 + rand() * 0.3), len = r.w * 0.06;
              el("path", { d: "M" + cx + " " + cy + " q" + len * 0.5 + " " + len * 0.3 + " " + len + " " + len * 1.1, fill: "none", stroke: INK, "stroke-width": 1.4, "stroke-linecap": "round", opacity: 0.55 }, g);
            }
          }
        }
      },
      日: function (g, r) {
        var cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = Math.min(r.w, r.h) * 0.34;
        el("circle", { cx: cx, cy: cy, r: rad * 1.5, fill: SEAL, opacity: 0.12, filter: "url(#db-wash)" }, g);
        el("circle", { cx: cx, cy: cy, r: rad, fill: "#c4402f", opacity: 0.88, filter: "url(#db-ink)" }, g);
      },
      月: function (g, r) {
        var cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = Math.min(r.w, r.h) * 0.32;
        el("circle", { cx: cx, cy: cy, r: rad * 1.6, fill: "#fffdf6", opacity: 0.6, filter: "url(#db-wash)" }, g);
        el("circle", { cx: cx, cy: cy, r: rad, fill: "#fbf7ec", stroke: INK, "stroke-width": 1, "stroke-opacity": 0.3, filter: "url(#db-ink)" }, g);
      },
      水: function (g, r, rand) {
        el("ellipse", { cx: r.x + r.w / 2, cy: r.y + r.h / 2, rx: r.w * 0.46, ry: r.h * 0.38, fill: "#6f7d82", opacity: 0.1, filter: "url(#db-wash)" }, g);
        var n = 5 + Math.floor(r.h / 40);
        for (var i = 0; i < n; i++) {
          var y = r.y + r.h * ((i + 0.5) / n), x0 = r.x + r.w * rand() * 0.25, x1 = r.x + r.w * (0.75 + rand() * 0.25), d = "M" + x0 + " " + y;
          for (var x = x0; x < x1; x += 22) d += " q11 " + (rand() > 0.5 ? -3 : 3) + " 22 0";
          el("path", { d: d, fill: "none", stroke: INK, "stroke-width": 1.3, opacity: 0.3 + rand() * 0.3, "stroke-linecap": "round", filter: "url(#db-ink)" }, g);
        }
      },
      云: function (g, r, rand) {
        for (var i = 0; i < 5; i++) {
          el("ellipse", { cx: r.x + r.w * (0.2 + rand() * 0.6), cy: r.y + r.h * (0.35 + rand() * 0.3), rx: r.w * (0.18 + rand() * 0.14), ry: r.h * (0.08 + rand() * 0.07), fill: "#8b8780", opacity: 0.2, filter: "url(#db-wash)" }, g);
        }
        var y = r.y + r.h * 0.55;
        el("path", { d: "M" + (r.x + r.w * 0.15) + " " + y + " c" + r.w * 0.12 + " " + -r.h * 0.2 + " " + r.w * 0.3 + " " + -r.h * 0.2 + " " + r.w * 0.36 + " 0 s" + r.w * 0.1 + " " + -r.h * 0.22 + " " + r.w * 0.28 + " " + -r.h * 0.06, fill: "none", stroke: INK, "stroke-width": 1.2, opacity: 0.4, "stroke-linecap": "round", filter: "url(#db-ink)" }, g);
      },
      松: function (g, r, rand) {
        var bx = r.x + r.w * (0.4 + rand() * 0.2), by = r.y + r.h, tx = r.x + r.w * (0.35 + rand() * 0.3), ty = r.y + r.h * 0.08;
        el("path", { d: "M" + bx + " " + by + " C" + (bx - r.w * 0.15) + " " + (by - r.h * 0.4) + " " + (tx + r.w * 0.18) + " " + (ty + r.h * 0.45) + " " + tx + " " + ty, fill: "none", stroke: INK, "stroke-width": Math.max(3, r.w * 0.05), "stroke-linecap": "round", opacity: 0.8, filter: "url(#db-ink)" }, g);
        for (var i = 0; i < 5; i++) {
          var t = 0.12 + i * 0.17, px = tx + (bx - tx) * t + (rand() - 0.5) * r.w * 0.15, py = ty + (by - ty) * t * 0.85, pw = r.w * (0.22 + rand() * 0.14) * (i % 2 ? 1 : -1);
          var cl = el("g", { filter: "url(#db-ink)" }, g);
          el("ellipse", { cx: px + pw * 0.5, cy: py, rx: Math.abs(pw) * 0.55, ry: r.h * 0.045, fill: INK, opacity: 0.72 }, cl);
          for (var k = 0; k < 9; k++) {
            var sx = px + pw * (k / 8);
            el("path", { d: "M" + sx + " " + (py - r.h * 0.04) + " l" + (rand() - 0.5) * 6 + " " + -r.h * 0.035, stroke: INK, "stroke-width": 1, opacity: 0.6 }, cl);
          }
        }
      },
      鸟: function (g, r, rand) {
        var n = 3 + Math.floor(rand() * 4);
        for (var i = 0; i < n; i++) {
          var x = r.x + r.w * (0.1 + rand() * 0.8), y = r.y + r.h * (0.15 + rand() * 0.7), s = Math.min(r.w, r.h) * (0.05 + rand() * 0.05);
          el("path", { d: "M" + (x - s) + " " + y + " q" + s * 0.5 + " " + -s * 0.6 + " " + s + " 0 q" + s * 0.5 + " " + -s * 0.6 + " " + s + " 0", fill: "none", stroke: INK, "stroke-width": 1.6, "stroke-linecap": "round", opacity: 0.8, filter: "url(#db-ink)" }, g);
        }
      },
      舟: function (g, r, rand) {
        var cx = r.x + r.w / 2, cy = r.y + r.h * 0.6, L = r.w * 0.38;
        el("path", { d: "M" + (cx - L) + " " + cy + " Q" + cx + " " + (cy + L * 0.32) + " " + (cx + L) + " " + (cy - L * 0.05) + " Q" + cx + " " + (cy + L * 0.12) + " " + (cx - L) + " " + cy + "Z", fill: INK, opacity: 0.8, filter: "url(#db-ink)" }, g);
        el("path", { d: "M" + (cx + L * 0.1) + " " + (cy + L * 0.04) + " l0 " + -L * 0.75, stroke: INK, "stroke-width": 1.4, opacity: 0.7 }, g);
        el("circle", { cx: cx - L * 0.3, cy: cy - L * 0.12, r: L * 0.06, fill: INK, opacity: 0.75 }, g);
        for (var i = 1; i <= 2; i++) el("path", { d: "M" + (cx - L * (1 + i * 0.2)) + " " + (cy + L * 0.18 * i) + " q" + L * 0.5 + " " + -4 + " " + L * 1.1 + " 0", fill: "none", stroke: INK, "stroke-width": 1, opacity: 0.35 }, g);
      },
    };
    var globals = { 雨: false, 夜: false };
    function drawGlobals() {
      gGlobal.textContent = "";
      if (globals.夜) {
        // a blue-black dusk over everything, with any moon glowing above it
        el("rect", { width: W, height: H, fill: "#1a2434", opacity: 0.62, style: "mix-blend-mode: multiply" }, gGlobal);
        motifs.forEach(function (m) {
          if (m.c !== "月") return;
          var cx = m.r.x + m.r.w / 2, cy = m.r.y + m.r.h / 2, rad = Math.min(m.r.w, m.r.h) * 0.32;
          el("circle", { cx: cx, cy: cy, r: rad * 2.2, fill: "#fff6d8", opacity: 0.28, filter: "url(#db-wash)" }, gGlobal);
          el("circle", { cx: cx, cy: cy, r: rad, fill: "#fbf3dc", filter: "url(#db-ink)" }, gGlobal);
        });
      }
      if (globals.雨) {
        var rand = rng(77);
        el("rect", { width: W, height: H, fill: "#5f6c75", opacity: 0.05 }, gGlobal);
        for (var i = 0; i < 140; i++) {
          var x = rand() * (W + 200) - 100, y = rand() * H, l = 18 + rand() * 30;
          el("path", { d: "M" + x + " " + y + " l" + -l * 0.35 + " " + l, stroke: INK, "stroke-width": 0.8, opacity: 0.18, "stroke-linecap": "round" }, gGlobal);
        }
      }
    }

    // ---- state ----
    var motifs = [], busy = false, current = "山", seed = 11;
    // share of `old` that the new region `r` covers
    function covered(old, r) {
      var x = Math.max(0, Math.min(old.x + old.w, r.x + r.w) - Math.max(old.x, r.x)), y = Math.max(0, Math.min(old.y + old.h, r.y + r.h) - Math.max(old.y, r.y));
      return (x * y) / (old.w * old.h);
    }
    function overlap(a, b) {
      return Math.max(covered(a, b), covered(b, a));
    }

    // ---- sound (off unless the visitor opts in): pentatonic plucks + soft noise ----
    var audio = null, soundOn = false, PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    function play(d) {
      if (!soundOn) return;
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      [0, 0.5].forEach(function (delay, i) {
        var o = audio.createOscillator(), v = audio.createGain();
        o.type = "triangle";
        o.frequency.value = 220 * Math.pow(2, (PENTA[d.note] + (i ? 7 : 0)) / 12);
        v.gain.setValueAtTime(0.0001, t + delay);
        v.gain.exponentialRampToValueAtTime(0.12 / (i + 1), t + delay + 0.02);
        v.gain.exponentialRampToValueAtTime(0.0001, t + delay + 2.6);
        o.connect(v).connect(audio.destination);
        o.start(t + delay);
        o.stop(t + delay + 2.7);
      });
      if (d.c === "雨" || d.c === "水") {
        var len = audio.sampleRate * 2, buf = audio.createBuffer(1, len, audio.sampleRate), ch = buf.getChannelData(0);
        for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
        var s = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
        s.buffer = buf;
        f.type = d.c === "雨" ? "highpass" : "lowpass";
        f.frequency.value = d.c === "雨" ? 2500 : 700;
        g.gain.value = 0.08;
        s.connect(f).connect(g).connect(audio.destination);
        s.start(t);
      }
    }
    soundBtn.addEventListener("click", function () {
      soundOn = !soundOn;
      soundBtn.setAttribute("aria-pressed", soundOn);
      soundBtn.textContent = soundOn ? "sound on" : "sound off";
    });

    // ---- the inkstone ----
    var tiles = {};
    CHARS.forEach(function (d) {
      var b = html("button", "db-char");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", d.c + ", " + d.py + ", " + d.en);
      var zh = html("b", "", d.c);
      zh.lang = "zh";
      b.appendChild(zh);
      b.appendChild(html("span", "", d.py + " · " + d.en));
      b.addEventListener("click", function () {
        pick(d.c);
      });
      charsEl.appendChild(b);
      tiles[d.c] = b;
    });
    function pick(c) {
      current = c;
      Object.keys(tiles).forEach(function (k) {
        tiles[k].setAttribute("aria-checked", k === c);
        tiles[k].tabIndex = k === c ? 0 : -1;
      });
      if (!busy && stepsEl.firstElementChild && stepsEl.firstElementChild.classList.contains("is-idle")) idle();
    }
    charsEl.addEventListener("keydown", function (e) {
      var keys = Object.keys(tiles), i = keys.indexOf(current);
      var j = { ArrowRight: i + 1, ArrowDown: i + 5, ArrowLeft: i - 1, ArrowUp: i - 5 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      pick(keys[(j + keys.length) % keys.length]);
      tiles[current].focus();
    });
    function idle() {
      stepsEl.textContent = "";
      var li = html("li", "is-idle", "drag on the paper to write ");
      var b = html("b", "db-zh-inline", current);
      b.lang = "zh";
      li.appendChild(b);
      li.appendChild(document.createTextNode(" · " + BY[current].en));
      stepsEl.appendChild(li);
    }

    function step(text, done) {
      var li = html("li", done ? "is-done" : "", text);
      stepsEl.appendChild(li);
      while (stepsEl.children.length > 5) stepsEl.removeChild(stepsEl.firstChild);
      return li;
    }

    function fadeTo(node, to, ms, cb) {
      if (reduceMotion) {
        node.setAttribute("opacity", to);
        if (cb) cb();
        return;
      }
      var from = +node.getAttribute("opacity") || 0, t0 = null;
      function frame(now) {
        if (t0 === null) t0 = now;
        var t = Math.min((now - t0) / ms, 1), e = 1 - Math.pow(1 - t, 2);
        node.setAttribute("opacity", from + (to - from) * e);
        if (t < 1) requestAnimationFrame(frame);
        else if (cb) cb();
      }
      requestAnimationFrame(frame);
    }

    // ---- writing ----
    function write(r) {
      if (busy) return;
      var d = BY[current];
      busy = true;
      suggestEl.hidden = true;
      stepsEl.textContent = "";
      // the wet character, right away
      var s = Math.min(r.w, r.h);
      var wet = el("text", { class: "wet", x: r.x + r.w / 2, y: r.y + r.h / 2, "font-size": s * 0.92, filter: "url(#db-wet)", opacity: 0.92 }, gWet);
      wet.textContent = d.c;
      if (r.w / r.h > 1.4 || r.h / r.w > 1.4) {
        var sx = r.w / s, sy = r.h / s, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        wet.setAttribute("transform", "translate(" + cx + " " + cy + ") scale(" + sx + " " + sy + ") translate(" + -cx + " " + -cy + ")");
      }
      step("stroke captured");
      var T = reduceMotion ? 0.25 : 1;
      setTimeout(function () {
        fadeTo(wet, 0, 2600 * T, function () {
          wet.remove();
        });
        step("vision model · " + d.c + " (" + d.py + ") = " + d.en, true);
      }, 450 * T);

      // decide what the inscription does to the scene
      var action = "add";
      if (d.global) action = globals[d.c] ? "deepen" : "shift";
      else {
        // a stroke that covers most of an existing motif replaces it (or, for
        // the same character, modifies it); a smaller one adds to the scene
        motifs.slice().forEach(function (m) {
          if (covered(m.r, r) > 0.6) {
            action = m.c === d.c ? "modify" : "replace";
            fadeTo(m.g, 0, 900 * T, function () {
              m.g.remove();
            });
            motifs.splice(motifs.indexOf(m), 1);
          }
        });
      }
      setTimeout(function () {
        step(d.global ? "image model · " + (d.c === "雨" ? "the weather turns to rain" : "the day turns to night") + ", across the painting" :
          "image model · " + action + " “" + d.en + "” inside the region, keep the rest", true);
      }, 1050 * T);
      setTimeout(function () {
        step("text-to-sound · " + d.sound, true);
      }, 1600 * T);
      setTimeout(function () {
        if (d.global) {
          globals[d.c] = true;
          drawGlobals();
          gGlobal.setAttribute("opacity", 0);
          fadeTo(gGlobal, 1, 1800 * T);
          if (d.c === "夜" && !motifs.some(function (m) { return m.c === "月"; })) {
            addMotif("月", r);
            drawGlobals(); // so the new moon glows through the dusk
          }
        } else {
          addMotif(d.c, r);
          if (globals.夜 && d.c === "月") drawGlobals();
        }
        if (+gSeal.getAttribute("opacity") === 0) fadeTo(gSeal, 0.92, 1600 * T);
        play(d);
        step("projection updated · sound plays", true);
        suggest(d);
        busy = false;
      }, 2400 * T);
    }

    function addMotif(c, r) {
      var g = el("g", { opacity: 0 }, gPaint);
      MOTIFS[c](g, r, rng(seed++));
      motifs.push({ c: c, r: r, g: g });
      fadeTo(g, 1, reduceMotion ? 0 : 1800);
    }

    function suggest(d) {
      suggestRow.textContent = "";
      d.next.forEach(function (c) {
        var b = html("button", "");
        b.type = "button";
        var zh = html("b", "", c);
        zh.lang = "zh";
        b.appendChild(zh);
        b.appendChild(document.createTextNode(BY[c].en));
        b.addEventListener("click", function () {
          pick(c);
          tiles[c].focus();
        });
        suggestRow.appendChild(b);
      });
      suggestEl.hidden = false;
    }

    // ---- pointer: drag a region ----
    var drag = null, guide = null;
    function pt(e) {
      var p = svg.createSVGPoint();
      p.x = e.clientX;
      p.y = e.clientY;
      p = p.matrixTransform(svg.getScreenCTM().inverse());
      return { x: Math.min(Math.max(p.x, 0), W), y: Math.min(Math.max(p.y, 0), H) };
    }
    function rectOf(a, b) {
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
    }
    svg.addEventListener("pointerdown", function (e) {
      if (busy) return;
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      drag = { a: pt(e), id: e.pointerId };
      guide = el("rect", { class: "guide", x: drag.a.x, y: drag.a.y, width: 0, height: 0 }, gGuide);
    });
    svg.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var r = rectOf(drag.a, pt(e));
      guide.setAttribute("x", r.x);
      guide.setAttribute("y", r.y);
      guide.setAttribute("width", r.w);
      guide.setAttribute("height", r.h);
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var r = rectOf(drag.a, pt(e));
      drag = null;
      if (guide) guide.remove();
      if (r.w < 40 || r.h < 40) {
        // a tap: a modest square around the point
        var s = 170, c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        r = { x: Math.min(Math.max(c.x - s / 2, 0), W - s), y: Math.min(Math.max(c.y - s / 2, 0), H - s), w: s, h: s };
      }
      write(r);
    }
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", function () {
      drag = null;
      if (guide) guide.remove();
    });

    // ---- buttons ----
    studio.querySelector('[data-db="place"]').addEventListener("click", function () {
      if (busy) return;
      var d = BY[current], size = d.c === "山" ? { w: 520, h: 420 } : d.c === "水" ? { w: 460, h: 160 } : d.c === "松" ? { w: 220, h: 380 } : { w: 170, h: 170 };
      var best = null, bestScore = -1, rand = rng(seed * 7);
      for (var i = 0; i < 40; i++) {
        var r = { x: rand() * (W - size.w), y: rand() * (H - size.h), w: size.w, h: size.h };
        if (d.c === "山") r.y = H - size.h - 40 - rand() * 120;
        if (d.c === "日" || d.c === "月" || d.c === "鸟" || d.c === "云") r.y = rand() * 260;
        var score = 1 - motifs.reduce(function (m, o) {
          return Math.max(m, overlap(o.r, r));
        }, 0);
        if (score > bestScore) {
          best = r;
          bestScore = score;
        }
      }
      write(best);
    });
    studio.querySelector('[data-db="clear"]').addEventListener("click", function () {
      if (busy) return;
      motifs.forEach(function (m) {
        fadeTo(m.g, 0, 700, function () {
          m.g.remove();
        });
      });
      motifs = [];
      globals.雨 = globals.夜 = false;
      fadeTo(gGlobal, 0, 700, drawGlobals);
      fadeTo(gSeal, 0, 700);
      suggestEl.hidden = true;
      idle();
    });

    pick("山");
    idle();
  })();
})();

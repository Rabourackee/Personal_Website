// Rubber Ducky page (src/projects/rubber-ducky.html): every interactive part.
// Each block looks for its own markup and skips quietly if it's absent; the
// page reads as a complete, static document without JavaScript.
(function () {
  "use strict";
  if (!document.querySelector(".rd")) return;

  var SVGNS = "http://www.w3.org/2000/svg";
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------ helpers

  function el(tag, attrs, parent) {
    var node = document.createElementNS(SVGNS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function set(node, attrs) {
    for (var k in attrs) node.setAttribute(k, attrs[k]);
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function onVisible(target, cb) {
    if (!("IntersectionObserver" in window)) return cb(true);
    new IntersectionObserver(function (entries) {
      cb(entries[0].isIntersecting);
    }, { rootMargin: "80px" }).observe(target);
  }

  function wait(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  var DEG = 180 / Math.PI;

  // ------------------------------------------------------------ neck kinematics
  // A planar two-link neck: the left servo sets the upper arm, the right servo
  // sets the forearm through a parallelogram (the four-bar linkage). To reach a
  // point, the elbow must lie on a circle of radius L1 around the shoulder and
  // on a circle of radius L2 around the target. Of the two crossings, always
  // keep the upper one, so the neck never flips between solutions.

  function solveIK(sx, sy, l1, l2, tx, ty) {
    var dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1e-6;
    var dd = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
    var a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
    var h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    var ux = dx / d, uy = dy / d, mx = sx + a * ux, my = sy + a * uy;
    var p1 = { x: mx - h * uy, y: my + h * ux }, p2 = { x: mx + h * uy, y: my - h * ux };
    var up = p1.y >= p2.y ? p1 : p2, down = up === p1 ? p2 : p1;
    var wx = sx + ux * dd, wy = sy + uy * dd;
    return {
      elbow: up,
      flipped: down,
      wrist: { x: wx, y: wy },
      t1: Math.atan2(up.y - sy, up.x - sx),
      t2: Math.atan2(wy - up.y, wx - up.x),
      d: d,
    };
  }

  // ------------------------------------------------------------ peck simulator

  (function () {
    var root = document.querySelector(".rd-sim");
    if (!root) return;
    var kb = root.querySelector(".rd-kb");
    var neck = root.querySelector(".rd-neck");
    var input = root.querySelector(".rd-field input");
    var textEl = root.querySelector(".rd-term__text");
    var logEl = root.querySelector(".rd-term__log");
    var runBtn = root.querySelector('[data-sim="run"]');
    var stopBtn = root.querySelector('[data-sim="stop"]');
    var calBox = root.querySelector('[data-sim="calibrate"]');
    var fastBox = root.querySelector('[data-sim="fast"]');
    var soundBox = root.querySelector('[data-sim="sound"]');
    var stat = {};
    root.querySelectorAll("[data-stat]").forEach(function (n) {
      stat[n.dataset.stat] = n;
    });
    var servo = {};
    root.querySelectorAll("[data-servo]").forEach(function (n) {
      servo[n.dataset.servo] = n;
    });

    // Keyboard, in key units (1u = 19 mm). [label, width, kind]
    var ROWS = [
      ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", ["⌫", 2, "bs"]],
      [["tab", 1.5, "mod"], "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", ["\\", 1.5]],
      [["caps", 1.75, "mod"], "a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'", ["return", 2.25, "mod"]],
      [["shift", 2.25, "mod"], "z", "x", "c", "v", "b", "n", "m", ",", ".", "/", ["shift", 2.75, "mod"]],
      [["ctrl", 1.25, "mod"], ["alt", 1.25, "mod"], ["cmd", 1.25, "mod"], ["space", 6.25, "sp"], ["cmd", 1.25, "mod"], ["alt", 1.25, "mod"], ["fn", 1.25, "mod"], ["ctrl", 1.25, "mod"]],
    ];
    var keys = [], byChar = {};
    var BASE = { x: 7.5, y: 8.25 };
    ROWS.forEach(function (row, r) {
      var x = 0;
      row.forEach(function (k) {
        var label = Array.isArray(k) ? k[0] : k, w = Array.isArray(k) ? k[1] : 1, kind = Array.isArray(k) ? k[2] || "char" : "char";
        var ch = kind === "char" ? label : kind === "sp" ? " " : kind === "bs" ? "\b" : null;
        var key = { label: label, ch: ch, kind: kind, x: x, y: r, w: w, cx: x + w / 2, cy: r + 0.5 };
        keys.push(key);
        if (ch !== null) byChar[ch] = key;
        x += w;
      });
    });

    // Workspace: the annular sector the bill can reach.
    var rMin = Infinity, rMax = 0, aMin = Infinity, aMax = -Infinity;
    keys.forEach(function (k) {
      [[k.x, k.y], [k.x + k.w, k.y], [k.x, k.y + 1], [k.x + k.w, k.y + 1]].forEach(function (p) {
        var dx = p[0] - BASE.x, dy = BASE.y - p[1], r = Math.hypot(dx, dy), a = Math.atan2(dx, dy);
        rMin = Math.min(rMin, r);
        rMax = Math.max(rMax, r);
        aMin = Math.min(aMin, a);
        aMax = Math.max(aMax, a);
      });
    });
    rMin -= 0.3;
    rMax += 0.3;
    aMin -= 0.04;
    aMax += 0.04;
    function polarPt(r, a) {
      return (BASE.x + r * Math.sin(a)).toFixed(3) + " " + (BASE.y - r * Math.cos(a)).toFixed(3);
    }
    el("path", {
      class: "reach",
      d: "M" + polarPt(rMin, aMin) + " L" + polarPt(rMax, aMin) + " A" + rMax + " " + rMax + " 0 0 1 " + polarPt(rMax, aMax) +
        " L" + polarPt(rMin, aMax) + " A" + rMin + " " + rMin + " 0 0 0 " + polarPt(rMin, aMin) + "Z",
    }, kb);

    keys.forEach(function (k) {
      var g = el("g", { class: "key" + (k.kind === "mod" ? " is-mod" : "") }, kb);
      el("rect", { x: k.x + 0.05, y: k.y + 0.05, width: k.w - 0.1, height: 0.9 }, g);
      el("text", { x: k.cx, y: k.cy }, g).textContent = k.label;
      k.g = g;
      if (k.ch !== null) {
        g.addEventListener("click", function () {
          if (!running) manualPeck(k);
        });
      }
    });
    var marks = el("g", {}, kb);
    var aimG = el("g", { class: "aim", opacity: 0 }, kb);
    el("line", { x1: -0.35, y1: 0, x2: 0.35, y2: 0 }, aimG);
    el("line", { x1: 0, y1: -0.35, x2: 0, y2: 0.35 }, aimG);

    // Top-view duck: the whole bird turns with the base servo.
    var duckTop = el("g", { class: "rd-duck" }, kb);
    el("circle", { class: "base", cx: BASE.x, cy: BASE.y, r: 1.35 }, duckTop);
    var turn = el("g", {}, duckTop);
    el("ellipse", { class: "body", cx: 0, cy: 0.35, rx: 0.95, ry: 0.8 }, turn);
    var tNeck = el("line", { class: "neck", x1: 0, y1: 0, x2: 0, y2: -4 }, turn);
    var tHead = el("circle", { class: "head", cx: 0, cy: -4, r: 0.5 }, turn);
    var tBill = el("ellipse", { class: "bill", cx: 0, cy: -4.5, rx: 0.26, ry: 0.42 }, turn);
    var tEyeL = el("circle", { class: "eye", cx: -0.2, cy: -4, r: 0.07 }, turn);
    var tEyeR = el("circle", { class: "eye", cx: 0.2, cy: -4, r: 0.07 }, turn);

    // Side view: the neck in the plane of the current yaw.
    var H0 = 4.4, L1 = 6, L2 = 6, BF = 1.0, HB = 2.0, CR = 1.1;
    el("line", { class: "ground", x1: -2.6, y1: 0, x2: 12.2, y2: 0 }, neck);
    for (var kx = 2; kx <= 11.2; kx += 1) el("rect", { class: "keycap", x: kx - 0.42, y: -0.32, width: 0.84, height: 0.32, rx: 0.06 }, neck);
    el("rect", { class: "ped", x: -1.6, y: -1.5, width: 3.2, height: 1.5, rx: 0.4 }, neck);
    el("rect", { class: "ped", x: -0.45, y: -H0, width: 0.9, height: H0 - 1.5 }, neck);
    var sTip = el("line", { class: "tip", x1: 0, y1: 0, x2: 0, y2: 0 }, neck);
    var sCrank = el("line", { class: "link thin" }, neck);
    var sCoupler = el("line", { class: "link thin" }, neck);
    var sExt = el("line", { class: "link thin" }, neck);
    var sUpper = el("line", { class: "link" }, neck);
    var sFore = el("line", { class: "link" }, neck);
    el("rect", { class: "servo", x: -0.7, y: -H0 - 0.55, width: 1.4, height: 1.1, rx: 0.15 }, neck);
    var sHeadG = el("g", { class: "rd-duck" }, neck);
    el("path", { class: "bill", d: "M0.7 0.5 L1.0 2.0 L0.2 1.62 Z" }, sHeadG);
    el("circle", { class: "head", cx: 0.2, cy: 0.9, r: 0.85 }, sHeadG);
    el("circle", { class: "eye", cx: 0.5, cy: 0.62, r: 0.11 }, sHeadG);
    var sJ = [0, 1, 2].map(function () {
      return el("circle", { class: "joint", r: 0.2 }, neck);
    });

    var pose = { a: 0, r: 5.2, h: 1.6 };
    function draw() {
      var deg = pose.a * DEG;
      set(turn, { transform: "translate(" + BASE.x + " " + BASE.y + ") rotate(" + deg.toFixed(2) + ")" });
      var hr = pose.r - 0.55;
      set(tNeck, { y2: -hr + 0.35 });
      set(tHead, { cy: -hr });
      set(tEyeL, { cy: -hr - 0.05 });
      set(tEyeR, { cy: -hr - 0.05 });
      set(tBill, { cy: -pose.r + 0.05 });

      var ik = solveIK(0, H0, L1, L2, pose.r - BF, pose.h + HB);
      var E = ik.elbow, W = ik.wrist;
      var cx = CR * Math.cos(ik.t2 + Math.PI), cy = CR * Math.sin(ik.t2 + Math.PI);
      function L(line, x1, y1, x2, y2) {
        set(line, { x1: x1, y1: -y1, x2: x2, y2: -y2 });
      }
      L(sUpper, 0, H0, E.x, E.y);
      L(sFore, E.x, E.y, W.x, W.y);
      L(sCrank, 0, H0, cx, H0 + cy);
      L(sCoupler, cx, H0 + cy, E.x + cx, E.y + cy);
      L(sExt, E.x, E.y, E.x + cx, E.y + cy);
      set(sTip, { x1: W.x + BF, y1: 0, x2: W.x + BF, y2: -(W.y - HB) });
      set(sHeadG, { transform: "translate(" + W.x + " " + -W.y + ")" });
      [[0, H0], [E.x, E.y], [W.x, W.y]].forEach(function (p, j) {
        set(sJ[j], { cx: p[0], cy: -p[1] });
      });
      servo.base.textContent = (deg >= 0 ? "+" : "") + deg.toFixed(1) + "°";
      servo.left.textContent = (ik.t1 * DEG).toFixed(1) + "°";
      servo.right.textContent = (ik.t2 * DEG).toFixed(1) + "°";
    }
    draw();

    function speed() {
      return (fastBox.checked ? 3 : 1) * (reduceMotion ? 6 : 1);
    }
    function moveTo(a, r, h, ms) {
      var from = { a: pose.a, r: pose.r, h: pose.h };
      ms = ms / speed();
      return new Promise(function (resolve) {
        var start = null;
        function frame(now) {
          if (start === null) start = now;
          var t = Math.min((now - start) / ms, 1), e = easeInOut(t);
          pose.a = from.a + (a - from.a) * e;
          pose.r = from.r + (r - from.r) * e;
          pose.h = from.h + (h - from.h) * e;
          draw();
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        }
        requestAnimationFrame(frame);
      });
    }

    // ---- the duck's aim: a fixed physical bias the camera can learn away ----
    var BIAS = { x: 0.38, y: 0.17 }, SIGMA = 0.24, GAIN = 0.35;
    var corr = { x: 0, y: 0 };
    function offsetMM() {
      return (Math.hypot(BIAS.x - corr.x, BIAS.y - corr.y) * 19).toFixed(1) + " mm";
    }

    function keyAt(x, y) {
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (x >= k.x + 0.03 && x <= k.x + k.w - 0.03 && y >= k.y + 0.03 && y <= k.y + 0.97) return k;
      }
      return null;
    }

    function flash(k, cls, ms) {
      if (!k) return;
      k.g.classList.add(cls);
      setTimeout(function () {
        k.g.classList.remove(cls);
      }, ms);
    }

    function addMark(x, y, miss) {
      var m = el("circle", { class: "mark" + (miss ? " miss" : ""), cx: x, cy: y, r: 0.11 }, marks);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          m.style.opacity = "0.25";
        });
      });
      while (marks.childNodes.length > 24) marks.removeChild(marks.firstChild);
    }

    // ---- sound (off unless the visitor opts in) ----
    var audio = null;
    function ctx() {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      return audio;
    }
    function quack() {
      if (!soundBox.checked) return;
      var ac = ctx(), t = ac.currentTime, o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(560, t);
      o.frequency.exponentialRampToValueAtTime(330, t + 0.17);
      f.type = "bandpass";
      f.frequency.value = 1150;
      f.Q.value = 2.5;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(f).connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 0.22);
    }
    function tick() {
      if (!soundBox.checked) return;
      var ac = ctx(), len = Math.floor(ac.sampleRate * 0.02), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      var s = ac.createBufferSource(), g = ac.createGain();
      s.buffer = buf;
      g.gain.value = 0.35;
      s.connect(g).connect(ac.destination);
      s.start();
    }
    soundBox.addEventListener("change", function () {
      if (soundBox.checked) quack();
    });

    // ---- terminal ----
    var buffer = [], target = "";
    function renderText() {
      var ok = 0;
      while (ok < buffer.length && buffer[ok] === target[ok]) ok++;
      textEl.textContent = "";
      buffer.forEach(function (ch, i) {
        var s = document.createElement("span");
        s.textContent = ch === " " ? " " : ch;
        if (i >= ok && target) s.className = "bad";
        textEl.appendChild(s);
      });
    }
    function log(text, cls) {
      var li = document.createElement("li");
      li.className = cls || "sys";
      li.textContent = text;
      logEl.appendChild(li);
      while (logEl.children.length > 5) logEl.removeChild(logEl.firstChild);
    }

    var QUIPS = [
      "quack. who designed this keyboard.",
      "that was “{hit}”. i meant “{aim}”. obviously.",
      "my bill is a precision instrument. mostly.",
      "backspace. again. quack.",
      "you could have typed this yourself, you know.",
      "i'm a duck, not a stenographer.",
      "this is a sisyphean task and i am the boulder.",
      "replanning. begrudgingly.",
      "the keys moved. i'm sure of it.",
      "quack quack. (that means sorry.)",
    ];
    var DONE = ["done. you're welcome. quack.", "there. flawless, as always.", "finished. i'd like a break now."];
    var lastQuip = -1;
    function quip(aim, hit) {
      var i;
      do i = Math.floor(Math.random() * QUIPS.length);
      while (i === lastQuip);
      lastQuip = i;
      log("duck> " + QUIPS[i].replace("{aim}", aim).replace("{hit}", hit), "duck");
      quack();
    }
    function name(k) {
      return k ? (k.ch === " " ? "space" : k.ch === "\b" ? "backspace" : k.label) : "nothing";
    }

    var stats = { pecks: 0, misses: 0, fixes: 0, hits: 0 };
    function renderStats() {
      stat.pecks.textContent = stats.pecks;
      stat.misses.textContent = stats.misses;
      stat.fixes.textContent = stats.fixes;
      stat.acc.textContent = stats.pecks ? Math.round((100 * stats.hits) / stats.pecks) + "%" : "–";
      stat.offset.textContent = offsetMM();
    }
    renderStats();

    // One peck at a key. Returns the key actually struck (or null).
    async function peck(aimKey) {
      var aim = { x: aimKey.cx, y: aimKey.cy };
      var land = {
        x: aim.x - corr.x + BIAS.x + gauss() * SIGMA,
        y: aim.y - corr.y + BIAS.y + gauss() * SIGMA * 0.8,
      };
      var dx = land.x - BASE.x, dy = BASE.y - land.y;
      var a = Math.atan2(dx, dy), r = Math.hypot(dx, dy);
      set(aimG, { transform: "translate(" + aim.x + " " + aim.y + ")", opacity: 1 });
      aimKey.g.classList.add("is-aim");
      await moveTo(a, r, 1.5, 460);
      await moveTo(a, r, 0.12, 110);
      tick();
      var hit = keyAt(land.x, land.y);
      stats.pecks++;
      addMark(land.x, land.y, hit !== aimKey);
      aimKey.g.classList.remove("is-aim");
      flash(hit, hit === aimKey ? "is-hit" : "is-wrong", 260 / speed() + 120);
      if (hit === aimKey) stats.hits++;
      else stats.misses++;
      if (calBox.checked) {
        var ex = land.x - aim.x, ey = land.y - aim.y;
        corr.x += GAIN * ex;
        corr.y += GAIN * ey;
        if (hit !== aimKey && Math.hypot(ex, ey) > 0.3) {
          log("gemini> bill landed " + (Math.hypot(ex, ey) * 19).toFixed(0) + " mm " + (Math.abs(ex) > Math.abs(ey) ? (ex > 0 ? "right" : "left") : ey > 0 ? "low" : "high") + " of “" + name(aimKey) + "”. adjusting aim.", "gem");
        }
      }
      set(aimG, { opacity: 0 });
      await moveTo(a, r, 1.5, 150);
      renderStats();
      return hit;
    }

    function apply(k) {
      if (!k || k.ch === null) return;
      if (k.ch === "\b") buffer.pop();
      else buffer.push(k.ch);
      renderText();
    }

    var running = false, runId = 0;
    function setRunning(on) {
      running = on;
      runBtn.disabled = on;
      stopBtn.disabled = !on;
      input.disabled = on;
    }

    async function run() {
      target = input.value;
      if (!target) return;
      var id = ++runId;
      setRunning(true);
      buffer = [];
      // counters start over for each phrase; the learned aim correction carries on
      stats = { pecks: 0, misses: 0, fixes: 0, hits: 0 };
      renderStats();
      renderText();
      log("you> “" + target + "”");
      var guard = 0;
      while (running && id === runId && guard++ < 160) {
        var ok = 0;
        while (ok < buffer.length && buffer[ok] === target[ok]) ok++;
        var wrong = ok < buffer.length;
        if (!wrong && buffer.length === target.length) break;
        var want = wrong ? byChar["\b"] : byChar[target[buffer.length]];
        var hit = await peck(want);
        if (!running || id !== runId) break;
        if (!hit) {
          log("duck> missed the keyboard entirely. great.", "duck");
          quack();
          continue;
        }
        if (want.ch === "\b" && hit === want) stats.fixes++;
        apply(hit);
        if (hit !== want) quip(name(want), name(hit));
        renderStats();
      }
      if (running && id === runId) {
        log("duck> " + DONE[Math.floor(Math.random() * DONE.length)], "duck");
        quack();
      }
      if (id === runId) {
        setRunning(false);
        await moveTo(0, 5.2, 1.6, 500);
      }
    }

    async function manualPeck(k) {
      setRunning(true);
      var id = ++runId;
      target = "";
      var hit = await peck(k);
      if (id !== runId) return;
      apply(hit);
      if (hit !== k) quip(name(k), name(hit));
      setRunning(false);
    }

    runBtn.addEventListener("click", run);
    stopBtn.addEventListener("click", function () {
      runId++;
      setRunning(false);
      log("sys> stopped.");
      moveTo(0, 5.2, 1.6, 500);
    });
    input.addEventListener("input", function () {
      var clean = input.value.toLowerCase().split("").filter(function (c) {
        return byChar[c] && c !== "\b";
      }).join("");
      if (clean !== input.value) input.value = clean;
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !running) run();
    });
    root.querySelectorAll("[data-preset]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (running) return;
        input.value = b.dataset.preset;
        run();
      });
    });
    calBox.addEventListener("change", function () {
      if (!calBox.checked) {
        corr.x = 0;
        corr.y = 0;
        log("gemini> calibration off. aim offset back to " + offsetMM() + ".", "gem");
      } else log("gemini> calibration on. watching the bill.", "gem");
      renderStats();
    });

    // A gentle idle sway so the duck looks alive until someone plays.
    var idle = !reduceMotion, visible = false, t0 = performance.now();
    onVisible(root, function (v) {
      visible = v;
    });
    function sway(now) {
      if (idle && !running && visible && runId === 0) {
        var t = (now - t0) / 1000;
        pose.a = Math.sin(t * 0.5) * 0.25;
        pose.h = 1.6 + Math.sin(t * 1.3) * 0.25;
        draw();
      }
      requestAnimationFrame(sway);
    }
    requestAnimationFrame(sway);
  })();

  // ------------------------------------------------------------ IK explainer

  (function () {
    var svg = document.querySelector(".rd-iksvg");
    if (!svg) return;
    var L1 = 6, L2 = 6, CR = 1.2, GROUND = -2.4;
    var out = {};
    document.querySelectorAll("[data-ik]").forEach(function (n) {
      out[n.dataset.ik] = n;
    });
    el("line", { class: "ground", x1: -3.2, y1: -GROUND, x2: 13.8, y2: -GROUND }, svg);
    el("rect", { x: -0.7, y: 0, width: 1.4, height: -GROUND, fill: "#3a6fe0", stroke: "#151515", "stroke-width": 0.05, rx: 0.2 }, svg);
    el("circle", { class: "circ", cx: 0, cy: 0, r: L1 }, svg);
    var c2 = el("circle", { class: "circ t", r: L2 }, svg);
    var gUp1 = el("line", { class: "ghost" }, svg), gUp2 = el("line", { class: "ghost" }, svg);
    var crank = el("line", { class: "coupler" }, svg), coup = el("line", { class: "coupler" }, svg), ext = el("line", { class: "coupler" }, svg);
    var up1 = el("line", { class: "link" }, svg), up2 = el("line", { class: "link" }, svg);
    el("circle", { class: "joint", r: 0.24, cx: 0, cy: 0 }, svg);
    var pick = el("circle", { class: "pick", r: 0.24 }, svg);
    var rej = el("circle", { class: "reject", r: 0.24 }, svg);
    var tKeep = el("text", {}, svg), tRej = el("text", {}, svg), tL1 = el("text", {}, svg), tL2 = el("text", {}, svg);
    tKeep.textContent = "keep";
    tRej.textContent = "reject: flips";
    tL1.textContent = "L₁";
    tL2.textContent = "L₂";
    var ring = el("circle", { class: "target-ring", r: 0.75 }, svg);
    var handle = el("circle", { class: "target", r: 0.42 }, svg);

    var T = { x: 8.2, y: -0.6 };
    function line(n, a, b) {
      set(n, { x1: a.x, y1: -a.y, x2: b.x, y2: -b.y });
    }
    function draw() {
      var ik = solveIK(0, 0, L1, L2, T.x, T.y);
      var E = ik.elbow, F = ik.flipped;
      set(c2, { cx: T.x, cy: -T.y });
      line(gUp1, { x: 0, y: 0 }, F);
      line(gUp2, F, T);
      line(up1, { x: 0, y: 0 }, E);
      line(up2, E, T);
      var cv = { x: CR * Math.cos(ik.t2 + Math.PI), y: CR * Math.sin(ik.t2 + Math.PI) };
      line(crank, { x: 0, y: 0 }, cv);
      line(coup, cv, { x: E.x + cv.x, y: E.y + cv.y });
      line(ext, E, { x: E.x + cv.x, y: E.y + cv.y });
      set(pick, { cx: E.x, cy: -E.y });
      set(rej, { cx: F.x, cy: -F.y });
      set(tKeep, { x: E.x + 0.4, y: -E.y - 0.35 });
      set(tRej, { x: F.x + 0.4, y: -F.y + 0.7 });
      set(tL1, { x: E.x / 2 - 0.6, y: -E.y / 2 });
      set(tL2, { x: (E.x + T.x) / 2 + 0.3, y: -(E.y + T.y) / 2 });
      set(ring, { cx: T.x, cy: -T.y });
      set(handle, { cx: T.x, cy: -T.y });
      out.d.textContent = Math.round((100 * ik.d) / (L1 + L2)) + "% of max";
      out.t1.textContent = (ik.t1 * DEG).toFixed(1) + "°";
      out.t2.textContent = (ik.t2 * DEG).toFixed(1) + "°";
    }

    function clampT(p) {
      p.y = Math.max(p.y, GROUND + 0.3);
      var d = Math.hypot(p.x, p.y), lo = 1.2, hi = L1 + L2 - 0.2;
      if (d < lo || d > hi) {
        var s = (d < lo ? lo : hi) / (d || 1);
        p.x *= s;
        p.y *= s;
      }
      return p;
    }

    var dragging = false, auto = !reduceMotion, visible = false, t0 = performance.now();
    function toSvg(e) {
      var pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      var p = pt.matrixTransform(svg.getScreenCTM().inverse());
      return { x: p.x, y: -p.y };
    }
    svg.addEventListener("pointerdown", function (e) {
      dragging = true;
      auto = false;
      svg.setPointerCapture(e.pointerId);
      T = clampT(toSvg(e));
      draw();
    });
    svg.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      T = clampT(toSvg(e));
      draw();
    });
    ["pointerup", "pointercancel"].forEach(function (ev) {
      svg.addEventListener(ev, function () {
        dragging = false;
      });
    });
    onVisible(svg, function (v) {
      visible = v;
    });
    function loop(now) {
      if (auto && visible) {
        var t = (now - t0) / 1000;
        T = clampT({ x: 7.2 + 2.6 * Math.sin(t * 0.45), y: -1.6 + 1.5 * Math.abs(Math.sin(t * 1.1)) });
        draw();
      }
      requestAnimationFrame(loop);
    }
    draw();
    requestAnimationFrame(loop);
  })();

  // ------------------------------------------------------------ hardware callouts

  (function () {
    var grid = document.querySelector(".rd-hw__grid");
    if (!grid) return;
    var parts = grid.querySelectorAll("[data-part]");
    var pinned = null;
    function show(id) {
      grid.classList.toggle("has-active", !!id);
      parts.forEach(function (p) {
        p.classList.toggle("is-active", p.dataset.part === id);
      });
    }
    parts.forEach(function (p) {
      var id = p.dataset.part;
      p.addEventListener("mouseenter", function () {
        show(id);
      });
      p.addEventListener("mouseleave", function () {
        show(pinned);
      });
      p.addEventListener("focus", function () {
        show(id);
      });
      p.addEventListener("blur", function () {
        show(pinned);
      });
      p.addEventListener("click", function () {
        pinned = pinned === id ? null : id;
        show(pinned);
      });
    });
  })();

  // ------------------------------------------------------------ system loop walkthrough

  (function () {
    var wrap = document.querySelector(".rd-loop__steps");
    var diagram = document.querySelector(".rd-loop__diagram");
    if (!wrap || !diagram) return;
    var steps = wrap.querySelectorAll(".rd-loop__list li");
    var count = wrap.querySelector(".rd-loop__count");
    var playBtn = wrap.querySelector('[data-loop="play"]');
    var nodes = diagram.querySelectorAll("[data-node]");
    var edges = diagram.querySelectorAll("[data-e]");
    var i = 0, playing = !reduceMotion, visible = false, timer = null;
    wrap.classList.add("is-live");
    diagram.classList.add("is-stepping");

    function show(n) {
      i = (n + steps.length) % steps.length;
      var s = steps[i], on = {}, onE = {};
      s.dataset.nodes.split(" ").forEach(function (k) {
        on[k] = true;
      });
      s.dataset.edges.split(" ").forEach(function (k) {
        onE[k] = true;
      });
      steps.forEach(function (li, j) {
        li.classList.toggle("is-on", j === i);
      });
      nodes.forEach(function (g) {
        g.classList.toggle("is-on", !!on[g.dataset.node]);
      });
      edges.forEach(function (p) {
        p.classList.toggle("is-on", !!onE[p.dataset.e]);
      });
      count.textContent = String(i + 1).padStart(2, "0") + " / " + String(steps.length).padStart(2, "0");
    }
    function schedule() {
      clearTimeout(timer);
      if (playing && visible) timer = setTimeout(function () {
        show(i + 1);
        schedule();
      }, 3800);
    }
    function setPlaying(on) {
      playing = on;
      playBtn.textContent = on ? "❚❚" : "▶︎";
      playBtn.setAttribute("aria-label", on ? "Pause the walkthrough" : "Play the walkthrough");
      schedule();
    }
    wrap.querySelector('[data-loop="prev"]').addEventListener("click", function () {
      show(i - 1);
      setPlaying(false);
    });
    wrap.querySelector('[data-loop="next"]').addEventListener("click", function () {
      show(i + 1);
      setPlaying(false);
    });
    playBtn.addEventListener("click", function () {
      setPlaying(!playing);
    });
    onVisible(diagram, function (v) {
      visible = v;
      schedule();
    });
    show(0);
    setPlaying(playing);
  })();

  // ------------------------------------------------------------ counters

  (function () {
    var els = document.querySelectorAll("[data-count]");
    if (!els.length) return;
    var done = false;
    onVisible(els[0], function (v) {
      if (!v || done) return;
      done = true;
      els.forEach(function (dd) {
        var to = +dd.dataset.count, pad = +dd.dataset.pad || 0, small = dd.querySelector("small");
        var suffix = small ? small.outerHTML : "", start = null, ms = reduceMotion ? 0 : 1400;
        function frame(now) {
          if (start === null) start = now;
          var t = ms ? Math.min((now - start) / ms, 1) : 1;
          var v = Math.round(to * (1 - Math.pow(1 - t, 3)));
          dd.innerHTML = String(v).padStart(pad, "0") + suffix;
          if (t < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    });
  })();
})();

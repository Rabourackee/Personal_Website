// Dream Brush page (src/projects/dreambrush.html): arrival animations, the
// drying trace in the hero, the film, and a small ink painter (Ink) behind
// the writing canvas and the four-panel screen. Each part skips quietly if
// its markup is absent; without JavaScript the page reads as a document.
(function () {
  "use strict";
  var root = document.querySelector(".db");
  if (!root) return;
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var HAND = '"Ma Shan Zheng", "Kaiti SC", "STKaiti", "KaiTi", serif';

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function fontsReady() {
    return document.fonts && document.fonts.load ? document.fonts.load("64px " + HAND, "山日月水云雨松鸟舟夜梦笔").catch(function () {}) : Promise.resolve();
  }

  // ------------------------------------------------------------ arrival

  if (!reduceMotion && "IntersectionObserver" in window) {
    root.classList.add("db-js");
    var arrive = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        arrive.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    root.querySelectorAll("[data-reveal]").forEach(function (n) {
      arrive.observe(n);
    });
  }

  // ------------------------------------------------------------ hero: water that dries

  (function () {
    var hero = root.querySelector(".db-hero");
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
      // each frame lifts a little of every mark: the water drying
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.026)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = "source-over";
      raf = now - lastInk < 5000 ? requestAnimationFrame(fade) : 0;
    }
    hero.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      var r = hero.getBoundingClientRect(), p = { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr, t: performance.now() };
      if (last && p.t - last.t < 80) {
        var d = Math.hypot(p.x - last.x, p.y - last.y), v = d / Math.max(1, p.t - last.t);
        ctx.strokeStyle = "rgba(52, 56, 62, 0.075)";
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(4, 26 - v * 7) * dpr; // slow strokes lay down more water
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

  // ------------------------------------------------------------ the film: a poster until asked

  (function () {
    var play = root.querySelector(".db-film__play");
    if (!play) return;
    play.addEventListener("click", function (e) {
      e.preventDefault();
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + play.getAttribute("data-video") + "?autoplay=1&rel=0&playsinline=1";
      f.title = "Dream Brush, the film";
      f.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      f.allowFullscreen = true;
      play.replaceWith(f);
      f.focus();
    });
  })();

  // ------------------------------------------------------------ ink: a small shan-shui painter
  // Paints on 2D canvases in logical units (600 across). Every mark is either a
  // bristle brush stroke, whose hairs break into flying white as they run dry,
  // or a soft wash. Washes are blurred through the canvas shadow, which every
  // browser supports.
  var Ink = (function () {
    "use strict";
    var INK = "28,26,22", PAPER = "244,239,229", CINNABAR = "172,48,34", NIGHT = "20,23,31";
    var TAU = Math.PI * 2;

    function rng(seed) {
      return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function noise1(r) {
      var v = [];
      for (var i = 0; i < 64; i++) v.push(r() * 2 - 1);
      return function (x) {
        var i = Math.floor(x), f = x - i;
        f = f * f * (3 - 2 * f);
        return v[i & 63] + (v[(i + 1) & 63] - v[i & 63]) * f;
      };
    }

    function clamp(v, a, b) {
      return v < a ? a : v > b ? b : v;
    }

    function mk(w, h) {
      var c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    }

    // a seamless tile of soft noise: paper takes ink unevenly
    var tile = null;
    function grainTile() {
      if (tile) return tile;
      var N = 256, cv = mk(N, N), g = cv.getContext("2d"), id = g.createImageData(N, N), r = rng(7);
      var oct = [[6, 0.5], [24, 0.3], [96, 0.2]].map(function (o) {
        var v = [];
        for (var i = 0; i < o[0] * o[0]; i++) v.push(r());
        return [o[0], o[1], v];
      });
      for (var y = 0; y < N; y++) {
        for (var x = 0; x < N; x++) {
          var s = 0;
          for (var k = 0; k < 3; k++) {
            var P = oct[k][0], v = oct[k][2], fx = (x / N) * P, fy = (y / N) * P, ix = fx | 0, iy = fy | 0;
            var tx = fx - ix, ty = fy - iy;
            tx = tx * tx * (3 - 2 * tx);
            ty = ty * ty * (3 - 2 * ty);
            var a = v[(iy % P) * P + (ix % P)], b = v[(iy % P) * P + ((ix + 1) % P)];
            var c = v[((iy + 1) % P) * P + (ix % P)], d = v[((iy + 1) % P) * P + ((ix + 1) % P)];
            s += oct[k][1] * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
          }
          id.data[(y * N + x) * 4 + 3] = clamp((s - 0.3) * 2.2, 0, 1) * 255;
        }
      }
      g.putImageData(id, 0, 0);
      return (tile = cv);
    }

    function resample(pts, step) {
      var out = [], d = [0], i;
      for (i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      var L = d[d.length - 1];
      if (!L) return out;
      var n = Math.max(2, Math.ceil(L / step)), j = 0;
      for (var s = 0; s <= n; s++) {
        var at = (L * s) / n;
        while (j < d.length - 2 && d[j + 1] < at) j++;
        var a = pts[j], b = pts[j + 1], f = (at - d[j]) / (d[j + 1] - d[j] || 1);
        var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        out.push([a[0] + dx * f, a[1] + dy * f, -dy / l, dx / l]);
      }
      return out;
    }

    function press(t, o) {
      var a = o.tin == null ? 0.15 : o.tin, b = o.tout == null ? 0.3 : o.tout, p = 1;
      if (a > 0 && t < a) p = 0.3 + 0.7 * Math.sin(((t / a) * Math.PI) / 2);
      if (b > 0 && t > 1 - b) p *= 0.08 + 0.92 * Math.cos((((t - 1 + b) / b) * Math.PI) / 2);
      return p;
    }

    function poly(c, pts) {
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.closePath();
    }

    function curve(pts, n) {
      // Chaikin smoothing, ends kept
      for (var k = 0; k < (n || 2); k++) {
        var o = [pts[0]];
        for (var i = 0; i < pts.length - 1; i++) {
          var a = pts[i], b = pts[i + 1];
          o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
        }
        o.push(pts[pts.length - 1]);
        pts = o;
      }
      return pts;
    }

    // ---- the painter: one canvas, a scratch canvas for washes ----

    function Painter(cv) {
      this.cv = cv;
      this.k = cv.width / 600;
      this.W = 600;
      this.H = cv.height / this.k;
      this.c = cv.getContext("2d");
      this.t = mk(cv.width, cv.height);
      this.tc = this.t.getContext("2d");
      this.reset(this.c);
    }

    Painter.prototype.reset = function (c) {
      c.setTransform(this.k, 0, 0, this.k, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
    };

    Painter.prototype.clear = function () {
      this.c.setTransform(1, 0, 0, 1, 0, 0);
      this.c.clearRect(0, 0, this.cv.width, this.cv.height);
      this.reset(this.c);
    };

    // build() fills shapes on the scratch canvas (only their alpha matters); the
    // result is laid down in one colour, blurred, through its shadow
    Painter.prototype.wash = function (box, build, o) {
      var t = this.tc, k = this.k, pad = (o.blur || 0) * 3 + 2;
      var x0 = Math.max(0, Math.floor((box.x - pad) * k)), y0 = Math.max(0, Math.floor((box.y - pad) * k));
      var x1 = Math.min(this.cv.width, Math.ceil((box.x + box.w + pad) * k)), y1 = Math.min(this.cv.height, Math.ceil((box.y + box.h + pad) * k));
      if (x1 <= x0 || y1 <= y0) return;
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.clearRect(x0, y0, x1 - x0, y1 - y0);
      this.reset(t);
      t.fillStyle = t.strokeStyle = "#000";
      build(t);
      if (o.mottle) {
        t.globalCompositeOperation = "destination-out";
        t.globalAlpha = o.mottle;
        t.fillStyle = t.createPattern(grainTile(), "repeat");
        t.fillRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2);
      }
      var c = this.c, off = this.cv.width + 64;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = o.op || "source-over";
      c.shadowColor = "rgba(" + (o.color || INK) + "," + (o.a == null ? 1 : o.a) + ")";
      c.shadowBlur = (o.blur || 0) * k;
      c.shadowOffsetX = off;
      c.drawImage(this.t, x0, y0, x1 - x0, y1 - y0, x0 - off, y0, x1 - x0, y1 - y0);
      c.restore();
    };

    // a bristle brush: hairs run side by side, each with its own load of ink
    Painter.prototype.stroke = function (pts, o) {
      var c = this.c, r = rng(o.seed || 1), n = noise1(r), w = o.w, dry = o.dry || 0, a = o.a == null ? 0.9 : o.a;
      var path = resample(pts, Math.max(0.5, w * 0.3)), N = path.length, i;
      if (N < 2) return;
      var K = clamp(Math.round(w * 0.8), 1, 9), col = "rgba(" + (o.color || INK) + ",", prs = [];
      for (i = 0; i < N; i++) prs.push(press(i / (N - 1), o) * (1 + 0.25 * n(i * 0.08)));
      c.lineCap = c.lineJoin = "round";
      var run, j0, load, off;
      function seg() {
        var m = Math.min(N - 1, (j0 + i) >> 1);
        c.lineWidth = Math.max(0.25, ((w * prs[m]) / K) * 1.8);
        c.strokeStyle = col + (a * clamp(load + 0.25, 0.15, 1) * (1 - (o.fade || 0) * (m / (N - 1)))).toFixed(3) + ")";
        c.stroke();
        c.beginPath();
        run = 0;
      }
      for (var k = 0; k < K; k++) {
        off = K === 1 ? 0 : (k / (K - 1) - 0.5) * 0.85 + (r() - 0.5) * 0.1;
        load = 1 - r() * dry * 0.35;
        run = 0;
        j0 = 0;
        var len = 6 + r() * 10, ph = r() * 50, edge = Math.abs(off) * dry * 0.6, step = Math.max(0.5, w * 0.3);
        c.beginPath();
        for (i = 0; i < N; i++) {
          var p = path[i], pr = prs[i], x = p[0] + p[2] * off * w * pr, y = p[1] + p[3] * off * w * pr;
          load -= (dry * (0.5 + r())) / N;
          var gap = dry > 0 && n(ph + i * step * 0.05) * 0.5 + 0.5 < dry * (1.2 - load) - 0.3 + edge;
          if (gap || pr < 0.05) {
            if (run) seg();
            continue;
          }
          if (!run) {
            c.moveTo(x, y);
            run = 1;
            j0 = i;
          } else {
            c.lineTo(x, y);
            if (i - j0 > len) {
              seg();
              c.moveTo(x, y);
              run = 1;
              j0 = i;
            }
          }
        }
        if (run) seg();
      }
    };

    Painter.prototype.dot = function (x, y, s, a, r) {
      var c = this.c;
      c.fillStyle = "rgba(" + INK + "," + a.toFixed(3) + ")";
      for (var i = 0; i < 2; i++) {
        c.beginPath();
        c.ellipse(x + (r() - 0.5) * s * 0.4, y + (r() - 0.5) * s * 0.3, s * (0.5 + r() * 0.3), s * (0.32 + r() * 0.2), (r() - 0.5) * 0.8, 0, TAU);
        c.fill();
      }
    };

    // ---- paper ----

    function paper(cv) {
      var P = new Painter(cv), c = P.c, r = rng(3);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = "rgb(" + PAPER + ")";
      c.fillRect(0, 0, cv.width, cv.height);
      P.reset(c);
      c.globalAlpha = 0.022;
      c.fillStyle = c.createPattern(grainTile(), "repeat");
      c.fillRect(0, 0, P.W, P.H);
      c.globalAlpha = 1;
      c.lineWidth = 0.35;
      for (var i = 0; i < (P.W * P.H) / 2600; i++) {
        var x = r() * P.W, y = r() * P.H, an = r() * TAU, l = 5 + r() * 20;
        c.strokeStyle = r() < 0.5 ? "rgba(255,255,255,.55)" : "rgba(" + INK + ",.045)";
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + Math.cos(an) * l * 0.5 + (r() - 0.5) * 6, y + Math.sin(an) * l * 0.5 + (r() - 0.5) * 6, x + Math.cos(an) * l, y + Math.sin(an) * l);
        c.stroke();
      }
    }

    // ---- motifs: each paints inside its region R = {x, y, w, h} ----

    function peak(P, f, r) {
      var H = f.base - f.top, n = noise1(r), N = 48, hs = [], pts = [], i, j;
      var p = 2.4 + r() * 1.6, q = 1 + r() * 0.8, sk = (r() - 0.5) * 0.5, bumps = [];
      for (j = 0; j < 4; j++) bumps.push([(r() - 0.5) * 1.7, 0.06 + r() * 0.14, 0.07 + r() * 0.12]);
      var hmax = 0;
      for (i = 0; i <= N; i++) {
        var u = (i / N) * 2 - 1, us = u - sk * (1 - u * u), h = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(us), p)), q);
        for (j = 0; j < bumps.length; j++) h += bumps[j][1] * Math.exp(-Math.pow((u - bumps[j][0]) / bumps[j][2], 2)) * (1 - Math.abs(u));
        h += 0.05 * n(i * 0.6) * (1 - u * u);
        hs.push(Math.max(0, h));
        hmax = Math.max(hmax, h);
      }
      var ti = 0;
      for (i = 0; i <= N; i++) {
        pts.push([f.cx + ((i / N) * 2 - 1) * f.bw, f.base - (hs[i] / hmax) * H]);
        if (pts[i][1] < pts[ti][1]) ti = i;
      }
      var box = { x: f.cx - f.bw, y: f.top, w: f.bw * 2, h: H }, tone = f.tone, wO = clamp(f.S * 0.011, 1.1, 4.6) * (0.55 + 0.45 * tone);
      var shade = sk > 0 ? -1 : 1; // the flank away from the light

      // paper body: hides what stands behind, gone by the foot
      P.wash(box, function (t) {
        var g = t.createLinearGradient(0, f.top, 0, f.base);
        g.addColorStop(0, "#000");
        g.addColorStop(0.55, "rgba(0,0,0,.92)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        t.fillStyle = g;
        poly(t, pts);
        t.fill();
      }, { color: PAPER, blur: 0.6 });

      // ink body: heavy along the ridges and on the shaded flank, thinning down into the mist
      P.wash(box, function (t) {
        t.save();
        poly(t, pts);
        t.clip();
        t.lineJoin = "round";
        t.lineWidth = H * 0.22;
        t.globalAlpha = 0.5;
        t.beginPath();
        pts.forEach(function (pt, k) {
          k ? t.lineTo(pt[0], pt[1]) : t.moveTo(pt[0], pt[1]);
        });
        t.stroke();
        t.lineWidth = H * 0.07;
        t.globalAlpha = 0.45;
        t.stroke();
        t.globalAlpha = 1;
        var g = t.createLinearGradient(0, f.top, 0, f.base);
        g.addColorStop(0, "rgba(0,0,0,.55)");
        g.addColorStop(0.6, "rgba(0,0,0,.14)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        t.fillStyle = g;
        t.fillRect(box.x, box.y, box.w, box.h);
        var g2 = t.createLinearGradient(f.cx, 0, f.cx + shade * f.bw, 0);
        g2.addColorStop(0, "rgba(0,0,0,0)");
        g2.addColorStop(0.5, "rgba(0,0,0,.28)");
        g2.addColorStop(1, "rgba(0,0,0,.1)");
        t.fillStyle = g2;
        t.fillRect(box.x, box.y, box.w, box.h * 0.8);
        t.restore();
        var g3 = t.createLinearGradient(0, f.top, 0, f.base);
        g3.addColorStop(0, "#000");
        g3.addColorStop(0.45, "rgba(0,0,0,.75)");
        g3.addColorStop(0.85, "rgba(0,0,0,.08)");
        g3.addColorStop(1, "rgba(0,0,0,0)");
        t.globalCompositeOperation = "destination-in";
        t.fillStyle = g3;
        t.fillRect(box.x, box.y, box.w, box.h);
        t.globalCompositeOperation = "source-over";
      }, { a: 0.55 * tone, blur: H * 0.022, mottle: 0.3 });

      // outline: from the summit down each side, in two strokes, dissolving at the foot
      [pts.slice(0, ti + 1).reverse(), pts.slice(ti)].forEach(function (side) {
        var cut = Math.max(3, Math.floor(side.length * (0.5 + r() * 0.35))), sd = side.slice(0, cut), mid = Math.max(2, Math.floor(sd.length * (0.3 + r() * 0.3)));
        P.stroke(sd.slice(0, mid + 1), { w: wO, a: 0.9 * tone, dry: 0.3, tin: 0.06, tout: 0.12, seed: (r() * 1e9) | 0 });
        if (sd.length - mid > 2) P.stroke(sd.slice(mid), { w: wO * 0.85, a: 0.8 * tone, dry: 0.5, tin: 0.12, tout: 0.55, fade: 0.6, seed: (r() * 1e9) | 0 });
      });

      var c = P.c, floor = f.base - H * 0.2;
      c.save();
      poly(c, pts);
      c.clip();
      // folds: smaller copies of the ridge, set into the mass
      for (j = 0; j < Math.round(f.detail * 1.4 * r()); j++) {
        var sc = 0.4 + r() * 0.35, dy = H * (0.1 + r() * 0.25), dx = (r() - 0.5) * f.bw * 0.4;
        var a0 = Math.floor(N * (0.15 + r() * 0.25)), a1 = Math.floor(N * (0.55 + r() * 0.3));
        var fold = pts.slice(a0, a1).map(function (pt) {
          return [f.cx + dx + (pt[0] - f.cx) * sc, Math.min(floor, pt[1] + dy + (f.base - pt[1]) * (1 - sc) * 0.25)];
        });
        if (fold.length > 2) P.stroke(fold.slice(0, Math.ceil(fold.length * (0.4 + r() * 0.3))), { w: wO * 0.6, a: 0.42 * tone, dry: 0.6, tin: 0.25, tout: 0.6, seed: (r() * 1e9) | 0 });
      }
      // texture: hemp-fibre strokes running down the slopes, more of them in shade
      var cun = Math.round(clamp((H * f.bw) / 700, 4, 36) * f.detail);
      for (j = 0; j < cun; j++) {
        var uu = (r() * 2 - 1) * 0.8;
        if (r() < 0.4) uu = shade * Math.abs(uu);
        var s0 = pts[Math.round(((uu + 1) / 2) * N)], dir = uu < 0 ? -1 : 1;
        var len = H * (0.08 + r() * 0.2), x = s0[0] - dir * f.bw * 0.03 * r(), y = s0[1] + H * (0.02 + r() * 0.22), ang = Math.PI / 2 - dir * (0.25 + r() * 0.4), line = [];
        for (var m = 0; m < 6 && y < floor; m++) {
          line.push([x, y]);
          ang += (r() - 0.5) * 0.3;
          x += (Math.cos(ang) * len) / 5;
          y += (Math.sin(ang) * len) / 5;
        }
        if (line.length > 2) P.stroke(line, { w: wO * (0.3 + r() * 0.3), a: (0.25 + r() * 0.3) * tone, dry: 0.6, tin: 0.1, tout: 0.6, fade: 0.5, seed: (r() * 1e9) | 0 });
      }
      c.restore();

      // moss dots, in small clusters along the ridge
      var groups = f.trees ? 1 + ((r() * 2) | 0) : 0;
      for (j = 0; j < groups; j++) {
        var gi = Math.round(N * (0.2 + r() * 0.6)), cnt = 2 + ((r() * 3) | 0);
        for (var k = 0; k < cnt; k++) {
          var pd = pts[clamp(gi + Math.round((r() - 0.5) * 4), 0, N)];
          P.dot(pd[0] + (r() - 0.5) * wO * 2, pd[1] + wO * (1 + r() * 3), wO * (0.45 + r() * 0.7), (0.55 + r() * 0.35) * tone, r);
        }
      }
      // groves on the lower ridges
      if (f.trees) {
        for (j = 0; j < 1 + ((r() * 2) | 0); j++) {
          var pg = pts[Math.round(N * (0.2 + r() * 0.6))];
          grove(P, pg[0], pg[1] + wO, f.S * (0.045 + r() * 0.03), 2 + ((r() * 4) | 0), r, tone);
        }
      }
      return pts;
    }

    function grove(P, x, y, h, count, r, tone) {
      for (var i = 0; i < count; i++) {
        var hh = h * (0.65 + r() * 0.5), xx = x + (i - count / 2) * h * 0.32 + (r() - 0.5) * h * 0.1, yy = y + (r() - 0.3) * h * 0.15;
        var s = (r() * 1e9) | 0, k;
        P.stroke([[xx, yy], [xx + (r() - 0.5) * hh * 0.12, yy - hh]], { w: hh * 0.06, a: 0.85 * tone, dry: 0.3, tin: 0, tout: 0.5, seed: s });
        if (r() < 0.55) {
          // a far pine: dabs stacked up the trunk, narrowing to the tip
          for (k = 0; k < 6; k++) {
            var t = 0.22 + k * 0.13, ty = yy - hh * t, half = hh * 0.3 * (1 - t) + hh * 0.05;
            P.stroke([[xx - half, ty + half * 0.3], [xx, ty - hh * 0.02], [xx + half, ty + half * 0.35]], { w: hh * 0.09, a: 0.75 * tone, dry: 0.35, tin: 0.2, tout: 0.4, seed: s + k });
          }
        } else {
          // a leaf tree: a crown of dots
          for (k = 0; k < 16; k++) {
            var an = r() * TAU, rr = Math.sqrt(r()) * hh * 0.3;
            P.dot(xx + Math.cos(an) * rr, yy - hh * 0.72 + Math.sin(an) * rr * 0.75, hh * 0.08, (0.55 + r() * 0.35) * tone, r);
          }
        }
      }
    }

    function farRange(P, R, r, tone) {
      var n = noise1(r), pts = [], y0 = R.y + R.h * (0.26 + r() * 0.12), base = R.y + R.h * 0.8;
      for (var i = 0; i <= 36; i++) {
        var u = i / 36;
        pts.push([R.x + R.w * u, y0 + (base - y0) * (0.3 + 0.32 * (n(u * 4.5) * 0.5 + 0.5) + 0.38 * Math.pow(Math.abs(u - 0.5) * 2, 2))]);
      }
      pts.push([R.x + R.w, base], [R.x, base]);
      P.wash(R, function (t) {
        var g = t.createLinearGradient(0, y0, 0, base);
        g.addColorStop(0, "#000");
        g.addColorStop(1, "rgba(0,0,0,0)");
        t.fillStyle = g;
        poly(t, pts);
        t.fill();
      }, { a: 0.15 * tone, blur: R.h * 0.012, mottle: 0.35 });
    }

    function mountain(P, R, r) {
      var S = Math.min(R.w, R.h), tone = clamp((S - 70) / 170, 0.4, 1), base = R.y + R.h;
      var detail = clamp(S / 260, 0.45, 1), i;
      farRange(P, R, r, tone);
      var mainW = Math.min(R.w * 0.4, R.h * 0.55), cx = R.x + R.w * (0.4 + r() * 0.2), forms = [];
      var nb = 1 + ((r() * 2) | 0) + (R.w > R.h * 1.3 ? 1 : 0);
      for (i = 0; i < nb; i++) {
        var side = i % 2 ? 1 : -1, bw = mainW * (0.6 + r() * 0.35);
        forms.push({ cx: clamp(cx + side * R.w * (0.22 + r() * 0.18), R.x + bw, R.x + R.w - bw), top: R.y + R.h * (0.24 + r() * 0.2), bw: bw, tone: 0.6 * tone, detail: 0.6 * detail });
      }
      for (i = 0; i < 1 + ((r() * 2) | 0); i++) {
        var sw = mainW * (0.55 + r() * 0.25), sd = (i % 2 ? 1 : -1) * (r() < 0.5 ? 1 : -1);
        forms.push({ cx: clamp(cx + sd * mainW * (0.45 + r() * 0.3), R.x + sw, R.x + R.w - sw), top: R.y + R.h * (0.1 + r() * 0.18), bw: sw, tone: 0.82 * tone, detail: 0.8 * detail });
      }
      forms.push({ cx: cx, top: R.y + R.h * 0.02, bw: mainW, tone: tone, detail: detail });
      forms.forEach(function (f) {
        f.base = base - R.h * 0.1;
        f.S = S;
        peak(P, f, r);
      });
      // a belt of cloud, left as paper, through the middle of the range
      if (r() < 0.75) {
        var my = R.y + R.h * (0.52 + r() * 0.16), mh = R.h * 0.05, tilt = (r() - 0.5) * R.h * 0.12, x0 = cx - mainW * (0.9 + r() * 0.5), x1 = cx + mainW * (0.9 + r() * 0.5);
        P.wash({ x: R.x, y: my - mh * 3 - Math.abs(tilt), w: R.w, h: mh * 6 + Math.abs(tilt) * 2 }, function (t) {
          for (var k = 0; k < 9; k++) {
            var u = k / 8, ex = x0 + (x1 - x0) * u, rx = (x1 - x0) * (0.06 + r() * 0.07) * Math.sin(0.25 + u * 2.6);
            t.beginPath();
            t.ellipse(clamp(ex, R.x + rx, R.x + R.w - rx), my + tilt * (u - 0.5) + (r() - 0.5) * mh * 1.4, Math.max(rx, 4), mh * (0.45 + r() * 0.7), 0, 0, TAU);
            t.fill();
          }
        }, { op: "destination-out", a: 0.85, blur: mh * 1.1 });
      }
      // foothills in front, with groves
      var nf = 1 + ((r() * 2) | 0);
      for (i = 0; i < nf; i++) {
        var fw = R.w * (0.16 + r() * 0.14);
        peak(P, { cx: R.x + fw + r() * (R.w - fw * 2), top: base - R.h * (0.16 + r() * 0.16), bw: fw, base: base, tone: tone, detail: detail, trees: detail > 0.6, S: S }, r);
      }
    }
    function sun(P, R) {
      var g = discOf(R, 0.27), box = { x: g.x - g.R * 1.3, y: g.y - g.R * 1.3, w: g.R * 2.6, h: g.R * 2.6 };
      P.wash(box, function (t) {
        t.beginPath();
        t.arc(g.x, g.y, g.R, 0, TAU);
        t.fill();
      }, { color: CINNABAR, a: 0.85, blur: g.R * 0.035, mottle: 0.3 });
      P.wash(box, function (t) {
        t.beginPath();
        t.arc(g.x, g.y, g.R * 1.06, 0, TAU);
        t.fill();
      }, { color: CINNABAR, a: 0.16, blur: g.R * 0.12 });
    }

    function discOf(R, f) {
      return { x: R.x + R.w / 2, y: R.y + R.h / 2, R: Math.min(R.w, R.h) * f };
    }

    // the moon is left unpainted: a light wash around it brings it out
    function moon(P, R) {
      var g = discOf(R, 0.26), box = { x: g.x - g.R * 2.7, y: g.y - g.R * 2.7, w: g.R * 5.4, h: g.R * 5.4 };
      P.wash(box, function (t) {
        t.beginPath();
        t.arc(g.x, g.y, g.R, 0, TAU);
        t.fill();
      }, { color: PAPER, a: 0.97, blur: 0.5 });
      P.wash(box, function (t) {
        var gr = t.createRadialGradient(g.x, g.y, g.R * 0.985, g.x, g.y, g.R * 2.6);
        gr.addColorStop(0, "rgba(0,0,0,0)");
        gr.addColorStop(0.012, "rgba(0,0,0,.9)");
        gr.addColorStop(0.3, "rgba(0,0,0,.35)");
        gr.addColorStop(1, "rgba(0,0,0,0)");
        t.fillStyle = gr;
        t.fillRect(box.x, box.y, box.w, box.h);
      }, { a: 0.2, mottle: 0.35 });
    }

    function water(P, R, r) {
      var S = Math.min(R.w, R.h), n = noise1(r), i;
      // a far bank, barely there, along the top edge
      var sy = R.y + R.h * 0.1, pts = [], bw = R.w * (0.35 + r() * 0.25), bx = r() < 0.5 ? R.x : R.x + R.w - bw;
      for (i = 0; i <= 30; i++) pts.push([bx + (bw * i) / 30, sy - R.h * 0.07 * (0.4 + 0.6 * (n(i * 0.35) * 0.5 + 0.5)) * Math.pow(Math.sin((i / 30) * Math.PI), 0.8)]);
      pts.push([bx + bw, sy + R.h * 0.04], [bx, sy + R.h * 0.04]);
      P.wash(R, function (t) {
        var g = t.createLinearGradient(0, sy - R.h * 0.06, 0, sy + R.h * 0.04);
        g.addColorStop(0, "#000");
        g.addColorStop(1, "rgba(0,0,0,0)");
        t.fillStyle = g;
        poly(t, pts);
        t.fill();
      }, { a: 0.13, blur: R.h * 0.01 + 0.8, mottle: 0.3 });
      // ripples: sparse, longer and looser toward the viewer
      var rows = Math.max(3, Math.round(R.h / 22));
      for (i = 1; i <= rows; i++) {
        var tt = i / rows, y = R.y + R.h * (0.16 + 0.8 * Math.pow(tt, 1.3)), segs = 1 + ((r() * 2.2) | 0);
        for (var s = 0; s < segs; s++) {
          var L = R.w * (0.1 + r() * 0.28) * (0.6 + tt * 0.7), x0 = R.x + r() * (R.w - L), amp = 0.5 + tt * 1.6, fq = 0.04 + r() * 0.05, ph = r() * TAU, line = [];
          for (var k = 0; k <= 14; k++) {
            var xx = x0 + (L * k) / 14;
            line.push([xx, y + Math.sin(ph + xx * fq) * amp]);
          }
          P.stroke(line, { w: S * (0.003 + tt * 0.004) + 0.6, a: 0.25 + r() * 0.35, dry: 0.08, tin: 0.35, tout: 0.45, seed: (r() * 1e9) | 0 });
        }
      }
    }

    function cloud(P, R, r) {
      var S = Math.min(R.w, R.h), cy = R.y + R.h * 0.5, puffs = [];
      for (var i = 0; i < 7; i++) puffs.push([R.x + R.w * (0.14 + 0.72 * (i / 6)) + (r() - 0.5) * R.w * 0.06, cy + (r() - 0.5) * R.h * 0.25, R.w * (0.12 + r() * 0.06), R.h * (0.16 + r() * 0.12)]);
      // mist, laid over what is there
      P.wash(R, function (t) {
        puffs.forEach(function (p) {
          t.beginPath();
          t.ellipse(p[0], p[1], p[2], p[3], 0, 0, TAU);
          t.fill();
        });
      }, { color: PAPER, a: 0.94, blur: S * 0.06 });
      // a faint shading under it
      P.wash(R, function (t) {
        puffs.forEach(function (p) {
          t.beginPath();
          t.ellipse(p[0], p[1] + p[3] * 0.55, p[2] * 0.85, p[3] * 0.3, 0, 0, TAU);
          t.fill();
        });
      }, { a: 0.06, blur: S * 0.05, mottle: 0.4 });
    }

    function pine(P, R, r) {
      var S = Math.min(R.w, R.h), x0 = R.x + R.w * (0.35 + r() * 0.3), y0 = R.y + R.h * 0.99, top = R.y + R.h * 0.3;
      var lean = (r() < 0.5 ? -1 : 1) * R.w * (0.08 + r() * 0.14), ph = r() * TAU, trunk = [], i, k, M = 16;
      for (i = 0; i <= M; i++) {
        var t = i / M;
        trunk.push([x0 + lean * t * t + Math.sin(t * Math.PI * 1.3 + ph) * R.w * 0.045, y0 - (y0 - top) * t]);
      }
      var tw = clamp(S * 0.12, 6, 56);
      function edge(d) {
        return trunk.map(function (p, j) {
          return [p[0] + d * (tw / 2) * (1 - (j / M) * 0.5), p[1]];
        });
      }
      var left = edge(-1), right = edge(1);
      // the trunk: a pale wash between two bark edges, narrowing upward
      P.wash(R, function (t) {
        poly(t, left.concat(right.slice().reverse()));
        t.fill();
      }, { a: 0.42, blur: 1, mottle: 0.5 });
      // long dry strokes inside the trunk: the grain of old bark
      for (i = 0; i < 5; i++) {
        var o = (r() - 0.5) * 0.7, j0 = (r() * 6) | 0, line = trunk.slice(j0, j0 + 6 + ((r() * 8) | 0)).map(function (p, j) {
          return [p[0] + o * tw * (1 - ((j0 + j) / M) * 0.5), p[1]];
        });
        if (line.length > 2) P.stroke(line, { w: tw * 0.1, a: 0.5, dry: 0.75, tin: 0.2, tout: 0.4, seed: (r() * 1e9) | 0 });
      }
      P.stroke(left, { w: tw * 0.2, a: 0.88, dry: 0.55, tin: 0.02, tout: 0.25, seed: (r() * 1e9) | 0 });
      P.stroke(right, { w: tw * 0.14, a: 0.72, dry: 0.65, tin: 0.02, tout: 0.25, seed: (r() * 1e9) | 0 });
      // bark: scales up the trunk
      for (i = 0; i < 18; i++) {
        var j = 1 + ((r() * 12) | 0), tp = trunk[j], ww = tw * (1 - (j / M) * 0.5), bx = tp[0] + (r() - 0.5) * ww * 0.45, by = tp[1] + (r() - 0.5) * 8;
        P.stroke([[bx - ww * 0.22, by + ww * 0.05], [bx, by - ww * 0.12], [bx + ww * 0.22, by + ww * 0.05]], { w: ww * 0.06 + 0.35, a: 0.55, dry: 0.4, tin: 0.2, tout: 0.4, seed: (r() * 1e9) | 0 });
      }
      // branches, reaching out and down, each carrying wheels of needles
      var nb = 4 + ((r() * 3) | 0);
      for (i = 0; i < nb; i++) {
        var from = trunk[Math.min(M, Math.round(M * (0.45 + (i / nb) * 0.5)))], side = i % 2 ? 1 : -1;
        if (r() < 0.3) side = -side;
        var L = R.w * (0.22 + r() * 0.24) * (1 - (i / nb) * 0.35), br = [];
        for (k = 0; k <= 8; k++) {
          var u = k / 8;
          br.push([from[0] + side * L * u, from[1] - R.h * 0.05 * Math.sin(u * Math.PI * 0.8) + R.h * 0.045 * u * u]);
        }
        P.stroke(br, { w: tw * 0.32 * (1 - (i / nb) * 0.4), a: 0.84, dry: 0.5, tin: 0.02, tout: 0.7, seed: (r() * 1e9) | 0 });
        for (k = 0; k < 2 + ((r() * 2) | 0); k++) {
          var bp = br[3 + ((r() * 6) | 0)];
          needles(P, [bp[0] + (r() - 0.5) * L * 0.12, bp[1] - S * 0.015], S * (0.075 + r() * 0.045), r);
        }
      }
      needles(P, [trunk[M][0], trunk[M][1] - S * 0.01], S * 0.1, r);
    }

    // a wheel of pine needles: a dark wash, needles fanning up and out
    function needles(P, c, L, r) {
      P.wash({ x: c[0] - L * 1.3, y: c[1] - L * 1.1, w: L * 2.6, h: L * 1.7 }, function (t) {
        t.beginPath();
        t.ellipse(c[0], c[1] - L * 0.22, L * 1.02, L * 0.42, 0, 0, TAU);
        t.fill();
      }, { a: 0.26, blur: L * 0.18, mottle: 0.45 });
      var n = 18 + ((r() * 8) | 0), i, an, l;
      for (i = 0; i < n; i++) {
        an = Math.PI * (1.02 + (i / (n - 1)) * 0.96) + (r() - 0.5) * 0.08;
        l = L * (0.8 + r() * 0.3);
        P.stroke([[c[0] + Math.cos(an) * l * 0.12, c[1] + Math.sin(an) * l * 0.06], [c[0] + Math.cos(an) * l, c[1] + Math.sin(an) * l * 0.62]], { w: L * 0.032 + 0.3, a: 0.85, dry: 0.15, tin: 0, tout: 0.75, seed: (r() * 1e9) | 0 });
      }
      for (i = 0; i < 5; i++) {
        an = Math.PI * (0.15 + r() * 0.7);
        l = L * (0.35 + r() * 0.2);
        P.stroke([[c[0], c[1]], [c[0] + Math.cos(an) * l, c[1] + Math.sin(an) * l * 0.5]], { w: L * 0.028 + 0.3, a: 0.7, dry: 0.2, tin: 0, tout: 0.7, seed: (r() * 1e9) | 0 });
      }
    }
    function birds(P, R, r) {
      var S = Math.min(R.w, R.h), n = 3 + ((r() * 4) | 0);
      for (var i = 0; i < n; i++) {
        var t = n > 1 ? i / (n - 1) : 0.5, s = S * 0.11 * (1 - t * 0.45) * (0.85 + r() * 0.3);
        var x = R.x + R.w * (0.12 + 0.76 * t) + (r() - 0.5) * R.w * 0.08, y = R.y + R.h * (0.3 + 0.35 * Math.sin(t * Math.PI * 0.9 + 0.3)) + (r() - 0.5) * R.h * 0.12;
        var flap = r(), seed = (r() * 1e9) | 0;
        [-1, 1].forEach(function (d) {
          var tip = [x + d * s, y - s * (0.05 + flap * 0.3)], mid = [x + d * s * 0.45, y - s * (0.25 + flap * 0.25)];
          P.stroke(curve([[x, y], mid, tip], 2), { w: s * 0.14, a: 0.85, dry: 0.15, tin: 0.05, tout: 0.7, seed: seed + d });
        });
        P.dot(x, y + s * 0.03, s * 0.1, 0.9, r);
      }
    }

    function boat(P, R, r) {
      var L = Math.min(R.w * 0.85, R.h * 1.8), cx = R.x + R.w / 2, cy = R.y + R.h * 0.6, s = (r() * 1e9) | 0;
      var hull = curve([[cx - L / 2, cy - L * 0.07], [cx - L * 0.2, cy + L * 0.04], [cx + L * 0.2, cy + L * 0.04], [cx + L / 2, cy - L * 0.1]], 3);
      var deck = curve([[cx - L * 0.47, cy - L * 0.06], [cx, cy - L * 0.02], [cx + L * 0.47, cy - L * 0.085]], 2);
      P.wash({ x: cx - L / 2, y: cy - L * 0.12, w: L, h: L * 0.2 }, function (t) {
        poly(t, hull.concat(deck.slice().reverse()));
        t.fill();
      }, { a: 0.3, blur: 0.6, mottle: 0.3 });
      P.stroke(hull, { w: L * 0.035 + 0.6, a: 0.9, dry: 0.35, tin: 0.12, tout: 0.25, seed: s });
      // the awning
      var aw = curve([[cx - L * 0.2, cy - L * 0.03], [cx - L * 0.16, cy - L * 0.16], [cx + L * 0.08, cy - L * 0.17], [cx + L * 0.12, cy - L * 0.04]], 2);
      P.wash({ x: cx - L * 0.22, y: cy - L * 0.18, w: L * 0.36, h: L * 0.16 }, function (t) {
        poly(t, aw);
        t.fill();
      }, { a: 0.42, blur: 0.8, mottle: 0.35 });
      P.stroke(aw, { w: L * 0.014 + 0.5, a: 0.85, dry: 0.4, tin: 0.1, tout: 0.3, seed: s + 1 });
      // a boatman with his pole
      var fx = cx + L * 0.3, fy = cy - L * 0.08;
      P.stroke([[fx, fy - L * 0.1], [fx + L * 0.01, fy]], { w: L * 0.03 + 0.4, a: 0.9, dry: 0.2, tin: 0.1, tout: 0.3, seed: s + 2 });
      P.dot(fx, fy - L * 0.12, L * 0.02 + 0.6, 0.95, r);
      P.stroke([[fx - L * 0.06, fy - L * 0.2], [fx + L * 0.26, cy + L * 0.22]], { w: L * 0.008 + 0.4, a: 0.75, dry: 0.2, tin: 0.05, tout: 0.2, seed: s + 3 });
      // its reflection
      for (var i = 0; i < 3; i++) {
        var yy = cy + L * (0.08 + i * 0.05), half = L * (0.3 - i * 0.07), ox = (r() - 0.5) * L * 0.1;
        P.stroke([[cx - half + ox, yy], [cx + ox, yy + 0.8], [cx + half + ox, yy]], { w: L * 0.008 + 0.4, a: 0.35, dry: 0.5, tin: 0.3, tout: 0.4, seed: s + 4 + i });
      }
    }

    // ---- whole-painting changes ----

    function rain(P, level, dark, r) {
      var c = P.c, W = P.W, H = P.H, all = { x: 0, y: 0, w: W, h: H };
      if (!dark) {
        P.wash(all, function (t) {
          var g = t.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, "rgba(0,0,0,.5)");
          g.addColorStop(1, "rgba(0,0,0,.18)");
          t.fillStyle = g;
          t.fillRect(0, 0, W, H);
        }, { color: PAPER, a: 0.55 + level * 0.12 });
        P.wash(all, function (t) {
          var g = t.createLinearGradient(0, 0, 0, H * 0.5);
          g.addColorStop(0, "rgba(0,0,0,1)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          t.fillStyle = g;
          t.fillRect(0, 0, W, H * 0.5);
        }, { a: 0.1 * level, mottle: 0.55 });
      }
      c.lineCap = "round";
      var count = Math.round(((W * H) / 1600) * level);
      for (var i = 0; i < count; i++) {
        var x = r() * (W + 80) - 20, y = r() * H, l = 10 + r() * 32;
        c.lineWidth = 0.35 + r() * 0.55;
        c.strokeStyle = dark ? "rgba(" + PAPER + "," + (0.08 + r() * 0.16).toFixed(3) + ")" : "rgba(" + INK + "," + (0.08 + r() * 0.16).toFixed(3) + ")";
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - l * 0.2, y + l);
        c.stroke();
      }
    }

    function night(P, level, moons) {
      var W = P.W, H = P.H;
      P.wash({ x: 0, y: 0, w: W, h: H }, function (t) {
        var g = t.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "rgba(0,0,0,.95)");
        g.addColorStop(1, "rgba(0,0,0,.6)");
        t.fillStyle = g;
        t.fillRect(0, 0, W, H);
        t.globalCompositeOperation = "destination-out";
        moons.forEach(function (m) {
          var gr = t.createRadialGradient(m.x, m.y, m.R * 0.985, m.x, m.y, m.R * 3);
          gr.addColorStop(0, "#000");
          gr.addColorStop(0.012, "rgba(0,0,0,.55)");
          gr.addColorStop(1, "rgba(0,0,0,0)");
          t.fillStyle = gr;
          t.beginPath();
          t.arc(m.x, m.y, m.R * 3, 0, TAU);
          t.fill();
        });
        t.globalCompositeOperation = "source-over";
      }, { color: NIGHT, a: level > 1 ? 0.82 : 0.68, mottle: 0.1, blur: 2 });
    }

    var PAINT = { 山: mountain, 日: sun, 月: moon, 水: water, 云: cloud, 松: pine, 鸟: birds, 舟: boat };

    // scene: { motifs: [{ c, r, seed }], rain: 0-2, night: 0-2 }
    function render(P, scene) {
      P.clear();
      scene.motifs.forEach(function (m) {
        PAINT[m.c](P, m.r, rng(m.seed));
        P.reset(P.c);
      });
      if (scene.night) {
        night(P, scene.night, scene.motifs.filter(function (m) { return m.c === "月"; }).map(function (m) { return discOf(m.r, 0.26); }));
      }
      if (scene.rain) rain(P, scene.rain, scene.night, rng(91));
    }

    return { Painter: Painter, paper: paper, render: render, rng: rng, mk: mk, INK: INK, PAPER: PAPER, CINNABAR: CINNABAR };
  })();

  // a character written in water: dark while wet, on a transparent layer
  var WET = "rgb(46, 52, 60)";
  function glyph(c, ch, r, a, k) {
    var s = Math.min(r.w, r.h) * 0.94;
    c.save();
    c.setTransform(k, 0, 0, k, 0, 0);
    c.globalAlpha = a;
    c.fillStyle = WET;
    c.font = s + "px " + HAND;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(ch, r.x + r.w / 2, r.y + r.h / 2 + s * 0.04);
    c.restore();
  }

  function seal(c, k, x, y) {
    c.save();
    c.setTransform(k, 0, 0, k, 0, 0);
    c.fillStyle = "rgba(" + Ink.CINNABAR + ",.9)";
    c.fillRect(x, y, 30, 56);
    c.fillStyle = "rgb(" + Ink.PAPER + ")";
    c.font = "22px " + HAND;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("梦", x + 15, y + 15);
    c.fillText("笔", x + 15, y + 41);
    c.restore();
  }

  function covered(old, r) {
    // the share of `old` that the region r covers
    var x = Math.max(0, Math.min(old.x + old.w, r.x + r.w) - Math.max(old.x, r.x)), y = Math.max(0, Math.min(old.y + old.h, r.y + r.h) - Math.max(old.y, r.y));
    return (x * y) / (old.w * old.h);
  }

  // ------------------------------------------------------------ the writing canvas

  (function () {
    var studio = root.querySelector(".db-studio");
    if (!studio) return;
    var cv = studio.querySelector(".db-canvas"), ctx = cv.getContext("2d");
    var stoneEl = studio.querySelector(".db-inkstone"), statusEl = studio.querySelector(".db-status");
    var soundBtn = studio.querySelector('[data-db="sound"]');

    // size and zone: where "write it for me" puts each character (logical 600 x 800)
    var CHARS = [
      { c: "山", py: "shān", en: "mountain", a: "a mountain", note: 0, size: [460, 400], zone: [250, 380] },
      { c: "日", py: "rì", en: "sun", a: "the sun", note: 4, size: [120, 120], zone: [40, 200] },
      { c: "月", py: "yuè", en: "moon", a: "the moon", note: 7, size: [130, 130], zone: [40, 200] },
      { c: "水", py: "shuǐ", en: "water", a: "water", note: 2, size: [560, 170], zone: [610, 620] },
      { c: "云", py: "yún", en: "cloud", a: "a cloud", note: 5, size: [420, 120], zone: [300, 480] },
      { c: "雨", py: "yǔ", en: "rain", a: "rain", note: 1, global: true },
      { c: "松", py: "sōng", en: "pine", a: "a pine", note: 3, size: [270, 440], zone: [340, 350] },
      { c: "鸟", py: "niǎo", en: "birds", a: "birds", note: 8, size: [250, 150], zone: [50, 200] },
      { c: "舟", py: "zhōu", en: "boat", a: "a boat", note: 6, size: [200, 110], zone: [610, 670] },
      { c: "夜", py: "yè", en: "night", a: "night", note: 9, global: true },
    ];
    var BY = {};
    CHARS.forEach(function (d) {
      BY[d.c] = d;
    });

    var scene = { motifs: [], rain: 0, night: 0 }, seedN = (Math.random() * 1e6) | 0, current = "山";
    var busy = false, sealOn = false, wet = null, drawing = null, anim = null, raf = 0, commit = 0, idle = 0, touched = false, timers = [];
    var k = 1, paperC, settled, next, Pn, tmpA, tmpB, wetC;

    function size() {
      var w = cv.clientWidth;
      if (!w) return;
      var W = Math.min(1400, Math.round(w * Math.min(devicePixelRatio || 1, 2))), H = Math.round((W * 4) / 3);
      if (cv.width === W && paperC) return;
      cv.width = W;
      cv.height = H;
      k = W / 600;
      paperC = Ink.mk(W, H);
      Ink.paper(paperC);
      settled = Ink.mk(W, H);
      next = Ink.mk(W, H);
      tmpA = Ink.mk(W, H);
      tmpB = Ink.mk(W, H);
      wetC = Ink.mk(W, H);
      Pn = new Ink.Painter(next);
      Ink.render(Pn, scene);
      settle();
    }

    function settle() {
      var s = settled.getContext("2d");
      s.clearRect(0, 0, settled.width, settled.height);
      s.drawImage(next, 0, 0);
      anim = null;
      draw(performance.now());
    }

    function draw(now) {
      var W = cv.width, H = cv.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(paperC, 0, 0);
      if (anim) {
        // the new painting spreads from where the character was written (or
        // washes down the paper, for weather and night) over the old one
        var t = clamp((now - anim.t0) / anim.dur, 0, 1), e = 1 - Math.pow(1 - t, 3), g;
        if (anim.global) {
          var y = e * H * 1.35;
          g = ctx.createLinearGradient(0, y - H * 0.35, 0, y);
        } else {
          g = ctx.createRadialGradient(anim.x, anim.y, 0, anim.x, anim.y, anim.R * e + 1);
          g.addColorStop(0.6, "#000");
        }
        g.addColorStop(0, "#000");
        g.addColorStop(1, "rgba(0,0,0,0)");
        layer(tmpA, settled, "destination-out", g);
        layer(tmpB, next, "destination-in", g);
        ctx.drawImage(tmpA, 0, 0);
        ctx.drawImage(tmpB, 0, 0);
        if (t >= 1) done();
      } else {
        ctx.drawImage(settled, 0, 0);
      }
      if (sealOn) seal(ctx, k, 22, 722);
      if (wet) drawWet(now);
    }

    function layer(dst, src, op, g) {
      var c = dst.getContext("2d");
      c.globalCompositeOperation = "source-over";
      c.clearRect(0, 0, dst.width, dst.height);
      c.drawImage(src, 0, 0);
      c.globalCompositeOperation = op;
      c.fillStyle = g;
      c.fillRect(0, 0, dst.width, dst.height);
      c.globalCompositeOperation = "source-over";
    }

    function drawWet(now) {
      var a = wet.dry && now > wet.dry ? 1 - (now - wet.dry) / 2600 : 1;
      if (a <= 0) {
        wet = null;
        return;
      }
      var c = wetC.getContext("2d");
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, wetC.width, wetC.height);
      c.setTransform(k, 0, 0, k, 0, 0);
      c.strokeStyle = WET;
      c.lineCap = c.lineJoin = "round";
      wet.strokes.forEach(function (s) {
        for (var i = 1; i < s.length; i++) {
          c.lineWidth = (s[i][2] + s[i - 1][2]) / 2;
          c.beginPath();
          c.moveTo(s[i - 1][0], s[i - 1][1]);
          c.lineTo(s[i][0], s[i][1]);
          c.stroke();
        }
        if (s.length === 1) {
          c.beginPath();
          c.arc(s[0][0], s[0][1], s[0][2] / 2, 0, Math.PI * 2);
          c.fillStyle = WET;
          c.fill();
        }
      });
      if (wet.glyph) {
        // written in from the top, as a brush would
        var p = clamp((now - wet.glyph.t0) / 650, 0, 1), r = wet.glyph.r;
        c.save();
        c.beginPath();
        c.rect(r.x - 40, r.y - 40, r.w + 80, (r.h + 80) * p);
        c.clip();
        glyph(c, wet.glyph.c, r, 1, k);
        c.restore();
      }
      ctx.save();
      ctx.globalAlpha = 0.86 * Math.pow(a, 1.6);
      ctx.shadowColor = "rgba(46, 52, 60, 0.45)";
      ctx.shadowBlur = 5 * k * (2 - a);
      ctx.drawImage(wetC, 0, 0);
      ctx.restore();
    }

    function frame(now) {
      raf = 0;
      draw(now);
      if (anim || wet || drawing) loop();
    }

    function loop() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function after(fn, ms) {
      return setTimeout(fn, reduceMotion ? 0 : ms);
    }

    // the demo's own waits, cancelled once the visitor takes the brush
    function later(fn, ms) {
      timers.push(after(fn, ms));
    }

    function status(t) {
      clearTimeout(idle);
      statusEl.textContent = t;
    }

    // ---- what a character does to the painting ----
    function apply(d, r) {
      if (d.global) {
        var key = d.c === "雨" ? "rain" : "night", deeper = scene[key] > 0;
        scene[key] = Math.min(2, scene[key] + 1);
        if (d.c === "夜" && !scene.motifs.some(function (m) { return m.c === "月"; })) {
          scene.motifs.push({ c: "月", r: { x: clamp(r.x + r.w / 2 - 65, 30, 440), y: clamp(r.y + r.h / 2 - 65, 40, 240), w: 130, h: 130 }, seed: ++seedN });
        }
        if (d.c === "雨") return { global: true, text: deeper ? "The rain grows heavier." : "Rain falls across the whole painting." };
        return { global: true, text: deeper ? "The night deepens." : "The day turns to night, and the moon comes out." };
      }
      var action = "add", gone = null;
      scene.motifs = scene.motifs.filter(function (m) {
        if (covered(m.r, r) <= 0.6) return true;
        action = m.c === d.c ? "modify" : "replace";
        gone = gone || m;
        return false;
      });
      scene.motifs.push({ c: d.c, r: r, seed: ++seedN });
      if (scene.motifs.length > 16) scene.motifs.shift();
      if (action === "modify") return { text: "The " + d.en + " is painted again, as you wrote it." };
      if (action === "replace") return { text: "The " + BY[gone.c].en + " gives way to " + d.a + "." };
      return { text: "Painting " + d.a + " where you wrote it." };
    }

    function describe() {
      var names = scene.motifs.map(function (m) { return BY[m.c].a; });
      var s = names.length ? "A painting of " + names.join(", ") : "An empty sheet of painting paper";
      if (scene.rain) s += ", in rain";
      if (scene.night) s += ", at night";
      cv.setAttribute("aria-label", s);
    }

    function write(c, r, asGlyph, then) {
      var d = BY[c], now = performance.now();
      busy = true;
      if (asGlyph) wet = { strokes: [], glyph: { c: c, r: r, t0: now }, dry: 0 };
      if (wet) wet.dry = now + (asGlyph ? 900 : 150); // the water starts to dry once the brush lifts
      loop();
      status("Reading the character…");
      after(function () {
        status(d.c + ", " + d.py + ": " + d.en + ".");
      }, 900);
      after(function () {
        var change = apply(d, r);
        Ink.render(Pn, scene);
        sealOn = true;
        anim = {
          t0: performance.now(),
          dur: reduceMotion ? 1 : change.global ? 2600 : 2100,
          global: change.global,
          x: (r.x + r.w / 2) * k,
          y: (r.y + r.h / 2) * k,
          R: Math.hypot(r.w, r.h) * 0.75 * k + 60 * k,
        };
        status(change.text);
        play(d);
        describe();
        loop();
        anim.then = then;
      }, 1500);
    }

    function done() {
      var then = anim.then;
      settle();
      busy = false;
      idle = after(function () {
        if (!busy && !drawing) statusEl.textContent = "Write another character.";
      }, 2200);
      if (then) then();
    }

    // ---- placing a character for the visitor: the open space that suits it ----
    function place(d) {
      if (d.global) return { x: 240, y: 120, w: 120, h: 120 };
      var best = null, bestScore = Infinity;
      for (var i = 0; i < 40; i++) {
        var w = d.size[0] * (0.85 + Math.random() * 0.25), h = d.size[1] * (0.85 + Math.random() * 0.25);
        w = Math.min(w, 580);
        var r = { x: 10 + Math.random() * (580 - w), y: clamp(d.zone[0] + Math.random() * (d.zone[1] - d.zone[0]), 10, 790 - h), w: w, h: h };
        var score = scene.motifs.reduce(function (s, m) {
          return s + covered(m.r, r) * 2 + covered(r, m.r);
        }, 0);
        if (score < bestScore) {
          bestScore = score;
          best = r;
        }
      }
      return best;
    }

    // ---- writing with the pointer ----
    function point(e) {
      var b = cv.getBoundingClientRect();
      return [((e.clientX - b.left) / b.width) * 600, ((e.clientY - b.top) / b.height) * 800, 12, e.timeStamp];
    }

    cv.addEventListener("pointerdown", function (e) {
      stopDemo();
      if (busy) return;
      clearTimeout(commit);
      cv.setPointerCapture(e.pointerId);
      if (!wet || wet.dry) wet = { strokes: [], glyph: null, dry: 0 };
      drawing = [point(e)];
      wet.strokes.push(drawing);
      status("Writing " + current + "…");
      loop();
    });

    cv.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      (e.getCoalescedEvents ? e.getCoalescedEvents() : [e]).forEach(function (ev) {
        var p = point(ev), q = drawing[drawing.length - 1], dist = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (dist < 1.5) return;
        var v = dist / Math.max(1, p[3] - q[3]), target = ev.pointerType === "pen" && ev.pressure ? 6 + ev.pressure * 20 : 22 - v * 10;
        p[2] = clamp(q[2] + (target - q[2]) * 0.35, 5, 24); // slow strokes lay down more water
        drawing.push(p);
      });
      loop();
    });

    function lift() {
      if (!drawing) return;
      drawing = null;
      var xs = [], ys = [], len = 0;
      wet.strokes.forEach(function (s) {
        s.forEach(function (p, i) {
          xs.push(p[0]);
          ys.push(p[1]);
          if (i) len += Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]);
        });
      });
      if (len < 14 && wet.strokes.length === 1) {
        // a tap: the character is written there for you
        var p0 = wet.strokes[0][0], d = BY[current], sz = d.global ? 140 : clamp(Math.min(d.size[0], d.size[1]), 120, 220);
        wet = null;
        write(current, { x: clamp(p0[0] - sz / 2, 6, 594 - sz), y: clamp(p0[1] - sz / 2, 6, 794 - sz), w: sz, h: sz }, true);
        return;
      }
      status("Pause, and it is read.");
      commit = setTimeout(function () {
        var x0 = Math.min.apply(null, xs) - 14, y0 = Math.min.apply(null, ys) - 14, x1 = Math.max.apply(null, xs) + 14, y1 = Math.max.apply(null, ys) + 14;
        var w = Math.max(80, x1 - x0), h = Math.max(80, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        var r = { x: clamp(cx - w / 2, 0, 600 - w), y: clamp(cy - h / 2, 0, 800 - h), w: Math.min(w, 600), h: Math.min(h, 800) };
        write(current, r, false);
      }, 900);
    }
    cv.addEventListener("pointerup", lift);
    cv.addEventListener("pointercancel", lift);

    // ---- sound (off unless the visitor turns it on): pentatonic plucks, soft noise ----
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
      soundBtn.textContent = soundOn ? "Sound on" : "Sound off";
    });

    // ---- the inkstone ----
    var tiles = {};
    CHARS.forEach(function (d) {
      var b = document.createElement("button"), zh = document.createElement("b"), en = document.createElement("span");
      b.type = "button";
      b.className = "db-char";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", d.c + ", " + d.py + ", " + d.en);
      zh.lang = "zh";
      zh.textContent = d.c;
      en.textContent = d.en;
      b.appendChild(zh);
      b.appendChild(en);
      b.addEventListener("click", function () {
        stopDemo();
        pick(d.c);
      });
      stoneEl.appendChild(b);
      tiles[d.c] = b;
    });
    function pick(c) {
      current = c;
      Object.keys(tiles).forEach(function (key) {
        tiles[key].setAttribute("aria-checked", key === c);
        tiles[key].tabIndex = key === c ? 0 : -1;
      });
    }
    stoneEl.addEventListener("keydown", function (e) {
      var keys = Object.keys(tiles), i = keys.indexOf(current), cols = getComputedStyle(stoneEl).gridTemplateColumns.split(" ").length;
      var j = { ArrowRight: i + 1, ArrowDown: i + cols, ArrowLeft: i - 1, ArrowUp: i - cols }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      j = (j + keys.length) % keys.length;
      pick(keys[j]);
      tiles[keys[j]].focus();
    });
    pick("山");

    studio.querySelector('[data-db="auto"]').addEventListener("click", function () {
      stopDemo();
      if (!busy) write(current, place(BY[current]), true);
    });
    studio.querySelector('[data-db="clear"]').addEventListener("click", function () {
      stopDemo();
      if (busy) return;
      scene = { motifs: [], rain: 0, night: 0 };
      Ink.render(Pn, scene);
      sealOn = false;
      wet = null;
      anim = { t0: performance.now(), dur: reduceMotion ? 1 : 1400, global: true };
      describe();
      status("A fresh sheet.");
      loop();
    });

    // ---- a first session plays by itself, until the visitor takes the brush ----
    function stopDemo() {
      touched = true;
      timers.forEach(clearTimeout);
      timers = [];
    }
    function demo() {
      if (touched || reduceMotion) return;
      pick("山");
      write("山", { x: 40, y: 300, w: 520, h: 450 }, true, function () {
        later(function () {
          if (touched) return;
          pick("日");
          write("日", { x: 425, y: 70, w: 115, h: 115 }, true, function () {
            later(function () {
              if (touched) return;
              pick("水");
              status("Your turn. Try 水, water, along the bottom.");
            }, 2400);
          });
        }, 900);
      });
    }

    fontsReady().then(function () {
      size();
      addEventListener("resize", function () {
        clearTimeout(size.t);
        size.t = setTimeout(function () {
          if (!busy) size();
        }, 200);
      });
      if (!("IntersectionObserver" in window)) return;
      var seen = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        seen.disconnect();
        later(demo, 700);
      }, { threshold: 0.3 });
      seen.observe(cv);
    });
  })();

  // ------------------------------------------------------------ the four-panel screen

  (function () {
    var panels = root.querySelectorAll(".db-panel");
    if (!panels.length) return;
    // logical 600 x 900; the written character is shown dried to a ghost, its region marked
    var SCENES = {
      size: { motifs: [{ c: "山", r: { x: 20, y: 380, w: 560, h: 500 }, seed: 11 }, { c: "山", r: { x: 330, y: 150, w: 210, h: 140 }, seed: 5 }], ghosts: [0, 1] },
      place: { motifs: [{ c: "山", r: { x: 30, y: 370, w: 540, h: 500 }, seed: 21 }, { c: "日", r: { x: 60, y: 110, w: 120, h: 120 }, seed: 2 }], ghosts: [1] },
      context: { motifs: [{ c: "山", r: { x: 20, y: 250, w: 560, h: 600 }, seed: 31 }, { c: "云", r: { x: 40, y: 500, w: 520, h: 150 }, seed: 4 }], ghosts: [1] },
      meaning: { motifs: [{ c: "山", r: { x: 50, y: 300, w: 500, h: 440 }, seed: 5 }, { c: "水", r: { x: 10, y: 720, w: 580, h: 170 }, seed: 3 }, { c: "舟", r: { x: 330, y: 760, w: 190, h: 100 }, seed: 6 }], rain: 1, ghost: { c: "雨", r: { x: 245, y: 110, w: 110, h: 110 } } },
    };

    function paint(cv) {
      var s = SCENES[cv.getAttribute("data-panel")], W = Math.min(900, Math.round(cv.clientWidth * Math.min(devicePixelRatio || 1, 2)));
      if (!s || !W) return;
      cv.width = W;
      cv.height = Math.round(W * 1.5);
      var k = W / 600, art = Ink.mk(cv.width, cv.height), c = cv.getContext("2d");
      Ink.paper(cv);
      Ink.render(new Ink.Painter(art), s);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(art, 0, 0);
      var marks = (s.ghosts || []).map(function (i) { return s.motifs[i]; });
      if (s.ghost) marks.push(s.ghost);
      marks.forEach(function (m) {
        glyph(c, m.c, m.r, 0.16, k);
        // the written region, marked at its corners in seal red
        var r = m.r, L = Math.min(r.w, r.h) * 0.14;
        c.save();
        c.setTransform(k, 0, 0, k, 0, 0);
        c.strokeStyle = "rgba(" + Ink.CINNABAR + ",.8)";
        c.lineWidth = 1.6;
        c.beginPath();
        [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]].forEach(function (q) {
          c.moveTo(q[0] + q[2] * L, q[1]);
          c.lineTo(q[0], q[1]);
          c.lineTo(q[0], q[1] + q[3] * L);
        });
        c.stroke();
        c.restore();
      });
    }

    fontsReady().then(function () {
      if (!("IntersectionObserver" in window)) return panels.forEach(paint);
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          paint(e.target);
        });
      }, { rootMargin: "400px 0px" });
      panels.forEach(function (p) {
        io.observe(p);
      });
    });
  })();
})();

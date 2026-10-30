// Mini TRANSFORM page (src/projects/mini-transform.html): a virtual Mini
// TRANSFORM drawn on canvas. Every canvas.mt-device becomes one device. The
// hero's plays by itself and rises under the cursor; the one in #play is
// driven by the console (mode keys, knobs, an LCD that mirrors the pins).
(function () {
  "use strict";
  if (!document.querySelector(".mt")) return;
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // geometry, in pin pitches: a 5 x 5 grid in a cube, pins that rise ~2 pitches
  var N = 5, W = 0.82, OPEN = 0.9, RIM = 0.34, L = N + RIM * 2, BOX = L * 0.94, TRAVEL = 1.9, REST = -0.12;
  var C = (N - 1) / 2;

  // 5 x 5 letters, five rows top to bottom
  var FONT = {
    A: ".###. #...# ##### #...# #...#", B: "####. #...# ####. #...# ####.", C: ".#### #.... #.... #.... .####",
    D: "####. #...# #...# #...# ####.", E: "##### #.... ####. #.... #####", F: "##### #.... ####. #.... #....",
    G: ".#### #.... #..## #...# .####", H: "#...# #...# ##### #...# #...#", I: "##### ..#.. ..#.. ..#.. #####",
    J: "..### ...#. ...#. #..#. .##..", K: "#...# #..#. ###.. #..#. #...#", L: "#.... #.... #.... #.... #####",
    M: "#...# ##.## #.#.# #...# #...#", N: "#...# ##..# #.#.# #..## #...#", O: ".###. #...# #...# #...# .###.",
    P: "####. #...# ####. #.... #....", Q: ".###. #...# #.#.# #..#. .##.#", R: "####. #...# ####. #..#. #...#",
    S: ".#### #.... .###. ....# ####.", T: "##### ..#.. ..#.. ..#.. ..#..", U: "#...# #...# #...# #...# .###.",
    V: "#...# #...# #...# .#.#. ..#..", W: "#...# #...# #.#.# ##.## #...#", X: "#...# .#.#. ..#.. .#.#. #...#",
    Y: "#...# .#.#. ..#.. ..#.. ..#..", Z: "##### ...#. ..#.. .#... #####", 0: ".###. #..## #.#.# ##..# .###.",
    1: "..#.. .##.. ..#.. ..#.. .###.", 2: ".###. #...# ..##. .#... #####", 3: "####. ....# .###. ....# ####.",
    4: "#..#. #..#. ##### ...#. ...#.", 5: "##### #.... ####. ....# ####.", 6: ".###. #.... ####. #...# .###.",
    7: "##### ...#. ..#.. .#... .#...", 8: ".###. #...# .###. #...# .###.", 9: ".###. #...# .#### ....# .###.",
    "♥": ".#.#. ##### ##### .###. ..#..", "?": ".###. #...# ..##. ..... ..#..", "!": "..#.. ..#.. ..#.. ..... ..#..",
  };
  Object.keys(FONT).forEach(function (k) {
    FONT[k] = FONT[k].split(" ").join("");
  });
  // the shape on the film's poster: an I-beam, three pins wide, in the middle
  var BEAM = "..... .###. ..#.. .###. .....".split(" ").join("");

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  // ------------------------------------------------------------ the device

  function Device(cv, mode) {
    this.cv = cv;
    this.ctx = cv.getContext("2d");
    this.h = new Float32Array(N * N);
    this.v = new Float32Array(N * N);
    this.goal = new Float32Array(N * N);
    this.drawn = new Float32Array(N * N);
    this.mode = mode;
    this.yaw = -0.62;
    this.pitch = 0.6;
    this.speed = 1.2; // share of full travel per second at full speed
    this.travel = 1;
    this.t = 0;
    this.hand = null; // world point under the pointer, or null
    this.ball = { x: -1.2, z: 0.8, vx: 0, vz: 0 };
    this.glyph = BEAM;
    this.ripple = { x: 0, z: 0, t0: 0 };
    this.order = [];
    this.size();
  }

  Device.prototype.size = function () {
    var r = this.cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    if (!r.width) return;
    this.cv.width = Math.round(r.width * dpr);
    this.cv.height = Math.round(r.height * dpr);
    this.dpr = dpr;
    // fit the device at its widest (45 degrees) so turning it never clips
    var sp = Math.sin(this.pitch), cp = Math.cos(this.pitch), half = (L * Math.SQRT2) / 2;
    var wU = L * Math.SQRT2, top = -half * sp - TRAVEL * cp, bot = half * sp + BOX * cp;
    this.k = Math.min((this.cv.width * 0.9) / wU, (this.cv.height * 0.92) / (bot - top));
    this.cx = this.cv.width / 2;
    this.cy = this.cv.height / 2 - ((top + bot) / 2) * this.k;
  };

  Device.prototype.project = function (x, y, z) {
    var c = Math.cos(this.yaw), s = Math.sin(this.yaw), xr = x * c - z * s, zr = x * s + z * c;
    return [this.cx + xr * this.k, this.cy + (zr * Math.sin(this.pitch) - y * Math.cos(this.pitch)) * this.k, zr];
  };

  // the world point (on a level plane at height y) under a screen point
  Device.prototype.unproject = function (sx, sy, y) {
    var c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    var xr = (sx - this.cx) / this.k, zr = ((sy - this.cy) / this.k + y * Math.cos(this.pitch)) / Math.sin(this.pitch);
    return { x: xr * c + zr * s, z: -xr * s + zr * c };
  };

  Device.prototype.top = function (i) {
    return REST + this.h[i] * (TRAVEL - REST);
  };

  function cell(i) {
    return { x: (i % N) - C, z: Math.floor(i / N) - C };
  }

  // ---- what each mode asks of the pins (0 = down, 1 = full travel) ----
  Device.prototype.goals = function (dt) {
    var g = this.goal, t = this.t, i, p, d;
    var mode = this.mode === "demo" ? this.demoMode() : this.mode;
    if (this.mode === "demo" && this.hand) mode = "hand";
    for (i = 0; i < N * N; i++) {
      p = cell(i);
      if (mode === "draw") g[i] = this.drawn[i];
      else if (mode === "hand") {
        d = this.hand ? Math.hypot(p.x - this.hand.x, p.z - this.hand.z) : 9;
        g[i] = Math.pow(clamp(1 - d / 1.8, 0, 1), 1.3);
      } else if (mode === "wave") {
        var a = t * 0.16;
        g[i] = 0.5 + 0.5 * Math.sin(1.25 * (p.x * Math.cos(a) + p.z * Math.sin(a)) - t * 2.2);
      } else if (mode === "ripple") {
        d = Math.hypot(p.x - this.ripple.x, p.z - this.ripple.z);
        g[i] = 0.5 + 0.5 * Math.cos(1.7 * d - (t - this.ripple.t0) * 3);
      } else if (mode === "type" || mode === "glyph") g[i] = this.glyph.charAt(i) === "#" ? 1 : 0;
      else if (mode === "ball") g[i] = this.tilt(p);
    }
    if (mode === "ball") this.roll(dt);
  };

  // the hero cycles through a few patterns on its own
  Device.prototype.demoMode = function () {
    var seq = ["wave", "glyph:beam", "glyph:M", "glyph:I", "glyph:T", "ripple", "glyph:♥"], dur = [7, 2.6, 1.6, 1.6, 1.6, 6, 2.6];
    var total = dur.reduce(function (a, b) { return a + b; }), u = this.t % total, j = 0;
    while (u > dur[j]) u -= dur[j++];
    var m = seq[j];
    if (m.indexOf("glyph:") === 0) {
      this.glyph = m === "glyph:beam" ? BEAM : FONT[m.slice(6)];
      return "glyph";
    }
    return m;
  };

  // ball mode: the surface leans down toward the pointer, and the ball follows
  Device.prototype.tilt = function (p) {
    var b = this.ball, dir = this.hand ? { x: this.hand.x - b.x, z: this.hand.z - b.z } : { x: Math.cos(this.t * 0.7), z: Math.sin(this.t * 0.7) };
    var m = Math.hypot(dir.x, dir.z) || 1;
    return clamp(0.5 - (0.42 * ((p.x - b.x) * dir.x + (p.z - b.z) * dir.z)) / m / 2.2, 0, 1);
  };

  Device.prototype.surface = function (x, z) {
    // pin-top height under a world point, bilinear between pin centres
    var gx = clamp(x + C, 0, N - 1.001), gz = clamp(z + C, 0, N - 1.001), ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    var a = this.top(iz * N + ix), b = this.top(iz * N + ix + 1), c = this.top((iz + 1) * N + ix), d = this.top((iz + 1) * N + ix + 1);
    return a * (1 - fx) * (1 - fz) + b * fx * (1 - fz) + c * (1 - fx) * fz + d * fx * fz;
  };

  Device.prototype.roll = function (dt) {
    var b = this.ball, e = 0.05, lim = C + 0.3;
    var gx = (this.surface(b.x + e, b.z) - this.surface(b.x - e, b.z)) / (2 * e), gz = (this.surface(b.x, b.z + e) - this.surface(b.x, b.z - e)) / (2 * e);
    b.vx += -gx * 9 * dt;
    b.vz += -gz * 9 * dt;
    b.vx *= 1 - 1.2 * dt;
    b.vz *= 1 - 1.2 * dt;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    if (Math.abs(b.x) > lim) {
      b.x = clamp(b.x, -lim, lim);
      b.vx *= -0.45;
    }
    if (Math.abs(b.z) > lim) {
      b.z = clamp(b.z, -lim, lim);
      b.vz *= -0.45;
    }
  };

  // ---- motors: each pin chases its goal at a limited speed, easing in and out ----
  Device.prototype.step = function (dt) {
    this.t += dt;
    this.goals(dt);
    var vmax = this.speed, acc = vmax * 7, moving = 0;
    for (var i = 0; i < N * N; i++) {
      var want = clamp((this.goal[i] * this.travel - this.h[i]) * 6, -vmax, vmax);
      var dv = clamp(want - this.v[i], -acc * dt, acc * dt);
      this.v[i] += dv;
      this.h[i] = clamp(this.h[i] + this.v[i] * dt, 0, 1);
      moving += Math.abs(this.v[i]);
    }
    this.moving = moving;
  };

  // ---- drawing ----
  var LIGHT = { x: -0.55, z: -0.83 }; // from the back left

  function shade(rgb, nx, nz, base) {
    var f = base + 0.16 * -(nx * LIGHT.x + nz * LIGHT.z);
    return "rgb(" + rgb.map(function (c) { return Math.round(c * f); }).join(",") + ")";
  }

  Device.prototype.poly = function (pts, fill, stroke) {
    var c = this.ctx;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.stroke();
    }
  };

  // the side faces of an upright box, from y0 to y1, that face the viewer
  Device.prototype.sides = function (x0, z0, x1, z1, y0, y1, rgb, stroke) {
    var s = Math.sin(this.yaw), c = Math.cos(this.yaw), self = this;
    [[x0, z0, x1, z0, 0, -1], [x1, z0, x1, z1, 1, 0], [x1, z1, x0, z1, 0, 1], [x0, z1, x0, z0, -1, 0]].forEach(function (f) {
      if (f[4] * s + f[5] * c <= 0) return; // faces away
      self.poly([self.project(f[0], y0, f[1]), self.project(f[2], y0, f[3]), self.project(f[2], y1, f[3]), self.project(f[0], y1, f[1])], shade(rgb, f[4], f[5], 0.86), stroke);
    });
  };

  Device.prototype.quad = function (x0, z0, x1, z1, y) {
    return [this.project(x0, y, z0), this.project(x1, y, z0), this.project(x1, y, z1), this.project(x0, y, z1)];
  };

  Device.prototype.draw = function () {
    var ctx = this.ctx, k = this.k, H = L / 2, i;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, this.dpr * 0.75);
    var edge = "rgba(30, 28, 24, 0.22)";

    // a soft shadow on the table
    var fp = this.quad(-H, -H, H, H, -BOX), off = this.cv.width * 3;
    ctx.save();
    ctx.shadowColor = "rgba(40, 36, 28, 0.28)";
    ctx.shadowBlur = k * 0.9;
    ctx.shadowOffsetX = off;
    ctx.shadowOffsetY = k * 0.25;
    ctx.translate(-off, 0);
    this.poly(fp, "#000");
    ctx.restore();

    // the housing: textured grey sides, a white grid on top
    this.sides(-H, -H, H, H, -BOX, 0, [214, 212, 206], edge);
    this.poly(this.quad(-H, -H, H, H, 0), "rgb(240, 239, 233)", edge);
    for (i = 0; i < N * N; i++) {
      var p = cell(i);
      this.poly(this.quad(p.x - OPEN / 2, p.z - OPEN / 2, p.x + OPEN / 2, p.z + OPEN / 2, 0), "rgb(176, 172, 162)");
    }

    // pins (and the ball), back to front
    var c = Math.cos(this.yaw), s = Math.sin(this.yaw), items = [];
    for (i = 0; i < N * N; i++) {
      p = cell(i);
      items.push({ i: i, d: p.x * s + p.z * c });
    }
    if (this.mode === "ball") items.push({ ball: true, d: this.ball.x * s + this.ball.z * c + 0.02 });
    items.sort(function (a, b) {
      return a.d - b.d;
    });
    this.order = items;
    var self = this;
    items.forEach(function (it) {
      if (it.ball) return self.drawBall();
      var p = cell(it.i), y = self.top(it.i), w = W / 2, sunk = y <= 0;
      if (sunk) {
        // below the grid: only what shows through the pin's opening
        ctx.save();
        self.poly(self.quad(p.x - OPEN / 2, p.z - OPEN / 2, p.x + OPEN / 2, p.z + OPEN / 2, 0), "rgb(176, 172, 162)");
        ctx.clip();
      } else self.sides(p.x - w, p.z - w, p.x + w, p.z + w, 0, y, [246, 245, 239], edge);
      self.poly(self.quad(p.x - w, p.z - w, p.x + w, p.z + w, y), sunk ? "rgb(226, 224, 216)" : "rgb(251, 250, 246)", edge);
      self.bore(p.x, p.z, y);
      if (sunk) ctx.restore();
    });
  };

  // the threaded bore in each cap
  Device.prototype.bore = function (x, z, y) {
    var o = this.project(x, y, z), ex = this.project(x + 1, y, z), ez = this.project(x, y, z + 1), ctx = this.ctx;
    ctx.save();
    ctx.setTransform(ex[0] - o[0], ex[1] - o[1], ez[0] - o[0], ez[1] - o[1], o[0], o[1]);
    ctx.beginPath();
    ctx.arc(0, 0, 0.27, 0, Math.PI * 2);
    ctx.fillStyle = y > 0 ? "rgb(214, 210, 199)" : "rgb(196, 193, 183)";
    ctx.fill();
    ctx.lineWidth = 0.025;
    ctx.strokeStyle = "rgba(120, 112, 98, 0.35)";
    for (var r = 0.1; r < 0.27; r += 0.055) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  Device.prototype.drawBall = function () {
    var b = this.ball, R = 0.34, y = this.surface(b.x, b.z), ctx = this.ctx;
    var o = this.project(b.x, y, b.z), ex = this.project(b.x + 1, y, b.z), ez = this.project(b.x, y, b.z + 1);
    ctx.save();
    ctx.setTransform(ex[0] - o[0], ex[1] - o[1], ez[0] - o[0], ez[1] - o[1], o[0], o[1]);
    ctx.beginPath();
    ctx.arc(0.05, 0.05, R * 0.95, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(40, 30, 20, 0.22)";
    ctx.fill();
    ctx.restore();
    var cpt = this.project(b.x, y + R, b.z), r = R * this.k, g = ctx.createRadialGradient(cpt[0] - r * 0.35, cpt[1] - r * 0.4, r * 0.1, cpt[0], cpt[1], r);
    g.addColorStop(0, "#ffb38a");
    g.addColorStop(0.45, "#ff5a1f");
    g.addColorStop(1, "#c23a0c");
    ctx.beginPath();
    ctx.arc(cpt[0], cpt[1], r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  };

  // the front-most pin whose outline holds a screen point
  Device.prototype.pick = function (sx, sy) {
    for (var j = this.order.length - 1; j >= 0; j--) {
      var it = this.order[j];
      if (it.ball) continue;
      var p = cell(it.i), w = W / 2, y = Math.max(0, this.top(it.i)), pts = [];
      [[-w, -w], [w, -w], [w, w], [-w, w]].forEach(function (q) {
        pts.push(this.project(p.x + q[0], 0, p.z + q[1]), this.project(p.x + q[0], y, p.z + q[1]));
      }, this);
      if (inHull(hull(pts), sx, sy)) return it.i;
    }
    return -1;
  };

  function hull(pts) {
    pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var cross = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    var lo = [], up = [], i;
    for (i = 0; i < pts.length; i++) {
      while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop();
      lo.push(pts[i]);
    }
    for (i = pts.length - 1; i >= 0; i--) {
      while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop();
      up.push(pts[i]);
    }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  function inHull(h, x, y) {
    for (var i = 0; i < h.length; i++) {
      var a = h[i], b = h[(i + 1) % h.length];
      if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
    }
    return h.length > 2;
  }

  // ------------------------------------------------------------ running devices

  var devices = [];
  function loop(now) {
    var dt = Math.min(0.05, (now - (loop.last || now)) / 1000);
    loop.last = now;
    devices.forEach(function (d) {
      if (!d.visible) return;
      d.step(dt);
      d.draw();
      if (d.after) d.after();
    });
    requestAnimationFrame(loop);
  }

  function attach(cv, mode) {
    var d = new Device(cv, mode);
    devices.push(d);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        d.visible = es[0].isIntersecting;
      }).observe(cv);
    } else d.visible = true;
    addEventListener("resize", function () {
      d.size();
    });
    return d;
  }

  function local(d, e) {
    var r = d.cv.getBoundingClientRect();
    return [(e.clientX - r.left) * d.dpr, (e.clientY - r.top) * d.dpr];
  }

  // ---- the hero: plays by itself; pins rise under a mouse ----
  var heroCv = document.querySelector(".mt-hero .mt-device");
  if (heroCv) {
    // with reduced motion it holds the poster's shape; otherwise it plays and turns a little
    var hero = attach(heroCv, reduceMotion ? "glyph" : "demo");
    if (!reduceMotion) {
      hero.after = function () {
        hero.yaw = -0.62 + Math.sin(hero.t * 0.12) * 0.22;
      };
    }
    heroCv.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var q = local(hero, e), w = hero.unproject(q[0], q[1], 0.6);
      hero.hand = Math.abs(w.x) < C + 1 && Math.abs(w.z) < C + 1 ? w : null;
    });
    heroCv.addEventListener("pointerleave", function () {
      hero.hand = null;
    });
  }

  // ---- the console ----
  var stage = document.querySelector(".mt-console");
  if (stage) console_(stage);

  function console_(root) {
    var cv = root.querySelector(".mt-device"), d = attach(cv, "draw"), hint = root.querySelector(".mt-hint");
    var lcdMode = root.querySelector(".mt-lcd__mode"), lcdStat = root.querySelector(".mt-lcd__stat"), lcdMap = root.querySelector(".mt-lcd__map");
    var typeBox = root.querySelector(".mt-type"), typeIn = root.querySelector(".mt-type input");
    var HINTS = {
      draw: "press a pin to raise it, press again to lower it. drag across pins to draw. drag the empty space to turn the device.",
      hand: "move over the pins. they rise under your hand, the way TRANSFORM mirrored people standing over it.",
      wave: "a travelling wave. turn speed up and the motors work harder; turn travel down and the wave flattens.",
      ripple: "press anywhere on the grid to drop a stone.",
      type: "type a letter or a number. the pins spell it.",
      ball: "move toward a side. the surface leans that way, and the ball rolls after you.",
    };

    // the LCD mirrors every pin
    var bars = [];
    for (var i = 0; i < N * N; i++) {
      var c = document.createElement("i");
      c.appendChild(document.createElement("b"));
      lcdMap.appendChild(c);
      bars.push(c.firstChild);
    }
    d.after = function () {
      var up = 0;
      for (var j = 0; j < N * N; j++) {
        bars[j].style.transform = "scaleY(" + (0.06 + d.h[j] * 0.94).toFixed(3) + ")";
        if (d.h[j] > 0.5) up++;
      }
      lcdStat.textContent = String(up).padStart(2, "0") + "/25 up";
      hum(d.moving);
    };

    // modes
    var keys = root.querySelectorAll(".mt-key");
    function setMode(m) {
      d.mode = m;
      keys.forEach(function (k) {
        var on = k.getAttribute("data-mode") === m;
        k.setAttribute("aria-checked", on);
        k.tabIndex = on ? 0 : -1;
      });
      lcdMode.textContent = m;
      hint.textContent = HINTS[m];
      typeBox.hidden = m !== "type";
      if (m === "type") d.glyph = FONT.M;
      if (m === "ripple") d.ripple = { x: 0, z: 0, t0: d.t };
      if (m === "ball") d.ball = { x: -1.4, z: 1.2, vx: 0, vz: 0 };
    }
    keys.forEach(function (k) {
      k.addEventListener("click", function () {
        setMode(k.getAttribute("data-mode"));
      });
    });
    root.querySelector(".mt-keys").addEventListener("keydown", function (e) {
      var list = Array.prototype.slice.call(keys), i = list.findIndex(function (k) { return k.getAttribute("aria-checked") === "true"; });
      var j = { ArrowRight: i + 1, ArrowDown: i + 3, ArrowLeft: i - 1, ArrowUp: i - 3 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      j = (j + list.length) % list.length;
      setMode(list[j].getAttribute("data-mode"));
      list[j].focus();
    });

    // keys 1-6 pick a mode; in type mode, letters go to the pins
    root.addEventListener("keydown", function (e) {
      if (e.target === typeIn || e.metaKey || e.ctrlKey || e.altKey) return;
      if (d.mode === "type" && e.key.length === 1 && FONT[e.key.toUpperCase()]) {
        d.glyph = FONT[e.key.toUpperCase()];
        return;
      }
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= keys.length && e.target.tagName !== "INPUT") setMode(keys[n - 1].getAttribute("data-mode"));
    });
    typeIn.addEventListener("input", function () {
      var ch = typeIn.value.slice(-1).toUpperCase();
      if (FONT[ch]) d.glyph = FONT[ch];
      typeIn.value = typeIn.value.slice(-1);
    });

    // knobs: drag up or down, scroll, or use the arrow keys
    root.querySelectorAll(".mt-knob").forEach(function (kn) {
      var min = +kn.getAttribute("aria-valuemin"), max = +kn.getAttribute("aria-valuemax"), val = +kn.getAttribute("aria-valuenow"), out = kn.parentNode.querySelector(".mt-knob__val");
      var dial = kn.querySelector(".mt-knob__dial"), what = kn.getAttribute("data-knob");
      function set(v) {
        // the view turns all the way round; the others stop at their ends
        val = what === "view" ? ((((v + 180) % 360) + 360) % 360) - 180 : clamp(v, min, max);
        kn.setAttribute("aria-valuenow", Math.round(val));
        var u = (val - min) / (max - min);
        dial.style.transform = "rotate(" + (-135 + u * 270) + "deg)";
        if (what === "speed") {
          d.speed = 0.25 + u * 2.25;
          out.textContent = d.speed.toFixed(1) + "×";
        } else if (what === "travel") {
          d.travel = 0.15 + u * 0.85;
          out.textContent = Math.round(d.travel * 100) + "%";
        } else {
          d.yaw = (val * Math.PI) / 180;
          out.textContent = Math.round(((val % 360) + 360) % 360) + "°";
        }
        kn.setAttribute("aria-valuetext", out.textContent);
      }
      set(val);
      kn.set = set;
      var y0 = 0, v0 = 0;
      kn.addEventListener("pointerdown", function (e) {
        kn.setPointerCapture(e.pointerId);
        y0 = e.clientY;
        v0 = val;
      });
      kn.addEventListener("pointermove", function (e) {
        if (!kn.hasPointerCapture(e.pointerId)) return;
        set(v0 + ((y0 - e.clientY) / 160) * (max - min));
      });
      kn.addEventListener("wheel", function (e) {
        e.preventDefault();
        set(val - (Math.sign(e.deltaY) * (max - min)) / 40);
      }, { passive: false });
      kn.addEventListener("keydown", function (e) {
        var step = (max - min) / 20, m = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: step * 4, PageDown: -step * 4 }[e.key];
        if (m === undefined) return;
        e.preventDefault();
        set(val + m);
      });
    });
    var viewKnob = root.querySelector('.mt-knob[data-knob="view"]');

    // the canvas: draw on pins, drop ripples, turn the device on empty space
    var paint = null, orbit = null;
    cv.addEventListener("pointerdown", function (e) {
      var q = local(d, e), hit = d.mode === "draw" ? d.pick(q[0], q[1]) : -1;
      cv.setPointerCapture(e.pointerId);
      if (hit >= 0) {
        paint = d.drawn[hit] > 0.5 ? 0 : 1;
        d.drawn[hit] = paint;
      } else if (d.mode === "ripple") {
        var w = d.unproject(q[0], q[1], 0.4);
        d.ripple = { x: clamp(w.x, -C, C), z: clamp(w.z, -C, C), t0: d.t };
      } else if (d.mode !== "hand" && d.mode !== "ball") {
        orbit = { x: e.clientX, yaw: +viewKnob.getAttribute("aria-valuenow") };
      }
      move(e);
    });
    function move(e) {
      var q = local(d, e);
      if (d.mode === "hand" || d.mode === "ball") {
        var w = d.unproject(q[0], q[1], 0.6);
        d.hand = { x: clamp(w.x, -C - 1, C + 1), z: clamp(w.z, -C - 1, C + 1) };
      }
      if (paint !== null) {
        var hit = d.pick(q[0], q[1]);
        if (hit >= 0) d.drawn[hit] = paint;
      }
      if (orbit) viewKnob.set(orbit.yaw - (e.clientX - orbit.x) * 0.5);
    }
    cv.addEventListener("pointermove", move);
    function up() {
      paint = null;
      orbit = null;
    }
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "mouse" && d.mode !== "ball") d.hand = null;
    });

    root.querySelector('[data-mt="clear"]').addEventListener("click", function () {
      d.drawn.fill(0);
      if (d.mode !== "draw") setMode("draw");
    });

    // sound (off until asked): one hum for all the motors, louder as more pins move
    var audio = null, gain = null, soundBtn = root.querySelector('[data-mt="sound"]');
    soundBtn.addEventListener("click", function () {
      var on = soundBtn.getAttribute("aria-pressed") !== "true";
      soundBtn.setAttribute("aria-pressed", on);
      soundBtn.textContent = on ? "sound on" : "sound off";
      if (on && !audio) {
        audio = new (window.AudioContext || window.webkitAudioContext)();
        var o = audio.createOscillator(), o2 = audio.createOscillator(), f = audio.createBiquadFilter();
        gain = audio.createGain();
        o.type = "sawtooth";
        o.frequency.value = 118;
        o2.type = "square";
        o2.frequency.value = 237;
        f.type = "lowpass";
        f.frequency.value = 900;
        gain.gain.value = 0;
        o.connect(f);
        o2.connect(f);
        f.connect(gain).connect(audio.destination);
        o.start();
        o2.start();
      }
      if (audio) audio[on ? "resume" : "suspend"]();
    });
    function hum(m) {
      if (!gain) return;
      gain.gain.setTargetAtTime(Math.min(0.09, m * 0.012), audio.currentTime, 0.05);
    }

    // draw a first shape so the device isn't blank
    BEAM.split("").forEach(function (ch, j) {
      d.drawn[j] = ch === "#" ? 1 : 0;
    });
    setMode("draw");
  }

  // ------------------------------------------------------------ the film: a poster until asked

  var play = document.querySelector(".mt-film__play");
  if (play) {
    play.addEventListener("click", function (e) {
      e.preventDefault();
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + play.getAttribute("data-video") + "?autoplay=1&rel=0&playsinline=1";
      f.title = "Mini TRANSFORM, the film";
      f.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      f.allowFullscreen = true;
      play.replaceWith(f);
      f.focus();
    });
  }

  requestAnimationFrame(loop);
})();

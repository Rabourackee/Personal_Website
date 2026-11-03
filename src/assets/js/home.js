// Homepage: the pin table in the hero, and the selected-works console.
//
// The pin table is a shape display, 35 × 20 square pins in a tray, drawn on a
// canvas in an orthographic three-quarter view. Each pin is driven like an
// actuator (a damped spring with a speed limit) towards a target height that
// the current mode sets: the name, a wave, your own text, or your drawing.
// The pointer is a hand under the table: pins near it rise and light orange.
// Pin tops take the "projection" (black letters, orange where you touch), the
// sides stay grey, as on a projector-lit shape display.
(function () {
  "use strict";
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  var hero = document.querySelector(".hh");
  if (hero) pinTable(hero);
  var console_ = document.querySelector(".hs");
  if (console_) selectedWorks(console_);

  /* ================================================================ pin table */

  function pinTable(hero) {
    var stage = hero.querySelector(".hh-stage");
    var canvas = hero.querySelector(".hh-canvas");
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Wide screens get a 35 × 20 table with the name on two lines; narrow ones
    // a 25 × 29 table with it on three (see build()).
    var COLS, ROWS, N, MARGIN, MID;
    var S = 0.42;        // half a pin's width, in cells
    var HMAX = 1.7;      // pin travel, in cells
    var BASE = 0.16;     // how far a lowered pin still stands out
    var TRAY = 0.55;     // tray thickness
    var RIM = 0.95;      // tray margin around the pins

    // 5 × 7 font: seven rows, top to bottom, five bits each (16 = left).
    var FONT = {
      A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
      D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
      G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
      J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
      M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
      P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
      S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
      V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
      Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
      0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
      3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
      6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
      9: [14, 17, 17, 15, 1, 2, 12],
      " ": [0, 0, 0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12], ",": [0, 0, 0, 0, 12, 4, 8],
      "·": [0, 0, 0, 12, 12, 0, 0], "-": [0, 0, 0, 14, 0, 0, 0], "!": [4, 4, 4, 4, 4, 0, 4],
      "?": [14, 17, 1, 2, 4, 0, 4], "&": [12, 18, 20, 8, 21, 18, 13], "'": [4, 4, 8, 0, 0, 0, 0],
      ":": [0, 12, 12, 0, 12, 12, 0], "/": [1, 1, 2, 4, 8, 16, 16], "+": [0, 4, 4, 31, 4, 4, 0],
      "@": [14, 17, 23, 21, 23, 16, 15], "#": [10, 31, 10, 10, 31, 10, 0], "♥": [0, 10, 31, 31, 14, 4, 0]
    };

    // A line of text as columns of 7-bit masks (bit 0 = top row).
    function textColumns(str) {
      var out = [];
      for (var k = 0; k < str.length; k++) {
        var g = FONT[str[k]];
        if (!g) continue;
        for (var x = 0; x < 5; x++) {
          var m = 0;
          for (var y = 0; y < 7; y++) if ((g[y] >> (4 - x)) & 1) m |= 1 << y;
          out.push(m);
        }
        out.push(0);
      }
      out.pop();
      return out;
    }

    function stamp(grid, cols, c0, r0) {
      for (var x = 0; x < cols.length; x++) {
        var c = c0 + x;
        if (c < 0 || c >= COLS) continue;
        for (var y = 0; y < 7; y++) {
          if ((cols[x] >> y) & 1 && r0 + y >= 0 && r0 + y < ROWS) grid[(r0 + y) * COLS + c] = 1;
        }
      }
    }

    // ---------------------------------------------------------- state
    var NAME, h, v, tgt, ink, inkT, heat, heatT, paint, text, reveal, order, introEnd = 0;
    var portrait = null;
    var dimEl = hero.querySelector(".hh-dim");
    var ripples = [];
    var mode = "name";
    var hand = { on: false, x: 0, z: 0 };
    var drawing = null; // 1 = raising, 0 = lowering, null = not drawing
    var marquee = null, marqueeX = 0;
    var t0 = performance.now(), now = 0, last = 0, lastPoke = 0;
    var visible = true, running = false;

    // ---------------------------------------------------------- camera
    var BASE_YAW = -0.2, BASE_PITCH = 0.86;
    var cam = { yaw: BASE_YAW, pitch: BASE_PITCH }, camT = { yaw: BASE_YAW, pitch: BASE_PITCH };
    var W = 0, H = 0, dpr = 1, k = 1, ox = 0, oy = 0;
    var P = { a: 0, b: 0, c: 0, d: 0, hz: 0 };

    function setProjection(yaw, pitch) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
      P.a = k * cy; P.c = -k * sy;
      P.b = k * sy * sp; P.d = k * cy * sp;
      P.hz = k * cp;
    }

    // Size the table to the stage, using the resting camera.
    function fit() {
      var rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      build(W < 640);
      dpr = Math.min(window.devicePixelRatio || 1, slow ? 1 : 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      k = 1;
      setProjection(BASE_YAW, BASE_PITCH);
      var xs = [], ys = [];
      var hx = COLS / 2 + RIM, hzr = ROWS / 2 + RIM;
      [[-hx, -hzr], [hx, -hzr], [hx, hzr], [-hx, hzr]].forEach(function (q) {
        var sx = P.a * q[0] + P.c * q[1], sy = P.b * q[0] + P.d * q[1];
        xs.push(sx); ys.push(sy + P.hz * TRAY, sy - P.hz * (BASE + HMAX));
      });
      var bw = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      var bh = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      var narrow = W < 700;
      k = Math.min((W * (narrow ? 1.0 : 0.94)) / bw, (H * 0.9) / bh);
      ox = W / 2 - k * (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2;
      oy = H / 2 - k * (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2;
      buildShadow();
      wake();
    }

    // (Re)build the table for the screen's shape. On first build the name
    // rises column by column, left to right.
    function build(tall) {
      if (tall === portrait) return;
      var first = portrait === null;
      portrait = tall;
      COLS = tall ? 25 : 35;
      ROWS = tall ? 29 : 20;
      N = COLS * ROWS;
      MARGIN = tall ? 1 : 3;
      MID = Math.floor((ROWS - 7) / 2);
      NAME = new Uint8Array(N);
      var lines = tall ? ["YU", "HAN", "WANG"] : ["YUHAN", "WANG"];
      lines.forEach(function (word, n) {
        stamp(NAME, textColumns(word), MARGIN, 2 + n * 9);
      });
      h = new Float32Array(N); v = new Float32Array(N); tgt = new Float32Array(N);
      ink = new Float32Array(N); inkT = new Float32Array(N);
      heat = new Float32Array(N); heatT = new Float32Array(N);
      paint = new Uint8Array(N); text = new Uint8Array(N);
      reveal = new Float32Array(N);
      introEnd = 0;
      for (var i = 0; i < N; i++) {
        var c = i % COLS, r = (i / COLS) | 0;
        reveal[i] = reduceMotion || !first ? 0 : 0.25 + c * 0.03 + r * 0.012;
        introEnd = Math.max(introEnd, reveal[i]);
      }
      if (!first) {
        // a rotated phone: start the new table where the old one was going
        for (var j = 0; j < N; j++) h[j] = NAME[j];
        ripples.length = 0;
      }
      // painter's order: far pins first, fixed since the camera stays in one quadrant
      var sy = Math.sin(BASE_YAW), cy = Math.cos(BASE_YAW);
      var depth = new Float32Array(N);
      order = [];
      for (var q = 0; q < N; q++) {
        depth[q] = ((q % COLS) - (COLS - 1) / 2) * sy + (((q / COLS) | 0) - (ROWS - 1) / 2) * cy;
        order.push(q);
      }
      order.sort(function (p, q) { return depth[p] - depth[q]; });
      if (dimEl) dimEl.textContent = "· " + COLS + " × " + ROWS + " pins";
      if (mode === "type") setText(typeInput.value);
    }

    // The soft shadow under the tray, blurred once and laid on the floor plane.
    var shadow = document.createElement("canvas");
    function buildShadow() {
      var sw = 300, sh = 200, pad = 50;
      shadow.width = sw; shadow.height = sh;
      var g = shadow.getContext("2d");
      g.clearRect(0, 0, sw, sh);
      g.shadowColor = "rgba(0,0,0,0.42)";
      g.shadowBlur = 26;
      g.shadowOffsetX = 2000;
      g.fillStyle = "#000";
      g.fillRect(pad - 2000, pad, sw - pad * 2, sh - pad * 2);
    }

    // ---------------------------------------------------------- pattern
    function setText(str) {
      str = (str || "").toUpperCase();
      text.fill(0);
      marquee = null;
      var words = str.trim().split(/\s+/).filter(Boolean);
      var cols = textColumns(str.trim());
      if (!str.trim()) {
        marquee = textColumns("ARCHITECTURE · XR · PHYSICAL INTERACTION · AI · ");
      } else if (cols.length <= COLS - 2 * MARGIN) {
        stamp(text, cols, Math.floor((COLS - cols.length) / 2), MID);
      } else if (words.length >= 2) {
        // two lines, split where the halves come out most even
        var best = null;
        for (var s = 1; s < words.length; s++) {
          var a = textColumns(words.slice(0, s).join(" ")), b = textColumns(words.slice(s).join(" "));
          var w = Math.max(a.length, b.length);
          if (w <= COLS - 2 * MARGIN && (!best || w < best.w)) best = { a: a, b: b, w: w };
        }
        if (best) {
          var top = Math.floor((ROWS - 16) / 2);
          stamp(text, best.a, MARGIN, top);
          stamp(text, best.b, MARGIN, top + 9);
        } else {
          marquee = textColumns(str.trim() + "   ");
        }
      } else {
        marquee = textColumns(str.trim() + "   ");
      }
      marqueeX = 0;
      wake();
    }

    function patternAt(i, c, r, t) {
      switch (mode) {
        case "wave": {
          var w = 0.5 + 0.5 * Math.sin(c * 0.36 - t * 2.1 + Math.sin(r * 0.33 + t * 0.6) * 1.4);
          return 0.12 + w * 0.42 + NAME[i] * 0.42;
        }
        case "type":
          return text[i];
        case "draw":
          return paint[i];
        default:
          return NAME[i];
      }
    }

    function inkAt(i) {
      if (mode === "draw") return 0;
      if (mode === "type") return text[i];
      return NAME[i];
    }

    // ---------------------------------------------------------- simulation
    function step(dt, t) {
      if (mode === "type" && marquee) {
        marqueeX += dt * (reduceMotion ? 0 : 9);
        var span = marquee.length + 6, off = Math.floor(marqueeX) % span;
        text.fill(0);
        var cols = [];
        for (var x = 0; x < COLS; x++) {
          var src = (x + off) % span;
          cols.push(src < marquee.length ? marquee[src] : 0);
        }
        stamp(text, cols, 0, MID);
      }

      for (var i = 0; i < N; i++) {
        var c = i % COLS, r = (i / COLS) | 0;
        var on = t >= reveal[i];
        tgt[i] = on ? patternAt(i, c, r, t) : 0;
        inkT[i] = on ? inkAt(i) : 0;
        heatT[i] = mode === "draw" ? paint[i] : 0;
      }

      // the hand under the table
      if (hand.on) {
        var R = mode === "draw" ? 1.2 : 2.7;
        for (var j = 0; j < N; j++) {
          var dx = (j % COLS) - (COLS - 1) / 2 - hand.x, dz = ((j / COLS) | 0) - (ROWS - 1) / 2 - hand.z;
          var d2 = (dx * dx + dz * dz) / (R * R);
          if (d2 >= 1) continue;
          var f = (1 - d2) * (1 - d2);
          if (mode === "draw") {
            heatT[j] = Math.max(heatT[j], f * 0.55);
          } else {
            tgt[j] = Math.max(tgt[j], Math.min(1, tgt[j] + f * 0.85));
            heatT[j] = Math.max(heatT[j], f);
          }
        }
      }

      // ripples: a ring of pins that rises as it passes
      for (var q = ripples.length - 1; q >= 0; q--) {
        var rp = ripples[q], age = t - rp.t;
        if (age > 3.2) { ripples.splice(q, 1); continue; }
        var radius = age * 10.5, amp = rp.amp * Math.exp(-age * 1.15);
        for (var p = 0; p < N; p++) {
          var ex = (p % COLS) - (COLS - 1) / 2 - rp.x, ez = ((p / COLS) | 0) - (ROWS - 1) / 2 - rp.z;
          var dd = Math.sqrt(ex * ex + ez * ez) - radius;
          if (dd < -3 || dd > 3) continue;
          var ring = Math.exp(-(dd * dd) / 1.6) * amp;
          tgt[p] = Math.min(1.1, tgt[p] + ring);
          if (rp.hot) heatT[p] = Math.max(heatT[p], ring * 1.3);
        }
      }

      // pins move like actuators: spring, damping, a speed limit
      var K = 74, D = 13.5, VMAX = 3.4, moving = false;
      for (var m = 0; m < N; m++) {
        if (reduceMotion && !hand.on && !ripples.length) {
          h[m] = tgt[m]; v[m] = 0;
        } else {
          var a = K * (tgt[m] - h[m]) - D * v[m];
          v[m] += a * dt;
          if (v[m] > VMAX) v[m] = VMAX; else if (v[m] < -VMAX) v[m] = -VMAX;
          h[m] += v[m] * dt;
        }
        ink[m] += (inkT[m] - ink[m]) * Math.min(1, dt * 9);
        heat[m] += (heatT[m] - heat[m]) * Math.min(1, dt * (heatT[m] > heat[m] ? 16 : 3.2));
        if (Math.abs(tgt[m] - h[m]) > 0.002 || Math.abs(v[m]) > 0.002 ||
            Math.abs(inkT[m] - ink[m]) > 0.004 || Math.abs(heatT[m] - heat[m]) > 0.004) moving = true;
      }
      return moving;
    }

    // ---------------------------------------------------------- drawing
    function rgb(r, g, b) {
      return "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")";
    }

    function quad(x1, y1, x2, y2, x3, y3, x4, y4, fill) {
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }

    function render(busy) {
      setProjection(cam.yaw, cam.pitch);
      var a = P.a, b = P.b, c = P.c, d = P.d, hz = P.hz;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      var hx = COLS / 2 + RIM, hzr = ROWS / 2 + RIM;
      var gx = function (x, z) { return ox + a * x + c * z; };
      var gy = function (x, z, y) { return oy + b * x + d * z - hz * (y || 0); };

      // shadow on the floor below the tray, pushed forward and right
      ctx.save();
      ctx.setTransform(dpr * a, dpr * b, dpr * c, dpr * d, dpr * (ox + 0.6 * k), dpr * (oy + hz * (TRAY + 0.2) + 0.9 * k));
      var sx0 = -hx - 3.2, sz0 = -hzr - 2.2;
      ctx.drawImage(shadow, sx0, sz0, (hx + 3.2) * 2, (hzr + 2.2) * 2);
      ctx.restore();

      // tray: left and front edges, then the top
      var L = -hx, R = hx, B = -hzr, F = hzr;
      quad(gx(L, B), gy(L, B), gx(L, F), gy(L, F), gx(L, F), gy(L, F, -TRAY), gx(L, B), gy(L, B, -TRAY), "#c3c4c6");
      quad(gx(L, F), gy(L, F), gx(R, F), gy(R, F), gx(R, F), gy(R, F, -TRAY), gx(L, F), gy(L, F, -TRAY), "#b1b2b4");
      quad(gx(L, B), gy(L, B), gx(R, B), gy(R, B), gx(R, F), gy(R, F), gx(L, F), gy(L, F), "#d2d3d4");
      // a light chamfer along the front and left top edges
      ctx.beginPath();
      ctx.moveTo(gx(L, B), gy(L, B)); ctx.lineTo(gx(L, F), gy(L, F)); ctx.lineTo(gx(R, F), gy(R, F));
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = Math.max(1, k * 0.06);
      ctx.stroke();

      // printing on the front rim, and a status LED that lights while pins move
      ctx.save();
      var Q = 40, rimZ = (ROWS / 2 + RIM * 0.5) * Q;
      ctx.setTransform((dpr * a) / Q, (dpr * b) / Q, (dpr * c) / Q, (dpr * d) / Q, dpr * ox, dpr * oy);
      ctx.font = "500 " + 0.34 * Q + "px 'Geist Mono Variable', ui-monospace, monospace";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillText("YUHAN WANG  ·  35 × 20", (-COLS / 2) * Q, rimZ);
      ctx.fillStyle = busy ? "#ff5722" : "#a9aaac";
      ctx.fillRect((COLS / 2 - 0.42) * Q, rimZ - 0.21 * Q, 0.42 * Q, 0.42 * Q);
      ctx.restore();

      // the well the pins stand in
      var wl = -COLS / 2, wr = COLS / 2, wb = -ROWS / 2, wf = ROWS / 2;
      quad(gx(wl, wb), gy(wl, wb), gx(wr, wb), gy(wr, wb), gx(wr, wf), gy(wr, wf), gx(wl, wf), gy(wl, wf), "#8d8e90");

      // corner offsets of a pin's footprint, in screen space
      var oLx = -a * S, oLy = -b * S, oRx = a * S, oRy = b * S; // -x / +x
      var oBx = -c * S, oBy = -d * S, oFx = c * S, oFy = d * S; // -z / +z

      for (var n = 0; n < N; n++) {
        var i = order[n];
        var col = i % COLS, row = (i / COLS) | 0;
        var x = col - (COLS - 1) / 2, z = row - (ROWS - 1) / 2;
        var px = ox + a * x + c * z, py = oy + b * x + d * z;
        var hh = h[i] < -0.05 ? -0.05 : h[i];
        var top = hz * (BASE + hh * HMAX);

        // shade from taller neighbours behind and to the left (the light is back-left)
        var occ = 0, nb;
        if (row > 0 && (nb = h[i - COLS] - hh) > occ) occ = nb;
        if (col > 0 && (nb = h[i - 1] - hh) > occ) occ = nb;
        if (row > 0 && col > 0 && (nb = h[i - COLS - 1] - hh) * 0.6 > occ) occ = nb * 0.6;
        occ = occ > 0.8 ? 0.8 : occ;
        var tone = 1 - occ * 0.15;

        var e = heat[i] > 1 ? 1 : heat[i], kI = ink[i] * (1 - e);
        // top: grey, projected black where letters are, orange where touched
        var tr = 244 * tone, tg = 244 * tone, tb = 244 * tone;
        tr += (20 - tr) * kI; tg += (20 - tg) * kI; tb += (20 - tb) * kI;
        tr += (255 - tr) * e; tg += (87 - tg) * e; tb += (34 - tb) * e;
        // sides: lit from the left, warmed a little by the orange above
        var lr = 214 * tone, lg = 215 * tone, lb = 216 * tone;
        var fr = 186 * tone, fg = 187 * tone, fb = 189 * tone;
        var w = e * 0.12;
        lr += (240 - lr) * w; lg += (120 - lg) * w; lb += (80 - lb) * w;
        fr += (214 - fr) * w; fg += (96 - fg) * w; fb += (60 - fb) * w;

        var blx = px + oLx + oFx, bly = py + oLy + oFy; // front-left
        var brx = px + oRx + oFx, bry = py + oRy + oFy; // front-right
        var tlx = px + oLx + oBx, tly = py + oLy + oBy; // back-left
        var trx = px + oRx + oBx, try_ = py + oRy + oBy; // back-right

        quad(tlx, tly - top, blx, bly - top, blx, bly, tlx, tly, rgb(lr, lg, lb));
        quad(blx, bly - top, brx, bry - top, brx, bry, blx, bly, rgb(fr, fg, fb));
        quad(tlx, tly - top, trx, try_ - top, brx, bry - top, blx, bly - top, rgb(tr, tg, tb));
      }
    }

    // ---------------------------------------------------------- loop
    var upEl = hero.querySelector(".hh-up"), lastUp = -1, readoutAt = 0;
    var slow = false, slowFrames = 0;

    function frame(ms) {
      running = false;
      if (!visible) return;
      now = (ms - t0) / 1000;
      var dt = Math.min(1 / 30, Math.max(0.001, now - last));
      last = now;

      // the camera leans gently towards the pointer
      cam.yaw += (camT.yaw - cam.yaw) * Math.min(1, dt * 4);
      cam.pitch += (camT.pitch - cam.pitch) * Math.min(1, dt * 4);
      var camMoving = Math.abs(camT.yaw - cam.yaw) + Math.abs(camT.pitch - cam.pitch) > 0.0004;

      var t1 = performance.now();
      var moving = step(dt, now);
      render(moving);
      var cost = performance.now() - t1;
      if (!slow && cost > 22 && ++slowFrames > 20) {
        slow = true;
        fit();
      }

      if (now - readoutAt > 0.12) {
        readoutAt = now;
        var up = 0;
        for (var i = 0; i < N; i++) if (h[i] > 0.5) up++;
        if (up !== lastUp && upEl) upEl.textContent = String(up).padStart(3, "0");
        lastUp = up;
      }

      var animated = mode === "wave" || (mode === "type" && marquee);
      var intro = now < introEnd;
      if (moving || intro || camMoving || ripples.length || hand.on || (animated && !reduceMotion)) wake();
    }

    // When nobody is touching the name, a slow wave passes now and then.
    if (!reduceMotion) {
      setInterval(function () {
        var t = (performance.now() - t0) / 1000;
        if (!visible || mode !== "name" || hand.on || t - lastPoke < 5 || t < 4) return;
        ripples.push({ x: (Math.random() - 0.5) * COLS, z: (Math.random() - 0.5) * ROWS, t: now = t, amp: 0.32, hot: false });
        wake();
      }, 6500);
    }

    function wake() {
      if (running || !visible) return;
      running = true;
      requestAnimationFrame(frame);
    }

    // ---------------------------------------------------------- pointer
    function toGround(e) {
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left, sy = e.clientY - rect.top + P.hz * (BASE + 0.35 * HMAX);
      var det = P.a * P.d - P.b * P.c;
      var X = sx - ox, Y = sy - oy;
      return { x: (P.d * X - P.c * Y) / det, z: (-P.b * X + P.a * Y) / det };
    }

    function pinAt(g) {
      var c = Math.round(g.x + (COLS - 1) / 2), r = Math.round(g.z + (ROWS - 1) / 2);
      return c < 0 || r < 0 || c >= COLS || r >= ROWS ? -1 : r * COLS + c;
    }

    function inside(g) {
      return Math.abs(g.x) < COLS / 2 + 0.5 && Math.abs(g.z) < ROWS / 2 + 0.5;
    }

    function paintAt(g) {
      var i = pinAt(g);
      if (i < 0) return;
      if (drawing === null) drawing = paint[i] ? 0 : 1;
      paint[i] = drawing;
    }

    canvas.addEventListener("pointermove", function (e) {
      var g = toGround(e);
      hand.on = inside(g);
      hand.x = g.x; hand.z = g.z;
      if (hand.on) lastPoke = now;
      if (drawing !== null) paintAt(g);
      wake();
    });
    canvas.addEventListener("pointerleave", function () {
      hand.on = false;
      wake();
    });
    canvas.addEventListener("pointerdown", function (e) {
      var g = toGround(e);
      if (!inside(g)) return;
      lastPoke = now;
      if (mode === "draw") {
        drawing = null;
        paintAt(g);
        canvas.setPointerCapture(e.pointerId);
      } else {
        ripples.push({ x: g.x, z: g.z, t: now, amp: 0.75, hot: true });
        if (ripples.length > 8) ripples.shift();
      }
      wake();
    });
    function stopDrawing() {
      drawing = null;
      if (mode === "draw") hand.on = false;
    }
    canvas.addEventListener("pointerup", stopDrawing);
    canvas.addEventListener("pointercancel", stopDrawing);

    if (!reduceMotion) {
      hero.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        var rect = stage.getBoundingClientRect();
        var nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        var ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        nx = Math.max(-1, Math.min(1, nx)); ny = Math.max(-1, Math.min(1, ny));
        camT.yaw = BASE_YAW + nx * 0.07;
        camT.pitch = BASE_PITCH - ny * 0.05;
        wake();
      });
      hero.addEventListener("pointerleave", function () {
        camT.yaw = BASE_YAW; camT.pitch = BASE_PITCH;
        wake();
      });
    }

    // ---------------------------------------------------------- keys
    var keys = hero.querySelectorAll(".hh-keys [data-mode]");
    var typeBox = hero.querySelector(".hh-type"), typeInput = typeBox.querySelector("input");
    var hint = hero.querySelector(".hh-hint");
    var HINTS = {
      name: "move over the pins to push them up · click to send a wave",
      wave: "the whole table in motion · your hand still lifts the pins",
      type: "type below and the pins spell it out",
      draw: "drag across the pins to raise them · press draw again to clear"
    };

    function setMode(m) {
      if (m === "draw" && mode === "draw") {
        paint.fill(0);
        hint.textContent = "cleared · drag across the pins to raise them";
        return wake();
      }
      mode = m;
      keys.forEach(function (k) {
        k.setAttribute("aria-checked", k.dataset.mode === m ? "true" : "false");
      });
      typeBox.hidden = m !== "type";
      canvas.classList.toggle("is-drawing", m === "draw");
      hint.textContent = HINTS[m];
      if (m === "type") {
        setText(typeInput.value);
        if (matchMedia("(pointer: fine)").matches) typeInput.focus();
      }
      lastPoke = now;
      wake();
    }

    keys.forEach(function (k) {
      k.addEventListener("click", function () {
        setMode(k.dataset.mode);
      });
    });
    hero.querySelector(".hh-keys").addEventListener("keydown", function (e) {
      var list = Array.prototype.slice.call(keys), at = list.indexOf(document.activeElement);
      if (at < 0) return;
      var dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      var nextKey = list[(at + dir + list.length) % list.length];
      nextKey.focus();
      setMode(nextKey.dataset.mode);
    });
    typeInput.addEventListener("input", function () {
      setText(typeInput.value);
    });

    // ---------------------------------------------------------- start

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) {
          last = (performance.now() - t0) / 1000;
          wake();
        }
      }).observe(stage);
    }
    if ("ResizeObserver" in window) {
      new ResizeObserver(fit).observe(stage);
    } else {
      addEventListener("resize", fit);
    }
    document.addEventListener("visibilitychange", function () {
      visible = !document.hidden;
      if (visible) {
        last = (performance.now() - t0) / 1000;
        wake();
      }
    });

    fit();
    hero.classList.add("is-live");
  }

  /* ================================================================ selected works
     A stage and a list. Pointing at (or focusing) a project in the list shows
     it on the stage; otherwise the console moves on by itself when the orange
     bar under the current project fills. */

  function selectedWorks(hs) {
    var slides = hs.querySelectorAll(".hs-slide");
    var items = hs.querySelectorAll(".hs-item");
    var current = 0;

    function show(i) {
      current = (i + slides.length) % slides.length;
      slides.forEach(function (s, j) {
        var on = j === current;
        s.classList.toggle("is-on", on);
        s.setAttribute("aria-hidden", on ? "false" : "true");
        s.querySelectorAll(".hs-title a").forEach(function (a) {
          a.tabIndex = on ? 0 : -1;
        });
      });
      items.forEach(function (it, j) {
        if (j === current) it.setAttribute("aria-current", "true");
        else it.removeAttribute("aria-current");
      });
    }

    items.forEach(function (it, j) {
      it.addEventListener("pointerenter", function (e) {
        if (e.pointerType === "mouse") show(j);
      });
      it.addEventListener("focus", function () {
        show(j);
      });
    });
    hs.addEventListener("animationend", function (e) {
      if (e.animationName === "hs-fill") show(current + 1);
    });
    document.addEventListener("visibilitychange", function () {
      hs.classList.toggle("is-hidden", document.hidden);
    });
    if (reduceMotion) hs.classList.add("is-static");
    else if ("IntersectionObserver" in window) {
      // only run the clock while the console is on screen
      new IntersectionObserver(function (entries) {
        hs.classList.toggle("is-away", !entries[0].isIntersecting);
      }).observe(hs);
    }
    hs.classList.add("is-live");
    show(0);
  }
})();

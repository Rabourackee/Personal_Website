// FLOAT page (src/projects/float.html): the film, and a twin view. On the
// left, a block screen: place a box anywhere in its column and it is set at
// once. On the right, the room: sixteen lantern boxes on lines, each lifted by
// its own stepper motor, catching up at a motor's pace. Each part skips quietly
// if its markup is absent; without JavaScript the page reads as a document.
(function () {
  "use strict";
  var root = document.querySelector(".fl");
  if (!root) return;
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(devicePixelRatio || 1, 2), N = 4, LV = 6, TAU = Math.PI * 2;

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  // ------------------------------------------------------------ the film: a poster until asked

  var play = root.querySelector(".fl-film__play");
  if (play) {
    play.addEventListener("click", function (e) {
      e.preventDefault();
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + play.getAttribute("data-video") + "?autoplay=1&rel=0&playsinline=1";
      f.title = "FLOAT, the film";
      f.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      f.allowFullscreen = true;
      play.replaceWith(f);
      f.focus();
    });
  }

  var twin = root.querySelector(".fl-twin");
  if (!twin) return;

  // ------------------------------------------------------------ state: 16 columns, levels 0 (floor) to 5

  var target = new Float32Array(N * N), pos = new Float32Array(N * N), vel = new Float32Array(N * N);
  var preset = null, t = 0, touched = false;
  function idx(i, j) {
    return j * N + i;
  }
  var SHAPES = {
    ground: function () {
      return 0;
    },
    stairs: function (i, j) {
      return (i + (N - 1 - j)) * (LV - 1) / (2 * N - 2);
    },
    pyramid: function (i, j) {
      return Math.min(i, N - 1 - i, j, N - 1 - j) === 0 ? 0 : 2;
    },
    arch: function (i, j) {
      return i === 1 || i === 2 ? 4 : 0;
    },
    cloud: function (i, j) {
      return 3.6 + ((i * 7 + j * 3) % 4) * 0.45;
    },
    wave: function (i, j) {
      return 2.5 + 2.5 * Math.sin(t * 1.5 - (i + j) * 0.75);
    },
    checker: function (i, j) {
      return (i + j) % 2 ? 3 : 0;
    },
    random: function () {
      return Math.floor(Math.random() * LV);
    },
  };
  var HINTS = {
    ground: "everything on the floor. hover a column on the screen, then click where its box should be.",
    stairs: "a staircase, rising from the front left.",
    pyramid: "a ring on the floor, and four boxes lifted in the middle.",
    arch: "two rows lifted high: a gate you could walk under.",
    cloud: "everything in the air, at slightly different heights.",
    wave: "a wave crossing the grid. the screen draws it instantly; the room follows as fast as the motors allow.",
    checker: "every other box lifted.",
    random: "a random arrangement. press again for another.",
    custom: "your arrangement. click a column on the screen to move its box, or drag across columns to paint.",
  };
  var hintEl = twin.querySelector(".fl-hint"), keys = twin.querySelectorAll(".fl-key"), statEl = twin.querySelector(".fl-stat"), motorsEl = twin.querySelector(".fl-motors");

  function setPreset(name) {
    preset = name;
    keys.forEach(function (k) {
      var on = k.getAttribute("data-shape") === name;
      k.setAttribute("aria-checked", on);
      k.tabIndex = on || (name === "custom" && k.getAttribute("data-shape") === "ground") ? 0 : -1;
    });
    if (name !== "custom" && name !== "wave") {
      for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) target[idx(i, j)] = SHAPES[name](i, j);
    }
    hintEl.textContent = HINTS[name];
  }
  keys.forEach(function (k) {
    k.addEventListener("click", function () {
      touched = true;
      setPreset(k.getAttribute("data-shape"));
    });
  });
  twin.querySelector(".fl-keys").addEventListener("keydown", function (e) {
    var list = Array.prototype.slice.call(keys), i = list.findIndex(function (k) { return k.getAttribute("aria-checked") === "true"; });
    var j = { ArrowRight: i + 1, ArrowDown: i + 4, ArrowLeft: i - 1, ArrowUp: i - 4 }[e.key];
    if (j === undefined) return;
    e.preventDefault();
    j = (j + list.length) % list.length;
    touched = true;
    setPreset(list[j].getAttribute("data-shape"));
    list[j].focus();
  });

  // the motor strip: one light per stepper
  var leds = [];
  for (var m = 0; m < N * N; m++) {
    var d = document.createElement("i");
    motorsEl.appendChild(d);
    leds.push(d);
  }

  // steppers: a steady top speed, with a short ramp at each end
  function step(dt) {
    var moving = 0, vmax = 1.4, acc = 3.2;
    if (preset === "wave") for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) target[idx(i, j)] = SHAPES.wave(i, j);
    for (var k = 0; k < N * N; k++) {
      var d = target[k] - pos[k], want = Math.abs(d) < 0.002 ? 0 : Math.sign(d) * Math.min(vmax, Math.sqrt(2 * acc * Math.abs(d)));
      vel[k] += clamp(want - vel[k], -acc * dt * 1.5, acc * dt * 1.5);
      pos[k] += vel[k] * dt;
      if (Math.abs(target[k] - pos[k]) < 0.004 && Math.abs(vel[k]) < 0.05) {
        pos[k] = target[k];
        vel[k] = 0;
      }
      var s = Math.abs(vel[k]) > 0.02 ? (vel[k] > 0 ? "up" : "down") : "";
      if (leds[k].className !== s) leds[k].className = s;
      if (s) moving++;
    }
    var txt = moving ? "16 steppers · " + moving + " moving" : "16 steppers · in place";
    if (statEl.textContent !== txt) statEl.textContent = txt;
  }

  // ------------------------------------------------------------ the screen: an isometric block editor

  var scr = twin.querySelector(".fl-screen canvas"), sc = scr.getContext("2d"), hover = null, paint = false, lastCol = -1;
  var G = 1.35, C30 = Math.cos(Math.PI / 6), S30 = 0.5, iso = { k: 20, cx: 0, cy: 0 };
  function colXZ(i, j) {
    return [(i - 1.5) * G, (j - 1.5) * G];
  }
  function ip(x, y, z) {
    return [iso.cx + (x - z) * C30 * iso.k, iso.cy + (x + z) * S30 * iso.k - y * iso.k];
  }
  function fitIso() {
    var w = scr.clientWidth, h = scr.clientHeight;
    if (!w || !h) return;
    scr.width = Math.round(w * DPR);
    scr.height = Math.round(h * DPR);
    // bounds of the whole lattice, in units of k
    var e = 1.5 * G + 0.5, spanX = 4 * e * C30, miny = -LV - 2 * e * S30, maxy = 2 * e * S30;
    var k = Math.min((scr.width * 0.86) / spanX, (scr.height * 0.84) / (maxy - miny));
    iso.k = k;
    iso.cx = scr.width / 2;
    iso.cy = scr.height * 0.5 - ((miny + maxy) / 2) * k;
  }
  function cubePts(x, y, z, s) {
    var h = s / 2;
    return {
      top: [ip(x - h, y + s, z - h), ip(x + h, y + s, z - h), ip(x + h, y + s, z + h), ip(x - h, y + s, z + h)],
      right: [ip(x + h, y, z - h), ip(x + h, y, z + h), ip(x + h, y + s, z + h), ip(x + h, y + s, z - h)],
      left: [ip(x - h, y, z + h), ip(x + h, y, z + h), ip(x + h, y + s, z + h), ip(x - h, y + s, z + h)],
    };
  }
  function poly(c, pts) {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }
  function drawScreen() {
    var c = sc, W = scr.width, H = scr.height, i, j, l;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#0b1022";
    c.fillRect(0, 0, W, H);
    c.lineJoin = "round";
    // the floor plate, cell by cell
    for (j = 0; j < N; j++) {
      for (i = 0; i < N; i++) {
        var p = colXZ(i, j), h = 0.5;
        poly(c, [ip(p[0] - h, 0, p[1] - h), ip(p[0] + h, 0, p[1] - h), ip(p[0] + h, 0, p[1] + h), ip(p[0] - h, 0, p[1] + h)]);
        c.fillStyle = hover && hover.i === i && hover.j === j ? "#1d2a63" : "#141c3a";
        c.fill();
        c.strokeStyle = "#2a3870";
        c.lineWidth = DPR;
        c.stroke();
      }
    }
    // columns back to front
    var order = [];
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) order.push([i, j]);
    order.sort(function (a, b) { return a[0] + a[1] - (b[0] + b[1]); });
    order.forEach(function (q) {
      var i = q[0], j = q[1], p = colXZ(i, j), k = idx(i, j), on = hover && hover.i === i && hover.j === j;
      // the lattice: a small cross at every slot centre
      c.strokeStyle = on ? "rgba(127,149,255,.75)" : "rgba(127,149,255,.22)";
      c.lineWidth = DPR;
      for (l = 0; l < LV; l++) {
        var cp = ip(p[0], l + 0.5, p[1]), r = 3 * DPR;
        c.beginPath();
        c.moveTo(cp[0] - r, cp[1]);
        c.lineTo(cp[0] + r, cp[1]);
        c.moveTo(cp[0], cp[1] - r);
        c.lineTo(cp[0], cp[1] + r);
        c.stroke();
      }
      if (on) {
        // the rail: where this column's box can go
        var b0 = ip(p[0], 0, p[1]), b1 = ip(p[0], LV, p[1]);
        c.beginPath();
        c.moveTo(b0[0], b0[1]);
        c.lineTo(b1[0], b1[1]);
        c.stroke();
      }
      // where the real box is, while it is still catching up
      if (Math.abs(pos[k] - target[k]) > 0.05) {
        var a = cubePts(p[0], pos[k], p[1], 1);
        c.setLineDash([3 * DPR, 3 * DPR]);
        c.strokeStyle = "rgba(255,178,74,.9)";
        c.lineWidth = 1.2 * DPR;
        [a.top, a.right, a.left].forEach(function (f) {
          poly(c, f);
          c.stroke();
        });
        c.setLineDash([]);
      }
      // the virtual box, set at once
      var v = cubePts(p[0], target[k], p[1], 1);
      [[v.left, "#9fb0ff"], [v.right, "#c3cdff"], [v.top, "#eef1ff"]].forEach(function (f) {
        poly(c, f[0]);
        c.fillStyle = f[1];
        c.fill();
        c.strokeStyle = "#3b5bff";
        c.lineWidth = 1.2 * DPR;
        c.stroke();
      });
      if (on && Math.abs(hover.l - target[k]) > 0.01) {
        var gh = cubePts(p[0], hover.l, p[1], 1);
        c.setLineDash([4 * DPR, 3 * DPR]);
        c.strokeStyle = "#ffffff";
        c.lineWidth = 1.4 * DPR;
        [gh.top, gh.right, gh.left].forEach(function (f) {
          poly(c, f);
          c.fillStyle = "rgba(255,255,255,.08)";
          c.fill();
          c.stroke();
        });
        c.setLineDash([]);
      }
    });
  }
  function inHull(pts, x, y) {
    pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var cr = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }, lo = [], up = [], i;
    for (i = 0; i < pts.length; i++) {
      while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop();
      lo.push(pts[i]);
    }
    for (i = pts.length - 1; i >= 0; i--) {
      while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop();
      up.push(pts[i]);
    }
    var h = lo.slice(0, -1).concat(up.slice(0, -1));
    for (i = 0; i < h.length; i++) {
      var a = h[i], b = h[(i + 1) % h.length];
      if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
    }
    return true;
  }
  // which column and level is under a point: the front-most column whose prism holds it
  function pick(e) {
    var r = scr.getBoundingClientRect(), x = (e.clientX - r.left) * DPR, y = (e.clientY - r.top) * DPR, best = null;
    for (var j = N - 1; j >= 0; j--) {
      for (var i = N - 1; i >= 0; i--) {
        var p = colXZ(i, j), h = 0.5, pts = [];
        [[-h, -h], [h, -h], [h, h], [-h, h]].forEach(function (q) {
          pts.push(ip(p[0] + q[0], 0, p[1] + q[1]), ip(p[0] + q[0], LV, p[1] + q[1]));
        });
        if (!inHull(pts, x, y)) continue;
        var base = ip(p[0], 0, p[1]), l = clamp(Math.floor((base[1] - y) / iso.k), 0, LV - 1);
        if (!best || i + j > best.i + best.j) best = { i: i, j: j, l: l };
      }
    }
    return best;
  }
  function place(h) {
    if (!h) return;
    touched = true;
    if (preset !== "custom") {
      if (preset === "wave") for (var k = 0; k < N * N; k++) target[k] = Math.round(target[k]);
      setPreset("custom");
    }
    target[idx(h.i, h.j)] = h.l;
  }
  scr.addEventListener("pointermove", function (e) {
    hover = pick(e);
    if (paint && hover && idx(hover.i, hover.j) !== lastCol) {
      place(hover);
      lastCol = idx(hover.i, hover.j);
    }
  });
  scr.addEventListener("pointerleave", function () {
    hover = null;
  });
  scr.addEventListener("pointerdown", function (e) {
    var h = pick(e);
    if (!h) return;
    scr.setPointerCapture(e.pointerId);
    paint = true;
    lastCol = idx(h.i, h.j);
    place(h);
  });
  ["pointerup", "pointercancel"].forEach(function (ev) {
    scr.addEventListener(ev, function () {
      paint = false;
    });
  });
  // keyboard: arrows move a cursor over the grid, page up / page down or + / − move its box
  var cur = { i: 0, j: N - 1 };
  scr.addEventListener("keydown", function (e) {
    var mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (mv) {
      cur.i = clamp(cur.i + mv[0], 0, N - 1);
      cur.j = clamp(cur.j + mv[1], 0, N - 1);
    } else if (e.key === "+" || e.key === "=" || e.key === "PageUp" || e.key === "-" || e.key === "PageDown") {
      var d = e.key === "+" || e.key === "=" || e.key === "PageUp" ? 1 : -1;
      place({ i: cur.i, j: cur.j, l: clamp(Math.round(target[idx(cur.i, cur.j)]) + d, 0, LV - 1) });
    } else return;
    e.preventDefault();
    hover = { i: cur.i, j: cur.j, l: target[idx(cur.i, cur.j)] };
  });
  scr.addEventListener("blur", function () {
    hover = null;
  });

  // ------------------------------------------------------------ the room: lantern boxes on lines

  var room = twin.querySelector(".fl-room canvas"), rc = room.getContext("2d");
  var SP = 0.62, BOX = 0.44, LH = 0.44, CEIL = 3.6;
  var cam = { t: [0, 1.15, 0], yaw: 0.6, pitch: 0.14, dist: 5.6, fov: 0.74 }, B = null;
  function norm(a) {
    var l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  function sizeRoom() {
    var w = room.clientWidth, h = room.clientHeight;
    if (!w || !h) return;
    room.width = Math.round(w * DPR);
    room.height = Math.round(h * DPR);
  }
  function basis() {
    var cp = Math.cos(cam.pitch), tt = cam.t;
    var p = [tt[0] + cam.dist * Math.sin(cam.yaw) * cp, tt[1] + cam.dist * Math.sin(cam.pitch), tt[2] + cam.dist * Math.cos(cam.yaw) * cp];
    var fw = norm([tt[0] - p[0], tt[1] - p[1], tt[2] - p[2]]), rt = norm([-fw[2], 0, fw[0]]);
    var up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
    B = { p: p, fw: fw, rt: rt, up: up, f: Math.min(room.height, room.width * 0.85) / 2 / Math.tan(cam.fov / 2), cx: room.width / 2, cy: room.height * 0.54 };
  }
  function pr(q) {
    var d = [q[0] - B.p[0], q[1] - B.p[1], q[2] - B.p[2]], z = d[0] * B.fw[0] + d[1] * B.fw[1] + d[2] * B.fw[2];
    return [B.cx + (B.f * (d[0] * B.rt[0] + d[1] * B.rt[1] + d[2] * B.rt[2])) / z, B.cy - (B.f * (d[0] * B.up[0] + d[1] * B.up[1] + d[2] * B.up[2])) / z, z];
  }
  function curtain() {
    var W = room.width, H = room.height, g = rc.createLinearGradient(0, 0, W, 0);
    // soft vertical folds
    for (var k = 0; k <= 18; k++) {
      var u = k / 18, v = 0.5 + 0.5 * Math.sin(k * 2.1) * Math.cos(k * 0.7);
      g.addColorStop(u, "rgb(" + Math.round(150 + 34 * v) + "," + Math.round(152 + 34 * v) + "," + Math.round(160 + 32 * v) + ")");
    }
    rc.fillStyle = g;
    rc.fillRect(0, 0, W, H);
    var dk = rc.createLinearGradient(0, 0, 0, H);
    dk.addColorStop(0, "rgba(20,22,30,.45)");
    dk.addColorStop(0.55, "rgba(20,22,30,0)");
    rc.fillStyle = dk;
    rc.fillRect(0, 0, W, H);
  }
  // the floor runs from just in front of the camera back to a curtain wall
  // standing behind the grid, whichever way the room is turned
  function floor() {
    var fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), back = 1.9, near = -cam.dist + 1.2, wide = 12;
    var q = [[-back, -wide], [-back, wide], [-near, wide], [-near, -wide]].map(function (o) {
      // o[0] along the view (toward the camera), o[1] across it
      return pr([cam.t[0] + fx * o[0] + fz * o[1], 0, cam.t[2] + fz * o[0] - fx * o[1]]);
    });
    var far = Math.min(q[0][1], q[1][1]), g = rc.createLinearGradient(0, far, 0, room.height);
    g.addColorStop(0, "#b8a88f");
    g.addColorStop(1, "#e4d4b8");
    poly(rc, q);
    rc.fillStyle = g;
    rc.fill();
    // a skirting line where the floor meets the curtain
    rc.strokeStyle = "rgba(60,55,50,.25)";
    rc.lineWidth = DPR;
    rc.beginPath();
    rc.moveTo(q[0][0], q[0][1]);
    rc.lineTo(q[1][0], q[1][1]);
    rc.stroke();
  }
  function pools() {
    for (var j = 0; j < N; j++) {
      for (var i = 0; i < N; i++) {
        var x = (i - 1.5) * SP, z = (j - 1.5) * SP, hgt = pos[idx(i, j)] * LH, c = pr([x, 0, z]), e = pr([x + 0.5, 0, z]), r = Math.max(4, Math.hypot(e[0] - c[0], e[1] - c[1])) * (1 + hgt * 0.35);
        var g = rc.createRadialGradient(c[0], c[1], 0, c[0], c[1], r);
        g.addColorStop(0, "rgba(255,214,140," + (0.42 / (1 + hgt * 1.4)).toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,214,140,0)");
        rc.save();
        rc.translate(c[0], c[1]);
        rc.scale(1, 0.42);
        rc.translate(-c[0], -c[1]);
        rc.fillStyle = g;
        rc.beginPath();
        rc.arc(c[0], c[1], r, 0, TAU);
        rc.fill();
        rc.restore();
      }
    }
  }
  function lantern(x, y, z) {
    var h = BOX / 2, V = [[x - h, y, z - h], [x + h, y, z - h], [x + h, y, z + h], [x - h, y, z + h], [x - h, y + BOX, z - h], [x + h, y + BOX, z - h], [x + h, y + BOX, z + h], [x - h, y + BOX, z + h]];
    var S = V.map(pr);
    // lines up to the ceiling, from the top corners
    rc.strokeStyle = "rgba(255,255,255,.5)";
    rc.lineWidth = 0.7 * DPR;
    [4, 5, 6, 7].forEach(function (k) {
      var v = V[k], top = pr([v[0], CEIL, v[2]]);
      rc.beginPath();
      rc.moveTo(S[k][0], S[k][1]);
      rc.lineTo(top[0], top[1]);
      rc.stroke();
    });
    var faces = [[3, 2, 1, 0, [0, -1, 0]], [4, 5, 6, 7, [0, 1, 0]], [0, 1, 5, 4, [0, 0, -1]], [1, 2, 6, 5, [1, 0, 0]], [2, 3, 7, 6, [0, 0, 1]], [3, 0, 4, 7, [-1, 0, 0]]];
    faces.forEach(function (f) {
      var n = f[4], cen = [x + n[0] * h, y + h + n[1] * h, z + n[2] * h];
      if ((cen[0] - B.p[0]) * n[0] + (cen[1] - B.p[1]) * n[1] + (cen[2] - B.p[2]) * n[2] >= 0) return; // faces away
      var pts = [S[f[0]], S[f[1]], S[f[2]], S[f[3]]], c = pr(cen), lit = n[1] > 0 ? 1 : n[1] < 0 ? 0.86 : 0.93 + 0.05 * n[0];
      poly(rc, pts);
      rc.fillStyle = "rgb(" + Math.round(246 * lit) + "," + Math.round(238 * lit) + "," + Math.round(218 * lit) + ")";
      rc.fill();
      // the glow from inside, brightest at the face's middle
      var span = Math.hypot(pts[0][0] - pts[2][0], pts[0][1] - pts[2][1]), g = rc.createRadialGradient(c[0], c[1], 0, c[0], c[1], span * 0.62);
      g.addColorStop(0, "rgba(255,240,205,.85)");
      g.addColorStop(1, "rgba(255,240,205,0)");
      rc.fillStyle = g;
      rc.fill();
      rc.strokeStyle = "rgba(150,138,118,.85)";
      rc.lineWidth = 1.1 * DPR;
      rc.stroke();
      if (n[1] > 0) {
        rc.strokeStyle = "rgba(150,138,118,.35)";
        rc.lineWidth = 0.7 * DPR;
        rc.beginPath();
        rc.moveTo(pts[0][0], pts[0][1]);
        rc.lineTo(pts[2][0], pts[2][1]);
        rc.stroke();
      }
    });
  }
  function person(x, z) {
    var f = pr([x, 0, z]), hd = pr([x, 1.7, z]), s = f[1] - hd[1];
    rc.fillStyle = "#26252a";
    rc.beginPath();
    rc.arc(f[0], hd[1] + s * 0.065, s * 0.065, 0, TAU);
    rc.fill();
    rc.beginPath();
    rc.moveTo(f[0] - s * 0.11, hd[1] + s * 0.15);
    rc.lineTo(f[0] + s * 0.11, hd[1] + s * 0.15);
    rc.lineTo(f[0] + s * 0.085, hd[1] + s * 0.55);
    rc.lineTo(f[0] + s * 0.06, f[1]);
    rc.lineTo(f[0] + s * 0.01, f[1]);
    rc.lineTo(f[0], hd[1] + s * 0.6);
    rc.lineTo(f[0] - s * 0.01, f[1]);
    rc.lineTo(f[0] - s * 0.06, f[1]);
    rc.lineTo(f[0] - s * 0.085, hd[1] + s * 0.55);
    rc.closePath();
    rc.fill();
  }
  function drawRoom() {
    basis();
    rc.setTransform(1, 0, 0, 1, 0, 0);
    curtain();
    floor();
    pools();
    var items = [];
    for (var j = 0; j < N; j++) {
      for (var i = 0; i < N; i++) {
        var x = (i - 1.5) * SP, z = (j - 1.5) * SP, y = pos[idx(i, j)] * LH;
        items.push({ d: pr([x, y + BOX / 2, z])[2], x: x, y: y, z: z });
      }
    }
    items.push({ d: pr([-1.75, 0.85, 0.5])[2], who: true });
    items.sort(function (a, b) { return b.d - a.d; });
    items.forEach(function (it) {
      if (it.who) person(-1.75, 0.5);
      else lantern(it.x, it.y, it.z);
    });
  }
  // walk around the room
  var walk = null;
  room.addEventListener("pointerdown", function (e) {
    room.setPointerCapture(e.pointerId);
    walk = { x: e.clientX, yaw: cam.yaw };
  });
  room.addEventListener("pointermove", function (e) {
    if (walk) cam.yaw = clamp(walk.yaw - (e.clientX - walk.x) * 0.006, -1.3, 1.6);
  });
  ["pointerup", "pointercancel"].forEach(function (ev) {
    room.addEventListener(ev, function () {
      walk = null;
    });
  });

  // ------------------------------------------------------------ run while on screen

  var visible = !("IntersectionObserver" in window), last = 0, started = false;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) {
      last = 0;
      return;
    }
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    t += dt;
    step(reduceMotion ? 1 : dt);
    drawScreen();
    drawRoom();
  }
  function resize() {
    fitIso();
    sizeRoom();
  }
  resize();
  addEventListener("resize", function () {
    clearTimeout(resize.t);
    resize.t = setTimeout(resize, 150);
  });
  setPreset("ground");
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      // the first time it comes into view, the grid rises into a staircase on its own
      if (visible && !started) {
        started = true;
        setTimeout(function () {
          if (!touched) setPreset("stairs");
        }, reduceMotion ? 0 : 600);
      }
    }, { threshold: 0.25 }).observe(twin);
  }
  requestAnimationFrame(frame);
})();

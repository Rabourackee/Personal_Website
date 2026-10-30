// CODEX & SYNTH page (src/projects/codex-synth.html). One small flat-shaded 3D
// renderer on canvas draws everything: the hero, the suburb, the mesh-or-model
// pair, a working model of CODEX-2 (magic pen, prompts, registry, details) and
// of SYNTH-2 (a building's levels, its data, and the charts you ask for).
// Each part skips quietly if its markup is absent.
(function () {
  "use strict";
  var root = document.querySelector(".cs");
  if (!root) return;
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(devicePixelRatio || 1, 2);
  var TAU = Math.PI * 2;
  var ORANGE = "#ff6a1f";

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  var RGB = {};
  function rgb(hex) {
    if (!RGB[hex]) {
      var n = parseInt(hex.slice(1), 16);
      RGB[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return RGB[hex];
  }
  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }
  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function norm(a) {
    var l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  function newell(w) {
    var n = [0, 0, 0];
    for (var i = 0; i < w.length; i++) {
      var a = w[i], b = w[(i + 1) % w.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]);
      n[1] += (a[2] - b[2]) * (a[0] + b[0]);
      n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    var l = Math.hypot(n[0], n[1], n[2]);
    return l ? [n[0] / l, n[1] / l, n[2] / l] : [0, 0, 0];
  }
  function inPoly(pts, x, y) {
    for (var c = false, i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (pts[i][1] > y !== pts[j][1] > y && x < ((pts[j][0] - pts[i][0]) * (y - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c;
    }
    return c;
  }
  function fmt(n) {
    return n.toLocaleString("en-US");
  }

  // ------------------------------------------------------------ parts: convex pieces, base at y = 0

  function ring(n, r, y, ez) {
    for (var o = [], i = 0; i < n; i++) {
      var a = (i / n) * TAU;
      o.push([Math.cos(a) * r, y, Math.sin(a) * r * (ez || 1)]);
    }
    return o;
  }
  var SHAPES = {
    box: function (p) {
      var x = p.s[0] / 2, h = p.s[1], z = p.s[2] / 2;
      var v = [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-x, h, -z], [x, h, -z], [x, h, z], [-x, h, z]];
      return { c: [0, h / 2, 0], f: [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]].map(function (f) {
        return f.map(function (i) { return v[i]; });
      }) };
    },
    // a cylinder; rt: 0 makes a cone, ez stretches it into an ellipse
    cyl: function (p) {
      var n = p.n || 14, rt = p.rt == null ? p.r : p.rt, b = ring(n, p.r, 0, p.ez), t = ring(n, rt, p.h, p.ez), f = [b.slice().reverse()];
      if (rt > 0) f.push(t);
      for (var i = 0; i < n; i++) {
        var j = (i + 1) % n;
        f.push(rt > 0 ? [b[i], t[i], t[j], b[j]] : [b[i], t[i], b[j]]);
      }
      return { c: [0, rt > 0 ? p.h / 2 : p.h / 3, 0], f: f };
    },
    sph: function (p) {
      var a = p.s, la = p.lat || 6, lo = p.lon || 10, rows = [], f = [], i, j;
      for (j = 0; j <= la; j++) {
        var ph = (j / la) * Math.PI, r = Math.sin(ph);
        rows.push(ring(lo, 1, 0).map(function (q) {
          return [q[0] * r * a[0], a[1] + Math.cos(ph) * a[1], q[2] * r * a[2]];
        }));
      }
      for (j = 0; j < la; j++) {
        for (i = 0; i < lo; i++) {
          var k = (i + 1) % lo;
          f.push([rows[j][i], rows[j][k], rows[j + 1][k], rows[j + 1][i]]);
        }
      }
      return { c: [0, a[1], 0], f: f };
    },
    // a gable roof: a triangle across x, run along z
    roof: function (p) {
      var x = p.s[0] / 2, h = p.s[1], z = p.s[2] / 2;
      var A = [-x, 0, -z], B = [x, 0, -z], Cc = [0, h, -z], D = [-x, 0, z], E = [x, 0, z], F = [0, h, z];
      return { c: [0, h / 3, 0], f: [[A, B, Cc], [F, E, D], [A, D, E, B], [B, E, F, Cc], [Cc, F, D, A]] };
    },
    tris: function (p) {
      return { c: p.c, f: p.f };
    },
  };

  // part frame (rz, ry, at), then the group (scale, turn, place)
  function xf(v, p, g, k) {
    var x = v[0], y = v[1], z = v[2], c, s, t;
    if (p.rz) {
      c = Math.cos(p.rz);
      s = Math.sin(p.rz);
      t = x * c - y * s;
      y = x * s + y * c;
      x = t;
    }
    if (p.ry) {
      c = Math.cos(p.ry);
      s = Math.sin(p.ry);
      t = x * c + z * s;
      z = -x * s + z * c;
      x = t;
    }
    var sc = g.scale * k;
    x = (x + p.at[0]) * sc;
    y = (y + p.at[1]) * sc;
    z = (z + p.at[2]) * sc;
    c = Math.cos(g.rot);
    s = Math.sin(g.rot);
    t = x * c + z * s;
    z = -x * s + z * c;
    return [t + g.pos[0], y + g.pos[1], z + g.pos[2]];
  }

  function grow(dt) {
    var t = clamp(dt / 520, 0, 1), c = 1.5;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }

  // ------------------------------------------------------------ the view

  function View(cv, o) {
    this.cv = cv;
    this.ctx = cv.getContext("2d");
    this.o = o || {};
    this.cam = { t: [0, 0.6, 0], yaw: 0.7, pitch: 0.45, dist: 10, fov: 0.8 };
    this.grid = this.o.grid !== false;
    this.drawn = [];
    this.size();
  }

  View.prototype.size = function () {
    var w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (!w || !h) return false;
    this.cv.width = Math.round(w * DPR);
    this.cv.height = Math.round(h * DPR);
    this.w = w;
    this.h = h;
    return true;
  };

  View.prototype.basis = function () {
    var c = this.cam, cp = Math.cos(c.pitch);
    var pos = [c.t[0] + c.dist * Math.sin(c.yaw) * cp, c.t[1] + c.dist * Math.sin(c.pitch), c.t[2] + c.dist * Math.cos(c.yaw) * cp];
    var fw = norm(sub(c.t, pos)), rt = norm(cross(fw, [0, 1, 0]));
    this.B = { pos: pos, fw: fw, rt: rt, up: cross(rt, fw), f: this.cv.height / 2 / Math.tan(c.fov / 2), cx: this.cv.width * (this.o.cx || 0.5), cy: this.cv.height * (this.o.cy || 0.5) };
  };

  View.prototype.cam3 = function (p) {
    var B = this.B, d = sub(p, B.pos);
    return [dot(d, B.rt), dot(d, B.up), dot(d, B.fw)];
  };

  View.prototype.proj = function (p) {
    var B = this.B, q = this.cam3(p);
    return [B.cx + (B.f * q[0]) / q[2], B.cy - (B.f * q[1]) / q[2], q[2]];
  };

  // a ray through a point given in CSS pixels on the canvas
  View.prototype.ray = function (sx, sy) {
    var B = this.B, a = (sx * DPR - B.cx) / B.f, b = -(sy * DPR - B.cy) / B.f;
    return { o: B.pos, d: norm([B.rt[0] * a + B.up[0] * b + B.fw[0], B.rt[1] * a + B.up[1] * b + B.fw[1], B.rt[2] * a + B.up[2] * b + B.fw[2]]) };
  };

  View.prototype.ground = function (sx, sy) {
    var r = this.ray(sx, sy);
    if (r.d[1] > -0.02) return null;
    var t = -r.o[1] / r.d[1];
    return [r.o[0] + r.d[0] * t, 0, r.o[2] + r.d[2] * t];
  };

  View.prototype.crosses = function () {
    var ctx = this.ctx, R = this.o.gridR || 14, s = 0.11, col = this.o.cross || "226,104,36", far = this.cam.dist * 2.4;
    ctx.lineWidth = 1.15 * DPR;
    for (var x = -R; x <= R; x++) {
      for (var z = -R; z <= R; z++) {
        var c = this.cam3([x, 0, z]);
        if (c[2] < 0.6) continue;
        var a = clamp(1.3 - c[2] / far, 0, 1) * (this.o.crossA || 0.85);
        if (a < 0.03) continue;
        var p1 = this.proj([x - s, 0, z - s]), p2 = this.proj([x + s, 0, z + s]), p3 = this.proj([x - s, 0, z + s]), p4 = this.proj([x + s, 0, z - s]);
        ctx.strokeStyle = "rgba(" + col + "," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.moveTo(p3[0], p3[1]);
        ctx.lineTo(p4[0], p4[1]);
        ctx.stroke();
      }
    }
  };

  View.prototype.render = function (groups, now, hi) {
    var ctx = this.ctx, o = this.o, W = this.cv.width, H = this.cv.height, self = this;
    this.basis();
    var B = this.B, L = norm([-0.45, 0.85, 0.42]), flat = [], solid = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (o.bg) {
      ctx.fillStyle = o.bg;
      ctx.fillRect(0, 0, W, H);
    } else ctx.clearRect(0, 0, W, H);
    if (this.grid) this.crosses();
    groups.forEach(function (g) {
      if (g.hidden) return;
      var k = g.born ? grow(now - g.born) : 1, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      g.parts.forEach(function (p) {
        var geo = p._g || (p._g = SHAPES[p.t](p)), pc = xf(geo.c, p, g, k), col = rgb(p.c);
        geo.f.forEach(function (f) {
          var w = f.map(function (v) {
            return xf(v, p, g, k);
          });
          for (var i = 0; i < w.length; i++) {
            for (var a = 0; a < 3; a++) {
              if (w[i][a] < mn[a]) mn[a] = w[i][a];
              if (w[i][a] > mx[a]) mx[a] = w[i][a];
            }
          }
          var n = newell(w), cen = [0, 0, 0];
          w.forEach(function (q) {
            cen[0] += q[0] / w.length;
            cen[1] += q[1] / w.length;
            cen[2] += q[2] / w.length;
          });
          if (dot(n, sub(cen, pc)) < 0) n = [-n[0], -n[1], -n[2]];
          if (dot(n, sub(cen, B.pos)) >= -1e-6) return; // faces away
          var s = w.map(self.proj, self), z = 0;
          for (i = 0; i < s.length; i++) {
            if (s[i][2] < 0.08) return;
            z += s[i][2] / s.length;
          }
          var lit = (o.amb || 0.46) + (1 - (o.amb || 0.46)) * Math.max(0, dot(n, L));
          (p.flat ? flat : solid).push({ s: s, w: w, n: n, z: z + (g.bias || 0), lit: lit, col: col, g: g, p: p });
        });
      });
      g._wb = [mn, mx];
      g._sc = self.proj([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]);
    });
    flat.sort(function (a, b) { return b.z - a.z; });
    solid.sort(function (a, b) { return b.z - a.z; });
    var all = flat.concat(solid);
    ctx.lineJoin = "round";
    all.forEach(function (f) {
      var c = f.col, l = f.lit, fill = "rgb(" + ((c[0] * l) | 0) + "," + ((c[1] * l) | 0) + "," + ((c[2] * l) | 0) + ")";
      ctx.beginPath();
      ctx.moveTo(f.s[0][0], f.s[0][1]);
      for (var i = 1; i < f.s.length; i++) ctx.lineTo(f.s[i][0], f.s[i][1]);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = (o.edgeW || 0.7) * DPR;
      ctx.strokeStyle = o.edges ? o.edges : fill; // a stroke in the fill colour closes hairline seams
      ctx.stroke();
    });
    if (hi && hi.length) {
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 1.4 * DPR;
      all.forEach(function (f) {
        if (hi.indexOf(f.g) < 0) return;
        ctx.beginPath();
        ctx.moveTo(f.s[0][0], f.s[0][1]);
        for (var i = 1; i < f.s.length; i++) ctx.lineTo(f.s[i][0], f.s[i][1]);
        ctx.closePath();
        ctx.stroke();
      });
    }
    this.drawn = all;
  };

  // the front-most face under a point (CSS pixels): its group and the 3D point hit
  View.prototype.hit = function (sx, sy, only) {
    var x = sx * DPR, y = sy * DPR;
    for (var i = this.drawn.length - 1; i >= 0; i--) {
      var f = this.drawn[i];
      if (only && only.indexOf(f.g) < 0) continue;
      if (!inPoly(f.s, x, y)) continue;
      var r = this.ray(sx, sy), den = dot(f.n, r.d), t = den ? dot(f.n, sub(f.w[0], r.o)) / den : 0;
      return { g: f.g, at: [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t, r.o[2] + r.d[2] * t] };
    }
    return null;
  };

  // ------------------------------------------------------------ what CODEX-2 can build (this demo's recipes)

  var K = { cream: "#efe2c6", red: "#c4362c", slate: "#5d5d5d", door: "#7a4a26", glass: "#9cc4de", trunk: "#7a4a26", leaf: "#5cb64c", leaf2: "#3f9b3f", water: "#3a73c4", pad: "#7cc243", stone: "#8b8b86", bird: "#b8642e", wing: "#8f4a20", beak: "#f2b33d", fur: "#8d4f24", ear: "#d8b48a", ink: "#141414", wood: "#a0703f", lamp: "#f4f4ec", cube: "#d9d9d6" };
  function P(t, o) {
    o.t = t;
    return o;
  }
  var RECIPES = {
    house: function () {
      return { name: "detailed_house", foot: 1.3, parts: [
        P("box", { s: [2, 1.3, 1.6], at: [0, 0, 0], c: K.cream }),
        P("roof", { s: [2.3, 0.85, 1.85], at: [0, 1.3, 0], c: K.red }),
        P("box", { s: [0.26, 0.75, 0.26], at: [0.5, 1.42, -0.32], c: K.slate }),
        P("box", { s: [0.42, 0.78, 0.06], at: [0, 0, 0.81], c: K.door }),
        P("box", { s: [0.36, 0.34, 0.05], at: [-0.6, 0.62, 0.81], c: K.glass }),
        P("box", { s: [0.36, 0.34, 0.05], at: [0.6, 0.62, 0.81], c: K.glass }),
        P("box", { s: [0.05, 0.34, 0.42], at: [1.01, 0.62, 0], c: K.glass }),
      ] };
    },
    tree: function () {
      return { name: "simple_tree", foot: 0.7, parts: [
        P("cyl", { r: 0.13, h: 1.25, at: [0, 0, 0], c: K.trunk, n: 8 }),
        P("sph", { s: [0.6, 0.55, 0.6], at: [0, 1.05, 0], c: K.leaf }),
        P("sph", { s: [0.45, 0.42, 0.45], at: [0.45, 0.95, 0.15], c: K.leaf2 }),
        P("sph", { s: [0.42, 0.4, 0.42], at: [-0.4, 1.0, -0.2], c: K.leaf2 }),
      ] };
    },
    pine: function () {
      return { name: "pine_tree", foot: 0.6, parts: [
        P("cyl", { r: 0.09, h: 0.7, at: [0, 0, 0], c: K.trunk, n: 7 }),
        P("cyl", { r: 0.62, rt: 0, h: 0.9, at: [0, 0.5, 0], c: "#2f9e6b", n: 9 }),
        P("cyl", { r: 0.5, rt: 0, h: 0.8, at: [0, 0.95, 0], c: "#3cb77d", n: 9 }),
        P("cyl", { r: 0.36, rt: 0, h: 0.7, at: [0, 1.4, 0], c: "#5fd39a", n: 9 }),
      ] };
    },
    pond: function (rx, rz) {
      rx = rx || 1.4;
      rz = rz || 1;
      var parts = [P("cyl", { r: rx, ez: rz / rx, h: 0.03, at: [0, 0, 0], c: K.water, n: 26, flat: true })];
      [[-0.35, 0.2], [0.3, -0.3], [0.1, 0.42]].forEach(function (q) {
        parts.push(P("cyl", { r: 0.17, h: 0.04, at: [q[0] * rx, 0.02, q[1] * rz], c: K.pad, n: 9, flat: true }));
      });
      parts.push(P("box", { s: [0.42, 0.06, 0.7], at: [rx * 0.82, 0.02, 0], c: K.wood, flat: true }));
      return { name: "pond", foot: Math.max(rx, rz), parts: parts };
    },
    bird: function () {
      return { name: "bird", foot: 0.25, parts: [
        P("sph", { s: [0.17, 0.14, 0.12], at: [0, 0, 0], c: K.bird }),
        P("sph", { s: [0.1, 0.1, 0.1], at: [0.14, 0.17, 0], c: K.bird }),
        P("cyl", { r: 0.04, rt: 0, h: 0.13, at: [0.23, 0.27, 0], rz: -Math.PI / 2, c: K.beak, n: 6 }),
        P("box", { s: [0.16, 0.03, 0.08], at: [-0.2, 0.12, 0], rz: 0.35, c: "#7a3f1c" }),
        P("box", { s: [0.2, 0.025, 0.14], at: [-0.02, 0.2, 0.12], ry: 0.3, rz: 0.4, c: K.wing }),
        P("box", { s: [0.2, 0.025, 0.14], at: [-0.02, 0.2, -0.12], ry: -0.3, rz: 0.4, c: K.wing }),
      ] };
    },
    rabbit: function () {
      return { name: "detailed_rabbit", foot: 0.5, parts: [
        P("sph", { s: [0.45, 0.42, 0.4], at: [0, 0.05, 0], c: K.fur }),
        P("sph", { s: [0.3, 0.28, 0.28], at: [0, 0.78, 0.05], c: K.fur }),
        P("cyl", { r: 0.06, h: 0.5, at: [-0.12, 1.22, 0], rz: 0.25, c: K.ear, n: 6 }),
        P("cyl", { r: 0.06, h: 0.5, at: [0.12, 1.22, 0], rz: -0.25, c: K.ear, n: 6 }),
        P("sph", { s: [0.05, 0.05, 0.05], at: [-0.1, 1.08, 0.3], c: K.ink, lat: 4, lon: 6 }),
        P("sph", { s: [0.05, 0.05, 0.05], at: [0.1, 1.08, 0.3], c: K.ink, lat: 4, lon: 6 }),
        P("sph", { s: [0.14, 0.08, 0.2], at: [-0.22, 0, 0.18], c: "#6e3b19", lat: 4 }),
        P("sph", { s: [0.14, 0.08, 0.2], at: [0.22, 0, 0.18], c: "#6e3b19", lat: 4 }),
      ] };
    },
    rock: function () {
      return { name: "rock", foot: 0.5, parts: [
        P("sph", { s: [0.5, 0.3, 0.42], at: [0, 0, 0], c: K.stone, lat: 4, lon: 8 }),
        P("sph", { s: [0.3, 0.22, 0.28], at: [0.48, 0, 0.2], c: "#9b9b95", lat: 4, lon: 7 }),
        P("sph", { s: [0.22, 0.16, 0.2], at: [-0.42, 0, 0.26], c: "#77776f", lat: 4, lon: 7 }),
      ] };
    },
    lamp: function () {
      return { name: "street_lamp", foot: 0.3, parts: [
        P("cyl", { r: 0.07, h: 2.3, at: [0, 0, 0], c: "#3c3c3c", n: 8 }),
        P("box", { s: [0.5, 0.05, 0.08], at: [0.2, 2.25, 0], c: "#3c3c3c" }),
        P("sph", { s: [0.2, 0.17, 0.2], at: [0.42, 1.95, 0], c: K.lamp }),
      ] };
    },
    table: function () {
      var parts = [P("box", { s: [1.4, 0.08, 0.8], at: [0, 0.72, 0], c: K.wood })];
      [[-0.62, -0.32], [0.62, -0.32], [-0.62, 0.32], [0.62, 0.32]].forEach(function (q) {
        parts.push(P("box", { s: [0.08, 0.72, 0.08], at: [q[0], 0, q[1]], c: "#7a5230" }));
      });
      return { name: "detailed_table", foot: 0.8, parts: parts };
    },
    cube: function () {
      return { name: "cube_" + Date.now(), foot: 0.6, prim: "BoxGeometry", parts: [P("box", { s: [1, 1, 1], at: [0, 0, 0], c: K.cube })] };
    },
  };

  var WORDS = [
    ["pine", /\b(pines?|firs?|conifers?|spruces?|forests?|christmas trees?)\b/],
    ["house", /\b(houses?|homes?|cottages?|huts?|cabins?|buildings?)\b/],
    ["tree", /\b(trees?|oaks?)\b/],
    ["pond", /\b(ponds?|lakes?|pools?|water)\b/],
    ["bird", /\b(birds?|crows?|sparrows?|robins?)\b/],
    ["rabbit", /\b(rabbits?|bunny|bunnies|hares?)\b/],
    ["rock", /\b(rocks?|stones?|boulders?)\b/],
    ["lamp", /\b(lamps?|lampposts?|street ?lights?)\b/],
    ["table", /\b(tables?|desks?)\b/],
    ["cube", /\b(cubes?|box|boxes|blocks?)\b/],
  ];
  var COLORS = { red: "#c4362c", orange: "#e8742a", yellow: "#e8c33a", green: "#4caf50", blue: "#3a73c4", purple: "#8a56c2", pink: "#e58fb0", white: "#f2f2ee", black: "#262626", grey: "#8b8b86", gray: "#8b8b86", brown: "#7a4a26" };
  var COUNTS = { two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2, few: 3, some: 3, several: 4 };

  function parse(text) {
    var t = " " + text.toLowerCase() + " ", out = { kind: null, n: 1, color: null };
    if (/\b(delete|remove|erase|clear|get rid|destroy)\b/.test(t)) out.act = "delete";
    else if (/\b(bigger|larger|grow|enlarge|taller)\b/.test(t)) out.act = "bigger";
    else if (/\b(smaller|shrink|tiny|shorter)\b/.test(t)) out.act = "smaller";
    for (var i = 0; i < WORDS.length; i++) {
      var m = t.match(WORDS[i][1]);
      if (m) {
        out.kind = WORDS[i][0];
        if (/forest/.test(m[0])) out.n = 5;
        else if (/s$/.test(m[0]) && !/(grass|glass|bus|boxes)$/.test(m[0])) out.n = 3;
        break;
      }
    }
    var c = t.match(/\b(\d|two|three|four|five|six|couple|few|some|several)\b/);
    if (c && out.kind) out.n = clamp(+c[1] || COUNTS[c[1]], 1, 6);
    Object.keys(COLORS).some(function (k) {
      if (new RegExp("\\b" + k + "\\b").test(t)) return (out.color = COLORS[k]);
    });
    if (!out.act) out.act = out.kind ? "add" : out.color ? "color" : null;
    return out;
  }

  // ------------------------------------------------------------ one render loop for every view

  var views = [];
  function loop(now) {
    views.forEach(function (v) {
      if (v.visible && (v.dirty || v.live)) {
        v.dirty = false;
        v.draw(now);
      }
    });
    requestAnimationFrame(loop);
  }
  function watch(v, el) {
    views.push(v);
    v.visible = true;
    if ("IntersectionObserver" in window) {
      v.visible = false;
      new IntersectionObserver(function (es) {
        v.visible = es[0].isIntersecting;
        if (v.visible) v.dirty = true;
      }, { rootMargin: "200px 0px" }).observe(el);
    }
    var t = 0;
    addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        if (v.resize) v.resize();
        v.dirty = true;
      }, 120);
    });
  }
  function inst(kind, pos, rot, scale, extra) {
    var r = RECIPES[kind].apply(null, extra || []);
    return { id: kind + Math.random().toString(36).slice(2, 7), kind: kind, name: r.name, prim: r.prim, foot: r.foot, parts: r.parts, pos: pos, rot: rot || 0, scale: scale || 1 };
  }
  function drag(el, onMove, onDown, onUp) {
    var last = null;
    el.addEventListener("pointerdown", function (e) {
      if (onDown && onDown(e) === false) return;
      el.setPointerCapture(e.pointerId);
      last = [e.clientX, e.clientY];
    });
    el.addEventListener("pointermove", function (e) {
      if (!last) return;
      onMove(e.clientX - last[0], e.clientY - last[1], e);
      last = [e.clientX, e.clientY];
    });
    function up(e) {
      if (!last) return;
      last = null;
      if (onUp) onUp(e);
    }
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  // ------------------------------------------------------------ hero: a generated scene on the cross ground

  (function () {
    var cv = root.querySelector(".cs-hero__view");
    if (!cv) return;
    var narrow = matchMedia("(max-width: 760px)");
    var v = new View(cv, { cx: narrow.matches ? 0.5 : 0.76, cy: narrow.matches ? 0.5 : 0.55, crossA: 0.75 });
    v.cam = { t: [0, 0.9, -0.6], yaw: -0.5, pitch: 0.3, dist: 10.5, fov: 0.75 };
    var scene = [[-2.3, -1.3, 1.25], [-1.25, -2, 1.45], [-0.35, -1.4, 1.1], [0.6, -2.2, 1.35], [1.45, -1.55, 1.15], [-1.75, 0.1, 1.3]].map(function (q, i) {
      return inst("pine", [q[0], 0, q[1]], i * 0.7, q[2]);
    });
    scene.push(inst("rabbit", [1.3, 0, 0.55], -0.5, 1));
    var mx = 0, my = 0, t0 = performance.now();
    v.live = !reduceMotion;
    v.dirty = true;
    v.resize = function () {
      v.o.cx = narrow.matches ? 0.5 : 0.76;
      v.o.cy = narrow.matches ? 0.5 : 0.55;
      v.size();
    };
    v.draw = function (now) {
      var t = (now - t0) / 1000;
      v.cam.yaw = -0.45 + Math.sin(t * 0.09) * 0.4 + mx * 0.25;
      v.cam.pitch = 0.3 + my * 0.08;
      v.render(scene, now);
    };
    cv.parentNode.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var r = cv.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - 0.5;
      my = (e.clientY - r.top) / r.height - 0.5;
    });
    watch(v, cv);
  })();

  // ------------------------------------------------------------ the pain point: a hundred ordinary houses, one design

  (function () {
    var cv = root.querySelector(".cs-suburb");
    if (!cv) return;
    var v = new View(cv, { bg: "#e7e6e1", grid: false, amb: 0.62 }), houses = [];
    v.cam = { t: [0, 0, 0], yaw: 0.55, pitch: 0.62, dist: 21, fov: 0.62 };
    var r = 7;
    for (var i = -5; i <= 5; i++) {
      for (var j = -7; j <= 7; j++) {
        r = (r * 9301 + 49297) % 233280;
        var rnd = r / 233280, x = j * 1.55 + (i % 2) * 0.6, z = i * 1.75 + Math.sin(j * 0.45) * 0.5;
        if (rnd < 0.1 || (Math.abs(i) < 1 && Math.abs(j) < 1)) continue;
        houses.push({ kind: "h", pos: [x, 0, z], rot: Math.sin(j * 0.45) * 0.35, scale: 0.36 + rnd * 0.06, parts: [
          P("box", { s: [2, 1.3, 1.6], at: [0, 0, 0], c: "#d6d5cf" }),
          P("roof", { s: [2.3, 0.85, 1.85], at: [0, 1.3, 0], c: "#c3c1b9" }),
        ] });
      }
    }
    // the one that matters
    houses.push({ kind: "h", pos: [0, 0, 0], rot: 0.2, scale: 1, parts: [
      P("box", { s: [1.3, 1.6, 1.3], at: [0, 0, 0], c: ORANGE }),
      P("box", { s: [0.8, 0.9, 0.8], at: [0.18, 1.6, -0.1], c: "#ff8a4d" }),
    ] });
    v.dirty = true;
    v.resize = function () {
      v.size();
    };
    v.draw = function (now) {
      v.render(houses, now);
    };
    watch(v, cv);
  })();

  // ------------------------------------------------------------ a mesh, or a model?

  (function () {
    var meshCv = root.querySelector('[data-vs="mesh"]'), modelCv = root.querySelector('[data-vs="model"]');
    if (!meshCv || !modelCv) return;
    // the house, as a generator would hand it back: one lumpy skin of triangles
    function inside(p) {
      var x = p[0], y = p[1], z = p[2];
      if (y < 0) return false;
      if (Math.abs(x) <= 1 && y <= 1.3 && Math.abs(z) <= 0.8) return true;
      if (y >= 1.3 && y <= 2.15 && Math.abs(z) <= 0.925 && Math.abs(x) <= 1.15 * (1 - (y - 1.3) / 0.85)) return true;
      return Math.abs(x - 0.5) <= 0.13 && Math.abs(z + 0.32) <= 0.13 && y <= 2.17 && y >= 1.4;
    }
    var t = (1 + Math.sqrt(5)) / 2, vs = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
    var fs = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (var s = 0; s < 2; s++) {
      var cache = {}, nf = [];
      var mid = function (a, b) {
        var key = a < b ? a + "_" + b : b + "_" + a;
        if (cache[key] == null) {
          vs.push(norm([(vs[a][0] + vs[b][0]) / 2, (vs[a][1] + vs[b][1]) / 2, (vs[a][2] + vs[b][2]) / 2]));
          cache[key] = vs.length - 1;
        }
        return cache[key];
      };
      fs.forEach(function (f) {
        var a = mid(f[0], f[1]), b = mid(f[1], f[2]), c = mid(f[2], f[0]);
        nf.push([f[0], a, c], [f[1], b, a], [f[2], c, b], [a, b, c]);
      });
      fs = nf;
    }
    var C0 = [0, 0.95, 0];
    var pts = vs.map(function (d, i) {
      var lo = 0, hi = 3.5;
      for (var k = 0; k < 20; k++) {
        var m = (lo + hi) / 2;
        if (inside([C0[0] + d[0] * m, C0[1] + d[1] * m, C0[2] + d[2] * m])) lo = m;
        else hi = m;
      }
      var wob = 1 + Math.sin(i * 12.9898) * 0.05 + Math.sin(i * 4.1) * 0.03;
      return [C0[0] + d[0] * lo * wob, Math.max(0, C0[1] + d[1] * lo * wob), C0[2] + d[2] * lo * wob];
    });
    var mesh = [{ pos: [0, 0, 0], rot: 0, scale: 1, parts: [P("tris", { c: C0, f: fs.map(function (f) { return f.map(function (i) { return pts[i]; }); }), at: [0, 0, 0], c: "#a3a39d" })] }];
    var model = [inst("house", [0, 0, 0], 0, 1)];
    var a = new View(meshCv, { bg: "#0b0b0b", edges: "rgba(255,255,255,0.22)", edgeW: 0.6, gridR: 6, crossA: 0.6 });
    var b = new View(modelCv, { bg: "#0b0b0b", gridR: 6, crossA: 0.6 });
    [a, b].forEach(function (v) {
      v.cam = { t: [0, 0.95, 0], yaw: 0.6, pitch: 0.32, dist: 6.4, fov: 0.7 };
    });
    var yaw = 0.6, held = false, t0 = null;
    function draw(now) {
      if (!held && !reduceMotion) {
        if (t0 != null) yaw += ((now - t0) / 1000) * 0.28;
        t0 = now;
      } else t0 = null;
      a.cam.yaw = b.cam.yaw = yaw;
    }
    a.draw = function (now) {
      draw(now);
      a.render(mesh, now);
    };
    b.draw = function (now) {
      draw(now);
      b.render(model, now);
    };
    [a, b].forEach(function (v) {
      v.live = !reduceMotion;
      v.dirty = true;
      v.resize = function () {
        v.size();
      };
      watch(v, v.cv);
      v.cv.style.touchAction = "pan-y";
      drag(v.cv, function (dx) {
        yaw -= dx * 0.01;
        a.dirty = b.dirty = true;
      }, function () {
        held = true;
      }, function () {
        held = false;
      });
    });
  })();

  // ------------------------------------------------------------ the anatomy figures: hover a part to light it

  root.querySelectorAll("[data-anat]").forEach(function (sec) {
    var fig = sec.querySelector(".cs-anat__fig"), box = sec.querySelector(".cs-anat__box"), items = sec.querySelectorAll("[data-box]");
    function show(btn) {
      items.forEach(function (b) {
        b.setAttribute("aria-current", b === btn);
      });
      if (!btn) {
        fig.classList.remove("is-on");
        return;
      }
      var q = btn.getAttribute("data-box").split(" ");
      box.style.left = q[0] + "%";
      box.style.top = q[1] + "%";
      box.style.width = q[2] + "%";
      box.style.height = q[3] + "%";
      fig.classList.add("is-on");
    }
    items.forEach(function (b) {
      b.addEventListener("mouseenter", function () {
        show(b);
      });
      b.addEventListener("focus", function () {
        show(b);
      });
      b.addEventListener("click", function () {
        show(b);
      });
    });
    sec.querySelector(".cs-anat__list").addEventListener("mouseleave", function () {
      if (!sec.contains(document.activeElement) || document.activeElement === document.body) show(null);
    });
  });

  // ------------------------------------------------------------ the film: a poster until asked

  var play = root.querySelector(".cs-film__play");
  if (play) {
    play.addEventListener("click", function (e) {
      e.preventDefault();
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + play.getAttribute("data-video") + "?autoplay=1&rel=0&playsinline=1";
      f.title = "CODEX & SYNTH, the film";
      f.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      f.allowFullscreen = true;
      play.replaceWith(f);
      f.focus();
    });
  }

  // ------------------------------------------------------------ CODEX-2, a working model

  (function () {
    var app = root.querySelector(".cx-app");
    if (!app) return;
    var cv = app.querySelector(".cx-view"), v = new View(cv, { bg: "#000" });
    v.cam = { t: [0, 0.7, 0], yaw: 0.72, pitch: 0.42, dist: 10, fov: 0.75 };
    var statusEl = root.querySelector(".cx-status"), logEl = root.querySelector(".cx-log"), input = app.querySelector(".cx-prompt input");
    var regEl = app.querySelector(".cx-registry ul"), regEmpty = app.querySelector(".cx-registry .cx-empty");
    var fieldsEl = app.querySelector(".cx-fields"), detEmpty = app.querySelector(".cx-details .cx-empty");
    var wheels = app.querySelector(".cx-wheels"), genBtn = app.querySelector(".cx-prompt button");
    var tasks = root.querySelectorAll(".cx-task");

    var scene = [inst("house", [-1.3, 0, 0.4], 0.35, 1), inst("tree", [1.7, 0, -0.9], 0, 1.15)];
    scene[1].id = "first-tree";
    var tool = "select", selected = null, lasso = null, busy = false, history = [];
    var names = {};
    scene.forEach(function (g) {
      names[g.name] = 1;
    });

    v.draw = function (now) {
      var hi = lasso && lasso.inside ? lasso.inside.slice() : [];
      if (selected) hi.push(selected);
      v.live = scene.some(function (g) {
        return g.born && now - g.born < 600;
      });
      v.render(scene, now, hi);
      if (selected && !selected.hidden) gumball(selected);
      if (lasso) drawLasso();
    };
    v.resize = function () {
      v.size();
    };
    watch(v, cv);
    v.dirty = true;

    function gumball(g) {
      var b = g._wb;
      if (!b) return;
      var c = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2], r = Math.max(0.45, Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]) * 0.55), ctx = v.ctx;
      [[[1, 0, 0], [0, 0, 1], "#ff6a1f"], [[1, 0, 0], [0, 1, 0], "#3a8bff"], [[0, 0, 1], [0, 1, 0], "#3ad07a"]].forEach(function (rg) {
        ctx.beginPath();
        for (var i = 0; i <= 40; i++) {
          var a = (i / 40) * TAU, p = v.proj([c[0] + (rg[0][0] * Math.cos(a) + rg[1][0] * Math.sin(a)) * r, c[1] + (rg[0][1] * Math.cos(a) + rg[1][1] * Math.sin(a)) * r, c[2] + (rg[0][2] * Math.cos(a) + rg[1][2] * Math.sin(a)) * r]);
          i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
        }
        ctx.strokeStyle = rg[2];
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.4 * DPR;
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      [[[r * 1.25, 0, 0], "#ff6a1f"], [[0, r * 1.25, 0], "#3ad07a"], [[0, 0, r * 1.25], "#3a8bff"]].forEach(function (ax) {
        var p0 = v.proj(c), p1 = v.proj([c[0] + ax[0][0], c[1] + ax[0][1], c[2] + ax[0][2]]);
        ctx.strokeStyle = ctx.fillStyle = ax[1];
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p1[0], p1[1], 3.2 * DPR, 0, TAU);
        ctx.fill();
      });
    }

    function drawLasso() {
      var ctx = v.ctx, pts = lasso.pts;
      if (pts.length < 2) return;
      ctx.save();
      ctx.setLineDash([6 * DPR, 5 * DPR]);
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 1.6 * DPR;
      ctx.shadowColor = "rgba(255,106,31,0.6)";
      ctx.shadowBlur = 8 * DPR;
      ctx.beginPath();
      pts.forEach(function (p, i) {
        i ? ctx.lineTo(p[0] * DPR, p[1] * DPR) : ctx.moveTo(p[0] * DPR, p[1] * DPR);
      });
      if (lasso.done) ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // ---- history ----
    function snap() {
      history.push(JSON.stringify({ s: scene, sel: selected && selected.id }, function (k, val) {
        return k.charAt(0) === "_" ? undefined : val;
      }));
      if (history.length > 40) history.shift();
    }
    function undo() {
      if (busy || !history.length) return status("nothing to undo.");
      var h = JSON.parse(history.pop());
      scene = h.s;
      scene.forEach(function (g) {
        g.born = 0;
      });
      selected = scene.filter(function (g) {
        return g.id === h.sel;
      })[0] || null;
      lasso = null;
      changed();
      status("undone.");
    }

    // ---- panels ----
    function changed() {
      v.dirty = true;
      registry();
      details();
      checkTasks();
    }
    function registry() {
      regEl.textContent = "";
      regEmpty.hidden = scene.length > 0;
      scene.forEach(function (g) {
        var li = document.createElement("li"), b = document.createElement("button");
        b.type = "button";
        b.innerHTML = "<span></span><em></em>";
        b.firstChild.textContent = g.name;
        b.lastChild.textContent = g.prim || "Group (" + g.parts.length + " objects)";
        b.setAttribute("aria-pressed", g === selected);
        b.addEventListener("click", function () {
          select(g === selected ? null : g);
        });
        li.appendChild(b);
        regEl.appendChild(li);
      });
    }
    var F = {};
    fieldsEl.querySelectorAll("[data-f]").forEach(function (el) {
      F[el.getAttribute("data-f")] = el;
    });
    var swatch = fieldsEl.querySelector(".cx-swatch");
    function biggest(g) {
      var best = g.parts[0], bv = 0;
      g.parts.forEach(function (p) {
        var vol = p.s ? p.s[0] * p.s[1] * p.s[2] : p.r ? p.r * p.r * (p.h || 0.1) * (p.ez || 1) * 3 : 0;
        if (vol > bv) {
          bv = vol;
          best = p;
        }
      });
      return best;
    }
    function details() {
      var g = selected;
      fieldsEl.hidden = !g;
      detEmpty.hidden = !!g;
      if (!g) return;
      F.name.value = g.name;
      swatch.style.background = biggest(g).c;
      set("size", g.scale, 2);
      set("x", g.pos[0], 1);
      set("y", g.pos[1], 1);
      set("z", g.pos[2], 1);
      set("rot", Math.round(((((g.rot * 180) / Math.PI) % 360) + 540) % 360 - 180), 0);
    }
    function set(k, val, d) {
      F[k].value = val;
      F[k].parentNode.querySelector("output").textContent = (+val).toFixed(d);
    }
    ["size", "x", "y", "z", "rot"].forEach(function (k) {
      var el = F[k], took = false;
      el.addEventListener("pointerdown", function () {
        took = false;
      });
      el.addEventListener("input", function () {
        if (!selected) return;
        if (!took) {
          snap();
          took = true;
        }
        var val = +el.value, g = selected;
        if (k === "size") g.scale = val;
        else if (k === "rot") g.rot = (val * Math.PI) / 180;
        else g.pos[{ x: 0, y: 1, z: 2 }[k]] = val;
        el.parentNode.querySelector("output").textContent = val.toFixed(k === "size" ? 2 : k === "rot" ? 0 : 1);
        v.dirty = true;
      });
      el.addEventListener("change", function () {
        took = false;
      });
    });
    F.name.addEventListener("change", function () {
      if (selected && F.name.value.trim()) {
        snap();
        selected.name = F.name.value.trim().replace(/\s+/g, "_");
        registry();
      }
    });

    function select(g) {
      selected = g;
      if (g) lasso = null;
      changed();
    }

    function status(t) {
      statusEl.textContent = t;
    }

    // ---- the log: what the model would write ----
    function f2(n) {
      return (n < 0 ? "" : " ") + n.toFixed(2);
    }
    function commands(head, gs) {
      var lines = ["> " + head];
      gs.forEach(function (g) {
        lines.push("  group(\"" + g.name + "\")");
        g.parts.forEach(function (p) {
          var at = xf([0, 0, 0], p, g, 1), sz = p.t === "box" || p.t === "roof" ? p.s.map(function (q) { return (q * g.scale).toFixed(2); }).join(" × ") : p.t === "sph" ? "r " + (p.s[0] * g.scale).toFixed(2) : "r " + (p.r * g.scale).toFixed(2) + " h " + (p.h * g.scale).toFixed(2);
          var name = { box: "box", roof: "gable", cyl: p.rt === 0 ? "cone" : "cylinder", sph: "sphere" }[p.t];
          lines.push("    " + (name + "        ").slice(0, 9) + (sz + "                ").slice(0, 18) + "at(" + f2(at[0]) + "," + f2(at[1]) + "," + f2(at[2]) + ")  " + p.c);
        });
      });
      type(lines);
    }
    var queue = [], typing = 0;
    function type(lines) {
      queue = queue.concat(lines, [""]);
      if (!typing) tick();
    }
    function tick() {
      if (!queue.length) {
        typing = 0;
        return;
      }
      var all = (logEl.textContent + queue.shift() + "\n").split("\n");
      logEl.textContent = all.slice(-15).join("\n");
      typing = setTimeout(tick, reduceMotion ? 0 : 45);
    }

    // ---- placing things ----
    function centre(g) {
      return [g.pos[0], g.pos[2]];
    }
    function free(foot) {
      for (var r = 0; r < 8; r += 0.5) {
        for (var a = 0; a < TAU; a += 0.5) {
          var x = Math.cos(a) * r, z = Math.sin(a) * r, ok = scene.every(function (g) {
            var c = centre(g);
            return Math.hypot(c[0] - x, c[1] - z) > (g.foot || 0.6) * g.scale + foot + 0.3;
          });
          if (ok) return [x, z];
        }
      }
      return [Math.random() * 6 - 3, Math.random() * 6 - 3];
    }
    function region() {
      var pts = lasso.pts.map(function (p) {
        return v.ground(p[0], p[1]);
      }).filter(Boolean);
      if (pts.length < 3) return null;
      var mn = [1e9, 1e9], mx = [-1e9, -1e9];
      pts.forEach(function (p) {
        mn[0] = Math.min(mn[0], p[0]);
        mx[0] = Math.max(mx[0], p[0]);
        mn[1] = Math.min(mn[1], p[2]);
        mx[1] = Math.max(mx[1], p[2]);
      });
      return { pts: pts, cx: (mn[0] + mx[0]) / 2, cz: (mn[1] + mx[1]) / 2, w: clamp(mx[0] - mn[0], 0.4, 14), d: clamp(mx[1] - mn[1], 0.4, 14) };
    }
    function inRegion(R, x, z) {
      return inPoly(R.pts.map(function (p) { return [p[0], p[2]]; }), x, z);
    }
    function unique(name) {
      if (!names[name]) {
        names[name] = 1;
        return name;
      }
      return name + "_" + ++names[name];
    }

    // ---- generate: read the prompt, wait like a model would, then act ----
    function generate(text) {
      if (busy) return;
      var q = parse(text);
      if (!q.act) {
        status("this model only knows a few things: a house, a tree or a pine, a pond, a bird, a rabbit, a rock, a lamp, a table, a cube. and: delete, bigger, smaller, or a colour.");
        return;
      }
      var targets = lasso && lasso.inside && lasso.inside.length ? lasso.inside : selected ? [selected] : [];
      if (q.act !== "add" && !targets.length) {
        status("circle something with the magic pen, or select it first, then say what to do with it.");
        return;
      }
      busy = true;
      genBtn.disabled = true;
      wheels.classList.add("is-busy");
      status("generating…");
      var hitAt = lasso && lasso.inside && lasso.inside.length && lasso.done ? v.hit(lasso.c[0], lasso.c[1], lasso.inside) : null;
      var R = lasso && lasso.done ? region() : null;
      setTimeout(function () {
        snap();
        var made = [], now = performance.now(), head = text.trim();
        if (q.act === "delete") {
          scene = scene.filter(function (g) {
            return targets.indexOf(g) < 0;
          });
          if (targets.indexOf(selected) >= 0) selected = null;
          type(["> " + head].concat(targets.map(function (g) { return "  remove(\"" + g.name + "\")"; })));
          status("removed " + targets.map(function (g) { return g.name; }).join(", ") + ".");
        } else if (q.act === "bigger" || q.act === "smaller") {
          targets.forEach(function (g) {
            g.scale = clamp(g.scale * (q.act === "bigger" ? 1.35 : 0.74), 0.3, 3);
          });
          type(["> " + head].concat(targets.map(function (g) { return "  scale(\"" + g.name + "\", " + g.scale.toFixed(2) + ")"; })));
          status(targets.length + (targets.length > 1 ? " objects " : " object ") + (q.act === "bigger" ? "enlarged." : "shrunk."));
        } else if (q.act === "color") {
          targets.forEach(function (g) {
            biggest(g).c = q.color;
          });
          type(["> " + head].concat(targets.map(function (g) { return "  color(\"" + g.name + "\", " + q.color + ")"; })));
          status("recoloured.");
        } else {
          var kind = q.kind, on = hitAt && ["bird", "lamp", "cube", "rock", "rabbit"].indexOf(kind) >= 0 && hitAt.at[1] > 0.15;
          for (var i = 0; i < q.n; i++) {
            var g, pos, sc = 1;
            if (kind === "pond") {
              var rx = R ? clamp((R.w / 2) * 0.92, 0.6, 5) : 1.5, rz = R ? clamp((R.d / 2) * 0.92, 0.5, 5) : 1.1, fp = R ? [R.cx, R.cz] : free(Math.max(rx, rz));
              g = inst("pond", [fp[0], 0, fp[1]], 0, 1, [rx, rz]);
            } else if (on && i === 0) {
              g = inst(kind, [hitAt.at[0], hitAt.at[1] - 0.02, hitAt.at[2]], Math.random() * TAU, kind === "bird" ? 1.2 : 0.6);
              g.bias = -2; // drawn after what it sits on
            } else if (R) {
              var foot = RECIPES[kind]().foot;
              sc = q.n > 1 ? clamp(Math.min(R.w, R.d) / (foot * 2 * Math.sqrt(q.n) + 0.6), 0.6, 1.8) : clamp(Math.min(R.w, R.d) / (foot * 2 + 0.4), 0.5, 2.4);
              pos = [R.cx, R.cz];
              for (var tries = 0; q.n > 1 && tries < 30; tries++) {
                var px = R.cx + (Math.random() - 0.5) * R.w, pz = R.cz + (Math.random() - 0.5) * R.d;
                if (!inRegion(R, px, pz)) continue;
                if (made.every(function (m) { return Math.hypot(m.pos[0] - px, m.pos[2] - pz) > foot * sc * 1.6; })) {
                  pos = [px, pz];
                  break;
                }
              }
              g = inst(kind, [pos[0], 0, pos[1]], Math.random() * 0.8 - 0.4, sc * (0.9 + Math.random() * 0.2));
            } else {
              var spot = free(RECIPES[kind]().foot);
              g = inst(kind, [spot[0], 0, spot[1]], Math.random() * 0.8 - 0.4, q.n > 1 ? 0.85 + Math.random() * 0.3 : 1);
            }
            if (q.color) biggest(g).c = q.color;
            g.name = kind === "cube" ? g.name : unique(g.name);
            g.born = now + i * 90;
            scene.push(g);
            made.push(g);
          }
          commands(head + (on ? "  [on " + hitAt.g.name + "]" : R ? "  [in the drawn area]" : ""), made);
          status("made " + (made.length > 1 ? made.length + " × " : "") + made[0].name.replace(/_\d+$/, "") + (on ? " on " + hitAt.g.name : R ? " in the area you drew" : "") + ".");
          selected = made.length === 1 ? made[0] : null;
        }
        lasso = null;
        busy = false;
        genBtn.disabled = false;
        wheels.classList.remove("is-busy");
        v.live = true;
        changed();
      }, reduceMotion ? 200 : 1300 + Math.random() * 500);
    }

    app.querySelector(".cx-prompt").addEventListener("submit", function (e) {
      e.preventDefault();
      if (input.value.trim()) generate(input.value);
    });

    // ---- tools ----
    var toolBtns = app.querySelectorAll("[data-tool]");
    var HINT = {
      select: "select: click an object to edit it, drag it to move it. drag empty ground to look around.",
      pen: "magic pen: draw around objects to pick them, or around empty ground to mark an area. then describe it.",
    };
    function setTool(t) {
      tool = t;
      toolBtns.forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-tool") === t);
      });
      cv.style.cursor = t === "pen" ? "crosshair" : "default";
      status(HINT[t]);
    }
    toolBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        setTool(b.getAttribute("data-tool"));
      });
    });
    app.querySelector('[data-act="cube"]').addEventListener("click", function () {
      if (busy) return;
      snap();
      var s = free(0.6), g = inst("cube", [s[0], 0, s[1]], 0, 1);
      g.born = performance.now();
      scene.push(g);
      selected = g;
      type(["> new BoxGeometry(1, 1, 1)", "  group(\"" + g.name + "\")", ""]);
      status("a cube. size it and move it in object details.");
      v.live = true;
      changed();
    });
    app.querySelector('[data-act="dup"]').addEventListener("click", function () {
      if (!selected || busy) return status("select something to duplicate.");
      snap();
      var g = JSON.parse(JSON.stringify(selected, function (k, val) {
        return k.charAt(0) === "_" ? undefined : val;
      }));
      g.id = g.kind + Math.random().toString(36).slice(2, 7);
      g.pos = [g.pos[0] + 1.2, g.pos[1], g.pos[2] + 0.6];
      g.name = g.kind === "cube" ? "cube_" + Date.now() : unique(g.name.replace(/_\d+$/, ""));
      g.born = performance.now();
      scene.push(g);
      selected = g;
      v.live = true;
      changed();
    });
    app.querySelector('[data-act="del"]').addEventListener("click", function () {
      var gs = lasso && lasso.inside && lasso.inside.length ? lasso.inside : selected ? [selected] : [];
      if (!gs.length || busy) return status("select or circle something to delete.");
      snap();
      scene = scene.filter(function (g) {
        return gs.indexOf(g) < 0;
      });
      selected = null;
      lasso = null;
      changed();
      status("deleted.");
    });
    var gridBtn = app.querySelector('[data-act="grid"]');
    gridBtn.addEventListener("click", function () {
      v.grid = !v.grid;
      gridBtn.setAttribute("aria-pressed", v.grid);
      v.dirty = true;
    });
    app.querySelector('[data-act="undo"]').addEventListener("click", undo);
    app.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.target !== input) {
        e.preventDefault();
        undo();
      }
    });

    // ---- the canvas ----
    var mode = null, start = null, grab = null, moved = false;
    function local(e) {
      var r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    cv.addEventListener("pointerdown", function (e) {
      if (busy) return;
      cv.setPointerCapture(e.pointerId);
      var p = local(e);
      start = p;
      moved = false;
      if (tool === "pen") {
        mode = "lasso";
        lasso = { pts: [p], done: false };
        selected = null;
        v.dirty = true;
        return;
      }
      var h = v.hit(p[0], p[1]);
      if (h) {
        mode = "move";
        select(h.g);
        var gp = v.ground(p[0], p[1]);
        grab = gp ? [gp[0] - h.g.pos[0], gp[2] - h.g.pos[2]] : null;
      } else mode = "orbit";
    });
    cv.addEventListener("pointermove", function (e) {
      if (!mode) return;
      var p = local(e);
      if (Math.hypot(p[0] - start[0], p[1] - start[1]) > 3) moved = true;
      if (mode === "lasso") {
        var last = lasso.pts[lasso.pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 3) lasso.pts.push(p);
      } else if (mode === "orbit") {
        v.cam.yaw -= (e.movementX || 0) * 0.006;
        v.cam.pitch = clamp(v.cam.pitch + (e.movementY || 0) * 0.004, 0.12, 1.25);
      } else if (mode === "move" && selected && grab && moved) {
        if (!selected._moving) {
          snap();
          selected._moving = true;
        }
        var gp = v.ground(p[0], p[1]);
        if (gp) {
          selected.pos[0] = clamp(gp[0] - grab[0], -12, 12);
          selected.pos[2] = clamp(gp[2] - grab[1], -12, 12);
          details();
        }
      }
      v.dirty = true;
    });
    function up() {
      if (!mode) return;
      if (mode === "lasso") {
        if (lasso.pts.length < 4) lasso = null;
        else {
          lasso.done = true;
          var cx = 0, cy = 0;
          lasso.pts.forEach(function (q) {
            cx += q[0] / lasso.pts.length;
            cy += q[1] / lasso.pts.length;
          });
          lasso.c = [cx, cy];
          lasso.inside = scene.filter(function (g) {
            return g._sc && inPoly(lasso.pts, g._sc[0] / DPR, g._sc[1] / DPR);
          });
          if (!lasso.inside.length) {
            // nothing's centre inside: anything the outline crosses the middle of, at the centroid
            var h = v.hit(cx, cy);
            if (h && h.g.kind !== "pond") lasso.inside = [h.g];
          }
          status(lasso.inside.length ? "circled: " + lasso.inside.map(function (g) { return g.name; }).join(", ") + ". now describe what to do: “a bird on it”, “delete this”, “make it bigger”." : "an area of ground. now describe what to build in it: “a pond”, “three pines”, “a house”.");
        }
      } else if (mode === "orbit" && !moved) select(null);
      if (selected) delete selected._moving;
      if (mode === "move") details();
      mode = null;
      v.dirty = true;
    }
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);

    // ---- the three tasks ----
    var TASK = [
      { prompt: "a pond", hint: "task 1: with the magic pen, draw a loop on empty ground, then press generate." },
      { prompt: "a bird on the roof", hint: "task 2: with the magic pen, circle the roof of the house, then press generate." },
      { prompt: "delete this", hint: "task 3: with the magic pen, circle the tree, then press generate." },
    ];
    tasks.forEach(function (b, i) {
      b.addEventListener("click", function () {
        setTool("pen");
        input.value = TASK[i].prompt;
        status(TASK[i].hint);
        cv.focus({ preventScroll: true });
      });
    });
    function checkTasks() {
      var done = [
        scene.some(function (g) { return g.kind === "pond"; }),
        scene.some(function (g) { return g.kind === "bird" && g.pos[1] > 0.6; }),
        !scene.some(function (g) { return g.id === "first-tree"; }),
      ];
      tasks.forEach(function (b, i) {
        b.setAttribute("data-done", done[i]);
      });
    }
    app.querySelectorAll(".cx-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        input.value = b.textContent;
        generate(b.textContent);
      });
    });
    root.querySelector('[data-cx="reset"]').addEventListener("click", function () {
      if (busy) return;
      snap();
      scene = [inst("house", [-1.3, 0, 0.4], 0.35, 1), inst("tree", [1.7, 0, -0.9], 0, 1.15)];
      scene[1].id = "first-tree";
      selected = null;
      lasso = null;
      v.cam.yaw = 0.72;
      v.cam.pitch = 0.42;
      changed();
      status("a fresh scene: the house and the tree.");
    });

    setTool("select");
    changed();
  })();

  // ------------------------------------------------------------ SYNTH-2, a working model

  (function () {
    var app = root.querySelector(".sy-app");
    if (!app) return;
    // the sample building in the live SYNTH-2: elements per level, from its layer list
    var LV = [["Level 01", 265], ["Level 02", 208], ["Level 03", 464], ["Level 04", 559], ["Level 05", 571], ["Level 06", 575], ["Level 07", 572], ["Level 08", 574], ["Level 09", 364], ["Level 10", 358], ["Roof", 176]];
    var TOTAL = LV.reduce(function (s, l) { return s + l[1]; }, 0);
    var cv = app.querySelector(".sy-view"), narrow = matchMedia("(max-width: 900px)");
    var v = new View(cv, { bg: "#000", grid: false, amb: 0.5, cx: narrow.matches ? 0.5 : 0.435, cy: narrow.matches ? 0.5 : 0.56 });
    v.cam = { t: [0, 2.0, 0], yaw: 0.62, pitch: 0.26, dist: narrow.matches ? 10 : 15, fov: 0.75 };
    var levels = LV.map(function (l, i) {
      var roof = i === 10;
      return { level: i, pos: [roof ? -0.7 : 0, i * 0.37, roof ? -0.15 : 0], rot: 0, scale: 1, parts: [P("box", { s: roof ? [1.9, 0.3, 1.1] : [4.2, 0.31, 1.8], at: [0, 0, 0], c: "#9a9a96" })] };
    });
    var state = { focus: null, split: false, hover: null, chart: null, iso: null };
    var statusEl = app.querySelector(".sy-answer"), chartEl = app.querySelector(".sy-chart"), headEl = app.querySelector(".sy-render__state"), tipEl = app.querySelector(".sy-tip");
    var layersEl = app.querySelector(".sy-layers ul"), elEl = app.querySelector(".sy-el p"), tableBtn = app.querySelector('[data-sy="table"]');
    var busy = false, table = false;

    function colour(i) {
      if (state.split) return i < 5 ? "#e9e9e4" : ORANGE;
      var lit = state.hover === i || state.focus === i;
      if (lit) return ORANGE;
      if (state.focus != null || state.iso != null) return "#3c3c3a";
      return "#9a9a96";
    }
    v.draw = function (now) {
      levels.forEach(function (g, i) {
        g.parts[0].c = colour(i);
        g.hidden = state.iso != null && state.iso !== i;
      });
      v.render(levels, now);
    };
    v.live = !reduceMotion;
    var t0 = performance.now();
    var baseDraw = v.draw;
    v.draw = function (now) {
      if (!reduceMotion && !orbiting) v.cam.yaw = 0.62 + Math.sin((now - t0) / 9000) * 0.5;
      baseDraw(now);
    };
    v.resize = function () {
      v.o.cx = narrow.matches ? 0.5 : 0.435;
      v.o.cy = narrow.matches ? 0.5 : 0.56;
      v.cam.dist = narrow.matches ? 10 : 15;
      v.size();
      chart();
    };
    watch(v, cv);
    var orbiting = false, dragged = 0;
    drag(cv, function (dx, dy) {
      dragged += Math.abs(dx) + Math.abs(dy);
      v.cam.yaw -= dx * 0.006;
      v.cam.pitch = clamp(v.cam.pitch + dy * 0.003, 0.05, 1.1);
      v.dirty = true;
    }, function () {
      orbiting = true;
      dragged = 0;
    }, function () {
      orbiting = false;
    });
    cv.addEventListener("pointermove", function (e) {
      var r = cv.getBoundingClientRect(), h = v.hit(e.clientX - r.left, e.clientY - r.top);
      hover(h ? h.g.level : null);
    });
    cv.addEventListener("pointerleave", function () {
      hover(null);
    });
    cv.addEventListener("click", function (e) {
      if (dragged > 4) return;
      var r = cv.getBoundingClientRect(), h = v.hit(e.clientX - r.left, e.clientY - r.top);
      if (h) focus(h.g.level === state.focus ? null : h.g.level);
    });

    function pct(n) {
      return ((n / TOTAL) * 100).toFixed(1) + "%";
    }
    function hover(i) {
      if (state.hover === i) return;
      state.hover = i;
      v.dirty = true;
      chartEl.querySelectorAll("[data-i]").forEach(function (b) {
        b.classList.toggle("is-hover", +b.getAttribute("data-i") === i);
      });
      layersEl.querySelectorAll("button").forEach(function (b, j) {
        b.classList.toggle("is-hover", j === i);
      });
      element();
    }
    function focus(i) {
      state.focus = i;
      state.split = false;
      layersEl.querySelectorAll("button").forEach(function (b, j) {
        b.setAttribute("aria-pressed", j === i);
      });
      element();
      v.dirty = true;
      if (state.chart !== "bars") draw("bars");
      else chart();
    }
    function element() {
      var i = state.hover != null ? state.hover : state.focus;
      elEl.textContent = i == null ? "No element selected" : LV[i][0] + " · " + fmt(LV[i][1]) + " elements · " + pct(LV[i][1]) + " of the model";
    }

    // layers & details, as in the app
    LV.forEach(function (l, i) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button";
      b.innerHTML = "<i aria-hidden=\"true\">›</i><span></span><b></b>";
      b.querySelector("span").textContent = l[0];
      b.querySelector("b").textContent = l[1];
      b.addEventListener("mouseenter", function () {
        hover(i);
      });
      b.addEventListener("mouseleave", function () {
        hover(null);
      });
      b.addEventListener("click", function () {
        focus(state.focus === i ? null : i);
      });
      li.appendChild(b);
      layersEl.appendChild(li);
    });
    app.querySelector('[data-sy="all"]').addEventListener("click", function () {
      state.iso = null;
      focus(null);
    });

    // ---- the chart renderer ----
    var NS = "http://www.w3.org/2000/svg";
    function el(tag, a, parent) {
      var n = document.createElementNS(NS, tag);
      for (var k in a) n.setAttribute(k, a[k]);
      if (parent) parent.appendChild(n);
      return n;
    }
    // a bar with its data end rounded and its base square on the axis
    function bar(x0, y, w, h, r) {
      r = Math.min(r, h / 2, w);
      return "M" + x0 + "," + y + "H" + (x0 + w - r) + "Q" + (x0 + w) + "," + y + " " + (x0 + w) + "," + (y + r) + "V" + (y + h - r) + "Q" + (x0 + w) + "," + (y + h) + " " + (x0 + w - r) + "," + (y + h) + "H" + x0 + "Z";
    }
    function chart() {
      chartEl.textContent = "";
      tableBtn.hidden = !state.chart;
      if (!state.chart) return;
      if (table) return drawTable();
      var W = chartEl.clientWidth, H = chartEl.clientHeight;
      if (!W || !H) return;
      var rows = state.chart === "split" ? [["Levels 01–05", LV.slice(0, 5).reduce(function (s, l) { return s + l[1]; }, 0), -1], ["Level 06 – roof", LV.slice(5).reduce(function (s, l) { return s + l[1]; }, 0), -2]] : LV.map(function (l, i) { return [l[0], l[1], i]; }).reverse();
      var max = state.chart === "split" ? 3000 : 600, ticks = state.chart === "split" ? [0, 1000, 2000, 3000] : [0, 200, 400, 600];
      var L = state.chart === "split" ? 104 : 78, R = 46, T = 6, B = 22, rh = (H - T - B) / rows.length, svg = el("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": state.chart === "split" ? "Bar chart: levels 01 to 05 hold 2,067 elements, level 06 to the roof hold 2,619." : "Bar chart of elements per level, from 176 on the roof to 575 on level 06." }, chartEl);
      var sx = function (n) { return L + (n / max) * (W - L - R); };
      ticks.forEach(function (t) {
        el("line", { x1: sx(t), x2: sx(t), y1: T, y2: H - B, class: "sy-grid" }, svg);
        el("text", { x: sx(t), y: H - 6, class: "sy-tick", "text-anchor": "middle" }, svg).textContent = fmt(t);
      });
      var top = LV.reduce(function (m, l, i) { return l[1] > LV[m][1] ? i : m; }, 0);
      rows.forEach(function (r, j) {
        var y = T + j * rh, bh = Math.max(4, rh * 0.58), i = r[2], g = el("g", { "data-i": i, class: "sy-row" }, svg);
        el("rect", { x: 0, y: y, width: W, height: rh, class: "sy-hit" }, g);
        el("text", { x: L - 10, y: y + rh / 2 + 4, class: "sy-lab", "text-anchor": "end" }, g).textContent = r[0];
        var fill = state.chart === "split" ? (i === -1 ? "#e9e9e4" : ORANGE) : i === state.focus ? ORANGE : "#d4d4cf";
        el("path", { d: bar(L, y + (rh - bh) / 2, Math.max(1, sx(r[1]) - L), bh, 4), fill: fill, class: "sy-bar" }, g);
        // labels: only where they carry the answer
        if (state.chart === "split" || i === state.focus || (state.focus == null && i === top)) el("text", { x: sx(r[1]) + 6, y: y + rh / 2 + 4, class: "sy-val" }, g).textContent = fmt(r[1]);
        g.addEventListener("pointerenter", function (e) {
          if (i >= 0) hover(i);
          tip(e, r);
        });
        g.addEventListener("pointermove", function (e) {
          tip(e, r);
        });
        g.addEventListener("pointerleave", function () {
          if (i >= 0) hover(null);
          tipEl.hidden = true;
        });
        g.addEventListener("click", function () {
          if (i >= 0) focus(state.focus === i ? null : i);
        });
      });
    }
    function tip(e, r) {
      var b = chartEl.getBoundingClientRect();
      tipEl.hidden = false;
      tipEl.textContent = r[0] + " · " + fmt(r[1]) + " elements · " + pct(r[1]);
      tipEl.style.left = clamp(e.clientX - b.left + 12, 0, b.width - tipEl.offsetWidth) + "px";
      tipEl.style.top = e.clientY - b.top - 34 + "px";
    }
    function drawTable() {
      var t = document.createElement("table"), rows = state.chart === "split" ? [["Levels 01–05", 2067], ["Level 06 – roof", 2619]] : LV;
      t.innerHTML = "<thead><tr><th>layer</th><th>elements</th><th>share</th></tr></thead>";
      var tb = document.createElement("tbody");
      rows.forEach(function (r) {
        var tr = document.createElement("tr");
        [r[0], fmt(r[1]), pct(r[1])].forEach(function (c) {
          var td = document.createElement("td");
          td.textContent = c;
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>total</td><td>" + fmt(TOTAL) + "</td><td>100%</td>";
      tb.appendChild(tr);
      t.appendChild(tb);
      chartEl.appendChild(t);
    }
    tableBtn.addEventListener("click", function () {
      table = !table;
      tableBtn.textContent = table ? "chart" : "table";
      chart();
    });
    function draw(kind) {
      state.chart = kind;
      headEl.textContent = kind === "split" ? "• bar chart, 2 bars" : "• bar chart, " + LV.length + " bars";
      chart();
    }

    // ---- the assistant: read the question, think, answer with a chart ----
    var scope = scopeView(app.querySelector(".sy-scope canvas"));
    function ask(text) {
      if (busy) return;
      var t = text.toLowerCase(), m = t.match(/level\s*0?(\d{1,2})/), plan;
      if (/cost|department|budget|price|area/.test(t)) plan = { say: "This model only carries the element count of each level. Costs, departments and areas come from the project’s own CSV in SYNTH-2." };
      else if (/pie/.test(t)) plan = { chart: "bars", say: "Eleven slices are hard to compare in a pie, so here are the same shares as bars. Level 06 holds the most: 575, " + pct(575) + "." };
      else if (m && +m[1] >= 1 && +m[1] <= 10) plan = { chart: "bars", focus: +m[1] - 1, iso: +m[1] - 1, say: LV[+m[1] - 1][0] + " has " + fmt(LV[+m[1] - 1][1]) + " elements, " + pct(LV[+m[1] - 1][1]) + " of the model." };
      else if (/roof/.test(t)) plan = { chart: "bars", focus: 10, iso: 10, say: "The roof has 176 elements, the fewest of any layer." };
      else if (/busiest|most|highest|largest|biggest|max/.test(t)) plan = { chart: "bars", focus: 5, say: "Level 06, with 575 elements. Levels 05, 07 and 08 are within four of it." };
      else if (/least|fewest|smallest|lowest|min/.test(t)) plan = { chart: "bars", focus: 10, say: "The roof, with 176. Of the full floors, level 02 has the fewest: 208." };
      else if (/lower|upper|half|halves|compare|split|top|bottom/.test(t)) plan = { chart: "split", split: true, say: "The upper floors hold more: 2,619 elements from level 06 to the roof, against 2,067 in levels 01 to 05." };
      else if (/total|how many|count|sum/.test(t)) plan = { chart: "bars", say: "4,686 elements in all, across ten levels and the roof." };
      else if (/bar|chart|level|layer|element|show|plot|graph|visual/.test(t)) plan = { chart: "bars", say: "Elements per level, all " + fmt(TOTAL) + " of them. The middle floors, 04 to 08, are the densest." };
      else plan = { say: "I can chart this building’s elements by level. Try “elements per level”, “which level is busiest?”, “lower vs upper floors” or “show level 09”." };
      busy = true;
      scope.think(true);
      var was = headEl.textContent;
      headEl.textContent = "• thinking…";
      statusEl.textContent = "";
      setTimeout(function () {
        busy = false;
        scope.think(false);
        statusEl.textContent = plan.say;
        state.split = !!plan.split;
        state.iso = plan.iso != null ? plan.iso : null;
        state.focus = plan.focus != null ? plan.focus : null;
        layersEl.querySelectorAll("button").forEach(function (b, j) {
          b.setAttribute("aria-pressed", j === state.focus);
        });
        element();
        if (plan.chart) draw(plan.chart);
        else headEl.textContent = was;
        v.dirty = true;
      }, reduceMotion ? 150 : 1100 + Math.random() * 400);
    }
    app.querySelector(".sy-ask").addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = app.querySelector(".sy-ask input");
      if (inp.value.trim()) ask(inp.value);
    });
    app.querySelectorAll(".sy-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        app.querySelector(".sy-ask input").value = b.textContent;
        ask(b.textContent);
      });
    });
    if ("ResizeObserver" in window) new ResizeObserver(function () {
      chart();
    }).observe(chartEl);
    element();
  })();

  // the assistant's oscilloscope: two traces that quicken while it thinks
  function scopeView(cv) {
    if (!cv) return { think: function () {} };
    var ctx = cv.getContext("2d"), k = 0, kt = 0, ph = 0, last = null, s = { visible: true, live: !reduceMotion, dirty: true };
    s.resize = function () {
      cv.width = Math.round(cv.clientWidth * DPR);
      cv.height = Math.round(cv.clientHeight * DPR);
    };
    s.resize();
    s.think = function (on) {
      kt = on ? 1 : 0;
      s.live = true;
    };
    s.draw = function (now) {
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      k += (kt - k) * Math.min(1, dt * 4);
      ph += dt * (1.2 + k * 9);
      if (reduceMotion && kt === 0 && k < 0.01) s.live = false;
      var W = cv.width, H = cv.height, i;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,0.13)";
      ctx.lineWidth = 1;
      for (i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo((W * i) / 8, 0);
        ctx.lineTo((W * i) / 8, H);
        ctx.stroke();
      }
      for (i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (H * i) / 4);
        ctx.lineTo(W, (H * i) / 4);
        ctx.stroke();
      }
      [[2.2 * DPR, 1, 1.6 + k * 2.5, 0.36 + k * 0.08, 0], [1 * DPR, 0.55, 4.2 + k * 6, 0.2 + k * 0.1, 1.3]].forEach(function (tr) {
        ctx.beginPath();
        for (var x = 0; x <= W; x += 3) {
          var u = x / W, y = H / 2 - H * tr[3] * (Math.sin(u * TAU * tr[2] + ph + tr[4]) * 0.8 + Math.sin(u * TAU * tr[2] * 2.1 - ph * 0.7) * 0.2 * (1 + k));
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = "rgba(255,255,255," + tr[1] + ")";
        ctx.lineWidth = tr[0];
        ctx.stroke();
      });
    };
    watch(s, cv);
    return s;
  }

  requestAnimationFrame(loop);
})();

// Robotecture page (src/projects/robotecture.html). A small perspective
// renderer draws a Robotecture grid on canvas: the frame and its legs, the
// units, the telescopic beams and the fabric skin. It runs the 3x3 you can
// drive (#drive) and the kinetic-grid figure. The section diagram is SVG.
// Units are centimetres, as in the paper: 20 cm cells, heights within one cell
// of every neighbour (the frame counts as a neighbour at 0).
(function () {
  "use strict";
  var root = document.querySelector(".rb");
  if (!root) return;
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(devicePixelRatio || 1, 2), TAU = Math.PI * 2, L = 20;
  var C = { ink: "#151412", fabric: [251, 250, 246], wood: "#c9a06c", woodD: "#a87f4c", print: "#f4f2ec", teal: "#0e9f86", amber: "#ff7a1a", panel: [34, 44, 66], bead: "#3c78c8" };

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function deg(r) {
    return (r * 180) / Math.PI;
  }
  function norm(a) {
    var l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
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

  // ------------------------------------------------------------ the grid

  // n x n units inside a frame; lattice index 0 and n+1 are the frame
  function Grid(n) {
    this.n = n;
    this.H = new Float32Array(n * n); // where the units are
    this.T = new Float32Array(n * n); // where they are going
    this.V = new Float32Array(n * n);
  }
  Grid.prototype.at = function (A, i, j) {
    var n = this.n;
    return i <= 0 || j <= 0 || i > n || j > n ? 0 : A[(j - 1) * n + (i - 1)];
  };
  Grid.prototype.x = function (i) {
    return (i - (this.n + 1) / 2) * L;
  };
  // keep every unit within one cell height of its neighbours (the beams cannot pass 45 degrees)
  Grid.prototype.fit = function (A) {
    var n = this.n, lim = L * 0.995;
    for (var pass = 0; pass < 6; pass++) {
      for (var j = 1; j <= n; j++) {
        for (var i = 1; i <= n; i++) {
          var nb = [this.at(A, i - 1, j), this.at(A, i + 1, j), this.at(A, i, j - 1), this.at(A, i, j + 1)];
          A[(j - 1) * n + i - 1] = clamp(A[(j - 1) * n + i - 1], Math.max.apply(null, nb) - lim, Math.min.apply(null, nb) + lim);
        }
      }
    }
  };
  // motors: each unit eases toward its target at the servo's pace (a full 40 cm in about 1.3 s)
  Grid.prototype.step = function (dt, speed) {
    var vmax = 31 * (speed || 1), moved = 0;
    for (var k = 0; k < this.H.length; k++) {
      var want = clamp((this.T[k] - this.H[k]) * 7, -vmax, vmax);
      this.V[k] += clamp(want - this.V[k], -vmax * 9 * dt, vmax * 9 * dt);
      this.H[k] += this.V[k] * dt;
      moved += Math.abs(this.V[k]);
    }
    this.fit(this.H);
    return moved;
  };
  // the fabric: a Catmull-Rom surface through the lattice (u, v in lattice units)
  Grid.prototype.surf = function (u, v) {
    var i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0, s = 0;
    for (var b = -1; b <= 2; b++) {
      var wv = cr(fv, b), row = 0;
      for (var a = -1; a <= 2; a++) row += cr(fu, a) * this.at(this.H, i0 + a, j0 + b);
      s += wv * row;
    }
    return s;
  };
  function cr(t, k) {
    var t2 = t * t, t3 = t2 * t;
    if (k === -1) return 0.5 * (-t3 + 2 * t2 - t);
    if (k === 0) return 0.5 * (3 * t3 - 5 * t2 + 2);
    if (k === 1) return 0.5 * (-3 * t3 + 4 * t2 + t);
    return 0.5 * (t3 - t2);
  }
  Grid.prototype.alpha = function (i, j, axis) {
    // the angle between a motor's two beams, measured beneath the unit (180 = level)
    var b = this.at(this.H, i, j), a = axis ? this.at(this.H, i, j - 1) : this.at(this.H, i - 1, j), c = axis ? this.at(this.H, i, j + 1) : this.at(this.H, i + 1, j);
    return deg(Math.atan2(L, b - a) + Math.atan2(L, b - c));
  };

  // ------------------------------------------------------------ the camera

  function Cam(cv, o) {
    this.cv = cv;
    this.ctx = cv.getContext("2d");
    this.t = o.t || [0, -10, 0];
    this.yaw = o.yaw;
    this.pitch = o.pitch;
    this.dist = o.dist;
    this.fov = o.fov || 0.62;
    this.cy = o.cy || 0.5;
    this.size();
  }
  Cam.prototype.size = function () {
    var w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (!w || !h) return;
    this.cv.width = Math.round(w * DPR);
    this.cv.height = Math.round(h * DPR);
  };
  Cam.prototype.basis = function () {
    var cp = Math.cos(this.pitch), t = this.t;
    var pos = [t[0] + this.dist * Math.sin(this.yaw) * cp, t[1] + this.dist * Math.sin(this.pitch), t[2] + this.dist * Math.cos(this.yaw) * cp];
    var fw = norm(sub(t, pos)), rt = norm(cross(fw, [0, 1, 0]));
    this.B = { pos: pos, fw: fw, rt: rt, up: cross(rt, fw), f: Math.min(this.cv.height, this.cv.width * 0.8) / 2 / Math.tan(this.fov / 2), cx: this.cv.width / 2, cy: this.cv.height * this.cy };
  };
  Cam.prototype.p = function (q) {
    var B = this.B, d = sub(q, B.pos), z = dot(d, B.fw);
    return [B.cx + (B.f * dot(d, B.rt)) / z, B.cy - (B.f * dot(d, B.up)) / z, z];
  };
  Cam.prototype.ground = function (sx, sy, y) {
    var B = this.B, a = (sx * DPR - B.cx) / B.f, b = -(sy * DPR - B.cy) / B.f;
    var d = norm([B.rt[0] * a + B.up[0] * b + B.fw[0], B.rt[1] * a + B.up[1] * b + B.fw[1], B.rt[2] * a + B.up[2] * b + B.fw[2]]);
    if (Math.abs(d[1]) < 1e-3) return null;
    var t = (y - B.pos[1]) / d[1];
    return t > 0 ? [B.pos[0] + d[0] * t, y, B.pos[2] + d[2] * t] : null;
  };

  // ------------------------------------------------------------ a scene: primitives sorted far to near

  var LIGHT = norm([-0.45, 0.85, 0.32]);
  function Scene(cam) {
    this.c = cam;
    this.items = [];
  }
  Scene.prototype.poly = function (w, rgb, alpha, edge, z0) {
    var s = w.map(this.c.p, this.c), z = 0, i;
    for (i = 0; i < s.length; i++) {
      if (s[i][2] < 5) return;
      z += s[i][2] / s.length;
    }
    var n = norm(cross(sub(w[1], w[0]), sub(w[2], w[0])));
    var view = sub(w[0], this.c.B.pos);
    if (dot(n, view) > 0) n = [-n[0], -n[1], -n[2]];
    var l = 0.62 + 0.38 * Math.abs(dot(n, LIGHT));
    this.items.push({ k: 0, s: s, z: z + (z0 || 0), fill: "rgba(" + ((rgb[0] * l) | 0) + "," + ((rgb[1] * l) | 0) + "," + ((rgb[2] * l) | 0) + "," + (alpha == null ? 1 : alpha) + ")", edge: edge });
  };
  // a rod of given world width, cut into pieces so it sorts well against the fabric
  Scene.prototype.rod = function (a, b, w, col, pieces, z0) {
    pieces = pieces || 1;
    for (var k = 0; k < pieces; k++) {
      var t0 = k / pieces, t1 = (k + 1) / pieces;
      var p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0], p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, a[2] + (b[2] - a[2]) * t1];
      var s0 = this.c.p(p0), s1 = this.c.p(p1);
      if (s0[2] < 5 || s1[2] < 5) continue;
      var z = (s0[2] + s1[2]) / 2;
      this.items.push({ k: 1, s: [s0, s1], z: z + (z0 || 0), w: Math.max(0.8 * DPR, (w * this.c.B.f) / z), col: col });
    }
  };
  Scene.prototype.box = function (cx, y0, cz, sx, sy, sz, rgb, edge, z0) {
    var x0 = cx - sx / 2, x1 = cx + sx / 2, z0b = cz - sz / 2, z1 = cz + sz / 2, y1 = y0 + sy, self = this;
    var V = [[x0, y0, z0b], [x1, y0, z0b], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0b], [x1, y1, z0b], [x1, y1, z1], [x0, y1, z1]];
    var cen = [cx, y0 + sy / 2, cz];
    [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]].forEach(function (f) {
      var w = f.map(function (i) { return V[i]; }), fc = [0, 0, 0];
      w.forEach(function (q) {
        fc[0] += q[0] / 4;
        fc[1] += q[1] / 4;
        fc[2] += q[2] / 4;
      });
      if (dot(sub(fc, cen), sub(fc, self.c.B.pos)) >= 0) return; // faces away
      self.poly(w, rgb, 1, edge, z0);
    });
  };
  Scene.prototype.dot = function (q, r, fill, z0, ring) {
    var s = this.c.p(q);
    if (s[2] < 5) return;
    this.items.push({ k: 2, s: s, z: s[2] + (z0 || 0), r: Math.max(1, (r * this.c.B.f) / s[2]), fill: fill, ring: ring });
  };
  Scene.prototype.draw = function () {
    var ctx = this.c.ctx;
    this.items.sort(function (a, b) { return b.z - a.z; });
    ctx.lineJoin = ctx.lineCap = "round";
    this.items.forEach(function (it) {
      if (it.k === 0) {
        ctx.beginPath();
        ctx.moveTo(it.s[0][0], it.s[0][1]);
        for (var i = 1; i < it.s.length; i++) ctx.lineTo(it.s[i][0], it.s[i][1]);
        ctx.closePath();
        ctx.fillStyle = it.fill;
        ctx.fill();
        if (it.edge) {
          ctx.strokeStyle = it.edge;
          ctx.lineWidth = 0.7 * DPR;
          ctx.stroke();
        }
      } else if (it.k === 1) {
        ctx.beginPath();
        ctx.moveTo(it.s[0][0], it.s[0][1]);
        ctx.lineTo(it.s[1][0], it.s[1][1]);
        ctx.strokeStyle = it.col;
        ctx.lineWidth = it.w;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(it.s[0], it.s[1], it.r, 0, TAU);
        ctx.fillStyle = it.fill;
        ctx.fill();
        if (it.ring) {
          ctx.strokeStyle = it.ring;
          ctx.lineWidth = 1.6 * DPR;
          ctx.stroke();
        }
      }
    });
    this.items = [];
  };

  // ------------------------------------------------------------ drawing a Robotecture

  var LEG = 46;
  function build(S, g, o) {
    var n = g.n, i, j, k, sub = o.sub || 4, M = (n + 1) * sub, skin = o.skin, hi = o.hi;
    var x = function (i) { return g.x(i); };
    // frame, legs and joints
    for (i = 0; i <= n + 1; i++) {
      [[i, 0], [i, n + 1], [0, i], [n + 1, i]].forEach(function (q) {
        var p = [x(q[0]), 0, x(q[1])];
        S.rod([p[0], -LEG, p[2]], [p[0], -1, p[2]], 1.3, C.wood, 3);
        S.box(p[0], -LEG, p[2], 3.2, 3, 3.2, [244, 242, 236]);
        S.box(p[0], -3.2, p[2], 4.4, 4.4, 4.4, [244, 242, 236]);
      });
    }
    var e0 = x(0), e1 = x(n + 1);
    [[[e0, 0, e0], [e1, 0, e0]], [[e1, 0, e0], [e1, 0, e1]], [[e1, 0, e1], [e0, 0, e1]], [[e0, 0, e1], [e0, 0, e0]]].forEach(function (s) {
      S.rod(s[0], s[1], 1.3, C.wood, 8);
    });
    // beams: wooden rods sliding in printed tubes that leave each unit
    if (skin !== "skin") {
      for (j = 1; j <= n; j++) {
        for (i = 0; i <= n; i++) {
          [[i, j, i + 1, j], [j, i, j, i + 1]].forEach(function (q) {
            var a = [x(q[0]), g.at(g.H, q[0], q[1]), x(q[1])], b = [x(q[2]), g.at(g.H, q[2], q[3]), x(q[3])];
            var lim = Math.abs(a[1] - b[1]) > L * 0.95;
            S.rod(a, b, 1.0, lim ? C.amber : C.wood, 5);
            var ua = q[0] > 0 && q[1] > 0 && q[0] <= n && q[1] <= n, ub = q[2] > 0 && q[3] > 0 && q[2] <= n && q[3] <= n, len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), t = 9 / len;
            if (ua) S.rod(a, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], 2.1, lim ? C.amber : "#e9e6de", 2, -0.5);
            if (ub) S.rod(b, [b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t, b[2] + (a[2] - b[2]) * t], 2.1, lim ? C.amber : "#e9e6de", 2, -0.5);
          });
        }
      }
      // units: the chassis hangs under its joint
      for (j = 1; j <= n; j++) {
        for (i = 1; i <= n; i++) {
          var h = g.at(g.H, i, j), sel = hi === (j - 1) * n + i - 1;
          S.box(x(i), h - 14, x(j), 7, 15, 5, sel ? [14, 159, 134] : [242, 240, 234], "rgba(21,20,18,.25)");
          S.box(x(i), h - 10, x(j), 4.6, 4, 6.4, [52, 52, 52], null, -0.3);
        }
      }
    }
    // the fabric skin
    if (skin !== "bones") {
      var V = [], u, v;
      for (k = 0; k <= M; k++) {
        V.push([]);
        for (var m = 0; m <= M; m++) {
          u = m / sub;
          v = k / sub;
          V[k].push([x(u), g.surf(u, v) + 1.6, x(v)]);
        }
      }
      var a = skin === "xray" ? 0.38 : 1, col = C.fabric;
      for (k = 0; k < M; k++) {
        for (m = 0; m < M; m++) {
          var q = [V[k][m], V[k][m + 1], V[k + 1][m + 1], V[k + 1][m]], fc = o.tint ? o.tint(m / sub + 0.5 / sub, k / sub + 0.5 / sub, q) : null;
          S.poly(q, fc || col, a, null, -0.6);
        }
      }
      // the skirt where the fabric folds over the frame
      var edge = [];
      for (m = 0; m < M; m++) edge.push([V[0][m], V[0][m + 1]], [V[M][m + 1], V[M][m]], [V[m + 1][0], V[m][0]], [V[m][M], V[m + 1][M]]);
      var out = function (p) {
        var mx = Math.max(Math.abs(p[0]), Math.abs(p[2])) || 1;
        return [p[0] + (p[0] / mx) * 3.4, -6, p[2] + (p[2] / mx) * 3.4];
      };
      // drawn after the frame it wraps
      edge.forEach(function (s) {
        S.poly([s[0], s[1], out(s[1]), out(s[0])], col, a, null, -6);
      });
    }
  }

  // ------------------------------------------------------------ one loop for everything that moves

  var runs = [];
  function loop(now) {
    var dt = Math.min(0.05, (now - (loop.t || now)) / 1000);
    loop.t = now;
    runs.forEach(function (r) {
      if (r.visible) r.frame(dt, now);
    });
    requestAnimationFrame(loop);
  }
  function watch(r, el) {
    runs.push(r);
    r.visible = true;
    if ("IntersectionObserver" in window) {
      r.visible = false;
      new IntersectionObserver(function (es) {
        r.visible = es[0].isIntersecting;
      }, { rootMargin: "120px 0px" }).observe(el);
    }
  }
  function resized(fn) {
    var t = 0;
    addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(fn, 150);
    });
  }

  // ------------------------------------------------------------ 02: the kinetic grid

  (function () {
    var cv = root.querySelector(".rb-kinetic");
    if (!cv) return;
    var steps = root.querySelectorAll(".rb-steps button"), cam = new Cam(cv, { t: [0, -4, 0], yaw: 0.72, pitch: 0.58, dist: 360, fov: 0.6, cy: 0.5 });
    var g = new Grid(7), S = new Scene(cam), step = 0, auto = !reduceMotion, since = 0, t = 0;
    function pick(k) {
      step = k;
      since = 0;
      steps.forEach(function (b, i) {
        b.setAttribute("aria-pressed", i === k);
      });
    }
    steps.forEach(function (b, i) {
      b.addEventListener("click", function () {
        auto = false;
        pick(i);
      });
    });
    pick(0);
    var r = {
      frame: function (dt) {
        t += dt;
        since += dt;
        if (auto && since > 3.4) pick((step + 1) % 4);
        var n = g.n, i, j;
        for (j = 1; j <= n; j++) {
          for (i = 1; i <= n; i++) {
            var x = g.x(i), z = g.x(j), k = (j - 1) * n + i - 1;
            g.T[k] = step === 1 ? 46 * Math.exp(-((x - 30) * (x - 30) + (z + 20) * (z + 20)) / 2600) - 30 * Math.exp(-((x + 40) * (x + 40) + (z - 30) * (z - 30)) / 2200) : step === 3 ? 30 * Math.sin(x / 26 - t * 1.4) * Math.cos(z / 34 + t * 0.6) : 0;
          }
        }
        g.step(dt, 1.4);
        cam.yaw = 0.72 + Math.sin(t * 0.12) * 0.12;
        cam.basis();
        var ctx = cam.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        var M = (n + 1) * 3, sub = 3, P = [];
        for (j = 0; j <= M; j++) {
          P.push([]);
          for (i = 0; i <= M; i++) P[j].push(cam.p([g.x(i / sub), g.surf(i / sub, j / sub), g.x(j / sub)]));
        }
        if (step < 2) {
          // a plain surface: shaded quads, no lines
          for (j = 0; j < M; j++) {
            for (i = 0; i < M; i++) {
              S.poly([[g.x(i / sub), g.surf(i / sub, j / sub), g.x(j / sub)], [g.x((i + 1) / sub), g.surf((i + 1) / sub, j / sub), g.x(j / sub)], [g.x((i + 1) / sub), g.surf((i + 1) / sub, (j + 1) / sub), g.x((j + 1) / sub)], [g.x(i / sub), g.surf(i / sub, (j + 1) / sub), g.x((j + 1) / sub)]], [236, 233, 226], 1);
            }
          }
          S.draw();
        } else {
          // the grid: lines along both directions, nodes where the units are
          ctx.strokeStyle = "rgba(21,20,18,.78)";
          ctx.lineWidth = 1.1 * DPR;
          for (j = 0; j <= M; j += sub) {
            ctx.beginPath();
            for (i = 0; i <= M; i++) i ? ctx.lineTo(P[j][i][0], P[j][i][1]) : ctx.moveTo(P[j][i][0], P[j][i][1]);
            ctx.stroke();
            ctx.beginPath();
            for (i = 0; i <= M; i++) i ? ctx.lineTo(P[i][j][0], P[i][j][1]) : ctx.moveTo(P[i][j][0], P[i][j][1]);
            ctx.stroke();
          }
          if (step === 3) {
            // one unit, its four beams in signal colour
            var ci = 3 * sub, cj = 4 * sub;
            ctx.strokeStyle = C.teal;
            ctx.lineWidth = 2.4 * DPR;
            [[ci - sub, cj], [ci + sub, cj], [ci, cj - sub], [ci, cj + sub]].forEach(function (q) {
              ctx.beginPath();
              ctx.moveTo(P[cj][ci][0], P[cj][ci][1]);
              for (var s = 1; s <= sub; s++) {
                var ii = ci + Math.sign(q[0] - ci) * s, jj = cj + Math.sign(q[1] - cj) * s;
                ctx.lineTo(P[jj][ii][0], P[jj][ii][1]);
              }
              ctx.stroke();
            });
            for (j = sub; j < M; j += sub) {
              for (i = sub; i < M; i += sub) {
                ctx.beginPath();
                ctx.arc(P[j][i][0], P[j][i][1], (i === ci && j === cj ? 5 : 2.6) * DPR, 0, TAU);
                ctx.fillStyle = i === ci && j === cj ? C.teal : C.ink;
                ctx.fill();
              }
            }
          }
        }
      },
    };
    watch(r, cv);
    resized(function () {
      cam.size();
    });
  })();

  // ------------------------------------------------------------ 03: drive it

  var drive = null;
  (function () {
    var con = root.querySelector(".rb-console");
    if (!con) return;
    var cv = con.querySelector(".rb-view"), cam = new Cam(cv, { t: [0, -12, 0], yaw: 0.62, pitch: 0.46, dist: 185, fov: 0.6, cy: 0.52 });
    var g = new Grid(3), S = new Scene(cam), n = 3, t = 0;
    var lcd = con.querySelector(".rb-lcd__grid"), lcdMode = con.querySelector(".rb-lcd__mode"), lcdStat = con.querySelector(".rb-lcd__stat");
    var hint = root.querySelector(".rb-hint"), keys = con.querySelectorAll(".rb-key"), skins = con.querySelectorAll("[data-skin]"), sunRow = con.querySelector(".rb-sun"), sunIn = con.querySelector(".rb-sun input");
    var mode = "flat", skin = "skin", sel = -1, aim = null, ball = null, beads = [], drops = [], hold = 0, sun = 13;
    var HINT = {
      flat: "level. press a mode, or grab a unit and pull it up or down. drag the empty space to walk around it.",
      wave: "a travelling wave. every unit stays within one cell height of its neighbours, so the beams never pass 45°.",
      opera: "an opera house: the ceiling rises into a dome to reflect the singer’s voice toward the audience.",
      ceiling: "a ceiling that comes down to you: the node holding a broken light bulb lowers within reach, then rises again.",
      solar: "a solar roof follows the sun across the day, so the panels face it. slide the time.",
      rain: "when it rains, the roof sinks in the middle and gathers the water to one point.",
      table: "a reading table: it lifts a slope under the book, in front of the reader.",
      bed: "a bed that wakes you: when the alarm rings, it folds into a chair and sits you up.",
      terrain: "a terrain for projection mapping and VR: hills and valleys you can touch.",
      ball: "object handling: move over the surface. it tilts so the ball rolls to your hand.",
      custom: "your own shape. α is each motor’s angle between its two beams, from the paper’s equation.",
    };
    var SHAPES = {
      flat: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      opera: [12, 17, 12, 17, 33, 17, 12, 17, 12],
      ceiling: [-6, -18, -6, -18, -36, -18, -6, -18, -6],
      rain: [-8, -17, -8, -17, -34, -17, -8, -17, -8],
      table: [0, 0, 0, 2, 10, 2, 6, 18, 6],
      bed: [18, 20, 18, 8, 12, 8, -4, -2, -4],
      terrain: [10, -4, 14, -2, 16, 6, 12, 0, -10],
    };
    var ARCH = { flat: 1, opera: 1, ceiling: 1, solar: 1, rain: 1, custom: 1 };

    function setMode(m, quiet) {
      mode = m;
      hold = 0;
      keys.forEach(function (k) {
        var on = k.getAttribute("data-mode") === m;
        k.setAttribute("aria-checked", on);
        k.tabIndex = on || (m === "custom" && k.getAttribute("data-mode") === "flat") ? 0 : -1;
      });
      lcdMode.textContent = m;
      hint.textContent = HINT[m];
      sunRow.hidden = m !== "solar";
      if (SHAPES[m]) for (var k = 0; k < 9; k++) g.T[k] = SHAPES[m][k];
      if (m === "ball") ball = { x: -24, z: 22, vx: 0, vz: 0 };
      else ball = null;
      if (m !== "rain") drops = [];
    }
    keys.forEach(function (k) {
      k.addEventListener("click", function () {
        setMode(k.getAttribute("data-mode"));
      });
    });
    con.querySelector(".rb-keys").addEventListener("keydown", function (e) {
      var list = Array.prototype.slice.call(keys), i = list.findIndex(function (k) { return k.getAttribute("aria-checked") === "true"; }), cols = 5;
      var j = { ArrowRight: i + 1, ArrowDown: i + cols, ArrowLeft: i - 1, ArrowUp: i - cols }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      j = (j + list.length) % list.length;
      setMode(list[j].getAttribute("data-mode"));
      list[j].focus();
    });
    skins.forEach(function (b) {
      b.addEventListener("click", function () {
        skin = b.getAttribute("data-skin");
        skins.forEach(function (o) {
          o.setAttribute("aria-pressed", o === b);
        });
      });
    });
    sunIn.addEventListener("input", function () {
      sun = +sunIn.value;
      con.querySelector(".rb-sun output").textContent = String(Math.floor(sun)).padStart(2, "0") + ":" + (sun % 1 ? "30" : "00");
    });

    // the readout: each unit's height and its two motors' angles
    var cells = [];
    for (var k = 0; k < 9; k++) {
      var c = document.createElement("div");
      c.className = "rb-cell";
      c.innerHTML = "<b></b><span></span><span></span>";
      lcd.appendChild(c);
      cells.push(c);
    }

    function targets(dt) {
      var i, j, k;
      if (mode === "wave") {
        for (j = 1; j <= n; j++) for (i = 1; i <= n; i++) g.T[(j - 1) * n + i - 1] = 17 * Math.sin(g.x(i) / 16 + g.x(j) / 30 - t * 2.4);
      } else if (mode === "solar") {
        // the sun from the east (+x) at 06:00 to the west at 18:00; the roof tips its panels toward it
        var ph = (Math.PI * (sun - 6)) / 12, dx = Math.cos(ph), dz = Math.sin(ph) * 0.55, el = Math.sin(ph), kk = 0.95 - 0.55 * el;
        for (j = 1; j <= n; j++) for (i = 1; i <= n; i++) g.T[(j - 1) * n + i - 1] = -kk * (g.x(i) * dx + g.x(j) * dz);
      } else if (mode === "ceiling") {
        // down, a pause to change the bulb, back up
        hold += dt;
        var down = hold % 9 < 6;
        for (k = 0; k < 9; k++) g.T[k] = down ? SHAPES.ceiling[k] : 0;
      } else if (mode === "ball" && ball) {
        var to = aim || { x: 26 * Math.cos(t * 0.6), z: 26 * Math.sin(t * 0.6) }, ddx = to.x - ball.x, ddz = to.z - ball.z, d = Math.hypot(ddx, ddz), slope = clamp(d / 30, 0, 1) * 0.75;
        for (j = 1; j <= n; j++) for (i = 1; i <= n; i++) g.T[(j - 1) * n + i - 1] = d > 1 ? -slope * (((g.x(i) - ball.x) * ddx + (g.x(j) - ball.z) * ddz) / d) : 0;
      }
      g.fit(g.T);
    }
    function slide(p, dt, damp, lim) {
      var e = 0.6, sx = (g.surf(p.x / L + 2 + e / L, p.z / L + 2) - g.surf(p.x / L + 2 - e / L, p.z / L + 2)) / (2 * e), sz = (g.surf(p.x / L + 2, p.z / L + 2 + e / L) - g.surf(p.x / L + 2, p.z / L + 2 - e / L)) / (2 * e);
      p.vx += -sx * 980 * 0.55 * dt;
      p.vz += -sz * 980 * 0.55 * dt;
      p.vx *= 1 - damp * dt;
      p.vz *= 1 - damp * dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      if (Math.abs(p.x) > lim) {
        p.x = clamp(p.x, -lim, lim);
        p.vx *= -0.4;
      }
      if (Math.abs(p.z) > lim) {
        p.z = clamp(p.z, -lim, lim);
        p.vz *= -0.4;
      }
    }

    function frame(dt) {
      t += dt;
      targets(dt);
      g.step(dt);
      if (ball) slide(ball, dt, 1.4, 36);
      if (mode === "rain") {
        if (drops.length < 70 && Math.random() < dt * 40) drops.push({ x: (Math.random() - 0.5) * 76, z: (Math.random() - 0.5) * 76, y: 70 + Math.random() * 20 });
        drops = drops.filter(function (d) {
          d.y -= 160 * dt;
          if (d.y <= g.surf(d.x / L + 2, d.z / L + 2) + 2) {
            if (beads.length < 160) beads.push({ x: d.x, z: d.z, vx: 0, vz: 0, a: 1 });
            return false;
          }
          return true;
        });
      }
      beads.forEach(function (b) {
        slide(b, dt, 3, 38);
        if (mode !== "rain") b.a -= dt * 0.8;
      });
      beads = beads.filter(function (b) { return b.a > 0; });
      draw();
      readout();
    }

    function tint(u, v) {
      if (mode === "solar" && Math.abs(u - 2) < 0.75 && Math.abs(v - 2) < 0.5) return C.panel;
      if (mode === "terrain") {
        var h = g.surf(u, v), q = clamp((h + 16) / 34, 0, 1);
        return [Math.round(96 + 140 * q), Math.round(132 + 90 * q - 20 * q * q), Math.round(92 + 100 * q)];
      }
      return null;
    }

    function draw() {
      cam.basis();
      var ctx = cam.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      // a ground shadow
      var gp = [[-48, -LEG, -48], [48, -LEG, -48], [48, -LEG, 48], [-48, -LEG, 48]].map(cam.p, cam);
      ctx.beginPath();
      gp.forEach(function (p, i) {
        i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(21,20,18,.06)";
      ctx.fill();
      if (mode === "solar") {
        var ph = (Math.PI * (sun - 6)) / 12, sp = cam.p([Math.cos(ph) * 260, 30 + Math.sin(ph) * 170, Math.sin(ph) * 140]);
        if (sp[2] > 0) {
          ctx.beginPath();
          ctx.arc(sp[0], sp[1], 16 * DPR, 0, TAU);
          ctx.fillStyle = C.amber;
          ctx.fill();
        }
      }
      build(S, g, { skin: skin, hi: sel, tint: tint });
      if (ARCH[mode]) {
        // scale figures under the roof, as in the model photographs
        [[-14, 6], [-9, 8], [16, -12], [21, -10]].forEach(function (q, k) {
          S.rod([q[0], -LEG, q[1]], [q[0], -LEG + 6.6, q[1]], 0.9, "#2a2826", 1);
          S.dot([q[0], -LEG + 7.6, q[1]], 0.75, "#2a2826");
        });
      }
      if (mode === "ceiling") {
        var hc = g.at(g.H, 2, 2);
        S.rod([0, hc - 14, 0], [0, hc - 22, 0], 0.4, "#2a2826", 1);
        S.dot([0, hc - 24, 0], 2.4, "#ffd36b", 0, "rgba(21,20,18,.4)");
      }
      if (ball) S.dot([ball.x, g.surf(ball.x / L + 2, ball.z / L + 2) + 5.2, ball.z], 3.5, "#79c9c0", -2, "rgba(21,20,18,.25)");
      drops.forEach(function (d) {
        S.rod([d.x, d.y, d.z], [d.x, d.y + 4, d.z], 0.35, "rgba(60,120,200,.7)", 1);
      });
      beads.forEach(function (b) {
        S.dot([b.x, g.surf(b.x / L + 2, b.z / L + 2) + 2.4, b.z], 0.9, "rgba(60,120,200," + b.a.toFixed(2) + ")", -1.5);
      });
      S.draw();
    }

    function readout() {
      var up = 0, lim = 0;
      for (var j = 1; j <= n; j++) {
        for (var i = 1; i <= n; i++) {
          var k = (j - 1) * n + i - 1, h = g.H[k], c = cells[k], ax = g.alpha(i, j, 0), az = g.alpha(i, j, 1);
          c.children[0].textContent = (h >= 0.5 ? "+" : h <= -0.5 ? "−" : " ") + Math.abs(Math.round(h)).toString().padStart(2, "0");
          c.children[1].textContent = "αx " + Math.round(ax) + "°";
          c.children[2].textContent = "αz " + Math.round(az) + "°";
          c.classList.toggle("is-sel", k === sel);
          if (Math.min(ax, az) < 92 || Math.max(ax, az) > 268) lim++;
          if (Math.abs(h - g.T[k]) > 0.6) up++;
        }
      }
      lcdStat.textContent = up ? "18 motors · shaping" : lim ? "18 motors · at the 45° limit" : "18 motors · holding";
    }

    // ---- pointer: grab a unit to lift it; drag empty space to walk around; in ball mode, lead the ball ----
    var grab = null, orbit = null;
    function local(e) {
      var r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    function unitAt(p) {
      cam.basis();
      var best = -1, bd = 26;
      for (var j = 1; j <= n; j++) {
        for (var i = 1; i <= n; i++) {
          var h = g.at(g.H, i, j);
          [h + 1.6, h - 6].forEach(function (y) {
            var s = cam.p([g.x(i), y, g.x(j)]), d = Math.hypot(s[0] / DPR - p[0], s[1] / DPR - p[1]);
            if (d < bd) {
              bd = d;
              best = (j - 1) * n + i - 1;
            }
          });
        }
      }
      return best;
    }
    cv.addEventListener("pointerdown", function (e) {
      var p = local(e), k = mode === "ball" ? -1 : unitAt(p);
      cv.setPointerCapture(e.pointerId);
      if (k >= 0) {
        if (mode !== "custom") {
          for (var q = 0; q < 9; q++) g.T[q] = g.H[q];
          setMode("custom", true);
        }
        sel = k;
        var i = (k % n) + 1, j = Math.floor(k / n) + 1, h = g.H[k];
        cam.basis();
        var a = cam.p([g.x(i), h, g.x(j)]), b = cam.p([g.x(i), h + 10, g.x(j)]);
        grab = { k: k, y: p[1], h: g.T[k], per: (a[1] - b[1]) / DPR / 10 };
      } else if (mode !== "ball") orbit = { x: p[0], y: p[1], yaw: cam.yaw, pitch: cam.pitch };
    });
    cv.addEventListener("pointermove", function (e) {
      var p = local(e);
      if (grab) {
        g.T[grab.k] = clamp(grab.h + (grab.y - p[1]) / grab.per, -40, 40);
        g.fit(g.T);
      } else if (orbit) {
        cam.yaw = orbit.yaw - (p[0] - orbit.x) * 0.008;
        cam.pitch = clamp(orbit.pitch + (p[1] - orbit.y) * 0.004, 0.08, 1.2);
      } else if (mode === "ball") {
        cam.basis();
        var w = cam.ground(p[0], p[1], 0);
        aim = w ? { x: clamp(w[0], -34, 34), z: clamp(w[2], -34, 34) } : null;
      }
    });
    function up() {
      grab = null;
      orbit = null;
    }
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "mouse") aim = null;
    });
    // keys 1-9 pick a unit; arrows lift and lower it
    cv.addEventListener("keydown", function (e) {
      var d = parseInt(e.key, 10);
      if (d >= 1 && d <= 9) {
        sel = d - 1;
        e.preventDefault();
        return;
      }
      if (sel < 0 || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      if (mode !== "custom") {
        for (var q = 0; q < 9; q++) g.T[q] = g.H[q];
        setMode("custom", true);
      }
      g.T[sel] = clamp(g.T[sel] + (e.key === "ArrowUp" ? 4 : -4), -40, 40);
      g.fit(g.T);
    });

    setMode("flat");
    var r = { frame: frame };
    watch(r, cv);
    resized(function () {
      cam.size();
    });
    drive = function (m) {
      setMode(m);
    };
  })();

  // scenario cards: run their shape on the model
  root.querySelectorAll("[data-run]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!drive) return;
      drive(b.getAttribute("data-run"));
      var c = root.querySelector(".rb-console");
      c.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    });
  });

  // ------------------------------------------------------------ 04: one line, in section

  (function () {
    var svg = root.querySelector(".rb-section svg");
    if (!svg) return;
    var NS = "http://www.w3.org/2000/svg", px = 7, base = 330, X = [100, 240, 380, 520, 660], hs = [0, 12, 26, 10, 0];
    var out = {
      a1: root.querySelector("[data-o=a1]"), a2: root.querySelector("[data-o=a2]"), al: root.querySelector("[data-o=al]"),
      a: root.querySelector("[data-o=a]"), b: root.querySelector("[data-o=b]"), c: root.querySelector("[data-o=c]"), turn: root.querySelector("[data-o=turn]"),
    };
    var sel = 2;
    function el(tag, a, parent) {
      var n = document.createElementNS(NS, tag);
      for (var k in a) n.setAttribute(k, a[k]);
      (parent || svg).appendChild(n);
      return n;
    }
    function y(h) {
      return base - h * px;
    }
    var g = el("g", {});
    function draw() {
      g.textContent = "";
      el("line", { x1: 60, x2: 700, y1: base, y2: base, class: "rb-sec__datum" }, g);
      el("text", { x: 706, y: base + 4, class: "rb-sec__small" }, g).textContent = "0";
      // spans
      for (var k = 0; k < 4; k++) {
        var a = [X[k], y(hs[k])], b = [X[k + 1], y(hs[k + 1])], len = Math.hypot(b[0] - a[0], b[1] - a[1]), lim = Math.abs(hs[k] - hs[k + 1]) > 19.6;
        el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "rb-sec__rod" + (lim ? " is-lim" : "") }, g);
        [[a, b, k > 0], [b, a, k + 1 < 4]].forEach(function (q) {
          if (!q[2]) return;
          var t = 70 / len;
          el("line", { x1: q[0][0], y1: q[0][1], x2: q[0][0] + (q[1][0] - q[0][0]) * t, y2: q[0][1] + (q[1][1] - q[0][1]) * t, class: "rb-sec__tube" + (lim ? " is-lim" : "") }, g);
        });
        el("text", { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - 12, class: "rb-sec__small", "text-anchor": "middle" }, g).textContent = (len / px).toFixed(1) + " cm";
      }
      // frame posts
      [0, 4].forEach(function (k) {
        el("rect", { x: X[k] - 8, y: base - 8, width: 16, height: 16, class: "rb-sec__frame" }, g);
        el("line", { x1: X[k], y1: base + 8, x2: X[k], y2: base + 90, class: "rb-sec__leg" }, g);
      });
      // units, with the angle beneath each
      for (k = 1; k <= 3; k++) {
        var p = [X[k], y(hs[k])], al = deg(Math.atan2(L, hs[k] - hs[k - 1]) + Math.atan2(L, hs[k] - hs[k + 1]));
        var dl = Math.atan2(y(hs[k - 1]) - p[1], X[k - 1] - p[0]), dr = Math.atan2(y(hs[k + 1]) - p[1], X[k + 1] - p[0]), R = 34;
        el("path", { d: "M" + (p[0] + R * Math.cos(dr)) + "," + (p[1] + R * Math.sin(dr)) + "A" + R + "," + R + " 0 " + (al > 180 ? 1 : 0) + " 1 " + (p[0] + R * Math.cos(dl)) + "," + (p[1] + R * Math.sin(dl)), class: "rb-sec__arc" + (k === sel ? " is-sel" : "") }, g);
        el("text", { x: p[0], y: p[1] + 58, class: "rb-sec__alpha", "text-anchor": "middle" }, g).textContent = Math.round(al) + "°";
        el("rect", { x: p[0] - 13, y: p[1] - 40, width: 26, height: 46, rx: 3, class: "rb-sec__unit" + (k === sel ? " is-sel" : "") }, g);
        el("circle", { cx: p[0], cy: p[1], r: 7, class: "rb-sec__motor" }, g);
        var hit = el("circle", { cx: p[0], cy: p[1] - 14, r: 30, class: "rb-sec__hit", "data-k": k, tabindex: 0, role: "slider", "aria-label": "Unit " + k + " height", "aria-valuemin": -40, "aria-valuemax": 40, "aria-valuenow": Math.round(hs[k]), "aria-valuetext": Math.round(hs[k]) + " centimetres" }, g);
        hit.addEventListener("keydown", key);
      }
      // a, b, c for the selected unit
      var a0 = hs[sel - 1], b0 = hs[sel], c0 = hs[sel + 1], a1 = deg(Math.atan2(L, b0 - a0)), a2 = deg(Math.atan2(L, b0 - c0));
      out.a.textContent = a0.toFixed(1);
      out.b.textContent = b0.toFixed(1);
      out.c.textContent = c0.toFixed(1);
      out.a1.textContent = a1.toFixed(1) + "°";
      out.a2.textContent = a2.toFixed(1) + "°";
      out.al.textContent = (a1 + a2).toFixed(1) + "°";
      out.turn.textContent = a1 + a2 < 179.5 ? "the unit is above its neighbours: it lifts" : a1 + a2 > 180.5 ? "the unit is below its neighbours: it lowers" : "level: the two beams make a straight line";
    }
    function bounds(k) {
      return [Math.max(hs[k - 1], hs[k + 1]) - L, Math.min(hs[k - 1], hs[k + 1]) + L];
    }
    function set(k, h) {
      var b = bounds(k);
      hs[k] = clamp(h, b[0], b[1]);
      sel = k;
      draw();
    }
    function key(e) {
      var k = +e.target.getAttribute("data-k"), d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      set(k, hs[k] + d);
      svg.querySelector('[data-k="' + k + '"]').focus();
    }
    var drag = null;
    svg.addEventListener("pointerdown", function (e) {
      var k = +(e.target.getAttribute && e.target.getAttribute("data-k"));
      if (!k) return;
      svg.setPointerCapture(e.pointerId);
      drag = k;
      sel = k;
      draw();
    });
    svg.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      var q = pt.matrixTransform(svg.getScreenCTM().inverse());
      set(drag, (base - q.y + 14) / px);
    });
    svg.addEventListener("pointerup", function () {
      drag = null;
    });
    draw();
  })();

  // ------------------------------------------------------------ the exploded unit: point at a part

  root.querySelectorAll("[data-anat]").forEach(function (sec) {
    var fig = sec.querySelector(".rb-anat__fig"), box = sec.querySelector(".rb-anat__box"), items = sec.querySelectorAll("[data-box]");
    function show(btn) {
      items.forEach(function (b) {
        b.setAttribute("aria-current", b === btn);
      });
      if (!btn) return fig.classList.remove("is-on");
      var q = btn.getAttribute("data-box").split(" ");
      box.style.left = q[0] + "%";
      box.style.top = q[1] + "%";
      box.style.width = q[2] + "%";
      box.style.height = q[3] + "%";
      fig.classList.add("is-on");
    }
    items.forEach(function (b) {
      ["mouseenter", "focus", "click"].forEach(function (ev) {
        b.addEventListener(ev, function () {
          show(b);
        });
      });
    });
    sec.querySelector(".rb-anat__list").addEventListener("mouseleave", function () {
      show(null);
    });
  });

  // ------------------------------------------------------------ the film: a poster until asked

  var play = root.querySelector(".rb-film__play");
  if (play) {
    play.addEventListener("click", function (e) {
      e.preventDefault();
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + play.getAttribute("data-video") + "?autoplay=1&rel=0&playsinline=1";
      f.title = "Robotecture, the film";
      f.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      f.allowFullscreen = true;
      play.replaceWith(f);
      f.focus();
    });
  }

  if (reduceMotion) {
    root.querySelectorAll("video[autoplay]").forEach(function (v) {
      v.removeAttribute("autoplay");
      v.pause();
      v.controls = true;
    });
  }

  requestAnimationFrame(loop);
})();

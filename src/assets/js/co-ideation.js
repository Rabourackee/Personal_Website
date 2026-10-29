// Co-Ideation page (src/projects/co-ideation-across-time.html): every
// interactive part. Each block looks for its own markup and skips quietly if
// it's absent; without JavaScript the page reads as a static document.
(function () {
  "use strict";
  if (!document.querySelector(".ci")) return;

  var SVGNS = "http://www.w3.org/2000/svg";
  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DEG = Math.PI / 180;

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

  function html(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function onVisible(target, cb) {
    if (!("IntersectionObserver" in window)) return cb(true);
    new IntersectionObserver(function (entries) {
      cb(entries[0].isIntersecting);
    }, { rootMargin: "60px" }).observe(target);
  }

  function svgPoint(svg, e) {
    var pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function wedge(r0, r1, half) {
    var a = -half * DEG, b = half * DEG;
    return "M" + r0 * Math.cos(a) + " " + r0 * Math.sin(a) + " L" + r1 * Math.cos(a) + " " + r1 * Math.sin(a) +
      " A" + r1 + " " + r1 + " 0 0 1 " + r1 * Math.cos(b) + " " + r1 * Math.sin(b) +
      " L" + r0 * Math.cos(b) + " " + r0 * Math.sin(b) + " A" + r0 + " " + r0 + " 0 0 0 " + r0 * Math.cos(a) + " " + r0 * Math.sin(a) + "Z";
  }

  function arc(r, a0, a1) {
    var x0 = r * Math.cos(a0 * DEG), y0 = r * Math.sin(a0 * DEG), x1 = r * Math.cos(a1 * DEG), y1 = r * Math.sin(a1 * DEG);
    return "M" + x0 + " " + y0 + " A" + r + " " + r + " 0 0 1 " + x1 + " " + y1;
  }

  function angDiff(a, b) {
    var d = ((a - b) % 360 + 540) % 360 - 180;
    return Math.abs(d);
  }

  // ------------------------------------------------------------ canvas simulator

  (function () {
    var root = document.querySelector(".ci-sim");
    if (!root) return;
    var svg = root.querySelector(".ci-sim__svg");
    var logEl = root.querySelector(".ci-log");
    var hint = root.querySelector(".ci-sim__hint");
    var selBox = root.querySelector(".ci-sim__sel");
    var selText = root.querySelector(".ci-sim__seltext");
    var moveEls = {};
    root.querySelectorAll("[data-move]").forEach(function (n) {
      moveEls[n.dataset.move] = n;
    });

    var W = 1000, H = 600;
    var ROOM = { id: "room", x: 300, y: 300, r: 96 };
    var BIN = { x: 24, y: 500, w: 150, h: 76 };
    var TRAY = { x: 822, y: 36, w: 156, h: 380 };

    function short(t) {
      t = t.split(" · ")[0];
      if (t.length <= 20) return t;
      var cut = t.slice(0, 20);
      return cut.slice(0, cut.lastIndexOf(" ")) + "…";
    }

    var MENTORS = {
      hci: {
        name: "HCI researcher", color: "#3d6fd6", home: { x: 900, y: 150 }, base: -45,
        intro: "How about a controller that changes shape or resistance as the game state changes? Right now it's graspable, but it's a generic handle: the same buttons whether you're flying a plane or swinging a sword.",
        ideas: [
          { t: "collapsing when you lose", c: ["grip firmness = health", "Map health to firmness. The grip softens as you take damage, and folds when you're out."], d: ["a controller that gets tired", "Flip it. The controller loses its shape when you've played too long, not when you lose."] },
          { t: "tension: stiffens or goes slack with the game", c: ["variable-stiffness triggers", "Start with the triggers: tight in a boss fight, slack in the menus."], d: ["one controller, two players", "What if the tension is between two players, pulling on one shared controller?"] },
          { t: "temperature as narrative", c: ["thermal thumbs", "A warm patch under each thumb in safe rooms, and cold just before an ambush."], d: ["the room is the controller", "Leave the hands alone. Let the air in the room change with the story."] },
        ],
        conv: function (t) {
          return [short(t) + " · prototype", "Make “" + t + "” physical first: one working prototype, then a play test."];
        },
        div: function (t) {
          return [short(t) + " · inverted", "Turn “" + t + "” inside out. What if the player reshapes it, instead of the game?"];
        },
      },
      leo: {
        name: "Leonardo", color: "#d6478f", home: { x: 900, y: 310 }, base: 45,
        intro: "What kind of mechanism and material do you want to use for the video game controller? Have you considered:",
        ideas: [
          { t: "a glove that reads finger motion", c: ["string-tendon glove", "A waxed cord along each finger, read like the strings of a lute."], d: ["a breath controller", "Why the hand at all? Read the breath, as a flute does."] },
          { t: "a trigger that fights back like a crossbow", c: ["drawn-string trigger", "A ratchet and a spring: the trigger must be drawn back before it can fire."], d: ["clockwork buttons", "Make every button a small machine you wind up before you play."] },
          { t: "a grip cast from the player's own hands", c: ["cast-resin grip", "Press the hands into clay, cast the grip in resin, then fit the sensors."], d: ["the toy as controller", "Cast the controller around a toy the player already loves."] },
        ],
        conv: function (t) {
          return [short(t) + " · drawn", "Draw “" + t + "” as a mechanism first: every lever, spring and pivot."];
        },
        div: function (t) {
          return [short(t) + " · from nature", "What creature already does “" + t + "”? Study it before you build."];
        },
      },
    };
    var SECTORS = [
      { key: "converge", mid: -90, color: "#2f9a6a" },
      { key: "diverge", mid: 30, color: "#e0541b" },
      { key: "talk", mid: 150, color: "#8a8f9c" },
    ];

    // ---- static layers ----
    var defs = el("defs", {}, svg);
    el("path", { id: "ci-rim", d: "M0 -51 A51 51 0 1 1 -0.01 -51" }, defs);
    var gTray = el("g", {}, svg);
    el("rect", { class: "tray", x: TRAY.x, y: TRAY.y, width: TRAY.w, height: TRAY.h, rx: 14 }, gTray);
    el("text", { class: "tray-label", x: TRAY.x + 16, y: TRAY.y + 22 }, gTray).textContent = "MENTOR TRAY";
    var gBin = el("g", { class: "bin" }, svg);
    el("rect", { x: BIN.x, y: BIN.y, width: BIN.w, height: BIN.h, rx: 10 }, gBin);
    el("text", { x: BIN.x + BIN.w / 2, y: BIN.y + BIN.h / 2 + 4, "text-anchor": "middle" }, gBin).textContent = "drop here to prune";
    var gLinks = el("g", {}, svg);
    var roomCircle = el("circle", { class: "room", cx: ROOM.x, cy: ROOM.y, r: ROOM.r }, svg);
    el("path", {
      class: "sketch",
      transform: "translate(" + (ROOM.x - 38) + " " + (ROOM.y - 52) + ")",
      d: "M8 10 C 2 10 0 18 2 28 C 4 38 12 40 18 32 L 22 26 L 54 26 L 58 32 C 64 40 72 38 74 28 C 76 18 74 10 68 10 Z M18 16 v10 M13 21 h10 M58 18 h1 M64 22 h1 M58 23 h1 M64 17 h1",
    }, svg);
    var fo = el("foreignObject", { x: ROOM.x - 80, y: ROOM.y - 4, width: 160, height: 70 }, svg);
    fo.appendChild(html("div", "room-text", "“i want to make a video game controller.”"));
    var gBubbles = el("g", {}, svg);
    var gOverlay = el("g", {}, svg);
    var gMentors = el("g", {}, svg);

    // ---- mentors ----
    var tokens = {};
    Object.keys(MENTORS).forEach(function (key) {
      var m = MENTORS[key];
      var g = el("g", { class: "mentor", tabindex: "-1" }, gMentors);
      var rot = el("g", {}, g);
      el("path", { class: "beam", d: wedge(42, 120, 20), fill: m.color }, rot);
      el("circle", { class: "shadow", r: 40, fill: m.color, stroke: m.color }, g);
      el("circle", { class: "core", r: 7 }, g);
      var t = el("text", { class: "rim-text", fill: m.color }, g);
      var tp = el("textPath", { href: "#ci-rim", startOffset: "2%" }, t);
      tp.textContent = m.name;
      tokens[key] = { key: key, g: g, rot: rot, x: m.home.x, y: m.home.y, angle: 180 };
      placeToken(tokens[key]);
      g.addEventListener("pointerdown", function (e) {
        startDrag(e, { kind: "mentor", token: tokens[key] });
      });
    });

    function placeToken(tk) {
      set(tk.g, { transform: "translate(" + tk.x + " " + tk.y + ")" });
      set(tk.rot, { transform: "rotate(" + tk.angle + ")" });
    }

    // ---- state ----
    var bubbles, branched, counts, selected, uid;
    function resetState() {
      bubbles = [];
      branched = {};
      counts = { branch: 0, step: 0, merge: 0, prune: 0 };
      selected = null;
      uid = 0;
      gBubbles.textContent = "";
      gLinks.textContent = "";
      Object.keys(tokens).forEach(function (k) {
        var tk = tokens[k], h = MENTORS[k].home;
        tk.x = h.x;
        tk.y = h.y;
        tk.angle = 180;
        placeToken(tk);
      });
      Object.keys(moveEls).forEach(function (k) {
        moveEls[k].textContent = "0";
      });
      select(null);
    }

    function bump(move) {
      counts[move]++;
      var n = moveEls[move];
      n.textContent = counts[move];
      n.classList.remove("is-bump");
      void n.offsetWidth;
      n.classList.add("is-bump");
      setTimeout(function () {
        n.classList.remove("is-bump");
      }, 700);
    }

    function log(head, text, color) {
      var li = document.createElement("li");
      if (color) li.style.setProperty("--c", color);
      if (head) li.appendChild(html("b", "", head));
      li.appendChild(document.createTextNode(text));
      if (!head) li.className = "sys";
      logEl.appendChild(li);
      while (logEl.children.length > 6) logEl.removeChild(logEl.firstChild);
    }

    function byId(id) {
      if (id === "room") return ROOM;
      for (var i = 0; i < bubbles.length; i++) if (bubbles[i].id === id) return bubbles[i];
      return null;
    }

    // keep new bubbles on the canvas and clear of everything else
    function settle(b) {
      for (var it = 0; it < 60; it++) {
        var moved = false;
        [ROOM].concat(bubbles).forEach(function (o) {
          if (o === b) return;
          var dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) || 0.01, min = b.r + o.r + 14;
          if (d < min) {
            b.x += (dx / d) * (min - d) * 0.6;
            b.y += (dy / d) * (min - d) * 0.6;
            moved = true;
          }
        });
        b.x = Math.min(Math.max(b.x, b.r + 8), W - b.r - 8);
        b.y = Math.min(Math.max(b.y, b.r + 8), H - b.r - 8);
        if (b.x + b.r > TRAY.x - 10 && b.y - b.r < TRAY.y + TRAY.h + 10) b.x = TRAY.x - 10 - b.r;
        if (b.x - b.r < BIN.x + BIN.w + 10 && b.y + b.r > BIN.y - 10) b.y = BIN.y - 10 - b.r;
        if (!moved) break;
      }
    }

    function addBubble(text, mentorKey, parents, r) {
      var color = mentorKey ? MENTORS[mentorKey].color : "#121316";
      var b = { id: "b" + ++uid, text: text, mentor: mentorKey, color: color, parents: parents, r: r || 50, x: 0, y: 0 };
      var g = el("g", { class: "bubble", tabindex: "0", role: "button", "aria-label": "idea: " + text }, gBubbles);
      el("circle", { class: "shape", r: b.r, stroke: color }, g);
      var f = el("foreignObject", { x: -b.r, y: -b.r, width: b.r * 2, height: b.r * 2 }, g);
      f.appendChild(html("div", "bubble-text", text));
      b.g = g;
      b.links = parents.map(function (pid) {
        return el("line", { class: "branch", stroke: color }, gLinks);
      });
      g.addEventListener("pointerdown", function (e) {
        startDrag(e, { kind: "bubble", bubble: b });
      });
      g.addEventListener("focus", function () {
        select(b);
      });
      g.addEventListener("keydown", function (e) {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          prune(b);
        }
      });
      bubbles.push(b);
      return b;
    }

    function drawBubble(b) {
      set(b.g, { transform: "translate(" + b.x.toFixed(1) + " " + b.y.toFixed(1) + ")" });
      b.parents.forEach(function (pid, i) {
        var p = byId(pid);
        if (p) set(b.links[i], { x1: p.x, y1: p.y, x2: b.x, y2: b.y });
      });
      bubbles.forEach(function (c) {
        if (c.parents.indexOf(b.id) > -1) drawBubble(c);
      });
    }

    function flash(b) {
      if (reduceMotion) return;
      var c = el("circle", { class: "flash", cx: b.x, cy: b.y, r: b.r, stroke: b.color, style: "transform-origin: " + b.x + "px " + b.y + "px" }, gOverlay);
      setTimeout(function () {
        c.remove();
      }, 800);
    }

    function spawn(b, from) {
      if (reduceMotion || !from) {
        drawBubble(b);
        flash(b);
        return;
      }
      var tx = b.x, ty = b.y, t0 = null;
      function frame(now) {
        if (t0 === null) t0 = now;
        var t = Math.min((now - t0) / 420, 1), e = 1 - Math.pow(1 - t, 3);
        b.x = from.x + (tx - from.x) * e;
        b.y = from.y + (ty - from.y) * e;
        drawBubble(b);
        if (t < 1) requestAnimationFrame(frame);
        else flash(b);
      }
      requestAnimationFrame(frame);
    }

    function select(b) {
      selected = b;
      bubbles && bubbles.forEach(function (o) {
        o.g.classList.toggle("is-selected", o === b);
      });
      selBox.hidden = !b;
      if (b) selText.textContent = b.text;
    }

    function faceTo(tk, x, y) {
      tk.angle = Math.atan2(y - tk.y, x - tk.x) / DEG;
      placeToken(tk);
    }

    // ---- the four moves ----
    function branch(key) {
      var m = MENTORS[key];
      if (branched[key]) {
        log("", m.name + " has already branched this room. Bring it up against one of its ideas instead.");
        return;
      }
      branched[key] = true;
      hint.classList.add("is-gone");
      log(m.name + " · branch", m.intro, m.color);
      m.ideas.forEach(function (idea, i) {
        var a = (m.base + (i - 1) * 35) * DEG;
        var b = addBubble(idea.t, key, ["room"], 50);
        b.idea = idea;
        b.x = ROOM.x + 210 * Math.cos(a);
        b.y = ROOM.y + 210 * Math.sin(a);
        settle(b);
        setTimeout(function () {
          spawn(b, ROOM);
        }, i * 120);
      });
      bump("branch");
    }

    var fan = 1;
    function step(b, mode, key) {
      key = key || b.mentor || "hci";
      var m = MENTORS[key];
      // pre-written follow-ups belong to the mentor who proposed the idea;
      // any other mentor answers in its own voice
      var out = b.idea && key === b.mentor ? b.idea[mode === "converge" ? "c" : "d"] : m[mode === "converge" ? "conv" : "div"](b.text);
      var p = byId(b.parents[0]) || ROOM;
      var dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
      fan = -fan;
      ang += (mode === "converge" ? 12 : 58) * fan * DEG;
      var nb = addBubble(out[0], key, [b.id], 46);
      nb.x = b.x + 150 * Math.cos(ang);
      nb.y = b.y + 150 * Math.sin(ang);
      settle(nb);
      spawn(nb, b);
      log(m.name + " · " + mode, out[1], m.color);
      bump("step");
      select(nb);
    }

    function merge(a, b) {
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var dx = mx - ROOM.x, dy = my - ROOM.y, d = Math.hypot(dx, dy) || 1;
      var nb = addBubble(short(a.text) + " + " + short(b.text), null, [a.id, b.id], 52);
      nb.mentor = a.mentor || b.mentor;
      nb.x = mx + (dx / d) * 120;
      nb.y = my + (dy / d) * 120;
      settle(nb);
      a.g.classList.add("is-dim");
      b.g.classList.add("is-dim");
      spawn(nb, { x: mx, y: my });
      log("merge", "“" + a.text + "” and “" + b.text + "” become one idea.", "#121316");
      bump("merge");
      select(nb);
    }

    function prune(b) {
      var gone = [b];
      for (var i = 0; i < gone.length; i++) {
        bubbles.forEach(function (c) {
          if (c.parents.indexOf(gone[i].id) > -1 && gone.indexOf(c) < 0) gone.push(c);
        });
      }
      gone.forEach(function (c) {
        c.g.remove();
        c.links.forEach(function (l) {
          l.remove();
        });
      });
      bubbles = bubbles.filter(function (c) {
        return gone.indexOf(c) < 0;
      });
      log("prune", "“" + b.text + "”" + (gone.length > 1 ? " and " + (gone.length - 1) + " idea" + (gone.length > 2 ? "s" : "") + " grown from it" : "") + " removed.", "#d8343f");
      bump("prune");
      if (gone.indexOf(selected) > -1) select(null);
    }

    // ---- dragging ----
    var drag = null;
    function startDrag(e, d) {
      e.preventDefault();
      var p = svgPoint(svg, e);
      var obj = d.kind === "mentor" ? d.token : d.bubble;
      drag = d;
      drag.dx = obj.x - p.x;
      drag.dy = obj.y - p.y;
      drag.moved = 0;
      drag.id = e.pointerId;
      drag.from = { x: obj.x, y: obj.y };
      svg.setPointerCapture(e.pointerId);
      if (d.kind === "bubble") select(d.bubble);
    }

    function nearestBubble(x, y, reach) {
      var best = null, bestD = Infinity;
      bubbles.forEach(function (b) {
        var d = Math.hypot(x - b.x, y - b.y);
        if (d < b.r + reach && d < bestD) {
          best = b;
          bestD = d;
        }
      });
      return best;
    }

    function sectorFor(b, x, y) {
      var a = Math.atan2(y - b.y, x - b.x) / DEG, best = SECTORS[0];
      SECTORS.forEach(function (s) {
        if (angDiff(a, s.mid) < angDiff(a, best.mid)) best = s;
      });
      return best;
    }

    function drawSectors(b, active) {
      gOverlay.textContent = "";
      if (!b) return;
      SECTORS.forEach(function (s) {
        var r = b.r + 14;
        el("path", {
          class: "sector" + (s === active ? " is-on" : ""),
          d: arc(r, s.mid - 52, s.mid + 52),
          stroke: s.color,
          transform: "translate(" + b.x + " " + b.y + ")",
        }, gOverlay);
        var lx = b.x + (r + 22) * Math.cos(s.mid * DEG), ly = b.y + (r + 22) * Math.sin(s.mid * DEG) + 4;
        el("text", { class: "sector-label", x: lx, y: ly }, gOverlay).textContent = s.key;
      });
    }

    function inRoom(x, y) {
      return Math.hypot(x - ROOM.x, y - ROOM.y) < ROOM.r;
    }

    function inBin(x, y) {
      return x > BIN.x && x < BIN.x + BIN.w && y > BIN.y && y < BIN.y + BIN.h;
    }

    svg.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var p = svgPoint(svg, e);
      var x = Math.min(Math.max(p.x + drag.dx, 20), W - 20), y = Math.min(Math.max(p.y + drag.dy, 20), H - 20);
      if (drag.kind === "mentor") {
        var tk = drag.token;
        drag.moved += Math.hypot(x - tk.x, y - tk.y);
        tk.x = x;
        tk.y = y;
        var room = inRoom(x, y);
        roomCircle.classList.toggle("is-target", room);
        var b = room ? null : nearestBubble(x, y, 70);
        drag.target = room ? "room" : b;
        drag.sector = b ? sectorFor(b, x, y) : null;
        drawSectors(b, drag.sector);
        if (b) faceTo(tk, b.x, b.y);
        else if (room) faceTo(tk, ROOM.x, ROOM.y);
        else placeToken(tk);
      } else {
        var bb = drag.bubble;
        drag.moved += Math.hypot(x - bb.x, y - bb.y);
        bb.x = x;
        bb.y = y;
        drawBubble(bb);
        var other = null;
        bubbles.forEach(function (o) {
          var hit = o !== bb && Math.hypot(o.x - x, o.y - y) < (o.r + bb.r) * 0.7;
          o.g.classList.toggle("is-merge-target", hit);
          if (hit) other = o;
        });
        drag.mergeWith = other;
        drag.bin = inBin(x, y);
        gBin.classList.toggle("is-hot", drag.bin);
      }
    });

    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag;
      drag = null;
      roomCircle.classList.remove("is-target");
      gBin.classList.remove("is-hot");
      gOverlay.textContent = "";
      if (d.kind === "mentor") {
        if (d.target === "room") {
          // settle each mentor on its own side of the room, facing its ideas
          var tk = d.token, a = MENTORS[tk.key].base * DEG;
          tk.x = ROOM.x + 40 * Math.cos(a);
          tk.y = ROOM.y + 40 * Math.sin(a);
          faceTo(tk, ROOM.x + 200 * Math.cos(a), ROOM.y + 200 * Math.sin(a));
          branch(tk.key);
        }
        else if (d.target && d.sector) {
          if (d.sector.key === "talk") log("", "Talk: on the real table you type or sketch your own request here, and " + MENTORS[d.token.key].name + " answers it, or draws it.");
          else step(d.target, d.sector.key, d.token.key);
        }
      } else {
        bubbles.forEach(function (o) {
          o.g.classList.remove("is-merge-target");
        });
        if (d.bin) prune(d.bubble);
        else if (d.mergeWith) {
          // the dragged idea springs back home; the merged one appears between them
          d.bubble.x = d.from.x;
          d.bubble.y = d.from.y;
          drawBubble(d.bubble);
          merge(d.mergeWith, d.bubble);
        }
      }
    }
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);
    svg.addEventListener("pointerdown", function (e) {
      if (e.target === svg) select(null);
    });

    // ---- panel buttons (also the keyboard route) ----
    root.querySelectorAll("[data-invite]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tk = tokens[btn.dataset.invite], a = MENTORS[tk.key].base * DEG;
        tk.x = ROOM.x + 40 * Math.cos(a);
        tk.y = ROOM.y + 40 * Math.sin(a);
        faceTo(tk, ROOM.x + 200 * Math.cos(a), ROOM.y + 200 * Math.sin(a));
        branch(tk.key);
      });
    });
    root.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.dataset.act;
        if (act === "reset") {
          resetState();
          logEl.textContent = "";
          log("", "canvas cleared. the room holds one idea: a video game controller.");
          hint.classList.remove("is-gone");
          return;
        }
        if (!selected) return;
        if (act === "prune") prune(selected);
        else step(selected, act);
      });
    });

    resetState();
  })();

  // ------------------------------------------------------------ debate arena

  (function () {
    var arena = document.querySelector(".ci-arena");
    if (!arena) return;
    var svg = arena.querySelector(".ci-arena__svg");
    var logEl = arena.querySelector(".ci-arena__log");
    var stanceEl = arena.querySelector(".ci-arena__stance");
    var P = {
      leo: { name: "leonardo", color: "#d6478f", x: 130, side: "left" },
      jobs: { name: "the entrepreneur", color: "#2f9a6a", x: 290, side: "right" },
    };
    var LINES = {
      leo: {
        agree: ["Yes, and let each module be a small machine: a spring for a bow, a cam for a wheel.", "Agreed. Then the hand learns a new instrument for every game."],
        disagree: ["No. A machine you must rebuild before each use is a poor machine.", "I disagree. One well-made mechanism, adjustable, beats a drawer of parts."],
        convince: ["Consider the crossbow: one stock, many bolts. The modules are only bolts.", "Look at the lute: one body, strings you change. This is the same thing."],
        refuse: ["I will not argue about selling. Show me the mechanism.", "That is a question for merchants, not engineers."],
        skeptical: ["I doubt it. Who stops a game to change a module?"],
        excited: ["Springs! Cams! Every game its own machine!"],
        interrupt: ["Forgive me, but the hinge will not survive a child."],
        confront: ["That is simply wrong. The hand is not a shop shelf."],
      },
      jobs: {
        agree: ["Right. The controller sells once; the modules sell forever.", "Yes, and swapping a module should feel like a click, not a chore."],
        disagree: ["No. Every swap is friction at the moment of peak intent.", "People don't want a toolkit. They want it to just work."],
        convince: ["Think of it as one controller with a story for every game.", "Ship three modules, not thirty. Make each one feel inevitable."],
        refuse: ["I'm not debating hinges.", "The mechanism isn't the product."],
        skeptical: ["Really? Who carries a bag of modules to a friend's house?"],
        excited: ["That's it. Snap, click, play. Ship it."],
        interrupt: ["Stop. What does the player feel in the first ten seconds?"],
        confront: ["That's backwards. Nobody buys a mechanism."],
      },
    };
    var facing = { leo: true, jobs: true };
    var next = "leo", idx = {}, figs = {};

    el("line", { x1: 30, y1: 150, x2: 390, y2: 150, stroke: "rgba(255,255,255,0.12)" }, svg);
    var zone = el("g", {}, svg);
    el("rect", { x: 374, y: 10, width: 38, height: 30, rx: 5, fill: "none", stroke: "rgba(255,216,74,0.45)", "stroke-dasharray": "4 4" }, zone);
    el("text", { class: "label", x: 393, y: 29 }, zone).textContent = "end";
    Object.keys(P).forEach(function (k) {
      var p = P[k];
      var g = el("g", { transform: "translate(" + p.x + " 80)" }, svg);
      var rot = el("g", {}, g);
      el("path", { class: "beam", d: wedge(30, 74, 24), fill: p.color }, rot);
      el("circle", { class: "shadow", r: 28, fill: p.color, stroke: p.color }, g);
      el("circle", { class: "core", r: 5 }, g);
      el("text", { class: "label", y: 58 }, g).textContent = p.name.toUpperCase();
      figs[k] = { rot: rot, angle: k === "leo" ? 0 : 180 };
      set(rot, { transform: "rotate(" + figs[k].angle + ")" });
    });

    function turnTo(k) {
      var f = figs[k], target = facing[k] ? (k === "leo" ? 0 : 180) : (k === "leo" ? 180 : 0);
      var from = f.angle, delta = ((target - from + 540) % 360) - 180, t0 = null;
      function frame(now) {
        if (t0 === null) t0 = now;
        var t = reduceMotion ? 1 : Math.min((now - t0) / 450, 1), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        f.angle = from + delta * e;
        set(f.rot, { transform: "rotate(" + f.angle + ")" });
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    function stanceFor(k) {
      var o = k === "leo" ? "jobs" : "leo";
      if (facing[k] && facing[o]) return "agree";
      if (!facing[k] && !facing[o]) return "disagree";
      return facing[k] ? "convince" : "refuse";
    }

    function renderStance() {
      var s;
      if (facing.leo && facing.jobs) s = "facing · agree and build";
      else if (!facing.leo && !facing.jobs) s = "turned away · disagree";
      else {
        var c = facing.leo ? "leo" : "jobs", r = c === "leo" ? "jobs" : "leo";
        s = P[c].name + " tries to convince · " + P[r].name + " refuses to engage";
      }
      stanceEl.textContent = "stance: " + s;
    }

    function say(k, kind, label) {
      var list = LINES[k][kind], i = (idx[k + kind] = ((idx[k + kind] === undefined ? -1 : idx[k + kind]) + 1) % list.length);
      var li = html("li", P[k].side === "right" ? "right" : "");
      li.style.setProperty("--c", P[k].color);
      li.appendChild(html("b", "", P[k].name + " · " + (label || kind)));
      li.appendChild(document.createTextNode(list[i]));
      logEl.appendChild(li);
      while (logEl.children.length > 4) logEl.removeChild(logEl.firstChild);
      next = k === "leo" ? "jobs" : "leo";
    }

    arena.querySelectorAll("[data-turn]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.dataset.turn;
        facing[k] = !facing[k];
        turnTo(k);
        renderStance();
      });
    });
    arena.querySelectorAll("[data-gest]").forEach(function (b) {
      b.addEventListener("click", function () {
        say(b.dataset.who, b.dataset.gest);
      });
    });
    arena.querySelector('[data-arena="next"]').addEventListener("click", function () {
      var k = next;
      say(k, stanceFor(k));
    });
    arena.querySelector('[data-arena="conclude"]').addEventListener("click", function () {
      var li = html("li", "synth");
      li.appendChild(html("b", "", "new room · synthesis"));
      li.appendChild(document.createTextNode("Three feels built in, behind one physical switch: no loose parts, a new sensation for every game. Ideas: a mode dial, magnetic snap-on grips, one hero module per game."));
      logEl.appendChild(li);
      while (logEl.children.length > 4) logEl.removeChild(logEl.firstChild);
    });
    renderStance();
    var start = html("li", "synth");
    start.appendChild(html("b", "", "press next turn"));
    start.appendChild(document.createTextNode("Both figurines face each other, so the first turns build on each other. Turn one away and watch the tone change."));
    logEl.appendChild(start);
  })();

  // ------------------------------------------------------------ lighthouse

  (function () {
    var svg = document.querySelector(".ci-beam__svg");
    if (!svg) return;
    var out = document.querySelector(".ci-beam__out");
    var kindEl = out.querySelector(".ci-beam__kind"), titleEl = out.querySelector(".ci-beam__title"), listEl = out.querySelector(".ci-beam__papers");
    var T = { x: 300, y: 470 };
    var CLUSTERS = [
      { a: -145, kind: "cluster 01 · main themes", title: "controller designs", lines: ["controller", "designs"], paper: "Beyond the Gamepad: HCI and Game Controller Design and Evaluation" },
      { a: -90, kind: "cluster 02 · adjacent contexts", title: "accessibility, XR, teleoperation, media psychology", lines: ["accessibility · xr", "teleoperation"], paper: "Who Can Play? Rethinking Video Game Controllers and Accessibility" },
      { a: -35, kind: "cluster 03 · technical foundations", title: "measurement apparatus", lines: ["measurement", "apparatus"], paper: "On the Latency of USB-Connected Input Devices" },
    ];
    var defs = el("defs", {}, svg);
    var rg = el("radialGradient", { id: "ci-beam-grad", cx: T.x, cy: T.y, r: 560, gradientUnits: "userSpaceOnUse" }, defs);
    el("stop", { offset: "0", "stop-color": "#ffd84a", "stop-opacity": "0.75" }, rg);
    el("stop", { offset: "0.7", "stop-color": "#ffd84a", "stop-opacity": "0.12" }, rg);
    el("stop", { offset: "1", "stop-color": "#ffd84a", "stop-opacity": "0" }, rg);
    var sg = el("radialGradient", { id: "ci-smoke", cx: "50%", cy: "45%", r: "70%" }, defs);
    el("stop", { offset: "0", "stop-color": "#2a3140", "stop-opacity": "0.5" }, sg);
    el("stop", { offset: "1", "stop-color": "#000", "stop-opacity": "0.2" }, sg);
    el("rect", { class: "smoke", x: 0, y: 0, width: 600, height: 520 }, svg);
    var beam = el("path", { class: "beam", d: wedge(14, 640, 45) }, svg);
    var groups = CLUSTERS.map(function (c) {
      var x = T.x + 255 * Math.cos(c.a * DEG), y = T.y + 255 * Math.sin(c.a * DEG);
      var g = el("g", { class: "cluster" }, svg);
      el("circle", { cx: x, cy: y, r: 64 }, g);
      for (var i = 0; i < 5; i++) {
        var a = (-90 + i * 72) * DEG;
        el("circle", { class: "dot", cx: x + 78 * Math.cos(a), cy: y + 78 * Math.sin(a), r: 4 }, g);
      }
      el("text", { x: x, y: y - 2 }, g).textContent = c.lines[0];
      el("text", { x: x, y: y + 16 }, g).textContent = c.lines[1];
      return g;
    });
    var tower = el("g", { transform: "translate(" + T.x + " " + T.y + ")" }, svg);
    el("path", { class: "tower", d: "M-16 34 L-9 -18 L9 -18 L16 34 Z" }, tower);
    el("rect", { class: "lantern", x: -8, y: -30, width: 16, height: 12, rx: 2 }, tower);
    el("path", { class: "tower", d: "M-11 -30 L0 -42 L11 -30 Z" }, tower);

    var angle = -90, lit = -1, touched = false, visible = false;
    function draw() {
      set(beam, { transform: "translate(" + T.x + " " + T.y + ") rotate(" + angle + ")" });
      var best = -1, bestD = 999;
      CLUSTERS.forEach(function (c, i) {
        var d = angDiff(angle, c.a);
        if (d < 40 && d < bestD) {
          best = i;
          bestD = d;
        }
      });
      if (best === lit) return;
      lit = best;
      groups.forEach(function (g, i) {
        g.classList.toggle("is-lit", i === best);
      });
      listEl.textContent = "";
      if (best < 0) {
        kindEl.textContent = "between clusters";
        titleEl.textContent = "keep rotating the beam";
        return;
      }
      var c = CLUSTERS[best];
      kindEl.textContent = c.kind;
      titleEl.textContent = c.title;
      listEl.appendChild(html("li", "", c.paper));
      listEl.appendChild(html("li", "more", "+ 4 more, via Semantic Scholar, arXiv and Crossref"));
    }
    function aim(e) {
      var p = svgPoint(svg, e), raw = Math.atan2(p.y - T.y, p.x - T.x) / DEG;
      if (raw > 0) raw = raw > 90 ? -172 : -8; // below the tower: pin to the nearer end
      angle = Math.min(Math.max(raw, -172), -8);
      draw();
    }
    var down = false;
    svg.addEventListener("pointerdown", function (e) {
      touched = down = true;
      svg.setPointerCapture(e.pointerId);
      aim(e);
    });
    svg.addEventListener("pointermove", function (e) {
      if (down) aim(e);
    });
    ["pointerup", "pointercancel"].forEach(function (t) {
      svg.addEventListener(t, function () {
        down = false;
      });
    });
    svg.addEventListener("keydown", function (e) {
      var d = { ArrowLeft: -8, ArrowRight: 8, ArrowUp: 8, ArrowDown: -8 }[e.key];
      if (!d) return;
      e.preventDefault();
      touched = true;
      angle = Math.min(Math.max(angle + d, -172), -8);
      draw();
    });
    onVisible(svg, function (v) {
      visible = v;
    });
    var t0 = performance.now();
    function sweep(now) {
      if (!touched && visible && !reduceMotion) {
        angle = -90 + 62 * Math.sin((now - t0) / 2600);
        draw();
      }
      requestAnimationFrame(sweep);
    }
    draw();
    requestAnimationFrame(sweep);
  })();

  // ------------------------------------------------------------ goal shelves

  (function () {
    var box = document.querySelector(".ci-report");
    if (!box) return;
    var flipBtn = document.querySelector(".ci-flip");
    var flipText = flipBtn.querySelector(".ci-flip__text");
    var radios = document.querySelectorAll("[data-shelf]");
    var IDEA = "a video game controller with swappable haptic modules";
    var R = {
      books: {
        up: { head: "publishability report", color: "#2f9a6a", sections: [
          ["strengths", ["links haptics directly to game state", "modular, so effects can be compared", "clear path to a lab prototype"]],
          ["research questions", ["does changing the feel change the play?", "which module do players pick, and why?", "how fast do players adapt to a swap?"]],
          ["hypotheses", ["matched haptics raise immersion", "a swap costs less than players expect", "players settle on two or three favourites"]],
          ["to develop", ["build three working modules", "run a within-subject study", "measure swap time and enjoyment"]],
        ] },
        down: { head: "publishability report · tipped", color: "#d8343f", sections: [
          ["weaknesses", ["close to existing modular controllers", "small hardware sample", "novelty may drive the effects"]],
          ["missing elements", ["no baseline controller", "no long-term use", "no accessibility review"]],
          ["logical flaws", ["assumes players want variety", "confuses feel with fun", "ignores the cost of swapping"]],
          ["not publishable because", ["contribution not yet distinct", "no evaluation plan", "related work too thin"]],
        ] },
      },
      market: {
        up: { head: "commercialization receipt", color: "#2a8fe0", sections: [
          ["market size", ["console accessories are a large market", "premium controllers keep growing", "modding communities already buy parts"]],
          ["target audience", ["enthusiast players", "players who need adapted controls", "studios, for special editions"]],
          ["revenue potential", ["the controller sells once; modules sell forever", "bundles with new games", "licensed modules for franchises"]],
          ["go-to-market", ["launch with three hero modules", "partner with one studio", "crowdfund a first run"]],
        ] },
        down: { head: "commercialization receipt · tipped", color: "#d8343f", sections: [
          ["market barriers", ["platform licensing", "first-party controllers dominate", "retail shelf space"]],
          ["target issues", ["casual players won't swap", "enthusiasts already own pro pads", "unclear who buys first"]],
          ["revenue risks", ["modules sit unused in drawers", "tooling cost for every module", "returns from broken latches"]],
          ["fatal flaws", ["friction at the moment of peak intent", "the player wants to play now", "assembly before fun"]],
        ] },
      },
    };
    var photo = document.querySelector(".ci-shelf__photo");
    var img = photo && photo.querySelector("img");
    var PHOTOS = {
      books: { src: "/media/co-ideation-across-time/shelf-books.webp", w: 1100, h: 787, alt: "The bookshelf: a black shelf of red and white books on three legs" },
      market: { src: "/media/co-ideation-across-time/shelf-market.webp", w: 1100, h: 681, alt: "The supermarket shelf: black pegboard shelves stocked with blue products" },
    };
    var shelf = "books", tipped = false;
    function showPhoto() {
      if (!img) return;
      var ph = PHOTOS[shelf];
      if (img.getAttribute("src") !== ph.src) {
        img.src = ph.src;
        img.width = ph.w;
        img.height = ph.h;
        img.alt = ph.alt;
      }
      photo.classList.toggle("is-tipped", tipped);
    }
    function render() {
      showPhoto();
      var r = R[shelf][tipped ? "down" : "up"];
      var doc = html("article", "ci-doc" + (shelf === "market" ? " ci-doc--receipt" : ""));
      doc.style.setProperty("--c", r.color);
      if (shelf === "books") doc.appendChild(html("span", "ci-doc__holes"));
      doc.appendChild(html("p", "ci-doc__head", r.head));
      doc.appendChild(html("p", "ci-doc__idea", "“" + IDEA + "”"));
      r.sections.forEach(function (s) {
        var h = html("h4", "", s[0]);
        if (shelf === "market") h.appendChild(html("span", "", "×3"));
        doc.appendChild(h);
        var ul = html("ul");
        s[1].forEach(function (t) {
          ul.appendChild(html("li", "", t));
        });
        doc.appendChild(ul);
      });
      if (shelf === "market") {
        var tot = html("p", "ci-doc__total");
        tot.appendChild(html("span", "", "total"));
        tot.appendChild(html("span", "", "4 sections · 12 lines"));
        doc.appendChild(tot);
      }
      box.textContent = "";
      box.appendChild(doc);
    }
    radios.forEach(function (b) {
      b.addEventListener("click", function () {
        shelf = b.dataset.shelf;
        radios.forEach(function (o) {
          o.setAttribute("aria-checked", o === b);
        });
        render();
      });
    });
    flipBtn.addEventListener("click", function () {
      tipped = !tipped;
      flipBtn.setAttribute("aria-pressed", tipped);
      flipText.textContent = tipped ? "set the shelf upright" : "tip the shelf over";
      render();
    });
    render();
  })();

  // ------------------------------------------------------------ study charts

  (function () {
    var host = document.querySelector(".ci-charts");
    if (!host) return;
    var DATA = [
      { name: "ideation actions per minute", unit: "actions/min", s: 8.36, t: 10.72, p: "p = .045", d: 2, note: "More moves with objects in hand." },
      { name: "pause between actions", unit: "s", s: 2.85, t: 2.41, p: "p = .009", d: 2, note: "Shorter gaps inside each burst." },
      { name: "burst index", unit: "", s: 0.271, t: 0.345, p: "p = .009", d: 3, note: "Activity clustered into bursts, then pauses." },
      { name: "human-authored ideas", unit: "per session", s: 0, t: 1, p: "p = .034", d: 0, note: "Screen-only pairs, median: none of their own." },
      { name: "all ideas", unit: "per session", s: 9.0, t: 7.19, p: "p = .216 · not significant", d: 2, note: "About the same overall." },
      { name: "speaking turns", unit: "turns", s: 59.5, t: 70.5, p: "p = .032", d: 1, note: "More back-and-forth between partners." },
      { name: "speaking time", unit: "min of 20", s: 19.0, t: 20.5, p: "p = .008", d: 1, note: "About a minute and a half more talk." },
    ];
    var tip = html("div", "ci-tip");
    tip.hidden = true;
    document.body.appendChild(tip);
    function showTip(e, text, target) {
      tip.textContent = text;
      tip.hidden = false;
      var r = target.getBoundingClientRect();
      tip.style.left = (e && e.clientX ? e.clientX : r.left + r.width / 2) + "px";
      tip.style.top = (e && e.clientY ? e.clientY : r.top) + "px";
    }
    var fills = [];
    DATA.forEach(function (m) {
      var card = html("figure", "ci-chart");
      card.appendChild(html("h3", "", m.name));
      card.appendChild(html("p", "ci-chart__p", m.p));
      var bars = html("div", "ci-chart__bars");
      var max = Math.max(m.s, m.t) * 1.12 || 1;
      [["screen-only", m.s, "var(--ci-blue)"], ["tangible", m.t, "var(--ci-signal)"]].forEach(function (b) {
        var row = html("div", "ci-bar");
        row.tabIndex = 0;
        var label = b[0] + " · median " + b[1].toFixed(m.d) + (m.unit ? " " + m.unit : "");
        row.setAttribute("aria-label", m.name + ", " + label);
        var track = html("div", "ci-bar__track"), fill = html("div", "ci-bar__fill");
        fill.style.setProperty("--c", b[2]);
        fill.dataset.w = (100 * b[1]) / max;
        track.appendChild(fill);
        row.appendChild(track);
        row.appendChild(html("span", "ci-bar__val", b[1].toFixed(m.d)));
        row.addEventListener("pointermove", function (e) {
          showTip(e, label, row);
        });
        row.addEventListener("pointerleave", function () {
          tip.hidden = true;
        });
        row.addEventListener("focus", function () {
          showTip(null, label, row);
        });
        row.addEventListener("blur", function () {
          tip.hidden = true;
        });
        fills.push(fill);
        bars.appendChild(row);
      });
      card.appendChild(bars);
      card.appendChild(html("p", "ci-chart__note", m.note));
      host.appendChild(card);
    });
    var key = html("div", "ci-chart ci-chart--legend");
    key.appendChild(html("p", "", "Medians across 16 pairs. Each panel has its own scale, starting at zero."));
    var lg = html("p", "ci-legend ci-mono");
    lg.innerHTML = '<span class="sw sw--screen"></span>screen-only <span class="sw sw--tangible"></span>tangible';
    key.appendChild(lg);
    host.appendChild(key);
    var done = false;
    onVisible(host, function (v) {
      if (!v || done) return;
      done = true;
      fills.forEach(function (f, i) {
        setTimeout(function () {
          f.style.width = f.dataset.w + "%";
        }, reduceMotion ? 0 : 60 * i);
      });
    });
    addEventListener("scroll", function () {
      tip.hidden = true;
    }, { passive: true });
  })();

  // ------------------------------------------------------------ rhythm illustration

  (function () {
    var rows = document.querySelectorAll(".ci-rhythm__row");
    if (!rows.length) return;
    var seed = 7;
    function rand() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }
    rows.forEach(function (row) {
      var svg = row.querySelector("svg"), xs = [];
      if (row.dataset.kind === "screen") {
        var n = 167;
        for (var i = 0; i < n; i++) xs.push((i + 0.5) * (1000 / n) + (rand() - 0.5) * 3);
      } else {
        var x = 6;
        while (x < 994) {
          var k = 10 + Math.floor(rand() * 10);
          for (var j = 0; j < k && x < 994; j++) {
            xs.push(x);
            x += 2.2 + rand() * 2.6;
          }
          x += 26 + rand() * 46;
        }
      }
      xs.forEach(function (x) {
        el("line", { x1: x, y1: 8, x2: x, y2: 32 }, svg);
      });
    });
  })();
})();

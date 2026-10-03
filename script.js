(function () {
  "use strict";

  /* =========================================================
     CONFIG
  ========================================================= */
  var FRAME_COUNT = 250;
  var FRAME_PATH = function (i) {
    return "assets/frames/f" + String(i).padStart(4, "0") + ".jpg";
  };
  var IMG_W = 960, IMG_H = 540;

  // Piecewise control points: scroll progress (0-1 across the pinned
  // section) -> frame number. Flat segments (same frame twice) create
  // a "hold" so the reader can absorb a callout without the spanner
  // spinning underneath it.
  var controlPoints = [
    { p: 0.000, f: 1 },
    { p: 0.055, f: 1 },
    { p: 0.130, f: 35 },
    { p: 0.200, f: 35 },
    { p: 0.275, f: 75 },
    { p: 0.345, f: 75 },
    { p: 0.420, f: 105 },
    { p: 0.490, f: 105 },
    { p: 0.565, f: 135 },
    { p: 0.635, f: 135 },
    { p: 0.710, f: 165 },
    { p: 0.780, f: 165 },
    { p: 0.880, f: 228 },
    { p: 1.000, f: 250 }
  ];

  // Callouts: anchor coordinates are in the native 960x540 frame space.
  var callouts = [
    { id: 0, holdStart: 0.130, holdEnd: 0.200, anchor: { x: 700, y: 232 }, side: "right" },
    { id: 1, holdStart: 0.275, holdEnd: 0.345, anchor: { x: 452, y: 276 }, side: "left" },
    { id: 2, holdStart: 0.420, holdEnd: 0.490, anchor: { x: 452, y: 424 }, side: "right" },
    { id: 3, holdStart: 0.565, holdEnd: 0.635, anchor: { x: 486, y: 250 }, side: "left" },
    { id: 4, holdStart: 0.710, holdEnd: 0.780, anchor: { x: 552, y: 372 }, side: "right" }
  ];

  /* =========================================================
     PRELOAD
  ========================================================= */
  var images = new Array(FRAME_COUNT + 1);
  var loadedCount = 0;
  var loaderBar = document.getElementById("loaderBar");
  var loaderPct = document.getElementById("loaderPct");
  var loaderEl = document.getElementById("loader");
  var readyToStart = false;

  function updateLoaderUI() {
    var pct = Math.round((loadedCount / FRAME_COUNT) * 100);
    loaderBar.style.width = pct + "%";
    loaderPct.textContent = pct;
    if (loadedCount >= FRAME_COUNT && !readyToStart) {
      readyToStart = true;
      setTimeout(function () {
        loaderEl.classList.add("hidden");
      }, 220);
    }
  }

  function preload() {
    for (var i = 1; i <= FRAME_COUNT; i++) {
      (function (idx) {
        var img = new Image();
        img.onload = img.onerror = function () {
          loadedCount++;
          images[idx] = img;
          updateLoaderUI();
        };
        img.src = FRAME_PATH(idx);
      })(i);
    }
  }
  preload();

  /* =========================================================
     CANVAS
  ========================================================= */
  var canvas = document.getElementById("spanner-canvas");
  var ctx = canvas.getContext("2d");
  var stage = document.querySelector(".sticky-stage");
  var drawRect = { x: 0, y: 0, w: 0, h: 0, scale: 1 };
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resizeCanvas() {
    var w = stage.clientWidth;
    var h = stage.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    var imgAspect = IMG_W / IMG_H;
    var stageAspect = w / h;
    var scale;
    if (stageAspect > imgAspect) {
      scale = w / IMG_W;
    } else {
      scale = h / IMG_H;
    }
    var drawW = IMG_W * scale;
    var drawH = IMG_H * scale;
    drawRect = {
      x: (w - drawW) / 2,
      y: (h - drawH) / 2,
      w: drawW,
      h: drawH,
      scale: scale
    };

    var hud = document.getElementById("hud");
    hud.setAttribute("width", w);
    hud.setAttribute("height", h);
    hud.setAttribute("viewBox", "0 0 " + w + " " + h);
  }

  var currentFrame = -1;
  function drawFrame(frameNum) {
    frameNum = Math.max(1, Math.min(FRAME_COUNT, Math.round(frameNum)));
    if (frameNum === currentFrame) return;
    currentFrame = frameNum;
    var img = images[frameNum];
    if (!img) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, drawRect.x, drawRect.y, drawRect.w, drawRect.h);
  }

  function anchorToScreen(anchor) {
    return {
      x: drawRect.x + anchor.x * drawRect.scale,
      y: drawRect.y + anchor.y * drawRect.scale
    };
  }

  /* =========================================================
     SCROLL -> PROGRESS -> FRAME
  ========================================================= */
  var revealEl = document.getElementById("reveal");

  function getProgress() {
    var rect = revealEl.getBoundingClientRect();
    var total = rect.height - window.innerHeight;
    if (total <= 0) return 0;
    var raw = -rect.top / total;
    return Math.max(0, Math.min(1, raw));
  }

  function frameForProgress(p) {
    for (var i = 0; i < controlPoints.length - 1; i++) {
      var a = controlPoints[i], b = controlPoints[i + 1];
      if (p >= a.p && p <= b.p) {
        if (b.p === a.p) return a.f;
        var t = (p - a.p) / (b.p - a.p);
        return a.f + (b.f - a.f) * t;
      }
    }
    return p <= 0 ? controlPoints[0].f : controlPoints[controlPoints.length - 1].f;
  }

  function smoothstep(edge0, edge1, x) {
    if (edge0 === edge1) return x < edge0 ? 0 : 1;
    var t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /* =========================================================
     HUD LINES + CALLOUT CARDS
  ========================================================= */
  var hud = document.getElementById("hud");
  var cardEls = {};
  var railEls = {};
  document.querySelectorAll(".callout").forEach(function (el) {
    cardEls[el.dataset.id] = el;
  });
  document.querySelectorAll(".rail-item").forEach(function (el) {
    railEls[el.dataset.rail] = el;
  });

  var NS = "http://www.w3.org/2000/svg";
  var hudGroups = {};
  callouts.forEach(function (c) {
    var g = document.createElementNS(NS, "g");
    g.setAttribute("data-hud", c.id);
    var path = document.createElementNS(NS, "path");
    path.setAttribute("class", "hud-line");
    var ring = document.createElementNS(NS, "circle");
    ring.setAttribute("class", "hud-ring");
    ring.setAttribute("r", "10");
    var dot = document.createElementNS(NS, "circle");
    dot.setAttribute("class", "hud-dot");
    dot.setAttribute("r", "3.2");
    g.appendChild(path);
    g.appendChild(ring);
    g.appendChild(dot);
    g.style.opacity = 0;
    hud.appendChild(g);
    hudGroups[c.id] = { g: g, path: path, ring: ring, dot: dot };
  });

  function buildElbowPath(ax, ay, ex, ey, side) {
    // Two-segment HUD leader line: out from the anchor, then a
    // vertical run, then in to the card's connector edge.
    var midX = ax + (side === "right" ? 46 : -46);
    return "M " + ax + " " + ay +
      " L " + midX + " " + ay +
      " L " + midX + " " + ey +
      " L " + ex + " " + ey;
  }

  function updateCallouts(progress) {
    callouts.forEach(function (c) {
      var card = cardEls[c.id];
      var hudEls = hudGroups[c.id];
      var rail = railEls[c.id];

      var fadeInStart = c.holdStart - 0.045;
      var fadeInEnd = c.holdStart + 0.015;
      var fadeOutStart = c.holdEnd;
      var fadeOutEnd = c.holdEnd + 0.03;

      var opacity;
      if (progress < fadeInStart || progress > fadeOutEnd) {
        opacity = 0;
      } else if (progress < fadeInEnd) {
        opacity = smoothstep(fadeInStart, fadeInEnd, progress);
      } else if (progress <= fadeOutStart) {
        opacity = 1;
      } else {
        opacity = 1 - smoothstep(fadeOutStart, fadeOutEnd, progress);
      }

      var active = opacity > 0.02;
      card.classList.toggle("active", active);
      card.style.opacity = opacity;

      if (rail) rail.classList.toggle("active", active);

      if (active) {
        // Position the card near the anchor's vertical position, docked
        // to the side declared on the callout.
        var anchorScreen = anchorToScreen(c.anchor);
        var stageW = stage.clientWidth, stageH = stage.clientHeight;
        var cardW = card.offsetWidth, cardH = card.offsetHeight;
        var margin = window.innerWidth <= 860 ? 20 : 56;

        var left = c.side === "right"
          ? stageW - cardW - margin
          : margin;
        var top = anchorScreen.y - cardH / 2;
        top = Math.max(20, Math.min(stageH - cardH - 20, top));

        card.style.left = left + "px";
        card.style.top = top + "px";

        // HUD leader line from anchor to the card's inner edge.
        var connectorX = c.side === "right" ? left : left + cardW;
        var connectorY = top + cardH / 2;
        var d = buildElbowPath(anchorScreen.x, anchorScreen.y, connectorX, connectorY, c.side);
        hudEls.path.setAttribute("d", d);

        var len = hudEls.path.getTotalLength();
        var drawProgress = smoothstep(fadeInStart, c.holdStart + 0.03, progress);
        hudEls.path.style.strokeDasharray = len;
        hudEls.path.style.strokeDashoffset = len * (1 - drawProgress);

        hudEls.ring.setAttribute("cx", anchorScreen.x);
        hudEls.ring.setAttribute("cy", anchorScreen.y);
        hudEls.dot.setAttribute("cx", anchorScreen.x);
        hudEls.dot.setAttribute("cy", anchorScreen.y);

        hudEls.g.style.opacity = opacity;
      } else {
        hudEls.g.style.opacity = 0;
      }
    });
  }

  /* =========================================================
     MAIN LOOP
  ========================================================= */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var progress = getProgress();
      var frame = frameForProgress(progress);
      drawFrame(frame);
      updateCallouts(progress);
      ticking = false;
    });
  }

  function init() {
    resizeCanvas();
    drawFrame(1);
    onScroll();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () {
    resizeCanvas();
    currentFrame = -1;
    onScroll();
  });

  // Kick things off once the very first frame is ready, then keep
  // redrawing as more of the sequence streams in.
  var startCheck = setInterval(function () {
    if (images[1]) {
      clearInterval(startCheck);
      init();
    }
  }, 30);

  window.addEventListener("load", init);
})();

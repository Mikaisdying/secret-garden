// ===========================================================
// Secret Garden — drawing + replay engine
// Strokes are captured as raw point arrays (works with mouse,
// touch and stylus via Pointer Events, pressure included where
// the device reports it), then shaped into a pressure-varying
// filled outline with perfect-freehand. Because each stroke keeps
// its original point sequence, the exact drawing process can be
// replayed later, point by point.
//
// perfect-freehand ships as a small, dependency-free ESM module,
// so it's loaded straight from a CDN — no bundler needed, the
// static site still works with zero build step.
// ===========================================================

import { getStroke } from "https://esm.sh/perfect-freehand@1.2.0";

/** Turns perfect-freehand's outline points into a closed, filled SVG path. */
function getSvgPathFromStroke(points) {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    d += ` Q ${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`;
  }
  d += " Z";
  return d;
}

/** Turns a stroke's raw points into a filled, pressure-shaped SVG path string. */
export function freehandPathFromPoints(points, size) {
  if (!points.length) return "";
  const input = points.map((p) => [p.x, p.y, p.pressure ?? 0.5]);
  const outline = getStroke(input, {
    size,
    thinning: 0.6,
    smoothing: 0.55,
    streamline: 0.5,
  });
  return getSvgPathFromStroke(outline);
}

/** Builds a ready-to-append <path> element for one stroke (fill, no outline). */
export function buildStrokePath(stroke) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", freehandPathFromPoints(stroke.points, stroke.size));
  path.setAttribute("fill", stroke.color);
  path.setAttribute("stroke", "none");
  return path;
}

let maskIdSeq = 0;

/**
 * Renders a list of strokes into a single <g>, with "erase" strokes cut as
 * real transparent holes (via nested SVG masks) instead of painted-over
 * patches — so erased areas show whatever sits behind the drawing (paper,
 * a garden thumbnail, a preview card) rather than a flat matte color.
 *
 * Each erase stroke wraps everything drawn before it in a mask, so it only
 * ever erases ink that came earlier — ink drawn afterward, on top, is safe.
 */
export function buildStrokesGroup(strokes) {
  const NS = "http://www.w3.org/2000/svg";
  let acc = document.createElementNS(NS, "g");

  strokes.forEach((s) => {
    if (s.erase) {
      const maskId = `erase-mask-${maskIdSeq++}`;
      const mask = document.createElementNS(NS, "mask");
      mask.setAttribute("id", maskId);
      mask.setAttribute("maskUnits", "userSpaceOnUse");
      mask.setAttribute("x", "-100000");
      mask.setAttribute("y", "-100000");
      mask.setAttribute("width", "200000");
      mask.setAttribute("height", "200000");

      const bg = document.createElementNS(NS, "rect");
      bg.setAttribute("x", "-100000");
      bg.setAttribute("y", "-100000");
      bg.setAttribute("width", "200000");
      bg.setAttribute("height", "200000");
      bg.setAttribute("fill", "white");
      mask.appendChild(bg);

      const hole = document.createElementNS(NS, "path");
      hole.setAttribute("d", freehandPathFromPoints(s.points, s.size));
      hole.setAttribute("fill", "black");
      mask.appendChild(hole);

      acc.appendChild(mask);
      acc.setAttribute("mask", `url(#${maskId})`);

      const outer = document.createElementNS(NS, "g");
      outer.appendChild(acc);
      acc = outer;
    } else {
      acc.appendChild(buildStrokePath(s));
    }
  });

  return acc;
}

/**
 * Attaches a freehand drawing surface to an <svg> element.
 * Returns an API to read/undo/redo/clear/replay strokes.
 */
export function createDrawingCanvas(svgEl, options = {}) {
  let strokes = [];
  let redoStack = [];
  let currentColor = options.color || "#5b6f4e";
  let currentSize = options.size || 6;
  let erasing = false;
  let activeStroke = null;
  let activePath = null;

  const viewBox = svgEl.viewBox.baseVal;

  function toLocalPoint(evt) {
    const rect = svgEl.getBoundingClientRect();
    // The SVG's default preserveAspectRatio ("xMidYMid meet") uniformly
    // scales and centers the viewBox inside rect, letterboxing it when
    // rect's aspect ratio doesn't match the viewBox's. Account for that
    // offset/scale here so pointer coordinates land where they're drawn.
    const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
    const offsetX = (rect.width - viewBox.width * scale) / 2;
    const offsetY = (rect.height - viewBox.height * scale) / 2;
    const x = (evt.clientX - rect.left - offsetX) / scale;
    const y = (evt.clientY - rect.top - offsetY) / scale;
    return { x, y, pressure: evt.pressure || 0.5 };
  }

  function pointerDown(evt) {
    evt.preventDefault();
    svgEl.setPointerCapture(evt.pointerId);
    const pt = toLocalPoint(evt);
    activeStroke = {
      color: erasing ? options.eraseColor || "#f5efdd" : currentColor,
      size: erasing ? currentSize * 3 : currentSize,
      points: [pt],
      erase: erasing,
    };
    activePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    activePath.setAttribute("fill", activeStroke.color);
    activePath.setAttribute("stroke", "none");
    svgEl.appendChild(activePath);
    redoStack = [];
  }

  function pointerMove(evt) {
    if (!activeStroke) return;
    const pt = toLocalPoint(evt);
    const last = activeStroke.points[activeStroke.points.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.6) return; // skip tiny jitter
    activeStroke.points.push(pt);
    activePath.setAttribute("d", freehandPathFromPoints(activeStroke.points, activeStroke.size));
  }

  function pointerUp() {
    if (!activeStroke) return;
    if (activeStroke.points.length >= 2) {
      strokes.push(activeStroke);
    } else if (activePath) {
      activePath.remove();
    }
    activeStroke = null;
    activePath = null;
    options.onChange?.(strokes);
  }

  svgEl.addEventListener("pointerdown", pointerDown);
  svgEl.addEventListener("pointermove", pointerMove);
  svgEl.addEventListener("pointerup", pointerUp);
  svgEl.addEventListener("pointercancel", pointerUp);
  svgEl.addEventListener("pointerleave", () => { if (activeStroke) pointerUp(); });

  function redraw() {
    svgEl.querySelectorAll("[data-strokes-group]").forEach((g) => g.remove());
    const group = buildStrokesGroup(strokes);
    group.setAttribute("data-strokes-group", "1");
    svgEl.appendChild(group);
  }

  return {
    setColor(c) { currentColor = c; erasing = false; },
    setSize(s) { currentSize = s; },
    setErasing(v) { erasing = v; },
    undo() {
      if (!strokes.length) return;
      redoStack.push(strokes.pop());
      redraw();
      options.onChange?.(strokes);
    },
    redo() {
      if (!redoStack.length) return;
      strokes.push(redoStack.pop());
      redraw();
      options.onChange?.(strokes);
    },
    clear() {
      strokes = [];
      redoStack = [];
      redraw();
      options.onChange?.(strokes);
    },
    getStrokes() { return strokes; },
    isEmpty() { return strokes.length === 0; },
    loadStrokes(loaded) {
      strokes = loaded.map((s) => ({ ...s }));
      redraw();
    },
  };
}

/**
 * Plays back a flower's strokes into a target <svg>, revealing each
 * stroke point-by-point (recomputing the freehand outline for a growing
 * prefix of points each frame). Returns play/pause/replay/setSpeed controls.
 */
export function createReplayPlayer(svgEl, strokes, { onDone } = {}) {
  svgEl.innerHTML = "";
  const paths = strokes.map((s) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", s.color);
    path.setAttribute("stroke", "none");
    svgEl.appendChild(path);
    return { path, stroke: s };
  });

  let rafId = null;
  let speed = 1;
  let strokeIndex = 0;
  let strokeStart = 0;
  let playing = false;
  const MS_PER_STROKE = 650;

  function paintStroke(i, t) {
    const { path, stroke } = paths[i];
    const count = Math.max(2, Math.round(stroke.points.length * t));
    path.setAttribute("d", freehandPathFromPoints(stroke.points.slice(0, count), stroke.size));
  }

  function resetVisual() {
    paths.forEach(({ path }) => path.setAttribute("d", ""));
  }

  function tick(now) {
    if (!playing) return;
    if (strokeIndex >= paths.length) { playing = false; onDone?.(); return; }
    if (!strokeStart) strokeStart = now;
    const elapsed = (now - strokeStart) * speed;
    const t = Math.min(1, elapsed / MS_PER_STROKE);
    paintStroke(strokeIndex, t);
    if (t >= 1) {
      strokeIndex += 1;
      strokeStart = 0;
    }
    rafId = requestAnimationFrame(tick);
  }

  return {
    play() {
      if (playing) return;
      playing = true;
      rafId = requestAnimationFrame(tick);
    },
    pause() {
      playing = false;
      if (rafId) cancelAnimationFrame(rafId);
    },
    replay() {
      this.pause();
      strokeIndex = 0;
      strokeStart = 0;
      resetVisual();
      this.play();
    },
    setSpeed(v) { speed = v; },
    showFinal() {
      this.pause();
      strokeIndex = paths.length;
      paths.forEach(({ path, stroke }) => {
        path.setAttribute("d", freehandPathFromPoints(stroke.points, stroke.size));
      });
    },
  };
}

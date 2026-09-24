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
//
// Drawing data is a flat list of entries, each either:
//   { type: "ink",  points, color, size }
//   { type: "fill", d, color, bbox, holes: [{ points, size }] }
// (older saved flowers omit `type` entirely — treated as "ink".)
// The eraser is not its own entry: it mutates this list directly —
// splitting/shrinking/dropping "ink" entries by their raw points,
// and recording a cut "hole" on any "fill" entry it crosses — so an
// erased area is truly gone from the data, not painted over.
// ===========================================================

import { getStroke } from "https://esm.sh/perfect-freehand@1.2.0";

const NS = "http://www.w3.org/2000/svg";
let maskIdSeq = 0;

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

// ---------------------------------------------------------------
// Eraser geometry — real partial removal, not a painted-over patch.
// ---------------------------------------------------------------

function pointSegDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether point p falls within `radius` of the polyline `path` (the eraser drag). */
function isErasedPoint(p, path, radius) {
  if (path.length === 1) return Math.hypot(p.x - path[0].x, p.y - path[0].y) <= radius;
  for (let i = 1; i < path.length; i++) {
    if (pointSegDist(p, path[i - 1], path[i]) <= radius) return true;
  }
  return false;
}

/**
 * Cuts an eraser path out of one "ink" stroke's raw points, returning the
 * remaining contiguous runs (0, 1 or more) as fresh stroke entries — same
 * color/size, shorter or split point arrays. A run shorter than 2 points
 * can't form a visible stroke and is dropped.
 */
function splitInkStroke(stroke, erasePath, radius) {
  const segments = [];
  let current = [];
  stroke.points.forEach((p) => {
    if (isErasedPoint(p, erasePath, radius)) {
      if (current.length >= 2) segments.push(current);
      current = [];
    } else {
      current.push(p);
    }
  });
  if (current.length >= 2) segments.push(current);
  return segments.map((points) => ({ ...stroke, points }));
}

function pathBBox(points, pad) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad,
    maxX: Math.max(...xs) + pad, maxY: Math.max(...ys) + pad,
  };
}
function bboxOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * Applies one eraser drag to the whole drawing. "ink" entries are split by
 * their raw points (see splitInkStroke); "fill" entries instead gain a
 * "hole" record — the fill's SVG path stays intact but gets wrapped in a
 * real SVG <mask> cutout wherever the eraser crossed it (see buildFillNode).
 * Returns a new list; never mutates `list` or its entries in place.
 */
function applyErase(list, erasePath, radius) {
  if (erasePath.length < 2) return list;
  const eBox = pathBBox(erasePath, radius);
  const result = [];
  list.forEach((entry) => {
    const type = entry.type || "ink";
    if (type === "fill") {
      if (entry.bbox && !bboxOverlap(eBox, entry.bbox)) {
        result.push(entry);
        return;
      }
      result.push({ ...entry, holes: [...(entry.holes || []), { points: erasePath, size: radius * 2 }] });
    } else {
      result.push(...splitInkStroke(entry, erasePath, radius));
    }
  });
  return result;
}

// ---------------------------------------------------------------
// Rendering — shared by the live canvas, preview, garden thumbnails
// and the replay player.
// ---------------------------------------------------------------

/** A full-bleed white/black <mask> definition, ready for its hole path to be filled in. */
function buildEraseMask() {
  const maskId = `fill-hole-${maskIdSeq++}`;
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
  hole.setAttribute("fill", "black");
  mask.appendChild(hole);

  return { maskId, mask, hole };
}

/**
 * Builds a fill entry's <path>, wrapped in one real transparent-hole mask
 * per eraser cut. `fillEntry.opacity`, when present, is a replay-only preview
 * hint (a fade-in progress 0-1) — never part of stored/serialized fill data.
 */
function buildFillNode(fillEntry) {
  let node = document.createElementNS(NS, "path");
  node.setAttribute("d", fillEntry.d);
  node.setAttribute("fill", fillEntry.color);
  node.setAttribute("stroke", "none");

  (fillEntry.holes || []).forEach((hole) => {
    const { maskId, mask, hole: holePath } = buildEraseMask();
    holePath.setAttribute("d", freehandPathFromPoints(hole.points, hole.size));
    const wrapper = document.createElementNS(NS, "g");
    wrapper.appendChild(mask);
    wrapper.appendChild(node);
    wrapper.setAttribute("mask", `url(#${maskId})`);
    node = wrapper;
  });

  if (fillEntry.opacity != null) node.setAttribute("opacity", String(fillEntry.opacity));
  return node;
}

/**
 * Builds the DOM for a drawing list, plus a flat {kind, path/el, stroke} ref
 * per entry. Fills are always rendered first — i.e. behind — every ink
 * stroke, regardless of where they fall in the list: a bucket fill is meant
 * to sit as a color wash under the linework that bounds it, never on top of
 * it, no matter whether it was added before or after that ink.
 */
function buildStrokesTree(list) {
  const root = document.createElementNS(NS, "g");
  const refs = [];
  const ordered = [
    ...list.filter((entry) => (entry.type || "ink") === "fill"),
    ...list.filter((entry) => (entry.type || "ink") !== "fill"),
  ];
  ordered.forEach((entry) => {
    if ((entry.type || "ink") === "fill") {
      const el = buildFillNode(entry);
      root.appendChild(el);
      refs.push({ kind: "fill", el, stroke: entry });
    } else {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("fill", entry.color);
      path.setAttribute("stroke", "none");
      root.appendChild(path);
      refs.push({ kind: "ink", path, stroke: entry });
    }
  });
  return { root, refs };
}

/** Renders a drawing list into a single <g>, ready to append as-is. */
export function buildStrokesGroup(list) {
  const { root, refs } = buildStrokesTree(list);
  refs.forEach((r) => {
    if (r.kind === "ink") r.path.setAttribute("d", freehandPathFromPoints(r.stroke.points, r.stroke.size));
  });
  return root;
}

// ---------------------------------------------------------------
// Fill (bucket) — the boundary is found by rasterizing the current
// drawing to an offscreen canvas (never attached to the page, never
// stored) and flood-filling from the click; the filled region is then
// traced back into one smoothed SVG path, which is what actually gets
// stored and rendered from then on. So the *lookup* touches pixels,
// but the *data* — and everything drawn from it — stays vector: it
// scales, serializes, and re-renders exactly like any other stroke.
// ---------------------------------------------------------------

const FILL_RASTER_SCALE = 4; // px per viewBox unit, for the throwaway lookup canvas
const FILL_GAP_TOLERANCE = 2; // vector units of extra ink width, to bridge tiny gaps

function rasterizeWalls(list, w, h, viewBox) {
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d");
  ctx.scale(FILL_RASTER_SCALE, FILL_RASTER_SCALE);
  ctx.translate(-viewBox.x, -viewBox.y);
  ctx.fillStyle = "#000";
  list.forEach((entry) => {
    if ((entry.type || "ink") === "fill") {
      ctx.fill(new Path2D(entry.d));
      (entry.holes || []).forEach((hole) => {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fill(new Path2D(freehandPathFromPoints(hole.points, hole.size)));
        ctx.globalCompositeOperation = "source-over";
      });
    } else {
      ctx.fill(new Path2D(freehandPathFromPoints(entry.points, entry.size + FILL_GAP_TOLERANCE)));
    }
  });
  return ctx.getImageData(0, 0, w, h);
}

/** 4-connected flood fill on the alpha channel; null if the region leaks to the canvas edge. */
function floodFill(imageData, w, h, startX, startY) {
  const data = imageData.data;
  const isWall = (x, y) => data[(y * w + x) * 4 + 3] > 10;
  if (startX < 0 || startY < 0 || startX >= w || startY >= h || isWall(startX, startY)) return null;

  const mask = new Uint8Array(w * h);
  const stack = [[startX, startY]];
  mask[startY * w + startX] = 1;
  let leaked = false;

  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) { leaked = true; continue; }
      const idx = ny * w + nx;
      if (mask[idx] || isWall(nx, ny)) continue;
      mask[idx] = 1;
      stack.push([nx, ny]);
    }
  }
  return leaked ? null : mask;
}

/**
 * Grows a binary mask outward by `iterations` pixels (4-connected). Used to
 * compensate for the wall dilation in rasterizeWalls: that dilation insets
 * the flood-filled region by ~FILL_GAP_TOLERANCE/2 from the ink's true edge
 * (needed to bridge tiny gaps between strokes), so growing the result back
 * out by that same amount tucks the fill under the ink instead of leaving a
 * hairline gap of background between them.
 */
function dilateMask(mask, w, h, iterations) {
  let current = mask;
  for (let i = 0; i < iterations; i++) {
    const next = new Uint8Array(current);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (current[y * w + x]) continue;
        if (
          (x > 0 && current[y * w + x - 1]) || (x < w - 1 && current[y * w + x + 1]) ||
          (y > 0 && current[(y - 1) * w + x]) || (y < h - 1 && current[(y + 1) * w + x])
        ) {
          next[y * w + x] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

/**
 * Traces every filled/empty boundary in a binary mask into closed pixel-grid
 * loops (one per outer edge and per enclosed "island" of unfilled pixels).
 * Walking each filled cell's four sides keeps this simple and infinite-loop
 * free, unlike hand-rolled Moore-neighbor tracing.
 */
function extractContourLoops(mask, w, h) {
  const filled = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const edgesFrom = new Map();
  const addEdge = (x1, y1, x2, y2) => {
    const key = `${x1},${y1}`;
    if (!edgesFrom.has(key)) edgesFrom.set(key, []);
    edgesFrom.get(key).push({ x: x2, y: y2 });
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!filled(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!filled(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!filled(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }

  const loops = [];
  for (const [startKey, edges] of edgesFrom) {
    while (edges.length) {
      const [sx, sy] = startKey.split(",").map(Number);
      let cur = { x: sx, y: sy };
      const loop = [cur];
      let guard = w * h * 4 + 8;
      while (guard-- > 0) {
        const next = (edgesFrom.get(`${cur.x},${cur.y}`) || []).shift();
        if (!next) break;
        cur = next;
        loop.push(cur);
        if (cur.x === sx && cur.y === sy) break;
      }
      if (loop.length > 3) loops.push(loop);
    }
  }
  return loops;
}

function shoelaceArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Ramer–Douglas–Peucker simplification, to turn a pixel staircase into a clean outline. */
function simplifyPath(points, epsilon) {
  if (points.length < 3) return points;
  let maxDist = 0, index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, index + 1), epsilon);
    const right = simplifyPath(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

/**
 * Finds the enclosed region at (x, y) in viewBox space and returns a ready
 * to store fill entry ({ type: "fill", d, color, bbox, holes: [] }), or null
 * if the click isn't inside a closed area (including landing right on ink,
 * or a region that leaks past the canvas edge).
 *
 * Known limitation: if the enclosed area itself contains a smaller untouched
 * "island" (ink fully surrounded by the fill), that island is painted over
 * rather than kept as a hole — only the outer boundary becomes the fill
 * shape. Good enough for quick doodles; a nested-holes fill was out of scope.
 */
function computeFill(list, viewBox, pt, color) {
  const w = Math.max(1, Math.round(viewBox.width * FILL_RASTER_SCALE));
  const h = Math.max(1, Math.round(viewBox.height * FILL_RASTER_SCALE));
  const imageData = rasterizeWalls(list, w, h, viewBox);
  const startX = Math.round((pt.x - viewBox.x) * FILL_RASTER_SCALE);
  const startY = Math.round((pt.y - viewBox.y) * FILL_RASTER_SCALE);

  const mask = floodFill(imageData, w, h, startX, startY);
  if (!mask) return null;

  // Grown by the full tolerance (not just the half that mathematically cancels
  // the wall dilation): 4-connected growth is diamond-shaped, not circular,
  // so it under-reaches on diagonal curves, and simplifyPath's epsilon below
  // eats back a little more. Since fills render behind all ink (see
  // buildStrokesTree), erring generous here just tucks further under the
  // ink — invisible — rather than risking a hairline gap showing through.
  const grown = dilateMask(mask, w, h, Math.round(FILL_RASTER_SCALE * FILL_GAP_TOLERANCE));
  const loops = extractContourLoops(grown, w, h);
  if (!loops.length) return null;
  loops.sort((a, b) => Math.abs(shoelaceArea(b)) - Math.abs(shoelaceArea(a)));

  const toViewBox = loops[0].map((p) => ({
    x: p.x / FILL_RASTER_SCALE + viewBox.x,
    y: p.y / FILL_RASTER_SCALE + viewBox.y,
  }));
  const simplified = simplifyPath(toViewBox, 0.6);
  if (simplified.length < 3) return null;

  const d = getSvgPathFromStroke(simplified.map((p) => [p.x, p.y]));
  const xs = simplified.map((p) => p.x), ys = simplified.map((p) => p.y);
  return {
    type: "fill",
    color,
    d,
    bbox: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
    holes: [],
  };
}

// ---------------------------------------------------------------
// The live drawing surface.
// ---------------------------------------------------------------

/**
 * Attaches a freehand drawing surface to an <svg> element.
 * Returns an API to read/undo/redo/clear/replay strokes.
 */
export function createDrawingCanvas(svgEl, options = {}) {
  let strokes = [];
  let currentColor = options.color || "#5b6f4e";
  let currentSize = options.size || 6;
  let tool = "brush"; // "brush" | "erase" | "fill"
  let activeStroke = null;
  let activePath = null;

  // Alongside `strokes` (the current, final drawing), we keep a chronological
  // log of the actions that produced it — draw/erase/fill/clear, in the order
  // they happened. `strokes` is what every renderer uses (preview, garden
  // thumbnails, the live canvas); `actions` exists so a flower's replay can
  // recreate the actual drawing *process* later — including an eraser
  // sweeping through and cutting ink — instead of only ever showing the
  // already-cut result. See createReplayPlayer/createActionReplayPlayer.
  let actions = [];

  // Undo/redo as full snapshots of `{ strokes, actions }`. Each committed
  // action (a drawn stroke, an eraser drag, a fill, a clear) pushes one
  // snapshot; undo/redo just move a pointer through them. Simple, and
  // correct for every action here — including an eraser drag that edits
  // several entries at once, which a per-stroke push/pop stack can't
  // express — and keeps the action log in lockstep with `strokes` so an
  // undone action never lingers in what eventually gets saved.
  let history = [{ strokes: structuredClone(strokes), actions: structuredClone(actions) }];
  let historyIndex = 0;

  const viewBox = svgEl.viewBox.baseVal;

  function commit(action) {
    actions = [...actions, action];
    history = history.slice(0, historyIndex + 1);
    history.push({ strokes: structuredClone(strokes), actions: structuredClone(actions) });
    historyIndex = history.length - 1;
  }

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

  function renderList(list) {
    svgEl.querySelectorAll("[data-strokes-group]").forEach((g) => g.remove());
    const group = buildStrokesGroup(list);
    group.setAttribute("data-strokes-group", "1");
    svgEl.appendChild(group);
  }
  function redraw() { renderList(strokes); }

  function pointerDown(evt) {
    evt.preventDefault();
    svgEl.setPointerCapture(evt.pointerId);
    const pt = toLocalPoint(evt);

    if (tool === "fill") {
      const entry = computeFill(strokes, viewBox, pt, currentColor);
      if (entry) {
        strokes.push(entry);
        commit({ type: "fill", entry });
        redraw();
        options.onChange?.(strokes);
      }
      return;
    }

    activeStroke = {
      color: currentColor,
      size: tool === "erase" ? currentSize * 3 : currentSize,
      points: [pt],
    };

    if (tool === "brush") {
      activePath = document.createElementNS(NS, "path");
      activePath.setAttribute("fill", activeStroke.color);
      activePath.setAttribute("stroke", "none");
      svgEl.appendChild(activePath);
    }
  }

  function pointerMove(evt) {
    if (!activeStroke) return;
    const pt = toLocalPoint(evt);
    const last = activeStroke.points[activeStroke.points.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.6) return; // skip tiny jitter
    activeStroke.points.push(pt);

    if (tool === "erase") {
      renderList(applyErase(strokes, activeStroke.points, activeStroke.size / 2));
    } else if (activePath) {
      activePath.setAttribute("d", freehandPathFromPoints(activeStroke.points, activeStroke.size));
    }
  }

  function pointerUp() {
    if (!activeStroke) return;
    if (activePath) { activePath.remove(); activePath = null; }

    if (activeStroke.points.length >= 2) {
      if (tool === "erase") {
        strokes = applyErase(strokes, activeStroke.points, activeStroke.size / 2);
        commit({ type: "erase", path: activeStroke.points, size: activeStroke.size });
      } else {
        strokes.push(activeStroke);
        commit({ type: "draw", stroke: activeStroke });
      }
    }
    redraw(); // restores canonical state either way (drops any live erase preview)
    activeStroke = null;
    options.onChange?.(strokes);
  }

  svgEl.addEventListener("pointerdown", pointerDown);
  svgEl.addEventListener("pointermove", pointerMove);
  svgEl.addEventListener("pointerup", pointerUp);
  svgEl.addEventListener("pointercancel", pointerUp);
  svgEl.addEventListener("pointerleave", () => { if (activeStroke) pointerUp(); });

  return {
    setColor(c) { currentColor = c; tool = "brush"; },
    setSize(s) { currentSize = s; },
    /** @deprecated use setTool("erase" | "brush") */
    setErasing(v) { tool = v ? "erase" : "brush"; },
    setTool(v) { tool = v; },
    undo() {
      if (historyIndex <= 0) return;
      historyIndex -= 1;
      strokes = structuredClone(history[historyIndex].strokes);
      actions = structuredClone(history[historyIndex].actions);
      redraw();
      options.onChange?.(strokes);
    },
    redo() {
      if (historyIndex >= history.length - 1) return;
      historyIndex += 1;
      strokes = structuredClone(history[historyIndex].strokes);
      actions = structuredClone(history[historyIndex].actions);
      redraw();
      options.onChange?.(strokes);
    },
    clear() {
      strokes = [];
      commit({ type: "clear" });
      redraw();
      options.onChange?.(strokes);
    },
    getStrokes() { return strokes; },
    getActions() { return actions; },
    isEmpty() { return strokes.length === 0; },
    loadStrokes(loaded) {
      strokes = structuredClone(loaded);
      actions = [];
      history = [{ strokes: structuredClone(strokes), actions: [] }];
      historyIndex = 0;
      redraw();
    },
  };
}

/**
 * Plays back a flower's drawing. When the flower has a recorded `actions`
 * log (see createDrawingCanvas), replays the actual draw/erase/fill/clear
 * sequence that produced it — an eraser sweep visibly cuts into ink, a fill
 * appears where it was clicked — via createActionReplayPlayer. Older
 * flowers saved before the action log existed only have `strokes`, so they
 * fall back to createFinalStrokesReplayPlayer, which just reveals each
 * already-final entry in order. Returns play/pause/replay/setSpeed controls.
 */
export function createReplayPlayer(svgEl, strokes, { onDone, actions, speed = 1 } = {}) {
  if (Array.isArray(actions) && actions.length) {
    return createActionReplayPlayer(svgEl, actions, { onDone, speed });
  }
  return createFinalStrokesReplayPlayer(svgEl, strokes, { onDone, speed });
}

/** Fallback replay for flowers with no action log: reveals each final stroke/fill in order. */
function createFinalStrokesReplayPlayer(svgEl, strokes, { onDone, speed = 1 } = {}) {
  svgEl.innerHTML = "";
  const { root, refs } = buildStrokesTree(strokes);
  refs.forEach((r) => {
    if (r.kind === "ink") r.path.setAttribute("d", "");
    else r.el.setAttribute("opacity", "0");
  });
  svgEl.appendChild(root);

  let rafId = null;
  let strokeIndex = 0;
  let strokeElapsed = 0;
  let lastNow = 0;
  let playing = false;
  const MS_PER_STROKE = 650;

  function paintFrame(i, t) {
    const r = refs[i];
    if (r.kind === "ink") {
      const count = Math.max(2, Math.round(r.stroke.points.length * t));
      r.path.setAttribute("d", freehandPathFromPoints(r.stroke.points.slice(0, count), r.stroke.size));
    } else {
      r.el.setAttribute("opacity", String(t));
    }
  }

  function resetVisual() {
    refs.forEach((r) => {
      if (r.kind === "ink") r.path.setAttribute("d", "");
      else r.el.setAttribute("opacity", "0");
    });
  }

  function tick(now) {
    if (!playing) return;
    if (strokeIndex >= refs.length) { playing = false; onDone?.(); return; }
    if (lastNow) strokeElapsed += (now - lastNow) * speed;
    lastNow = now;
    const t = Math.min(1, strokeElapsed / MS_PER_STROKE);
    paintFrame(strokeIndex, t);
    if (t >= 1) {
      strokeIndex += 1;
      strokeElapsed = 0;
    }
    rafId = requestAnimationFrame(tick);
  }

  return {
    play() {
      if (playing) return;
      if (strokeIndex >= refs.length) { this.replay(); return; }
      playing = true;
      lastNow = 0;
      rafId = requestAnimationFrame(tick);
    },
    pause() {
      playing = false;
      if (rafId) cancelAnimationFrame(rafId);
    },
    replay() {
      this.pause();
      strokeIndex = 0;
      strokeElapsed = 0;
      resetVisual();
      playing = true;
      lastNow = 0;
      rafId = requestAnimationFrame(tick);
    },
    setSpeed(v) { speed = v; },
    showFinal() {
      this.pause();
      strokeIndex = refs.length;
      refs.forEach((r) => {
        if (r.kind === "ink") r.path.setAttribute("d", freehandPathFromPoints(r.stroke.points, r.stroke.size));
        else r.el.setAttribute("opacity", "1");
      });
    },
  };
}

/**
 * Replays a recorded action log by re-running the same list-transforming
 * logic the live canvas uses (applyErase, appending an ink/fill entry,
 * clearing) one action at a time, animating each: an ink stroke grows point
 * by point same as before, but an eraser action grows *its own* path and
 * re-applies applyErase() to the drawing-so-far each frame — so the cut
 * visibly sweeps through the ink instead of the stroke just already being
 * split. Rebuilds the whole SVG group every frame rather than touching
 * individual paths, since an eraser frame can restructure several entries
 * at once; fine at this app's scale (a few dozen entries, a few seconds of
 * animation).
 */
function createActionReplayPlayer(svgEl, actions, { onDone, speed = 1 } = {}) {
  let list = [];
  let rafId = null;
  let actionIndex = 0;
  let actionElapsed = 0;
  let lastNow = 0;
  let playing = false;
  const MS_PER_ACTION = 650;

  function render(previewList) {
    svgEl.innerHTML = "";
    svgEl.appendChild(buildStrokesGroup(previewList));
  }

  function previewAt(action, t) {
    switch (action.type) {
      case "draw": {
        const count = Math.max(2, Math.round(action.stroke.points.length * t));
        return [...list, { ...action.stroke, points: action.stroke.points.slice(0, count) }];
      }
      case "erase": {
        const count = Math.max(2, Math.round(action.path.length * t));
        return applyErase(list, action.path.slice(0, count), action.size / 2);
      }
      case "fill":
        return [...list, { ...action.entry, opacity: t }];
      case "clear":
        return list;
      default:
        return list;
    }
  }

  function commitAction(action) {
    switch (action.type) {
      case "draw": list = [...list, action.stroke]; break;
      case "erase": list = applyErase(list, action.path, action.size / 2); break;
      case "fill": list = [...list, action.entry]; break;
      case "clear": list = []; break;
    }
  }

  function tick(now) {
    if (!playing) return;
    if (actionIndex >= actions.length) { playing = false; onDone?.(); return; }
    if (lastNow) actionElapsed += (now - lastNow) * speed;
    lastNow = now;
    const t = Math.min(1, actionElapsed / MS_PER_ACTION);
    render(previewAt(actions[actionIndex], t));
    if (t >= 1) {
      commitAction(actions[actionIndex]);
      actionIndex += 1;
      actionElapsed = 0;
    }
    rafId = requestAnimationFrame(tick);
  }

  render(list);

  return {
    play() {
      if (playing) return;
      if (actionIndex >= actions.length) { this.replay(); return; }
      playing = true;
      lastNow = 0;
      rafId = requestAnimationFrame(tick);
    },
    pause() {
      playing = false;
      if (rafId) cancelAnimationFrame(rafId);
    },
    replay() {
      this.pause();
      list = [];
      actionIndex = 0;
      actionElapsed = 0;
      render(list);
      playing = true;
      lastNow = 0;
      rafId = requestAnimationFrame(tick);
    },
    setSpeed(v) { speed = v; },
    showFinal() {
      this.pause();
      list = [];
      actions.forEach((a) => commitAction(a));
      actionIndex = actions.length;
      render(list);
    },
  };
}

// ===========================================================
// Secret Garden — data layer
// Flowers are stored as stroke data (vector), not raster images,
// so a flower's drawing can be replayed stroke-by-stroke later.
// Persisted to localStorage so the "shared garden" survives reloads
// on this device. Swap this module for a Supabase client to make
// it genuinely shared across visitors — see README.
// ===========================================================

const STORAGE_KEY = "secret-garden.flowers.v1";

/**
 * @typedef {{x:number,y:number}} StrokePoint
 * @typedef {{points:StrokePoint[], color:string, size:number}} Stroke
 * @typedef {{
 *   id:string, name:string, author:string, message:string,
 *   createdAt:string, plotX:number, plotY:number, scale:number, hue:number,
 *   strokes:Stroke[], isPrivate:boolean, seal:(string|null)
 * }} Flower
 */

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Secret Garden: could not read storage", e);
    return null;
  }
}

function writeAll(flowers) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flowers));
  } catch (e) {
    console.warn("Secret Garden: could not save flower (storage full or blocked)", e);
  }
}

// A handful of hand-authored strokes so the garden never opens empty.
// Each is a very small line-drawing built from a few soft strokes.
function seedFlowers() {
  const petals = (cx, cy, color) => ([
    { color, size: 6, points: bloomPath(cx, cy, 0) },
    { color, size: 6, points: bloomPath(cx, cy, 72) },
    { color, size: 6, points: bloomPath(cx, cy, 144) },
    { color, size: 6, points: bloomPath(cx, cy, 216) },
    { color, size: 6, points: bloomPath(cx, cy, 288) },
    { color: "#6b7f52", size: 5, points: stemPath(cx, cy) },
  ]);

  function bloomPath(cx, cy, angleDeg) {
    const a = (angleDeg * Math.PI) / 180;
    const r1 = 4, r2 = 26;
    const midA = a + 0.5;
    return [
      { x: cx, y: cy },
      { x: cx + Math.cos(a) * r1, y: cy + Math.sin(a) * r1 },
      { x: cx + Math.cos(midA) * r2 * 0.7, y: cy + Math.sin(midA) * r2 * 0.7 },
      { x: cx + Math.cos(a) * r2, y: cy + Math.sin(a) * r2 },
      { x: cx + Math.cos(a - 0.5) * r2 * 0.7, y: cy + Math.sin(a - 0.5) * r2 * 0.7 },
      { x: cx, y: cy },
    ];
  }
  function stemPath(cx, cy) {
    return [
      { x: cx, y: cy },
      { x: cx - 4, y: cy + 30 },
      { x: cx + 3, y: cy + 60 },
    ];
  }

  return [
    {
      id: "seed-1", name: "Moonflower", author: "Mika",
      message: "Even on the quietest nights, I hope you find something worth looking at.",
      createdAt: "2024-03-02T20:10:00.000Z",
      plotX: 22, plotY: 62, scale: 1, hue: 0,
      strokes: petals(60, 60, "#e9e2f3"),
      isPrivate: false, seal: null,
    },
    {
      id: "seed-2", name: "Wren's Wish", author: "Wren",
      message: "For the version of you that hasn't arrived yet — take your time.",
      createdAt: "2024-04-11T14:32:00.000Z",
      plotX: 68, plotY: 70, scale: 1.1, hue: 0,
      strokes: petals(60, 60, "#d8a3a0"),
      isPrivate: false, seal: null,
    },
    {
      id: "seed-3", name: "Small Gold Thing", author: "Theo",
      message: "This one's for the mornings you almost didn't get out of bed, and did anyway.",
      createdAt: "2024-05-29T09:00:00.000Z",
      plotX: 45, plotY: 48, scale: 0.9, hue: 0,
      strokes: petals(60, 60, "#e3b94f"),
      isPrivate: false, seal: null,
    },
    {
      id: "seed-4", name: "Late Bloomer", author: "Ana",
      message: "Some things take longer to open. That's not the same as being wrong.",
      createdAt: "2024-06-14T18:45:00.000Z",
      plotX: 81, plotY: 40, scale: 1, hue: 0,
      strokes: petals(60, 60, "#9fc1d0"),
      isPrivate: false, seal: null,
    },
    {
      id: "seed-5", name: "Whispered Thing", author: "Mika",
      message: "This one isn't for everyone. If you're reading it, you probably know why.",
      createdAt: "2024-07-20T21:15:00.000Z",
      plotX: 34, plotY: 34, scale: 1, hue: 0,
      strokes: petals(60, 60, "#c2aed1"),
      isPrivate: true, seal: "lavender",
    },
  ];
}

export function getFlowers() {
  const stored = readAll();
  if (stored && Array.isArray(stored) && stored.length) return stored;
  const seeded = seedFlowers();
  writeAll(seeded);
  return seeded;
}

export function addFlower(flower) {
  const flowers = getFlowers();
  const withId = { ...flower, id: uid(), createdAt: new Date().toISOString() };
  flowers.push(withId);
  writeAll(flowers);
  return withId;
}

export function getFlowerById(id) {
  return getFlowers().find((f) => f.id === id) || null;
}

/** Random-but-stable-feeling open plot, avoiding existing flowers too closely. */
export function suggestPlot() {
  const flowers = getFlowers();
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = 10 + Math.random() * 80;
    const y = 30 + Math.random() * 55;
    const tooClose = flowers.some((f) => Math.hypot(f.plotX - x, f.plotY - y) < 9);
    if (!tooClose) return { x, y };
  }
  return { x: 50, y: 55 };
}

export function formatDate(iso, locale) {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return "";
  }
}

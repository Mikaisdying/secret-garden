// ===========================================================
// Secret Garden — data layer
// Flowers are stored as stroke data (vector), not raster images,
// so a flower's drawing can be replayed stroke-by-stroke later.
// Persisted in the Supabase `flowers` table (see supabase/schema.sql),
// so every visitor sees the same garden.
// ===========================================================

import { supabase } from "./supabase.js";
import { stashForGarden, takeFromPreload } from "./handoff.js";

/**
 * @typedef {{x:number,y:number}} StrokePoint
 * @typedef {{type?:"ink", points:StrokePoint[], color:string, size:number}} InkStroke
 * @typedef {{type:"fill", d:string, color:string, bbox:object, holes:{points:StrokePoint[],size:number}[]}} FillStroke
 * @typedef {{
 *   id:string, name:string, author:string, message:string,
 *   createdAt:string, plotX:number, plotY:number, scale:number, hue:number,
 *   strokes:(InkStroke|FillStroke)[],
 *   isPrivate:boolean, seal:(string|null)
 * }} Flower
 */
// `strokes` is the final drawing — what every renderer uses. `actions` is an
// optional chronological log of draw/erase/fill/clear steps (see js/draw.js)
// that lets the garden replay the actual drawing process, not just its
// result; flowers saved before this existed simply omit it.
// The log can be much heavier than `strokes` (every erased stroke, every
// undone-then-redone step), and only the replay needs it — so the flower
// list never selects the `actions` column; getFlowerActions() fetches it on
// demand when someone opens that flower.

// Must match the check constraints in supabase/schema.sql.
export const LIMITS = {
  name: { min: 2, max: 40 },
  author: { min: 2, max: 30 },
  message: { min: 5, max: 220 },
};

const LIST_COLUMNS =
  "id, created_at, name, author, message, plot_x, plot_y, scale, hue, strokes, is_private, seal";

/** Counts characters the way Postgres char_length() does (code points, not UTF-16 units). */
export function textLength(str) {
  return Array.from(str.trim()).length;
}

export function isWithinLimit(field, str) {
  const len = textLength(str);
  return len >= LIMITS[field].min && len <= LIMITS[field].max;
}

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    message: row.message,
    createdAt: row.created_at,
    plotX: row.plot_x,
    plotY: row.plot_y,
    scale: row.scale,
    hue: row.hue,
    strokes: row.strokes,
    isPrivate: row.is_private,
    seal: row.seal,
  };
}

let flowersPromise = null;

/** All flowers, oldest first, without their action logs. Fetched once per page load. */
export function getFlowers() {
  if (!flowersPromise) {
    const handedOff = takeFromPreload("flowers");
    if (Array.isArray(handedOff)) {
      flowersPromise = Promise.resolve(handedOff);
      return flowersPromise;
    }
    flowersPromise = supabase
      .from("flowers")
      .select(LIST_COLUMNS)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) throw error;
        const flowers = data.map(fromRow);
        stashForGarden("flowers", flowers);
        return flowers;
      });
    flowersPromise.catch(() => { flowersPromise = null; });
  }
  return flowersPromise;
}

/** Saves the flower with its action log. Returns the saved record, without `actions`. */
export async function addFlower({ actions, ...flower }) {
  const { data, error } = await supabase
    .from("flowers")
    .insert({
      name: flower.name,
      author: flower.author,
      message: flower.message,
      plot_x: flower.plotX,
      plot_y: flower.plotY,
      scale: flower.scale,
      hue: flower.hue,
      strokes: flower.strokes,
      actions: Array.isArray(actions) && actions.length ? actions : null,
      is_private: flower.isPrivate,
      seal: flower.seal,
    })
    .select(LIST_COLUMNS)
    .single();
  if (error) throw error;
  flowersPromise = null;
  return fromRow(data);
}

/** A flower's drawing-history log for replay, or null if it has none. */
export async function getFlowerActions(id) {
  const { data, error } = await supabase
    .from("flowers")
    .select("actions")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn("Secret Garden: could not load drawing history", error);
    return null;
  }
  return data?.actions ?? null;
}

export async function getFlowerById(id) {
  const flowers = await getFlowers();
  return flowers.find((f) => f.id === id) || null;
}

/** Removes a flower. The server checks `adminKey`; throws if it's wrong or the request fails. */
export async function deleteFlower(id, adminKey) {
  const { error } = await supabase.rpc("delete_flower", { flower_id: id, admin_key: adminKey });
  if (error) throw error;
  flowersPromise = null;
}

/** Random-but-stable-feeling open plot, avoiding existing flowers too closely. */
export async function suggestPlot() {
  const flowers = await getFlowers();
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

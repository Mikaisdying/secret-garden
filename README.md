# Secret Garden

A quiet, illustrated digital garden. Visitors draw a flower, name it, leave a
message, and plant it. Others can wander the garden, discover flowers, and
watch each one's drawing replay stroke by stroke.

This build is a **static, zero-build-step prototype** — plain HTML/CSS/
JavaScript (ES modules), no bundler, no npm install required. It runs by
opening the files in a browser or serving the folder with any static file
server. Flower data lives in `localStorage`, so the garden persists on your
own device/browser but isn't yet shared across visitors — see "Going live
with a real shared garden" below for the one swap that fixes that.

```

## File tree

```

secret-garden/
├── index.html Landing / welcome screen (the hero scene)
├── garden.html The shared garden — explore & discover flowers
├── plant.html The 5-step "plant a flower" flow
├── css/
│ ├── tokens.css Design tokens: color, type scale, spacing, motion
│ ├── base.css Global resets, buttons, fireflies
│ ├── landing.css Hero scene layout & illustration layers
│ ├── garden.css Garden scene, flower plots, detail panel
│ └── plant.css Step wizard, drawing toolbar, preview card
├── js/
│ ├── data.js Flower storage (localStorage) + seed flowers + plot logic
│ ├── draw.js Freehand drawing engine + stroke-by-stroke replay player
│ ├── landing.js Procedural trees/grass/fireflies for the hero scene
│ ├── garden.js Renders flowers into the garden, opens detail/replay
│ └── plant.js Wires up the 5-step planting flow, saves flowers
└── README.md

````

## How the drawing/replay system works

Every flower is stored as **vector stroke data**, not a raster image:

```js
{
  id, name, author, message, createdAt, plotX, plotY,
  strokes: [
    { type: "ink", color: "#5b6f4e", size: 6, points: [{x,y}, {x,y}, ...] },
    { type: "fill", color: "#5b6f4e", d: "M ... Z", bbox: {...}, holes: [] },
    ...
  ],
  actions: [
    { type: "draw", stroke: { color, size, points } },
    { type: "erase", path: [{x,y}, ...], size: 18 },
    { type: "fill", entry: { type: "fill", color, d, bbox, holes: [] } },
    { type: "clear" },
    ...
  ]
}
````

(older flowers omit `type` entirely — treated as `"ink"`. Older flowers also
omit `actions` entirely — see replay below.)

`actions` can be far heavier than `strokes`, and only the replay needs it, so
`js/data.js` stores it apart from the flower list (one localStorage entry per
flower). `getFlowers()` returns flowers _without_ `actions` — enough to draw
every thumbnail — and the garden calls `getFlowerActions(id)` only when a
viewer opens a flower. Flowers saved with `actions` embedded are migrated
automatically on the next `getFlowers()`.

`js/draw.js` exports:

- `createDrawingCanvas(svg, opts)` — attaches Pointer Events (mouse, touch,
  and stylus all work, pressure included where the device reports it) to an
  `<svg>`, captures each stroke's raw points, and exposes
  `undo/redo/clear/getStrokes/getActions/setTool("brush"|"erase"|"fill")`.
  The eraser does real partial removal — it splits/shrinks/drops "ink"
  entries by their raw points and cuts a real transparent hole (an SVG
  `<mask>`) into any "fill" entry it crosses, never a painted-over patch.
  Undo/redo are full snapshots of `{ strokes, actions }` together, so a
  multi-entry eraser drag, a fill, or a clear are each one undoable step, and
  an undone action never lingers in either list.
  `strokes` is the current, final drawing — what every renderer uses.
  `actions` is a parallel chronological log of the draw/erase/fill/clear
  steps that produced it, saved alongside `strokes` on the flower purely so
  replay can recreate the actual drawing _process_ later (see below) —
  nothing reads it to render the current state.
- `createReplayPlayer(svg, strokes, { actions })` — if `actions` is given and
  non-empty, replays that log action by action: an ink stroke grows point by
  point same as before, but an eraser action grows _its own_ recorded path
  and re-applies the same list-cutting logic the live canvas uses each
  frame, so the cut visibly sweeps through the ink instead of the stroke
  already being split. Without `actions` (older flowers), falls back to
  revealing each already-final `strokes` entry in order — recomputing an ink
  stroke's outline for a growing prefix of points, fading each fill in.
  Either way, exposes `play/pause/replay/setSpeed`.
- `buildStrokesGroup(strokes)` / `freehandPathFromPoints(points, size)` — the
  shared renderer used everywhere a drawing becomes SVG (the live canvas,
  garden thumbnails, and the preview panel).

Fill (bucket) finds its boundary by rasterizing the current drawing to a
throwaway offscreen canvas and flood-filling from the click — this is the one
place pixels get touched, purely as a lookup. The filled region is traced
back into one smoothed SVG path via `getSvgPathFromStroke`, and _that_ path is
what gets stored and rendered from then on, so the data (and everything drawn
from it — preview, garden, scaling, `localStorage`) stays vector. A click
that leaks past the canvas edge, or lands right on ink, fills nothing. A
smaller enclosed "island" fully inside a filled region gets painted over
rather than kept as a hole — a known simplification.

Each stroke's points are shaped into a single filled outline with
[`perfect-freehand`](https://github.com/steveruizok/perfect-freehand),
loaded straight from a CDN (`https://esm.sh/perfect-freehand@1.2.0`) as a
plain ES module — no bundler needed, the static site still works with zero
build step. This gives pressure-shaped, variable-width strokes wherever a
stylus or touchscreen reports pressure, falling back to a steady mid-weight
line for mouse input.

## Going live with a real shared garden

Right now `js/data.js` reads/writes `localStorage`, so each visitor has
their own private garden. To make it genuinely shared:

1. Create a free [Supabase](https://supabase.com) project.
2. Create a `flowers` table matching the shape above (`strokes` as `jsonb`).
3. In `js/data.js`, replace the `readAll`/`writeAll`/`addFlower` internals
   with Supabase client calls, e.g.:

   ```js
   import { createClient } from "@supabase/supabase-js";
   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

   // Everything except the heavy `actions` column.
   export async function getFlowers() {
     const { data } = await supabase
       .from("flowers")
       .select(
         "id, name, author, message, createdAt, plotX, plotY, scale, hue, strokes, isPrivate, seal",
       );
     return data;
   }
   // Fetched only when a flower is opened for replay.
   export async function getFlowerActions(id) {
     const { data } = await supabase
       .from("flowers")
       .select("actions")
       .eq("id", id)
       .single();
     return data?.actions ?? null;
   }
   export async function addFlower(flower) {
     const { data } = await supabase
       .from("flowers")
       .insert(flower)
       .select()
       .single();
     return data;
   }
   ```

4. Optionally subscribe to Supabase Realtime so newly planted flowers appear
   live for everyone already browsing the garden, without a refresh.
5. Deploy the static folder to **Vercel**, **Netlify**, or **GitHub Pages**
   (all free) — no server-side rendering is required for this app.

## Design notes

- Palette, type scale and motion timing are centralized in
  `css/tokens.css` — change the whole feel of the site from one file.
- Typography: **Cormorant Garamond** (display/italic headings) +
  **Lora** (body) — loaded free from Google Fonts in `css/base.css`.
- Flowers are scattered with percentage-based absolute positioning, never a
  grid, and each has a slow independent sway (`@keyframes flower-sway`) so
  the garden reads as a living place rather than a list of cards.
- All motion respects `prefers-reduced-motion` — with it enabled, fireflies
  render statically and sway/entrance animations are skipped, but no
  content or functionality is lost.

## Known limitations of this prototype

- No accounts/auth — anyone can plant a flower under any name. Add
  Supabase Auth if you need attribution to be trustworthy.
- No moderation. If you open this to the public, add a simple report
  mechanism and a review queue before flowers appear.
- "Birthday / special occasion mode" from the original brief isn't built
  yet — the cleanest way to add it is a `garden.html?occasion=<id>` route
  that filters `getFlowers()` to a tagged subset and swaps the closing
  copy to "This garden was grown for you."

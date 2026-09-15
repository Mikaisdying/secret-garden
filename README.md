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

## Running it locally

Because this uses ES modules (`<script type="module">`), open it through a
local server rather than double-clicking the HTML file (`file://` URLs block
module imports in most browsers).

```bash
cd secret-garden
python3 -m http.server 8000
# then visit http://localhost:8000
```

or with Node:

```bash
npx serve .
```

## File tree

```
secret-garden/
├── index.html            Landing / welcome screen (the hero scene)
├── garden.html            The shared garden — explore & discover flowers
├── plant.html              The 5-step "plant a flower" flow
├── about.html               Short lore / explanation page
├── css/
│   ├── tokens.css              Design tokens: color, type scale, spacing, motion
│   ├── base.css                  Global resets, nav, buttons, fireflies
│   ├── landing.css                Hero scene layout & illustration layers
│   ├── garden.css                  Garden scene, flower plots, detail panel
│   └── plant.css                    Step wizard, drawing toolbar, preview card
├── js/
│   ├── data.js         Flower storage (localStorage) + seed flowers + plot logic
│   ├── draw.js           Freehand drawing engine + stroke-by-stroke replay player
│   ├── landing.js          Procedural trees/grass/fireflies for the hero scene
│   ├── garden.js            Renders flowers into the garden, opens detail/replay
│   └── plant.js                Wires up the 5-step planting flow, saves flowers
└── README.md
```

## How the drawing/replay system works

Every flower is stored as **vector stroke data**, not a raster image:

```js
{
  id, name, author, message, createdAt, plotX, plotY,
  strokes: [
    { color: "#5b6f4e", size: 6, points: [{x,y}, {x,y}, ...] },
    ...
  ]
}
```

`js/draw.js` exports:
- `createDrawingCanvas(svg, opts)` — attaches Pointer Events (mouse, touch,
  and stylus all work, pressure included where the device reports it) to an
  `<svg>`, captures each stroke's raw points, and exposes
  `undo/redo/clear/getStrokes`.
- `createReplayPlayer(svg, strokes)` — renders each stroke as a filled path,
  recomputing its outline for a growing prefix of points each frame so the
  flower appears to draw itself, stroke by stroke. Exposes
  `play/pause/replay/setSpeed`.
- `buildStrokePath(stroke)` / `freehandPathFromPoints(points, size)` — the
  shared renderer used everywhere a stroke becomes an SVG path (the live
  canvas, garden thumbnails, and the replay/preview panels).

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

   export async function getFlowers() {
     const { data } = await supabase.from("flowers").select("*");
     return data;
   }
   export async function addFlower(flower) {
     const { data } = await supabase.from("flowers").insert(flower).select().single();
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

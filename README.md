# Secret Garden

A quiet, illustrated digital garden. Visitors draw a flower, pick a spot on
the lawn, name it, leave a message (optionally sealed as a private letter),
and plant it. Others wander the garden, open flowers, and watch each drawing
replay stroke by stroke.

Plain HTML/CSS/JavaScript (ES modules). No bundler, no `npm install`.
Flowers live in one Supabase table, so every visitor sees the same garden.
The only build step is `node scripts/build-config.mjs`, which writes
`js/config.js` from `.env`. After that, serve the folder with any static
file server (ES modules do not load from `file://`), e.g. `npx serve .` or
`python -m http.server`. See [Setup and deploy](#setup-and-deploy).

## User flow

```
index.html ──intro animation──▶ garden.html ──shovel button──▶ plant.html
                                   ▲                              │
                                   └──── ?planted=<id> ◀──────────┘
```

1. **Intro (`index.html`)**: a dot traces the sprout logo, then a circle
   grows to reveal `garden.html`. The garden has already been loading in a
   hidden iframe, so the page switch is instant. The iframe hands its
   flower list and rain result to the real garden page through
   `sessionStorage`, so flowers and rain show on the first frame instead of
   popping in after a second fetch. The whole screen is a link,
   so clicking it (or disabling JS) goes straight to the garden.
2. **Garden (`garden.html`)**:
   - Flowers are scattered over the lawn at their `plotX/plotY` and sway
     gently. Fireflies, wind, grass tufts and mushrooms are drawn
     procedurally.
   - A night tint follows the visitor's local clock (19:00–06:00). A rain
     layer turns on when Open-Meteo reports rain near the visitor's
     IP-based location (ipwho.is). If either request fails, the sky is clear.
   - Opening a flower shows a detail panel with a polaroid (drawing replay
     with play/pause, replay and speed controls) and a stamp card (name,
     author, date, message).
   - A private flower shows a sealed envelope with its wax seal instead of
     the message.
3. **Plant (`plant.html`)**: a 5-step wizard.
   1. Draw: brush, custom color, size, eraser, fill bucket, undo/redo, clear.
   2. Choose a place on a mini lawn that shows existing flowers.
   3. Name the flower and the author (both required, at least 1 character).
      An empty field shows a hint under it on blur or when pressing Next.
   4. Write a message (5–220 characters), optionally mark it private and
      pick a wax seal.
   5. Preview, then plant. The page waits for Supabase to save the flower,
      then goes to `garden.html?planted=<id>`, which opens the new flower
      automatically and strips the parameter from the URL. If saving fails,
      an error shows and the button can be pressed again.
4. **Unlocked garden (`garden.html?key=<secret>`)**: sealed letters
   become readable, an unlock banner appears, and the shovel button is
   replaced by a watering can that opens a gallery of every letter. Opening
   a flower also shows a trash button. It asks for one confirmation, then
   calls `delete_flower()` on the server, which checks the key again.
   Reading sealed letters is a cosmetic gate, not security: every row is
   publicly readable through the Supabase API.

## File tree

```
secret-garden/
├── index.html            Intro screen, preloads the garden in an iframe
├── garden.html           The garden scene, detail panel, letter gallery
├── plant.html            5-step planting wizard
├── css/
│   ├── tokens.css        Design tokens: color, type, spacing, motion
│   ├── base.css          Resets, fonts, buttons, shared components
│   ├── landing.css       Intro screen
│   ├── garden.css        Garden scene, day/night/rain, detail panel, gallery
│   └── plant.css         Wizard, drawing toolbar, plot picker, preview card
├── js/
│   ├── landing.js        Intro animation and handoff to the garden
│   ├── garden.js         Renders the garden, detail/replay, gallery, unlock mode
│   ├── plant.js          Wizard state and saving a new flower
│   ├── data.js           Flower reads/writes/deletes via Supabase, length limits
│   ├── supabase.js       Supabase client
│   ├── config.js         Generated from .env (gitignored), Supabase URL + key
│   ├── draw.js           Drawing engine, shared SVG renderer, replay player
│   ├── scenery.js        Seeded random + grass tufts shared by garden and picker
│   ├── environment.js    Day/night and rain classes on the scene
│   ├── seals.js          Wax seal presets and their SVG markup
│   ├── access.js         `?key=` check for unlock mode, key sent on delete
│   ├── handoff.js        Passes flowers/rain from the intro iframe to the garden
│   └── i18n/
│       ├── index.js      t(), setLang(), data-i18n* attribute binding
│       ├── boot.js       Initializes i18n on pages without their own script
│       ├── vi.js         Vietnamese strings (default language)
│       └── en.js         English strings (fallback for missing keys)
├── img/                  Favicon, intro paper texture, stamp masks
├── scripts/
│   └── build-config.mjs  Writes js/config.js from env vars or .env
├── supabase/
│   └── schema.sql        Table, limits, RLS, delete_flower(), seed flowers
├── .env.example          Template for .env (the real .env is gitignored)
└── vercel.json           Runs build-config.mjs on deploy, serves the root
```

## Data model

```js
{
  id, name, author, message, createdAt,
  plotX, plotY,          // percent position on the lawn
  scale, hue,
  isPrivate, seal,       // seal: a SEALS id from js/seals.js, or null
  strokes: [
    { type: "ink", color, size, points: [{ x, y }, ...] },   // type may be omitted on older flowers
    { type: "fill", color, d: "M ... Z", bbox, holes: [] },
  ],
}
```

Stored in the Supabase table `public.flowers` with snake_case columns
(`plot_x`, `created_at`, `is_private`, …). `js/data.js` maps rows to the
camelCase shape above.

- `id` (uuid) and `created_at` are set by the database. Visitors cannot set
  them.
- `actions` (the drawing-history log) is a column in the same table, but
  `getFlowers()` never selects it. `getFlowerActions(id)` loads it only
  when a flower is opened for replay.
- Length limits (`LIMITS` in `js/data.js`, check constraints in
  `schema.sql`): name 1–40, author 1–30, message 5–220 characters, trimmed.
  `strokes` must be a non-empty array of at most 500 KB, and `actions` at
  most 2 MB.
- Row Level Security: anyone can read and insert. Nobody can update. Rows
  can only be deleted through `delete_flower(flower_id, admin_key)`, which
  compares the SHA-256 of the key with the hash in `private.settings`.

`localStorage` keys:

- `secret-garden.lang`: the chosen language.

`sessionStorage` keys (written only by the intro's preload iframe, read
once and removed by the next top-level garden page, ignored after 30 s):

- `secret-garden.handoff.flowers`: the flower list, same shape as
  `getFlowers()`.
- `secret-garden.handoff.rainy`: `true`/`false` from the rain check.

## Drawing and replay (`js/draw.js`)

- `createDrawingCanvas(svg, opts)`: uses Pointer Events, so mouse, touch
  and stylus pressure all work. Tools are `brush`, `erase` and `fill`. It
  records two lists:
  - `strokes`: the final drawing, which every renderer uses.
  - `actions`: a chronological `draw`/`erase`/`fill`/`clear` log, used only
    by replay.

  Undo/redo snapshot both lists together.
- The eraser really removes ink: it splits or shortens `ink` entries and
  cuts SVG-mask holes into `fill` entries.
- Fill rasterizes the drawing offscreen, flood-fills from the click, then
  traces the region back into one smoothed SVG path. Only that vector path
  is stored. A fill that leaks past the canvas edge, or starts on ink, does
  nothing.
- `createReplayPlayer(svg, strokes, { actions })`: replays the action log
  (ink grows point by point, erasers sweep through ink). Without a log, it
  reveals the final strokes in order. It exposes `play/pause/replay/setSpeed`.
- `buildStrokesGroup(strokes)` / `freehandPathFromPoints(points, size)`: the
  shared renderer for the canvas, garden thumbnails and previews.
- Stroke outlines come from
  [`perfect-freehand`](https://github.com/steveruizok/perfect-freehand),
  imported from `https://esm.sh/perfect-freehand@1.2.0`.

## i18n

Every visible string goes through `t("section.key")` or a `data-i18n`,
`data-i18n-placeholder`, `data-i18n-aria-label`, `data-i18n-title` or
`data-i18n-content` attribute. The default language is Vietnamese, and
missing keys fall back to English. To add a language, copy `vi.js`,
translate it, and register it in `LANGUAGES` in `js/i18n/index.js`.

## Setup and deploy

1. Create a Supabase project. In **SQL Editor**, run
   `supabase/schema.sql`. It creates the table, limits, RLS, the delete
   function and 5 seed flowers (only if the table is empty). It is safe to
   re-run.
2. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` (the publishable key from **Project Settings →
   API**). Run `node scripts/build-config.mjs` to generate `js/config.js`.
   Re-run it whenever `.env` changes.
3. Deploy on Vercel: import the GitHub repo and add `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` under **Environment Variables**. `vercel.json`
   runs the config script as the build command. Every push to `main`
   redeploys.

The publishable key still reaches the browser (it has to), so it is not a
secret. `.env` only keeps it out of the repo. RLS is what protects the data.

To change the delete key, edit the value in the `insert into
private.settings` statement (lowercase) and run it again. The client-side
unlock check in `js/access.js` must use the same value.

## Known limitations

- No accounts: anyone can plant under any name.
- No moderation, apart from deleting in unlock mode.
- Private letters are hidden only in the UI. Anyone can read them through
  the Supabase API, and the unlock key is visible in `js/access.js`, so
  anyone who reads the source can also delete flowers.
- Inside a filled region, a smaller enclosed island is painted over instead
  of being kept as a hole.

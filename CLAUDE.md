# CLAUDE.md

## Code comments

- Do not write explanatory comments (inline, block, JSDoc, HTML/CSS) that restate what the code does. Use clear naming and small functions instead, and put explanations in the chat reply.
- Comments are allowed only for:
  - Layout / section separators that split UI regions (e.g. `<!-- Detail panel -->`, `/* ===== Gallery ===== */`).
  - Important, non-obvious notes: why a workaround exists, a browser quirk, a deliberate trade-off, or a constraint that would break things if changed.
- Leave existing comments in the codebase as they are unless they become wrong after your change.

## Validation

- Input validation rules (min/max length, required fields, format checks) live on the frontend only: `LIMITS` in `js/data.js`, `maxlength`/`minlength` in the HTML, and the checks in `js/plant.js`.
- Do not add or tighten Supabase `check` constraints, triggers or RLS rules to mirror frontend validation. Leave the existing constraints in `supabase/schema.sql` as they are.

## README

- `README.md` must describe the actual user flow (intro → garden → plant → back to garden, unlock mode), the file tree, the data model and where data is stored.
- Flowers are stored in Supabase (`public.flowers`, see `supabase/schema.sql`, accessed through `js/supabase.js` and `js/data.js`), not in `localStorage`. `localStorage` holds only the chosen language, and `sessionStorage` holds only the intro → garden handoff (`js/handoff.js`).
- When a change alters the flow, adds/removes/renames a file, changes the data shape, the Supabase schema or RPCs, `localStorage`/`sessionStorage` keys, URL parameters, or i18n setup, update `README.md` in the same change.
- Keep the README factual and matched to the code. Do not document features that do not exist.

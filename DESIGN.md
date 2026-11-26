# Mosaic Chart Designer — Design

A browser app for designing **overlay mosaic crochet** charts and exporting them as PDFs to work from on a tablet. UK terms throughout.

## Stitch rules

| Chart | Stitch |
|---|---|
| Blank | DC in the back loop of the stitch below |
| X | TR in the front loop of the stitch two rows below |
| BS | Border stitch: DC through both loops, first and last stitch of every row |
| FS / LS | First / last stitches: spare stitches before / after the repeats |
| FR | Foundation rows: plain, worked once at the start |

- One colour per row; every row worked on the right side, from right to left.
- An X in row *r* makes the stitch below (row *r−1*) show row *r*'s colour.
- Blocked, with a reason: an X directly above another X, an X on a BS column, an X on a foundation row.
- Checked across the whole design, including where sections meet.

## Project structure

- **Project:** stitches per row (including the 2 BS), colour palette, foundation rows.
- **Sections:** each has a row colour sequence (e.g. A, B or A, B, A, C) and either:
  - a **repeat**, tiled across the width, with spare stitches centred (continue the motif or plain fill; a toggle sets which side gets an odd spare stitch), or
  - **no repeat**: drawn across the whole width (pictures, logos).
- **Arrangement:** the order sections are worked in; sections can be reused. Shown bottom-up like the fabric, reorderable by drag or ↑ / ↓.
- Row numbers restart in each section.

## Editor

- New project form: width as total stitches (default) or repeat × count + spare.
- Click or drag to add/remove X's; the colour drop shows immediately.
- Rows added or removed at the top, or at the bottom (moving the whole pattern up or down a row, with each row keeping its colour).
- Per-row colour override; repeat view and full-width view; mirror; undo/redo; zoom.
- Whole-design preview updates live.

## Picture tools

One engine turns a target picture into X's:

- A stitch shows its own row's colour, or the row above's when that row has an X there.
- Shapes must start and end on a row of their own colour. Each column is solved exactly: fewest wrong stitches, then fewest X's; where a stitch can't match, *thin* or *thicken* decides which way it gives. Stitches that still can't be made are outlined in red.
- **Image import:** PNG/JPG/WebP, read on the device (nothing uploaded). Split into picture and background by a brightness threshold (auto-set, adjustable, swappable), with two alternating row colours. *Fill letter bodies* fills inside outlines but keeps holes (the middle of an O). Optional 90° / 180° turn; width in stitches (centred) and height in rows, proportional by default; plain rows above and below, plus one more on top if needed so the top row is the background colour. Live preview of the picture and the resulting chart; it becomes an ordinary no-repeat section on top of the arrangement. Multi-colour pictures: later.
- **Duplicate flipped:** an upside-down copy of a section, recalculated with the same engine (X's only drop downwards, so reversing rows isn't enough). *Turn upside down* rotates 180° (also swapping the odd spare stitch side); *flip* mirrors top to bottom only.
- Later: paint mode (paint the colours, the app places the X's).

## Saving

- Autosave in the browser; download/open project files. Designs never go into the repo.

## PDF

- A4, made in the browser with pdf-lib (loaded only when needed); standard fonts, so unusual characters in names show as "?".
- Full design image, colour key, legend, starting instructions.
- Section checklist (top-down, with tick boxes).
- One chart per section: red repeat box, stitch numbers along the top and bottom, row numbers on both sides, colour letter and tick box on the right.
- Tall sections split across pages; each continued page repeats the previous page's top 2 rows, faded, with shared tick boxes.
- Charts appear in the order sections are first worked; sections not in the arrangement are left out. The checklist links to each chart, and each chart links back.
- Tick boxes tappable as well as markable by hand. Written instructions: optional.

## Build order

1. Project set-up; mosaic rules with tests
2. Editor and saving
3. Picture engine and Duplicate flipped
4. Image import
5. PDF export

## Technical

- Static web app (Vite + JavaScript/TypeScript, Vitest for rule tests); hosted on GitHub Pages.
- No server or accounts. PDF generated in the browser.
- `mockup/` holds the clickable design mock-up.

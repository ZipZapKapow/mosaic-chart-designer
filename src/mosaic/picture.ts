import { layoutOf } from "./layout";
import type { ColourIndex, Row, Section } from "./types";

/**
 * The picture engine: given each row's colour and a target picture, choose the X's.
 *
 * A stitch in row r shows row r's colour, or row r+1's colour when row r+1 has an X
 * there. X's can't be stacked, so a shape has to start and end on rows of its own
 * colour. Each column is solved exactly (dynamic programming over the rows): the
 * X's chosen give the fewest stitches that differ from the target, then the
 * fewest X's. Stitches that still can't match are reported as misses.
 */

/** A target colour for each row (bottom first) and stored column; null means "don't mind". */
export type Target = (ColourIndex | null)[][];

export interface FitOptions {
  /**
   * When a stitch can't match, which way to give. `thin` lets shapes of `colour`
   * lose stitches at their edges; `thicken` lets them gain stitches instead.
   */
  prefer?: { colour: ColourIndex; mode: "thin" | "thicken" };
}

export interface Fit {
  /** X's per row and stored column. Row 1 (index 0) never gets X's. */
  x: boolean[][];
  /** Stitches that don't show their target colour. */
  misses: { row: number; col: number }[];
}

const MISS = 1_000_000;
const PREFER = 1_000;
const PER_X = 1;

export function fitPicture(rowColours: ColourIndex[], target: Target, opts: FitOptions = {}): Fit {
  const n = rowColours.length;
  if (target.length !== n) throw new Error("The picture needs one target row per section row.");
  const columns = target[0]?.length ?? 0;
  const x = Array.from({ length: n }, () => Array<boolean>(columns).fill(false));
  const misses: Fit["misses"] = [];

  const missCost = (want: ColourIndex) => {
    const p = opts.prefer;
    if (!p) return MISS;
    // thin: losing stitches of the shape colour is the cheaper mistake; thicken: the opposite.
    const isShape = want === p.colour;
    return (p.mode === "thin") === isShape ? MISS - PREFER : MISS;
  };

  for (let c = 0; c < columns; c++) {
    // Cost of row r's stitch, given whether row r+1 has an X here.
    const rowCost = (r: number, covered: boolean) => {
      const want = target[r]![c];
      if (want === null || want === undefined) return 0;
      const shows = covered ? rowColours[r + 1]! : rowColours[r]!;
      return shows === want ? 0 : missCost(want);
    };

    // best[r][v]: lowest cost of rows below r, given X(r) = v. choice[r][v]: best X(r-1).
    const best: [number, number][] = [[0, Infinity]];
    const choice: [number, number][] = [[0, 0]];
    for (let r = 1; r < n; r++) {
      const below = best[r - 1]!;
      const noX = Math.min(below[0], below[1]);
      best.push([rowCost(r - 1, false) + noX, rowCost(r - 1, true) + PER_X + below[0]]);
      choice.push([below[0] <= below[1] ? 0 : 1, 0]);
    }
    const top = best[n - 1]!;
    let v = top[0] <= top[1] ? 0 : 1;
    for (let r = n - 1; r >= 0; r--) {
      x[r]![c] = v === 1;
      v = choice[r]![v]!;
    }
    for (let r = 0; r < n; r++) {
      const want = target[r]![c];
      if (want === null || want === undefined) continue;
      const shows = x[r + 1]?.[c] ? rowColours[r + 1]! : rowColours[r]!;
      if (shows !== want) misses.push({ row: r, col: c });
    }
  }
  return { x, misses };
}

/** What each stored column of a section shows, on its own (nothing above its top row). */
export function shownColumns(section: Section): ColourIndex[][] {
  const rows = section.rows;
  return rows.map((row, r) => row.x.map((_, c) => (rows[r + 1]?.x[c] ? rows[r + 1]!.colour : row.colour)));
}

/**
 * An upside-down copy of a section with its X's worked out again (reversing the
 * rows isn't enough, because an X only ever drops its colour downwards).
 * `rotate` turns it round 180°, as when the other end of a scarf hangs down;
 * otherwise it's flipped top to bottom only.
 */
export function flippedSection(
  section: Section,
  width: number,
  opts: { id: string; name: string; rotate: boolean },
): { section: Section; misses: Fit["misses"] } {
  const shown = shownColumns(section);
  const n = section.rows.length;
  const rowColours = section.rows.map((r) => r.colour).reverse();
  const target: Target = shown
    .slice()
    .reverse()
    .map((line) => (opts.rotate ? line.slice().reverse() : line.slice()));
  const fit = fitPicture(rowColours, target);
  const rows: Row[] = rowColours.map((colour, r) => ({ colour, x: fit.x[r]! }));
  const period = section.colourSequence.length;
  const colourSequence = Array.from({ length: Math.min(period, n) }, (_, i) => rowColours[i]!);

  // Turning round swaps the two sides, so the odd spare stitch moves across too.
  const layout = layoutOf(section, width);
  const swapSide = opts.rotate && layout.spare % 2 === 1;
  return {
    section: {
      ...section,
      id: opts.id,
      name: opts.name,
      oddSpareSide: swapSide ? (section.oddSpareSide === "left" ? "right" : "left") : section.oddSpareSide,
      colourSequence,
      rows,
    },
    misses: fit.misses,
  };
}

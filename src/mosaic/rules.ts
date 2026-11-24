import { layoutOf, motifColumn } from "./layout";
import type { Section } from "./types";

/**
 * Result of trying to add or remove an X.
 * - `ok`: changed (with `section` holding the new section).
 * - `unchanged`: it was already like that.
 * - `blocked`: not allowed; `reason` says why, `conflictRow` is the row in the way.
 */
export type XChange =
  | { kind: "ok"; section: Section; noVisibleEffect: boolean }
  | { kind: "unchanged" }
  | { kind: "blocked"; reason: BlockReason; conflictRow?: number };

export type BlockReason =
  /** The stitch is a plain spare stitch outside the repeats. */
  | "plain-spare"
  /** The row below already has an X in this stitch. */
  | "x-below"
  /** The row above already has an X in this stitch. */
  | "x-above";

export const BLOCK_MESSAGES: Record<BlockReason, string> = {
  "plain-spare":
    'This is a plain spare stitch outside the repeats. Set spare stitches to "Continue motif" to pattern it.',
  "x-below":
    "An X can't sit on top of another X: the stitch below is already a dropped treble, so there's no plain stitch for this one to cover.",
  "x-above": "An X can't sit directly under another X: the X above would have no plain stitch to cover.",
};

/**
 * Add or remove an X at a stitch of a section row. Pure: returns a new section.
 * `width` is the project's design width (stitches between the border stitches).
 */
export function setX(section: Section, width: number, row: number, stitch: number, value: boolean): XChange {
  const target = section.rows[row];
  if (!target) throw new RangeError(`Row ${row + 1} doesn't exist in ${section.name}`);
  const layout = layoutOf(section, width);
  const col = motifColumn(section, layout, stitch);
  if (col === null) return { kind: "blocked", reason: "plain-spare" };
  if (target.x[col] === value) return { kind: "unchanged" };

  if (value) {
    if (section.rows[row - 1]?.x[col]) return { kind: "blocked", reason: "x-below", conflictRow: row - 1 };
    if (section.rows[row + 1]?.x[col]) return { kind: "blocked", reason: "x-above", conflictRow: row + 1 };
  }

  const rows = section.rows.map((r, i) => {
    if (i !== row) return r;
    const x = r.x.slice();
    x[col] = value;
    return { ...r, x };
  });
  const below = section.rows[row - 1];
  const noVisibleEffect = value && below !== undefined && below.colour === target.colour;
  return { kind: "ok", section: { ...section, rows }, noVisibleEffect };
}

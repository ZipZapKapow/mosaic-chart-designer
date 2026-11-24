import type { Project, Section } from "./types";

/** Stitches between the two border stitches: the part of the row that can be designed. */
export function designWidth(project: Pick<Project, "stitchesPerRow">): number {
  return project.stitchesPerRow - 2;
}

/** Foundation chain length: one stitch per stitch in the row, plus one to turn. */
export function foundationChain(project: Pick<Project, "stitchesPerRow">): number {
  return project.stitchesPerRow + 1;
}

/** How a section's repeat sits across the design width. */
export interface Layout {
  /** Stitches between the border stitches. */
  width: number;
  /** Width of one repeat (equals `width` for a no-repeat section). */
  motifWidth: number;
  /** Whole repeats that fit. */
  repeats: number;
  /** Stitches left over after the whole repeats. */
  spare: number;
  /** First stitches (FS): spare stitches on the right, worked before the repeats. */
  first: number;
  /** Last stitches (LS): spare stitches on the left, worked after the repeats. */
  last: number;
}

export function layoutOf(section: Section, width: number): Layout {
  if (section.repeatWidth === null) {
    return { width, motifWidth: width, repeats: 1, spare: 0, first: 0, last: 0 };
  }
  const motifWidth = Math.max(1, Math.min(section.repeatWidth, width));
  const repeats = Math.floor(width / motifWidth);
  const spare = width - repeats * motifWidth;
  const half = spare / 2;
  const first = section.oddSpareSide === "right" ? Math.ceil(half) : Math.floor(half);
  return { width, motifWidth, repeats, spare, first, last: spare - first };
}

/** True when the stitch falls inside the whole repeats (the red box on the chart). */
export function inRepeat(layout: Layout, stitch: number): boolean {
  return stitch >= layout.first && stitch < layout.first + layout.repeats * layout.motifWidth;
}

/**
 * Which column of the stored row data a stitch reads from, or null for a plain spare stitch.
 * Spare stitches that "continue" the motif read the column they'd have if the repeat carried on.
 */
export function motifColumn(section: Section, layout: Layout, stitch: number): number | null {
  if (stitch < 0 || stitch >= layout.width) return null;
  if (!inRepeat(layout, stitch) && section.spareFill === "plain") return null;
  const m = layout.motifWidth;
  return (((stitch - layout.first) % m) + m) % m;
}

/** Whether a stitch in a section row is an X. */
export function hasX(section: Section, layout: Layout, row: number, stitch: number): boolean {
  const col = motifColumn(section, layout, stitch);
  return col !== null && section.rows[row]?.x[col] === true;
}

/** True when the odd spare stitch leaves the section one stitch off-centre. */
export function isOffCentre(layout: Layout): boolean {
  return layout.spare % 2 === 1 && layout.spare > 1;
}

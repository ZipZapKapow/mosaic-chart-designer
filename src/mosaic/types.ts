/**
 * Data model for an overlay mosaic crochet project.
 *
 * Conventions used throughout:
 * - Rows are numbered from the bottom. Index 0 is the first row worked.
 * - Stitches are numbered from the RIGHT, because every row is worked right to left.
 *   Stitch index 0 is the first stitch after the right-hand border stitch.
 * - Border stitches (BS) are not stored: every row has one at each end,
 *   always a plain double crochet in the row's colour.
 */

/** Index into Project.palette. */
export type ColourIndex = number;

export interface Yarn {
  name: string;
  /** CSS hex colour, e.g. "#5E7F4C". */
  hex: string;
}

export interface Row {
  colour: ColourIndex;
  /**
   * Where the X's (front-loop trebles two rows down) are.
   * For a repeating section this has one entry per stitch of the repeat;
   * for a no-repeat section, one entry per stitch of the design width.
   */
  x: boolean[];
}

export type SpareFill = "continue" | "plain";
export type Side = "left" | "right";

export interface Section {
  id: string;
  name: string;
  /** Repeat width in stitches, or null for a no-repeat (whole width) section. */
  repeatWidth: number | null;
  /** What spare stitches outside the whole repeats show. */
  spareFill: SpareFill;
  /** Which side gets the extra stitch when the spare stitches are an odd number. */
  oddSpareSide: Side;
  /** Row colours repeat this sequence from row 1 upwards, e.g. [A, B]. */
  colourSequence: ColourIndex[];
  rows: Row[];
}

export interface Project {
  version: 1;
  name: string;
  /** Stitches in every row, including the two border stitches. */
  stitchesPerRow: number;
  palette: Yarn[];
  /** Colours of the foundation rows, bottom first. These rows never have X's. */
  foundation: ColourIndex[];
  sections: Section[];
  /** Section ids in the order they are worked, first at index 0. Sections may repeat. */
  arrangement: string[];
}

import { layoutOf, motifColumn } from "./layout";
import type { ColourIndex, Row, Section } from "./types";

/** Colour of row `index` under a colour sequence. */
export function sequenceColour(sequence: ColourIndex[], index: number): ColourIndex {
  if (sequence.length === 0) throw new Error("A colour sequence needs at least one colour.");
  return sequence[index % sequence.length]!;
}

/** Recolour every row to follow a new sequence. X's are kept. */
export function applySequence(section: Section, sequence: ColourIndex[]): Section {
  return {
    ...section,
    colourSequence: sequence.slice(),
    rows: section.rows.map((r, i) => ({ ...r, colour: sequenceColour(sequence, i) })),
  };
}

/** True when some rows have been recoloured by hand away from the sequence. */
export function hasRowOverrides(section: Section): boolean {
  return section.rows.some((r, i) => r.colour !== sequenceColour(section.colourSequence, i));
}

function blankRow(colour: ColourIndex, columns: number): Row {
  return { colour, x: Array<boolean>(columns).fill(false) };
}

/** Stored columns per row: the repeat width, or the full design width for no-repeat. */
export function columnsOf(section: Section, width: number): number {
  return layoutOf(section, width).motifWidth;
}

/** Add a plain row on top, coloured by the sequence. */
export function addRowOnTop(section: Section, width: number): Section {
  const colour = sequenceColour(section.colourSequence, section.rows.length);
  return { ...section, rows: [...section.rows, blankRow(colour, columnsOf(section, width))] };
}

/** Remove the top row. Sections keep at least two rows. */
export function removeTopRow(section: Section): Section {
  if (section.rows.length <= 2) return section;
  return { ...section, rows: section.rows.slice(0, -1) };
}

/**
 * Add a plain row at the bottom, moving every row up one. Existing rows keep their
 * colours: the sequence is turned round one place, so the new row 1 is the colour
 * that comes before the old row 1.
 */
export function addRowAtBottom(section: Section, width: number): Section {
  if (section.rows.length >= MAX_ROWS) return section;
  const seq = section.colourSequence;
  const colourSequence = [seq[seq.length - 1]!, ...seq.slice(0, -1)];
  return { ...section, colourSequence, rows: [blankRow(colourSequence[0]!, columnsOf(section, width)), ...section.rows] };
}

/** Remove the bottom row, moving every row down one. Sections keep at least two rows. */
export function removeBottomRow(section: Section): Section {
  if (section.rows.length <= MIN_ROWS) return section;
  const seq = section.colourSequence;
  return { ...section, colourSequence: [...seq.slice(1), seq[0]!], rows: section.rows.slice(1) };
}

export function newSection(id: string, name: string, opts: {
  rows: number;
  width: number;
  repeatWidth: number | null;
  sequence: ColourIndex[];
}): Section {
  const section: Section = {
    id,
    name,
    repeatWidth: opts.repeatWidth,
    spareFill: "continue",
    oddSpareSide: "left",
    colourSequence: opts.sequence.slice(),
    rows: [],
  };
  const columns = columnsOf(section, opts.width);
  section.rows = Array.from({ length: opts.rows }, (_, i) => blankRow(sequenceColour(opts.sequence, i), columns));
  return section;
}

/**
 * Switch a repeating section to no repeat. The tiled pattern is copied across the
 * whole width, so the section looks exactly the same afterwards.
 */
export function toNoRepeat(section: Section, width: number): Section {
  if (section.repeatWidth === null) return section;
  const layout = layoutOf(section, width);
  const rows = section.rows.map((r) => ({
    ...r,
    x: Array.from({ length: width }, (_, stitch) => {
      const col = motifColumn(section, layout, stitch);
      return col !== null && r.x[col] === true;
    }),
  }));
  return { ...section, repeatWidth: null, rows };
}

/**
 * Give a section a repeat of `repeatWidth` stitches. Existing X's in the first
 * `repeatWidth` columns are kept; anything wider is dropped.
 */
export function withRepeatWidth(section: Section, repeatWidth: number, width: number): Section {
  const w = Math.max(1, Math.min(repeatWidth, width));
  const rows = section.rows.map((r) => ({
    ...r,
    x: Array.from({ length: w }, (_, i) => r.x[i] === true),
  }));
  return { ...section, repeatWidth: w, rows };
}

/** Keep the stored row data the right size for no-repeat sections when the project width changes. */
export function fitToWidth(section: Section, width: number): Section {
  if (section.repeatWidth !== null) return section;
  if (section.rows.every((r) => r.x.length === width)) return section;
  return {
    ...section,
    rows: section.rows.map((r) => ({ ...r, x: Array.from({ length: width }, (_, i) => r.x[i] === true) })),
  };
}

/**
 * Mirror the right half of the stored pattern onto the left (stitch 1 → last stitch).
 * Mirroring left to right can never create stacked X's, because each column keeps its own X's.
 */
export function mirrorRightToLeft(section: Section): Section {
  const rows = section.rows.map((r) => {
    const x = r.x.slice();
    const n = x.length;
    for (let j = 0; j < Math.floor(n / 2); j++) x[n - 1 - j] = x[j]!;
    return { ...r, x };
  });
  return { ...section, rows };
}

/** Change one row's colour by hand (it then differs from the sequence). */
export function setRowColour(section: Section, row: number, colour: ColourIndex): Section {
  if (!section.rows[row] || section.rows[row]!.colour === colour) return section;
  return { ...section, rows: section.rows.map((r, i) => (i === row ? { ...r, colour } : r)) };
}

/** Remove every X in the section. */
export function clearAllX(section: Section): Section {
  if (section.rows.every((r) => !r.x.includes(true))) return section;
  return { ...section, rows: section.rows.map((r) => ({ ...r, x: r.x.map(() => false) })) };
}

export const MIN_ROWS = 2;
export const MAX_ROWS = 2000;

/** Set the number of rows: new plain rows are added on top, or rows are removed from the top. */
export function setRowCount(section: Section, count: number, width: number): Section {
  const n = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.round(count)));
  if (n === section.rows.length) return section;
  if (n < section.rows.length) return { ...section, rows: section.rows.slice(0, n) };
  const columns = columnsOf(section, width);
  const extra = Array.from({ length: n - section.rows.length }, (_, k) =>
    blankRow(sequenceColour(section.colourSequence, section.rows.length + k), columns),
  );
  return { ...section, rows: [...section.rows, ...extra] };
}

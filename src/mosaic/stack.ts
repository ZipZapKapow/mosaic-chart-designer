import { designWidth, hasX, layoutOf } from "./layout";
import type { ColourIndex, Project, Section } from "./types";

/**
 * One worked row of the whole design, from the foundation rows up through every
 * section in the arrangement. This is what the fabric looks like row by row.
 */
export interface StackRow {
  colour: ColourIndex;
  /** Whether the stitch (0 = first after the right border stitch) is an X. */
  xAt: (stitch: number) => boolean;
  /** Where this row comes from. */
  source:
    | { kind: "foundation"; index: number }
    | { kind: "section"; step: number; sectionId: string; row: number };
}

export function findSection(project: Project, id: string): Section {
  const s = project.sections.find((sec) => sec.id === id);
  if (!s) throw new Error(`The arrangement refers to a section that doesn't exist (${id}).`);
  return s;
}

/** Rows of one section on their own (optionally with the foundation rows underneath). */
export function sectionStack(project: Project, section: Section, withFoundation = false, step = 0): StackRow[] {
  const width = designWidth(project);
  const layout = layoutOf(section, width);
  const rows: StackRow[] = withFoundation ? foundationRows(project) : [];
  section.rows.forEach((r, i) =>
    rows.push({
      colour: r.colour,
      xAt: (stitch) => hasX(section, layout, i, stitch),
      source: { kind: "section", step, sectionId: section.id, row: i },
    }),
  );
  return rows;
}

function foundationRows(project: Project): StackRow[] {
  return project.foundation.map((colour, index) => ({
    colour,
    xAt: () => false,
    source: { kind: "foundation", index },
  }));
}

/** Every row of the finished piece, bottom first. */
export function wholeStack(project: Project): StackRow[] {
  const rows = foundationRows(project);
  project.arrangement.forEach((id, step) => {
    rows.push(...sectionStack(project, findSection(project, id), false, step));
  });
  return rows;
}

/**
 * The colour a stitch shows. An X in the row above covers this stitch with the
 * colour of the row above; otherwise it shows its own row's colour.
 */
export function shownColour(stack: StackRow[], row: number, stitch: number): ColourIndex {
  const here = stack[row];
  if (!here) throw new RangeError(`Row index ${row} is outside the design`);
  const above = stack[row + 1];
  return above && above.xAt(stitch) ? above.colour : here.colour;
}

/**
 * The finished look as a grid of colours: grid[row][column], row 0 at the bottom,
 * column 0 at the LEFT edge (as you'd draw it), including both border stitches.
 */
export function colourGrid(project: Project, stack: StackRow[] = wholeStack(project)): ColourIndex[][] {
  const width = designWidth(project);
  return stack.map((row, r) => {
    const line: ColourIndex[] = [row.colour];
    for (let stitch = width - 1; stitch >= 0; stitch--) line.push(shownColour(stack, r, stitch));
    line.push(row.colour);
    return line;
  });
}

export type Problem =
  | { kind: "stacked-x"; row: number; stitch: number }
  | { kind: "x-on-foundation"; row: number; stitch: number };

/**
 * Rule breaks anywhere in the arranged design. The editor stops these within a
 * section; this also catches them where one section meets the next.
 */
export function findProblems(project: Project, stack: StackRow[] = wholeStack(project)): Problem[] {
  const width = designWidth(project);
  const problems: Problem[] = [];
  stack.forEach((row, r) => {
    for (let stitch = 0; stitch < width; stitch++) {
      if (!row.xAt(stitch)) continue;
      if (row.source.kind === "foundation") problems.push({ kind: "x-on-foundation", row: r, stitch });
      else if (r > 0 && stack[r - 1]?.xAt(stitch)) problems.push({ kind: "stacked-x", row: r, stitch });
    }
  });
  return problems;
}

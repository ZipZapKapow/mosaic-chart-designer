import {
  chartColumns,
  designWidth,
  layoutOf,
  sectionStack,
  type ChartCol,
  type Project,
  type Section,
  type StackRow,
} from "../mosaic";

/** A4 portrait, in points. */
export const PAGE = { width: 595.28, height: 841.89, margin: 34 };
/** Space for the title lines above a chart, and the footer below. */
export const CHART_HEADER = 64;
export const FOOTER = 26;
/** Width of the row number columns. */
export const ROW_NUMBER_WIDTH = 20;
/** Gap before the colour letter and the tick box. */
export const SIDE_GAP = 3;
export const MAX_CELL = 16;
/** Rows repeated at the bottom of each continued page, so you can find your place. */
export const OVERLAP = 2;

export interface Segment {
  /** Stack rows shown on the page: [start, end). */
  start: number;
  end: number;
  /** How many of the bottom rows repeat the top of the previous page. */
  repeated: number;
}

export interface ChartPlan {
  section: Section;
  /** Rows to draw, bottom first (the foundation rows too, for the first section worked). */
  stack: StackRow[];
  /** Rows of the stack that are foundation rows. */
  foundationRows: number;
  cols: ChartCol[];
  cell: number;
  /** Heights of the label row and each stitch-number row. */
  labelHeight: number;
  numberHeight: number;
  segments: Segment[];
  /** Steps of the arrangement that work this section (0-based). */
  steps: number[];
}

/** Sections in the order they're first worked. Sections not in the arrangement are left out. */
export function sectionsInOrder(project: Project): Section[] {
  const seen = new Set<string>();
  const out: Section[] = [];
  for (const id of project.arrangement) {
    if (seen.has(id)) continue;
    seen.add(id);
    const s = project.sections.find((x) => x.id === id);
    if (s) out.push(s);
  }
  return out;
}

/** Split `total` rows into pages of at most `perPage`, each continued page repeating `overlap` rows. */
export function splitRows(total: number, perPage: number, overlap = OVERLAP): Segment[] {
  const per = Math.max(1, perPage);
  const lap = per > overlap * 4 ? overlap : 0;
  const out: Segment[] = [];
  let start = 0;
  for (;;) {
    const end = Math.min(total, start + per);
    out.push({ start, end, repeated: out.length ? lap : 0 });
    if (end >= total) return out;
    start = end - lap;
  }
}

export function planChart(project: Project, section: Section): ChartPlan {
  const width = designWidth(project);
  const layout = layoutOf(section, width);
  const mode = section.repeatWidth === null ? "full" : "repeat";
  const cols = chartColumns(layout, mode);
  const withFoundation = project.arrangement[0] === section.id;
  const stack = sectionStack(project, section, withFoundation);

  const availW = PAGE.width - 2 * PAGE.margin - 2 * ROW_NUMBER_WIDTH - 2 * SIDE_GAP;
  const cell = Math.min(MAX_CELL, availW / (cols.length + 2));
  const labelHeight = Math.max(cell, 12);
  const numberHeight = Math.max(cell, 9);
  const availH = PAGE.height - 2 * PAGE.margin - CHART_HEADER - FOOTER - labelHeight - 2 * numberHeight;
  const perPage = Math.floor(availH / cell);

  const steps = project.arrangement.flatMap((id, i) => (id === section.id ? [i] : []));
  return {
    section,
    stack,
    foundationRows: withFoundation ? project.foundation.length : 0,
    cols,
    cell,
    labelHeight,
    numberHeight,
    segments: splitRows(stack.length, perPage),
    steps,
  };
}

import { designWidth } from "./layout";
import { fitToWidth, newSection } from "./sections";
import type { Problem, StackRow } from "./stack";
import type { ColourIndex, Project, Section, Yarn } from "./types";

export const MIN_STITCHES = 8;
export const MAX_STITCHES = 400;
export const MAX_COLOURS = 6;
export const LETTERS = "ABCDEFGH";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

export interface NewProjectOptions {
  name: string;
  palette: Yarn[];
  /** Including the two border stitches. */
  stitchesPerRow: number;
  /** Repeat width for the first section, or null for no repeat. */
  repeatWidth: number | null;
  rows: number;
  /** Colour of row 1 of the first section. */
  firstColour: ColourIndex;
  foundationRows: number;
}

/** The other colour of a two-colour pair. */
function partner(colour: ColourIndex, paletteSize: number): ColourIndex {
  return paletteSize < 2 ? 0 : colour === 0 ? 1 : 0;
}

/**
 * Foundation colours, bottom first, alternating so that the last foundation row
 * is the opposite colour to row 1.
 */
export function foundationColours(count: number, firstColour: ColourIndex, paletteSize: number): ColourIndex[] {
  const other = partner(firstColour, paletteSize);
  return Array.from({ length: count }, (_, k) => ((count - 1 - k) % 2 === 0 ? other : firstColour));
}

export function createProject(opts: NewProjectOptions): Project {
  const stitchesPerRow = clamp(opts.stitchesPerRow, MIN_STITCHES, MAX_STITCHES);
  const width = stitchesPerRow - 2;
  const palette = opts.palette.length ? opts.palette.map((y) => ({ ...y })) : [{ name: "Colour A", hex: "#EFE8D8" }];
  const first = clamp(opts.firstColour, 0, palette.length - 1);
  const repeatWidth = opts.repeatWidth === null ? null : clamp(opts.repeatWidth, 1, width);
  const section = newSection("s1", "Pattern 1", {
    rows: clamp(opts.rows, 2, 2000),
    width,
    repeatWidth,
    sequence: [first, partner(first, palette.length)],
  });
  return {
    version: 1,
    name: opts.name.trim() || "Untitled project",
    stitchesPerRow,
    palette,
    foundation: foundationColours(clamp(opts.foundationRows, 1, 3), first, palette.length),
    sections: [section],
    arrangement: [section.id],
  };
}

/** Change the stitches per row (including border stitches). */
export function setStitchesPerRow(project: Project, stitchesPerRow: number): Project {
  const n = clamp(stitchesPerRow, MIN_STITCHES, MAX_STITCHES);
  if (n === project.stitchesPerRow) return project;
  const width = n - 2;
  return { ...project, stitchesPerRow: n, sections: project.sections.map((s) => fitToWidth(s, width)) };
}

export function replaceSection(project: Project, section: Section): Project {
  return { ...project, sections: project.sections.map((s) => (s.id === section.id ? section : s)) };
}

function nextSectionId(project: Project): string {
  const used = new Set(project.sections.map((s) => s.id));
  let n = project.sections.length + 1;
  while (used.has(`s${n}`)) n++;
  return `s${n}`;
}

function nextSectionName(project: Project): string {
  const used = new Set(project.sections.map((s) => s.name));
  let n = project.sections.length + 1;
  while (used.has(`Pattern ${n}`)) n++;
  return `Pattern ${n}`;
}

/** Add a new plain section (not yet placed in the arrangement). */
export function addSection(project: Project): { project: Project; id: string } {
  const width = designWidth(project);
  const id = nextSectionId(project);
  const sequence = project.palette.length > 1 ? [0, 1] : [0];
  const section = newSection(id, nextSectionName(project), {
    rows: 8,
    width,
    repeatWidth: Math.min(8, width),
    sequence,
  });
  return { project: { ...project, sections: [...project.sections, section] }, id };
}

/** Delete a section and its steps in the arrangement. A project keeps at least one section. */
export function deleteSection(project: Project, id: string): Project {
  if (project.sections.length <= 1) return project;
  const sections = project.sections.filter((s) => s.id !== id);
  if (sections.length === project.sections.length) return project;
  let arrangement = project.arrangement.filter((a) => a !== id);
  if (!arrangement.length) arrangement = [sections[0]!.id];
  return { ...project, sections, arrangement };
}

/** Move a step of the arrangement from one position to another. */
export function moveStep(project: Project, from: number, to: number): Project {
  const n = project.arrangement.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return project;
  const arrangement = project.arrangement.slice();
  const [id] = arrangement.splice(from, 1);
  arrangement.splice(to, 0, id!);
  return { ...project, arrangement };
}

/** Add a section on top of the arrangement (worked last). */
export function addStep(project: Project, id: string): Project {
  if (!project.sections.some((s) => s.id === id)) return project;
  return { ...project, arrangement: [...project.arrangement, id] };
}

/** Remove one step. The arrangement keeps at least one step. */
export function removeStep(project: Project, index: number): Project {
  if (project.arrangement.length <= 1 || index < 0 || index >= project.arrangement.length) return project;
  return { ...project, arrangement: project.arrangement.filter((_, i) => i !== index) };
}

const SPARE_YARNS: Yarn[] = [
  { name: "Damson", hex: "#6D3B5F" },
  { name: "Mustard", hex: "#D3A12E" },
  { name: "Sky", hex: "#7FA9C9" },
  { name: "Charcoal", hex: "#3B3F45" },
  { name: "Rust", hex: "#A9502F" },
  { name: "Moss", hex: "#5E7F4C" },
];

/** Add a colour to the palette, picking a spare yarn not already used by name. */
export function addColour(project: Project): Project {
  if (project.palette.length >= MAX_COLOURS) return project;
  const used = new Set(project.palette.map((y) => y.name));
  const yarn = SPARE_YARNS.find((y) => !used.has(y.name)) ?? { name: "New colour", hex: "#888888" };
  return { ...project, palette: [...project.palette, { ...yarn }] };
}

export function updateColour(project: Project, index: number, yarn: Partial<Yarn>): Project {
  if (!project.palette[index]) return project;
  return { ...project, palette: project.palette.map((y, i) => (i === index ? { ...y, ...yarn } : y)) };
}

export function setFoundationColour(project: Project, index: number, colour: ColourIndex): Project {
  if (index < 0 || index >= project.foundation.length || project.foundation[index] === colour) return project;
  return { ...project, foundation: project.foundation.map((c, i) => (i === index ? colour : c)) };
}

function describeRow(project: Project, row: StackRow): string {
  if (row.source.kind === "foundation") return `foundation row ${row.source.index + 1}`;
  const { sectionId, step } = row.source;
  const name = project.sections.find((s) => s.id === sectionId)?.name ?? "a section";
  return `${name} (step ${step + 1}) row ${row.source.row + 1}`;
}

/** A plain-English description of a rule break found by findProblems. */
export function describeProblem(project: Project, stack: StackRow[], problem: Problem): string {
  const row = stack[problem.row];
  if (!row) return "There's a problem in the design.";
  const stitch = `stitch ${problem.stitch + 1}`;
  if (problem.kind === "x-on-foundation") return `There's an X on ${describeRow(project, row)}, ${stitch}.`;
  const below = stack[problem.row - 1];
  const where = below ? describeRow(project, below) : "the row below";
  const text = `${describeRow(project, row)} has an X directly above an X in ${where}, ${stitch}.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

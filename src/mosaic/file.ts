import { designWidth } from "./layout";
import { MAX_COLOURS, MAX_STITCHES, MIN_STITCHES } from "./project";
import type { Project, Row, Section, Yarn } from "./types";

/**
 * Project files: JSON, with each row's X's written as a string ("." plain, "x" X)
 * to keep files small. Saved with the extension .mosaic.json.
 */
export const FILE_FORMAT = "mosaic-chart-designer";
export const FILE_EXTENSION = ".mosaic.json";

export function serialiseProject(project: Project): string {
  const data = {
    format: FILE_FORMAT,
    version: project.version,
    project: {
      ...project,
      sections: project.sections.map((s) => ({
        ...s,
        rows: s.rows.map((r) => ({ colour: r.colour, x: r.x.map((v) => (v ? "x" : ".")).join("") })),
      })),
    },
  };
  return JSON.stringify(data);
}

/** A safe file name for downloading a project. */
export function fileNameFor(project: Project): string {
  const base = project.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-") || "mosaic-project";
  return base.slice(0, 60) + FILE_EXTENSION;
}

class FileError extends Error {}

function fail(message: string): never {
  throw new FileError(message);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Read a project file. Throws an Error with a message suitable to show the user
 * when the file isn't a valid project.
 */
export function parseProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    fail("This file isn't a Mosaic Chart Designer project (it isn't readable JSON).");
  }
  if (!isObj(data) || data.format !== FILE_FORMAT) fail("This file isn't a Mosaic Chart Designer project.");
  if (data.version !== 1) fail("This project was saved by a newer version of the app.");
  const p = data.project;
  if (!isObj(p)) fail("The project data is missing.");

  const name = typeof p.name === "string" && p.name.trim() ? p.name : "Untitled project";
  const spr = p.stitchesPerRow;
  if (!isInt(spr) || spr < MIN_STITCHES || spr > MAX_STITCHES) fail("The stitches per row aren't valid.");
  const width = designWidth({ stitchesPerRow: spr });

  if (!Array.isArray(p.palette) || p.palette.length < 1 || p.palette.length > MAX_COLOURS) fail("The colours aren't valid.");
  const palette: Yarn[] = p.palette.map((y, i) => {
    if (!isObj(y) || typeof y.hex !== "string" || !HEX.test(y.hex)) fail(`Colour ${i + 1} isn't valid.`);
    return { name: typeof y.name === "string" ? y.name : `Colour ${i + 1}`, hex: y.hex };
  });
  const isColour = (c: unknown): c is number => isInt(c) && c >= 0 && c < palette.length;

  if (!Array.isArray(p.foundation) || p.foundation.length < 1 || !p.foundation.every(isColour)) {
    fail("The foundation rows aren't valid.");
  }

  if (!Array.isArray(p.sections) || p.sections.length < 1) fail("The project has no sections.");
  const ids = new Set<string>();
  const sections: Section[] = p.sections.map((s, i) => {
    const label = `Section ${i + 1}`;
    if (!isObj(s) || typeof s.id !== "string" || !s.id || ids.has(s.id)) fail(`${label} isn't valid.`);
    ids.add(s.id);
    const rw = s.repeatWidth;
    if (!(rw === null || (isInt(rw) && rw >= 1 && rw <= width))) fail(`${label} has an invalid repeat width.`);
    if (!Array.isArray(s.colourSequence) || s.colourSequence.length < 1 || !s.colourSequence.every(isColour)) {
      fail(`${label} has an invalid colour sequence.`);
    }
    if (!Array.isArray(s.rows) || s.rows.length < 1) fail(`${label} has no rows.`);
    const columns = rw ?? width;
    const rows: Row[] = s.rows.map((r, k) => {
      const marks = isObj(r) ? r.x : undefined;
      if (!isObj(r) || !isColour(r.colour) || typeof marks !== "string" || !/^[.x]*$/.test(marks)) {
        fail(`${label}, row ${k + 1} isn't valid.`);
      }
      const x = Array.from({ length: columns }, (_, c) => marks[c] === "x");
      return { colour: r.colour, x };
    });
    return {
      id: s.id,
      name: typeof s.name === "string" && s.name.trim() ? s.name : `Pattern ${i + 1}`,
      repeatWidth: rw,
      spareFill: s.spareFill === "plain" ? "plain" : "continue",
      oddSpareSide: s.oddSpareSide === "right" ? "right" : "left",
      colourSequence: s.colourSequence.slice(),
      rows,
    };
  });

  if (!Array.isArray(p.arrangement) || p.arrangement.length < 1) fail("The arrangement is empty.");
  const arrangement = p.arrangement.map((a) => {
    if (typeof a !== "string" || !ids.has(a)) fail("The arrangement refers to a section that doesn't exist.");
    return a;
  });

  return { version: 1, name, stitchesPerRow: spr, palette, foundation: p.foundation.slice(), sections, arrangement };
}

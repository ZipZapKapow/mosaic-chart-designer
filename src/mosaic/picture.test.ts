import { describe, expect, it } from "vitest";
import {
  designWidth,
  exampleProject,
  fitPicture,
  flippedSection,
  layoutOf,
  newSection,
  replaceSection,
  sectionStack,
  setX,
  shownColour,
  shownColumns,
  type Section,
  type Target,
} from "./index";

const A = 0;
const B = 1;
const alternating = (n: number, first = A) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? first : 1 - first));

/** One column of target colours, bottom first, as a Target. */
const column = (cols: number[]): Target => cols.map((c) => [c]);

function stackedX(x: boolean[][]) {
  return x.some((row, r) => r > 0 && row.some((v, c) => v && x[r - 1]![c]));
}

describe("picture engine", () => {
  it("reproduces exactly what a valid section shows", () => {
    for (const s of exampleProject().sections) {
      const fit = fitPicture(s.rows.map((r) => r.colour), shownColumns(s));
      expect(fit.misses).toEqual([]);
      const rebuilt: Section = { ...s, rows: s.rows.map((r, i) => ({ ...r, x: fit.x[i]! })) };
      expect(shownColumns(rebuilt)).toEqual(shownColumns(s));
    }
  });

  it("makes a dark bar that starts and ends on dark rows exactly", () => {
    // rows: A B A B A B A B A; dark bar on rows 2–6 (index 1–5), starting and ending on B rows
    const fit = fitPicture(alternating(9), column([A, B, B, B, B, B, A, A, A]));
    expect(fit.misses).toEqual([]);
    expect(fit.x.map((r) => (r[0] ? "x" : "."))).toEqual([".", ".", ".", "x", ".", "x", ".", ".", "x"]);
  });

  it("can't start a shape on a row of the other colour, and reports the one stitch it misses", () => {
    // bar starts on an A row (index 2): impossible without stacking X's
    const fit = fitPicture(alternating(9), column([A, A, B, B, B, B, A, A, A]));
    expect(fit.misses).toHaveLength(1);
    expect(stackedX(fit.x)).toBe(false);
  });

  it("thins or thickens the shape at an impossible edge, as asked", () => {
    const rows = alternating(9);
    const target = column([A, A, B, B, B, B, A, A, A]);
    const shows = (fit: { x: boolean[][] }) => rows.map((colour, r) => (fit.x[r + 1]?.[0] ? rows[r + 1]! : colour));
    const thin = fitPicture(rows, target, { prefer: { colour: B, mode: "thin" } });
    const thick = fitPicture(rows, target, { prefer: { colour: B, mode: "thicken" } });
    expect(shows(thin)).toEqual([A, A, A, B, B, B, A, A, A]); // lost row 3
    expect(shows(thick)).toEqual([A, B, B, B, B, B, A, A, A]); // gained row 2
    expect(thin.misses).toEqual([{ row: 2, col: 0 }]);
    expect(thick.misses).toEqual([{ row: 1, col: 0 }]);
  });

  it("never puts an X on row 1, never stacks X's, and ignores 'don't mind' stitches", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rows = 40;
    const colours = Array.from({ length: rows }, (_, i) => [A, B, A, 2][i % 4]!);
    const target: Target = Array.from({ length: rows }, () =>
      Array.from({ length: 12 }, () => (rand() < 0.1 ? null : Math.floor(rand() * 3))),
    );
    const fit = fitPicture(colours, target);
    expect(stackedX(fit.x)).toBe(false);
    expect(fit.x[0]!.every((v) => !v)).toBe(true);
    for (const m of fit.misses) expect(target[m.row]![m.col]).not.toBeNull();
  });

  it("doesn't add pointless X's", () => {
    const fit = fitPicture(alternating(6), column([A, B, A, B, A, B]));
    expect(fit.x.flat().some(Boolean)).toBe(false);
  });
});

describe("duplicate flipped", () => {
  const width = 73;

  it("turns a symmetric motif upside down exactly, reversing the row colours", () => {
    const s = exampleProject().sections[0]!; // the diamond is symmetric left to right
    const { section, misses } = flippedSection(s, width, { id: "f", name: "Pattern 1 (flipped)", rotate: true });
    expect(section.id).toBe("f");
    expect(section.rows.map((r) => r.colour)).toEqual(s.rows.map((r) => r.colour).reverse());
    const original = shownColumns(s);
    const flipped = shownColumns(section);
    const n = s.rows.length;
    // Every stitch matches the original turned round, except where the original's
    // bottom row borrowed colour from row 2: that row is now the top, where nothing is above it.
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < 12; c++) {
        const expected = original[n - 1 - r]![11 - c]!;
        if (!misses.some((m) => m.row === r && m.col === c)) expect(flipped[r]![c]).toBe(expected);
      }
    }
    expect(misses.every((m) => m.row === n - 1)).toBe(true);
  });

  it("turning round twice gives back the same look, apart from the original bottom row's borrowed colour", () => {
    const s = exampleProject().sections[1]!;
    const first = flippedSection(s, width, { id: "a", name: "a", rotate: true });
    // The zigzag's row 1 borrows colour from X's in row 2. Turned round, that row is on
    // top with nothing above it, so those stitches can't be made: they're the misses.
    const borrowed = shownColumns(s)[0]!.filter((c) => c !== s.rows[0]!.colour).length;
    expect(first.misses).toHaveLength(borrowed);
    expect(first.misses.every((m) => m.row === s.rows.length - 1)).toBe(true);
    const twice = flippedSection(first.section, width, { id: s.id, name: s.name, rotate: true }).section;
    expect(shownColumns(twice).slice(1)).toEqual(shownColumns(s).slice(1));
    expect(twice.oddSpareSide).toBe(s.oddSpareSide);
  });

  it("rotating swaps the odd spare stitch to the other side, so the whole row mirrors", () => {
    const s = exampleProject().sections[1]!; // 10-stitch repeat in 73: 3 spare, odd
    const rotated = flippedSection(s, width, { id: "r", name: "r", rotate: true }).section;
    expect(rotated.oddSpareSide).toBe("right");
    const flipOnly = flippedSection(s, width, { id: "f", name: "f", rotate: false }).section;
    expect(flipOnly.oddSpareSide).toBe("left");

    // Whole-width check: stitch s of the rotated section matches stitch (width-1-s) of the original, rows reversed.
    const p = exampleProject();
    const project = { ...p, sections: [...p.sections, rotated] };
    const orig = sectionStack(project, s);
    const rot = sectionStack(project, rotated);
    const n = s.rows.length;
    let mismatches = 0;
    for (let r = 0; r < n - 1; r++) {
      for (let st = 0; st < width; st++) {
        if (shownColour(rot, r, st) !== shownColour(orig, n - 1 - r, width - 1 - st)) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
    expect(layoutOf(rotated, width).first).toBe(layoutOf(s, width).last);
  });

  it("flips a no-repeat picture section", () => {
    const w = 20;
    let s = newSection("p", "Picture", { rows: 10, width: w, repeatWidth: null, sequence: [A, B] });
    for (const [r, st] of [[3, 2], [5, 2], [3, 15], [7, 9]] as const) {
      const res = setX(s, w, r, st, true);
      if (res.kind === "ok") s = res.section;
    }
    const { section, misses } = flippedSection(s, w, { id: "q", name: "q", rotate: false });
    expect(misses).toEqual([]);
    const a = shownColumns(s);
    const b = shownColumns(section);
    expect(b).toEqual(a.slice().reverse());
    expect(section.rows.every((r) => r.x.length === w)).toBe(true);
    // the copy fits in a project without problems
    const p = replaceSection({ ...exampleProject(), stitchesPerRow: w + 2, sections: [s], arrangement: [s.id] }, s);
    expect(designWidth(p)).toBe(w);
  });
});

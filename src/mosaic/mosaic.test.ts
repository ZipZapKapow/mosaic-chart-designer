import { describe, expect, it } from "vitest";
import {
  addRowOnTop,
  applySequence,
  colourGrid,
  designWidth,
  exampleProject,
  findProblems,
  foundationChain,
  hasRowOverrides,
  hasX,
  isOffCentre,
  layoutOf,
  mirrorRightToLeft,
  motifColumn,
  newSection,
  removeTopRow,
  sectionStack,
  setX,
  shownColour,
  toNoRepeat,
  wholeStack,
  withRepeatWidth,
  type Project,
  type Section,
} from "./index";

const A = 0;
const B = 1;

/** A small project with one section, for focused tests. */
function tiny(section: Section, stitchesPerRow = 8): Project {
  return {
    version: 1,
    name: "Test",
    stitchesPerRow,
    palette: [
      { name: "A", hex: "#ffffff" },
      { name: "B", hex: "#000000" },
    ],
    foundation: [A, B],
    sections: [section],
    arrangement: [section.id],
  };
}

function blank(rows: number, repeatWidth: number | null, width: number, sequence = [A, B]): Section {
  return newSection("s", "Pattern 1", { rows, width, repeatWidth, sequence });
}

function mustSet(section: Section, width: number, row: number, stitch: number, value = true): Section {
  const res = setX(section, width, row, stitch, value);
  if (res.kind !== "ok") throw new Error(`expected ok, got ${JSON.stringify(res)}`);
  return res.section;
}

describe("widths", () => {
  it("design width excludes the two border stitches", () => {
    expect(designWidth({ stitchesPerRow: 75 })).toBe(73);
  });
  it("foundation chain is stitches per row plus one", () => {
    expect(foundationChain({ stitchesPerRow: 60 })).toBe(61);
  });
});

describe("repeat layout and centring", () => {
  const sec = (repeatWidth: number | null, oddSpareSide: "left" | "right" = "left"): Section => ({
    ...blank(2, repeatWidth, 73),
    oddSpareSide,
  });

  it("a single spare stitch goes on the left as a last stitch by default", () => {
    expect(layoutOf(sec(12), 73)).toEqual({ width: 73, motifWidth: 12, repeats: 6, spare: 1, first: 0, last: 1 });
  });
  it("the odd spare stitch can be moved to the right as a first stitch", () => {
    expect(layoutOf(sec(12, "right"), 73)).toMatchObject({ first: 1, last: 0 });
  });
  it("three spare stitches split 1 first + 2 last, or 2 + 1 when swapped", () => {
    expect(layoutOf(sec(10), 73)).toMatchObject({ repeats: 7, spare: 3, first: 1, last: 2 });
    expect(layoutOf(sec(10, "right"), 73)).toMatchObject({ first: 2, last: 1 });
  });
  it("flags an odd split of more than one spare stitch as off-centre", () => {
    expect(isOffCentre(layoutOf(sec(10), 73))).toBe(true);
    expect(isOffCentre(layoutOf(sec(12), 73))).toBe(false);
    expect(isOffCentre(layoutOf(sec(12), 74))).toBe(false); // 2 spare, splits evenly
  });
  it("a no-repeat section spans the whole width", () => {
    expect(layoutOf(sec(null), 58)).toEqual({ width: 58, motifWidth: 58, repeats: 1, spare: 0, first: 0, last: 0 });
  });
});

describe("which motif column a stitch reads", () => {
  // 10-stitch repeat in 73: first = 1 (right), 7 repeats, last = 2 (left)
  const s = blank(2, 10, 73);
  const layout = layoutOf(s, 73);

  it("the first repeat starts after the first stitches", () => {
    expect(motifColumn(s, layout, 1)).toBe(0);
    expect(motifColumn(s, layout, 10)).toBe(9);
    expect(motifColumn(s, layout, 11)).toBe(0);
  });
  it("continuing spare stitches carry the motif on past the repeats", () => {
    expect(motifColumn(s, layout, 0)).toBe(9); // first stitch continues the repeat to its right
    expect(motifColumn(s, layout, 71)).toBe(0); // last stitches carry on into a new repeat
    expect(motifColumn(s, layout, 72)).toBe(1);
  });
  it("plain spare stitches read no column", () => {
    const plain = { ...s, spareFill: "plain" as const };
    expect(motifColumn(plain, layout, 0)).toBeNull();
    expect(motifColumn(plain, layout, 72)).toBeNull();
    expect(motifColumn(plain, layout, 5)).toBe(4);
  });
  it("stitches outside the design read nothing", () => {
    expect(motifColumn(s, layout, -1)).toBeNull();
    expect(motifColumn(s, layout, 73)).toBeNull();
  });
});

describe("colour drop", () => {
  it("an X shows its own row's colour and covers the stitch below with it", () => {
    const width = 6;
    let s = blank(3, null, width); // rows: A, B, A
    s = mustSet(s, width, 1, 2); // X in row 2 (colour B) at stitch 3
    const p = tiny(s);
    const stack = sectionStack(p, s);
    expect(shownColour(stack, 1, 2)).toBe(B); // the X itself stays B
    expect(shownColour(stack, 0, 2)).toBe(B); // row 1 (A) is covered by B
    expect(shownColour(stack, 0, 3)).toBe(A); // neighbours untouched
    expect(shownColour(stack, 2, 2)).toBe(A);
  });

  it("an X in row 1 of the first section drops into the last foundation row", () => {
    const width = 6;
    const s = mustSet(blank(2, null, width), width, 0, 0); // row 1 is A, foundation is A, B
    const stack = wholeStack(tiny(s));
    expect(shownColour(stack, 1, 0)).toBe(A); // FR2 (B) shows A
  });

  it("the colour grid reads left to right with border stitches in the row colour", () => {
    const width = 4;
    const s = mustSet(blank(2, null, width), width, 1, 0); // X at stitch 1 (rightmost) in row 2 (B)
    const p = tiny(s, 6);
    const grid = colourGrid(p, sectionStack(p, s));
    expect(grid[0]).toEqual([A, A, A, A, B, A]); // BS, stitches 4..1, BS
    expect(grid[1]).toEqual([B, B, B, B, B, B]);
  });
});

describe("placing X's", () => {
  const width = 6;

  it("blocks an X directly above another X", () => {
    const s = mustSet(blank(4, null, width), width, 1, 3);
    const res = setX(s, width, 2, 3, true);
    expect(res).toEqual({ kind: "blocked", reason: "x-below", conflictRow: 1 });
  });

  it("blocks an X directly below another X", () => {
    const s = mustSet(blank(4, null, width), width, 2, 3);
    expect(setX(s, width, 1, 3, true)).toEqual({ kind: "blocked", reason: "x-above", conflictRow: 2 });
  });

  it("allows X's in neighbouring stitches and two rows apart", () => {
    let s = mustSet(blank(5, null, width), width, 1, 3);
    s = mustSet(s, width, 2, 4);
    s = mustSet(s, width, 3, 3);
    expect(s.rows.map((r) => r.x.filter(Boolean).length)).toEqual([0, 1, 1, 1, 0]);
  });

  it("removing an X is always allowed", () => {
    const s = mustSet(blank(3, null, width), width, 1, 3);
    const res = setX(s, width, 1, 3, false);
    expect(res.kind).toBe("ok");
  });

  it("reports when nothing changes", () => {
    expect(setX(blank(3, null, width), width, 1, 3, false)).toEqual({ kind: "unchanged" });
  });

  it("blocks plain spare stitches", () => {
    const s = { ...blank(3, 4, 6), spareFill: "plain" as const }; // 4-stitch repeat in 6: 1 first, 1 last
    expect(setX(s, 6, 1, 0, true)).toEqual({ kind: "blocked", reason: "plain-spare" });
  });

  it("notes when an X can't be seen because the row below is the same colour", () => {
    const s = blank(3, null, width, [A, A, B]);
    const res = setX(s, width, 1, 0, true);
    expect(res.kind === "ok" && res.noVisibleEffect).toBe(true);
  });

  it("does not change the original section", () => {
    const s = blank(3, null, width);
    mustSet(s, width, 1, 0);
    expect(s.rows[1]!.x[0]).toBe(false);
  });

  it("an X in a repeat shows in every copy of the repeat", () => {
    const s = mustSet(blank(3, 4, 12), 12, 1, 0); // 4-stitch repeat, 3 copies
    const layout = layoutOf(s, 12);
    expect([0, 4, 8].map((st) => hasX(s, layout, 1, st))).toEqual([true, true, true]);
    expect(hasX(s, layout, 1, 1)).toBe(false);
  });
});

describe("whole-design problems", () => {
  it("the example project has none", () => {
    expect(findProblems(exampleProject())).toEqual([]);
  });

  it("finds an X stacked across a join between sections", () => {
    const width = 6;
    const lower = mustSet({ ...blank(2, null, width), id: "low" }, width, 1, 2); // X in top row
    const upper = mustSet({ ...blank(2, null, width), id: "up" }, width, 0, 2); // X in first row
    const p: Project = { ...tiny(lower), sections: [lower, upper], arrangement: ["low", "up"] };
    expect(findProblems(p)).toEqual([{ kind: "stacked-x", row: 4, stitch: 2 }]);
  });

  it("whole stack has the foundation rows plus every arranged row", () => {
    const p = exampleProject();
    expect(wholeStack(p)).toHaveLength(2 + 16 * 3 + 8 * 2);
  });
});

describe("section editing", () => {
  it("applying a sequence recolours every row and keeps X's", () => {
    const width = 6;
    const s = mustSet(blank(4, null, width), width, 1, 0);
    const t = applySequence(s, [A, B, A, 2]);
    expect(t.rows.map((r) => r.colour)).toEqual([A, B, A, 2]);
    expect(t.rows[1]!.x[0]).toBe(true);
  });

  it("knows when rows have been recoloured by hand", () => {
    const s = blank(4, null, 6);
    expect(hasRowOverrides(s)).toBe(false);
    const t = { ...s, rows: s.rows.map((r, i) => (i === 2 ? { ...r, colour: B } : r)) };
    expect(hasRowOverrides(t)).toBe(true);
  });

  it("new rows on top follow the sequence", () => {
    const s = blank(3, null, 6, [A, B, 2]);
    expect(addRowOnTop(s, 6).rows.at(-1)!.colour).toBe(A);
    expect(addRowOnTop(addRowOnTop(s, 6), 6).rows.at(-1)!.colour).toBe(B);
  });

  it("keeps at least two rows", () => {
    expect(removeTopRow(blank(2, null, 6)).rows).toHaveLength(2);
    expect(removeTopRow(blank(3, null, 6)).rows).toHaveLength(2);
  });

  it("switching to no repeat keeps the look exactly the same", () => {
    const p = exampleProject();
    const width = designWidth(p);
    const before = p.sections[1]!; // 10-stitch repeat with spare stitches
    const after = toNoRepeat(before, width);
    expect(after.repeatWidth).toBeNull();
    expect(after.rows[0]!.x).toHaveLength(width);
    expect(colourGrid(p, sectionStack(p, after))).toEqual(colourGrid(p, sectionStack(p, before)));
  });

  it("changing the repeat width keeps the X's that still fit", () => {
    const s = mustSet(blank(3, 6, 12), 12, 1, 4);
    const t = withRepeatWidth(s, 5, 12);
    expect(t.rows[1]!.x).toEqual([false, false, false, false, true]);
  });

  it("mirroring copies the right half onto the left", () => {
    const s = mustSet(mustSet(blank(3, 6, 12), 12, 1, 0), 12, 1, 1);
    expect(mirrorRightToLeft(s).rows[1]!.x).toEqual([true, true, false, false, true, true]);
  });

  it("mirroring leaves the middle stitch of an odd width alone", () => {
    const s = mustSet(blank(3, 5, 10), 10, 1, 2);
    expect(mirrorRightToLeft(s).rows[1]!.x).toEqual([false, false, true, false, false]);
  });
});

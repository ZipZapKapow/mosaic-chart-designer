import { describe, expect, it } from "vitest";
import {
  addColour,
  addSection,
  addStep,
  clearAllX,
  createProject,
  deleteSection,
  describeProblem,
  designWidth,
  exampleProject,
  fileNameFor,
  findProblems,
  foundationColours,
  MAX_COLOURS,
  moveStep,
  parseProject,
  removeStep,
  replaceSection,
  serialiseProject,
  setFoundationColour,
  setRowColour,
  setRowCount,
  setStitchesPerRow,
  setX,
  toNoRepeat,
  wholeStack,
} from "./index";

const scarf = () =>
  createProject({
    name: "  Test scarf ",
    palette: [
      { name: "Cream", hex: "#EFE8D8" },
      { name: "Black", hex: "#111111" },
    ],
    stitchesPerRow: 60,
    repeatWidth: null,
    rows: 20,
    firstColour: 1,
    foundationRows: 2,
  });

describe("new projects", () => {
  it("builds a no-repeat project at the given total width", () => {
    const p = scarf();
    expect(p.name).toBe("Test scarf");
    expect(designWidth(p)).toBe(58);
    const s = p.sections[0]!;
    expect(s.repeatWidth).toBeNull();
    expect(s.rows).toHaveLength(20);
    expect(s.rows[0]!.x).toHaveLength(58);
    expect(s.rows.map((r) => r.colour).slice(0, 4)).toEqual([1, 0, 1, 0]);
    expect(p.arrangement).toEqual([s.id]);
  });

  it("alternates foundation rows so the last one is the opposite of row 1", () => {
    expect(foundationColours(2, 0, 2)).toEqual([0, 1]);
    expect(foundationColours(2, 1, 2)).toEqual([1, 0]);
    expect(foundationColours(3, 0, 2)).toEqual([1, 0, 1]);
    expect(foundationColours(1, 0, 2)).toEqual([1]);
    expect(scarf().foundation).toEqual([1, 0]);
  });

  it("clamps a repeat wider than the design", () => {
    const p = createProject({ ...{ name: "x", palette: [{ name: "A", hex: "#ffffff" }, { name: "B", hex: "#000000" }] }, stitchesPerRow: 12, repeatWidth: 40, rows: 4, firstColour: 0, foundationRows: 2 });
    expect(p.sections[0]!.repeatWidth).toBe(10);
  });
});

describe("project edits", () => {
  it("changing the width resizes no-repeat sections but keeps X's", () => {
    let p = scarf();
    const r = setX(p.sections[0]!, designWidth(p), 3, 5, true);
    if (r.kind !== "ok") throw new Error("expected ok");
    p = replaceSection(p, r.section);
    const wider = setStitchesPerRow(p, 70);
    expect(wider.sections[0]!.rows[0]!.x).toHaveLength(68);
    expect(wider.sections[0]!.rows[3]!.x[5]).toBe(true);
    expect(setStitchesPerRow(p, 2).stitchesPerRow).toBe(8);
  });

  it("adds sections with unique ids and names", () => {
    const a = addSection(exampleProject());
    const b = addSection(a.project);
    expect(a.id).not.toBe(b.id);
    const names = b.project.sections.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(b.project.arrangement).toEqual(exampleProject().arrangement);
  });

  it("deleting a section removes its steps, and the last section can't be deleted", () => {
    const p = deleteSection(exampleProject(), "zigzag");
    expect(p.sections.map((s) => s.id)).toEqual(["diamond"]);
    expect(p.arrangement).toEqual(["diamond", "diamond", "diamond"]);
    expect(deleteSection(p, "diamond")).toBe(p);
  });

  it("deleting the only section in the arrangement leaves another in its place", () => {
    const { project, id } = addSection(scarf());
    const p = deleteSection(project, "s1");
    expect(p.arrangement).toEqual([id]);
  });

  it("moves, adds and removes arrangement steps", () => {
    const p = exampleProject();
    expect(moveStep(p, 0, 1).arrangement).toEqual(["zigzag", "diamond", "diamond", "zigzag", "diamond"]);
    expect(moveStep(p, 4, 0).arrangement[0]).toBe("diamond");
    expect(moveStep(p, 0, 9)).toBe(p);
    expect(addStep(p, "zigzag").arrangement.at(-1)).toBe("zigzag");
    expect(addStep(p, "nope")).toBe(p);
    expect(removeStep(p, 1).arrangement).toEqual(["diamond", "diamond", "zigzag", "diamond"]);
    const single = { ...p, arrangement: ["diamond"] };
    expect(removeStep(single, 0)).toBe(single);
  });

  it("adds colours up to the limit, without repeating names", () => {
    let p = exampleProject();
    for (let i = 0; i < 10; i++) p = addColour(p);
    expect(p.palette).toHaveLength(MAX_COLOURS);
    expect(new Set(p.palette.map((y) => y.name)).size).toBe(MAX_COLOURS);
  });

  it("recolours foundation rows and single rows", () => {
    const p = setFoundationColour(exampleProject(), 1, 2);
    expect(p.foundation).toEqual([0, 2]);
    const s = setRowColour(p.sections[0]!, 3, 2);
    expect(s.rows[3]!.colour).toBe(2);
    expect(s.rows[2]!.colour).toBe(p.sections[0]!.rows[2]!.colour);
  });

  it("sets the row count from the top, following the colour sequence", () => {
    const s = exampleProject().sections[1]!; // 8 rows, sequence [0, 2]
    const more = setRowCount(s, 11, 73);
    expect(more.rows).toHaveLength(11);
    expect(more.rows.slice(8).map((r) => r.colour)).toEqual([0, 2, 0]);
    expect(more.rows[10]!.x).toHaveLength(10);
    expect(setRowCount(s, 3, 73).rows).toEqual(s.rows.slice(0, 3));
    expect(setRowCount(s, 0, 73).rows).toHaveLength(2);
  });

  it("clears every X", () => {
    const s = clearAllX(exampleProject().sections[0]!);
    expect(s.rows.every((r) => r.x.every((v) => !v))).toBe(true);
  });
});

describe("join problems in words", () => {
  it("names both sections, steps, rows and the stitch", () => {
    const base = exampleProject();
    // Stitch 4: diamond column 3 (row 15 is plain there), zigzag column 2 (row 2 is plain there).
    // Put an X on the diamond's top row and on row 1 of the zigzag, one above the other.
    const diamond = base.sections[0]!;
    const top = diamond.rows.length - 1;
    const withTop = { ...diamond, rows: diamond.rows.map((r, i) => (i === top ? { ...r, x: r.x.map((_, k) => k === 3) } : r)) };
    const zig = base.sections[1]!;
    const withBottom = { ...zig, rows: zig.rows.map((r, i) => (i === 0 ? { ...r, x: r.x.map((_, k) => k === 2) } : r)) };
    const p = replaceSection(replaceSection(base, withTop), withBottom);
    const stack = wholeStack(p);
    const problems = findProblems(p, stack);
    expect(problems.length).toBeGreaterThan(0);
    const text = describeProblem(p, stack, problems[0]!);
    expect(text).toMatch(/^Pattern 2 \(step 2\) row 1 has an X directly above an X in Pattern 1 \(step 1\) row 16, stitch 4\.$/);
  });
});

describe("project files", () => {
  it("round-trips a project exactly", () => {
    const p = exampleProject();
    expect(parseProject(serialiseProject(p))).toEqual(p);
    const q = { ...scarf(), sections: [toNoRepeat(exampleProject().sections[0]!, 58)] };
    q.arrangement = [q.sections[0]!.id];
    expect(parseProject(serialiseProject(q))).toEqual(q);
  });

  it("stores X's compactly", () => {
    const text = serialiseProject(exampleProject());
    expect(text).toContain('"x":"xxx..xx..xxx"');
    expect(text).not.toContain("false");
  });

  it("rejects files that aren't projects, with a readable message", () => {
    expect(() => parseProject("not json")).toThrow(/isn't a Mosaic Chart Designer project/);
    expect(() => parseProject(JSON.stringify({ hello: 1 }))).toThrow(/isn't a Mosaic Chart Designer project/);
    expect(() => parseProject(JSON.stringify({ format: "mosaic-chart-designer", version: 2, project: {} }))).toThrow(/newer version/);
  });

  it("rejects broken data inside a project file", () => {
    const good = JSON.parse(serialiseProject(exampleProject()));
    const broken = (fn: (d: any) => void) => {
      const d = structuredClone(good);
      fn(d);
      return () => parseProject(JSON.stringify(d));
    };
    expect(broken((d) => (d.project.palette[0].hex = "red"))).toThrow(/Colour 1/);
    expect(broken((d) => (d.project.arrangement = ["ghost"]))).toThrow(/doesn't exist/);
    expect(broken((d) => (d.project.sections[0].rows[2].colour = 9))).toThrow(/row 3/);
    expect(broken((d) => (d.project.sections[1].id = "diamond"))).toThrow(/Section 2/);
    expect(broken((d) => (d.project.stitchesPerRow = 3))).toThrow(/stitches per row/);
  });

  it("makes safe file names", () => {
    expect(fileNameFor({ ...exampleProject(), name: "Gran's scarf / v2" })).toBe("Grans-scarf-v2.mosaic.json");
    expect(fileNameFor({ ...exampleProject(), name: "///" })).toBe("mosaic-project.mosaic.json");
  });
});

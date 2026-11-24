import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { exampleProject, newSection, type Project } from "../mosaic";
import { buildPdf } from "./pdf";
import { planChart, sectionsInOrder, splitRows } from "./plan";

describe("splitting tall charts across pages", () => {
  it("covers every row, repeating two rows at the bottom of each continued page", () => {
    const segs = splitRows(100, 40);
    expect(segs).toEqual([
      { start: 0, end: 40, repeated: 0 },
      { start: 38, end: 78, repeated: 2 },
      { start: 76, end: 100, repeated: 2 },
    ]);
    expect(splitRows(10, 40)).toEqual([{ start: 0, end: 10, repeated: 0 }]);
  });
});

describe("the pattern PDF", () => {
  it("has a cover, a checklist and a chart page per section, with tick boxes", async () => {
    const p = exampleProject();
    const plans = sectionsInOrder(p).map((s) => planChart(p, s));
    const chartPages = plans.reduce((n, pl) => n + pl.segments.length, 0);
    const doc = await PDFDocument.load(await buildPdf(p));
    expect(doc.getPageCount()).toBe(2 + chartPages);
    const names = doc.getForm().getFields().map((f) => f.getName());
    const rowTicks = plans.reduce((n, pl) => n + pl.stack.length, 0);
    expect(names.length).toBe(rowTicks + p.arrangement.length);
    expect(new Set(names).size).toBe(names.length);
    expect(doc.getTitle()).toBe(p.name);
  });

  it("splits a tall section, sharing tick boxes on repeated rows, and copes with any yarn name", async () => {
    const base = exampleProject();
    const tall = newSection("tall", "Tall", { rows: 300, width: base.stitchesPerRow - 2, repeatWidth: null, sequence: [0, 1] });
    const p: Project = {
      ...base,
      palette: base.palette.map((y, i) => (i === 0 ? { ...y, name: "Ochre ✿ 黄色" } : y)),
      sections: [...base.sections, tall],
      arrangement: [...base.arrangement, "tall"],
    };
    const plan = planChart(p, tall);
    expect(plan.segments.length).toBeGreaterThan(1);
    const doc = await PDFDocument.load(await buildPdf(p));
    const field = doc.getForm().getCheckBox(`row_tall_${plan.segments[1]!.start}`);
    expect(field.acroField.getWidgets().length).toBe(2);
  });
});

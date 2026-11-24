import { describe, expect, it } from "vitest";
import {
  addPictureSection,
  autoThreshold,
  brightness,
  exampleProject,
  fillLetterBodies,
  pictureSection,
  proportionalRows,
  shownColumns,
  toCells,
  toMask,
  turnMask,
  type Mask,
} from "./index";

/** A mask from strings, "#" = picture, top row first. */
function mask(lines: string[]): Mask {
  const width = lines[0]!.length;
  const data = new Uint8Array(width * lines.length);
  lines.forEach((l, y) => [...l].forEach((ch, x) => (data[y * width + x] = ch === "#" ? 1 : 0)));
  return { width, height: lines.length, data };
}
function lines(m: Mask): string[] {
  return Array.from({ length: m.height }, (_, y) =>
    Array.from({ length: m.width }, (_, x) => (m.data[y * m.width + x] ? "#" : ".")).join(""),
  );
}

describe("splitting a picture into picture and background", () => {
  it("counts see-through pixels as white and finds a threshold between two greys", () => {
    // black, dark grey, light grey, see-through black
    const px = { width: 4, height: 1, data: [0, 0, 0, 255, 60, 60, 60, 255, 200, 200, 200, 255, 0, 0, 0, 0] };
    const light = brightness(px);
    expect(Array.from(light).map(Math.round)).toEqual([0, 60, 200, 255]);
    const t = autoThreshold(light);
    expect(t).toBeGreaterThan(60);
    expect(t).toBeLessThanOrEqual(200);
    expect(lines(toMask(light, 4, 1, t))).toEqual(["##.."]);
    expect(lines(toMask(light, 4, 1, t, true))).toEqual(["..##"]);
  });
});

describe("filling letter bodies", () => {
  it("fills inside an outline", () => {
    const m = mask(["......", ".####.", ".#..#.", ".#..#.", ".####.", "......"]);
    expect(lines(fillLetterBodies(m))).toEqual(["......", ".####.", ".####.", ".####.", ".####.", "......"]);
  });

  it("keeps the hole of an outlined O", () => {
    const m = mask([
      "#########",
      "#.......#",
      "#.#####.#",
      "#.#...#.#",
      "#.#####.#",
      "#.......#",
      "#########",
    ]);
    expect(lines(fillLetterBodies(m))).toEqual([
      "#########",
      "#########",
      "#########",
      "###...###",
      "#########",
      "#########",
      "#########",
    ]);
  });

  it("closes a diagonal outline, but can't fill one with a gap", () => {
    const diamond = mask([".....", "..#..", ".#.#.", "..#..", "....."]);
    expect(lines(fillLetterBodies(diamond))[2]).toBe(".###.");
    const open = mask(["......", ".####.", ".#..#.", ".#..#.", ".##.#.", "......"]);
    expect(lines(fillLetterBodies(open))).toEqual(lines(open));
  });

  it("leaves solid shapes alone", () => {
    const m = mask(["....", ".##.", ".##.", "...."]);
    expect(lines(fillLetterBodies(m))).toEqual(lines(m));
  });
});

describe("turning and shrinking", () => {
  const L = mask(["#..", "#..", "##."]);

  it("turns clockwise and back", () => {
    expect(lines(turnMask(L, 90))).toEqual(["###", "#..", "..."]);
    expect(lines(turnMask(L, 270))).toEqual(["...", "..#", "###"]);
    expect(lines(turnMask(L, 180))).toEqual([".##", "..#", "..#"]);
    expect(lines(turnMask(turnMask(L, 90), 270))).toEqual(lines(L));
    const wide = mask(["##..", "...."]);
    expect(turnMask(wide, 90)).toMatchObject({ width: 2, height: 4 });
  });

  it("shrinks by area, keeping cells that are at least half picture", () => {
    const m = mask(["##..##", "##..#.", "......", "...#.."]);
    expect(toCells(m, 3, 2)).toEqual([
      [true, false, true],
      [false, false, false],
    ]);
    expect(toCells(mask(["#."]), 4, 1)).toEqual([[true, true, false, false]]);
    expect(proportionalRows({ width: 200, height: 100 }, 60)).toBe(30);
  });
});

describe("picture sections", () => {
  const base = {
    id: "p",
    name: "Pic",
    width: 8,
    pictureWidth: 4,
    pictureRows: 3,
    marginRows: 2,
    rowColours: [0, 1] as [number, number],
    pictureColour: 1,
    mode: "thicken" as const,
  };

  it("centres the picture, keeps its top at the top and its left on the left", () => {
    // One picture cell at the top-left of a 4 × 3 picture.
    const cells = [
      [true, false, false, false],
      [false, false, false, false],
      [false, false, false, false],
    ];
    const { section, target } = pictureSection(cells, base);
    expect(section.rows.length).toBe(7); // 3 + 2 × 2, top row already background
    expect(section.repeatWidth).toBeNull();
    expect(section.rows.map((r) => r.colour)).toEqual([0, 1, 0, 1, 0, 1, 0]);
    // Picture top row is section row index 4 (2 margin + 3 rows − 1); display column 2 from the left
    // of 8 stitches is stitch index 5 (stitches count from the right).
    const want = target.flatMap((line, r) => line.map((c, s) => (c === 1 ? `${r}:${s}` : null))).filter(Boolean);
    expect(want).toEqual(["4:5"]);
  });

  it("adds a row on top when the top row would be in the picture colour", () => {
    const cells = [[false]];
    const res = pictureSection(cells, { ...base, pictureWidth: 1, pictureRows: 2 });
    expect(res.section.rows.length).toBe(7);
    expect(res.section.rows.at(-1)!.colour).toBe(0);
    expect(res.misses).toEqual([]);
  });

  it("matches a shape that starts and ends on its own rows, with no stacked X's", () => {
    // Picture colour 1 is on odd rows (index 1, 3, 5). A block on picture rows 0–2 = section rows 2–4
    // would start and end on colour-0 rows, so use margin 1: section rows 1–3, colours 1,0,1.
    const cells = Array.from({ length: 3 }, () => [true, true, true, true]);
    const res = pictureSection(cells, { ...base, marginRows: 1 });
    expect(res.misses).toEqual([]);
    const shown = shownColumns(res.section);
    expect(shown).toEqual(res.target);
    const x = res.section.rows.map((r) => r.x);
    expect(x.some((row, r) => r > 0 && row.some((v, c) => v && x[r - 1]![c]))).toBe(false);
  });

  it("thickens or thins where a shape starts on the wrong row", () => {
    const cells = Array.from({ length: 3 }, () => [true, true, true, true]);
    const thick = pictureSection(cells, { ...base, mode: "thicken" });
    const thin = pictureSection(cells, { ...base, mode: "thin" });
    const count = (s: number[][]) => s.flat().filter((c) => c === 1).length;
    expect(count(shownColumns(thick.section))).toBeGreaterThan(12);
    expect(count(shownColumns(thin.section))).toBeLessThan(12);
  });

  it("is added on top of the arrangement with a name of its own", () => {
    const p = exampleProject();
    const cells = [[true]];
    const opts = { ...base, name: p.sections[0]!.name, pictureWidth: 1, pictureRows: 1 };
    const res = addPictureSection(p, cells, opts);
    const added = res.project.sections.find((s) => s.id === res.id)!;
    expect(res.project.arrangement.at(-1)).toBe(res.id);
    expect(added.name).toBe(`${p.sections[0]!.name} 2`);
    expect(added.rows[0]!.x.length).toBe(p.stitchesPerRow - 2);
  });
});

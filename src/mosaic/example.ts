import type { Project, Row } from "./types";

/** Rows from strings, bottom row first; "x" marks an X. */
function rows(lines: string[], sequence: number[]): Row[] {
  return lines.map((line, i) => ({ colour: sequence[i % sequence.length]!, x: [...line].map((c) => c === "x") }));
}

/** A made-up example project: a 12-stitch diamond band and a 10-stitch zigzag band. */
export function exampleProject(): Project {
  return {
    version: 1,
    name: "Example: Diamond scarf",
    stitchesPerRow: 75,
    palette: [
      { name: "Oatmeal", hex: "#E9E1CF" },
      { name: "Moss", hex: "#5E7F4C" },
      { name: "Damson", hex: "#6D3B5F" },
    ],
    foundation: [0, 1],
    sections: [
      {
        id: "diamond",
        name: "Pattern 1",
        repeatWidth: 12,
        spareFill: "continue",
        oddSpareSide: "left",
        colourSequence: [0, 1],
        rows: rows(
          [
            "............", "............", "xxx..xx..xxx", "...xx..xx...",
            "xx........xx", "..xx.xx.xx..", "x...x..x...x", ".xx......xx.",
            "...xxxxxx...", ".xx......xx.", "x...x..x...x", "..xx.xx.xx..",
            "xx........xx", "...xx..xx...", "xxx..xx..xxx", "............",
          ],
          [0, 1],
        ),
      },
      {
        id: "zigzag",
        name: "Pattern 2",
        repeatWidth: 10,
        spareFill: "continue",
        oddSpareSide: "left",
        colourSequence: [0, 2],
        rows: rows(
          ["..........", "....xx....", "xx......xx", "..xx..xx..", "....xx....", "xx......xx", "..xx..xx..", ".........."],
          [0, 2],
        ),
      },
    ],
    arrangement: ["diamond", "zigzag", "diamond", "zigzag", "diamond"],
  };
}

import type { Layout } from "./layout";

export type ChartMode = "repeat" | "full";

/** A chart column: a border stitch, or a stitch with its heading (number, FS or LS). */
export type ChartCol = { kind: "bs" } | { kind: "stitch"; stitch: number; head: string };

/**
 * Chart columns, left to right: BS, stitches from the highest number down to 1, BS.
 * `repeat` shows one repeat plus the spare stitches; `full` shows every stitch.
 */
export function chartColumns(layout: Layout, mode: ChartMode): ChartCol[] {
  const cols: ChartCol[] = [{ kind: "bs" }];
  const { width, first, motifWidth, repeats } = layout;
  if (mode === "full") {
    for (let s = width - 1; s >= 0; s--) {
      const n = s + 1;
      cols.push({ kind: "stitch", stitch: s, head: n % 5 === 0 || n === 1 ? String(n) : "" });
    }
  } else {
    for (let s = width - 1; s >= first + repeats * motifWidth; s--) cols.push({ kind: "stitch", stitch: s, head: "LS" });
    for (let s = first + motifWidth - 1; s >= first; s--) cols.push({ kind: "stitch", stitch: s, head: String(s - first + 1) });
    for (let s = first - 1; s >= 0; s--) cols.push({ kind: "stitch", stitch: s, head: "FS" });
  }
  cols.push({ kind: "bs" });
  return cols;
}

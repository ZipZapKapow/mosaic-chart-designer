import {
  designWidth,
  inRepeat,
  layoutOf,
  motifColumn,
  LETTERS,
  sectionStack,
  shownColour,
  type Layout,
  type Project,
  type Section,
  type StackRow,
} from "../mosaic";

export type ChartMode = "repeat" | "full";

/** What a pointer is over in the chart. `row` is the section row (0 = row 1). */
export type CellTarget = { kind: "bs" } | { kind: "foundation" } | { kind: "stitch"; row: number; stitch: number };

export type ChipTarget = { kind: "row"; row: number } | { kind: "foundation"; index: number };

export interface ChartHandlers {
  onCellDown(target: CellTarget): void;
  onCellEnter(target: CellTarget): void;
  onChip(target: ChipTarget, anchor: HTMLElement): void;
}

type Col = { kind: "bs" } | { kind: "stitch"; stitch: number; head: string };

interface Cell {
  td: HTMLTableCellElement;
  stitch: number;
  base: string;
}

/**
 * The editable chart for one section, drawn as a table: stitch numbers along the
 * top and bottom, row numbers on both sides, a colour letter per row, and the red
 * repeat box. Stitches are numbered from the right, as they're worked.
 */
export class Chart {
  readonly el: HTMLDivElement;
  private stack: StackRow[] = [];
  private offset = 0;
  private withFoundation = false;
  private cells = new Map<number, Cell[]>();

  constructor(private handlers: ChartHandlers) {
    this.el = document.createElement("div");
    this.el.className = "chart-wrap";
    this.el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const t = this.targetAt(e.target);
      if (!t) return;
      e.preventDefault();
      this.handlers.onCellDown(t);
    });
    this.el.addEventListener("pointermove", (e) => {
      if (!(e.buttons & 1)) return;
      const t = this.targetAt(document.elementFromPoint(e.clientX, e.clientY));
      if (t) this.handlers.onCellEnter(t);
    });
    this.el.addEventListener("click", (e) => {
      const chip = (e.target as Element).closest<HTMLButtonElement>(".colchip");
      if (!chip) return;
      const k = Number(chip.dataset.k);
      const src = this.stack[k]?.source;
      if (!src) return;
      this.handlers.onChip(src.kind === "foundation" ? { kind: "foundation", index: src.index } : { kind: "row", row: src.row }, chip);
    });
  }

  private targetAt(node: EventTarget | null): CellTarget | null {
    if (!(node instanceof Element)) return null;
    const td = node.closest<HTMLTableCellElement>("td.c");
    if (!td || !this.el.contains(td)) return null;
    if (td.dataset.bs) return { kind: "bs" };
    const k = Number(td.dataset.k);
    const src = this.stack[k]?.source;
    if (!src) return null;
    if (src.kind === "foundation") return { kind: "foundation" };
    return { kind: "stitch", row: src.row, stitch: Number(td.dataset.s) };
  }

  /** Rebuild the whole chart. */
  render(project: Project, section: Section, opts: { mode: ChartMode; cell: number; withFoundation: boolean }) {
    const width = designWidth(project);
    const layout = layoutOf(section, width);
    const mode: ChartMode = section.repeatWidth === null ? "full" : opts.mode;
    this.withFoundation = opts.withFoundation;
    this.offset = opts.withFoundation ? project.foundation.length : 0;
    this.stack = sectionStack(project, section, opts.withFoundation);
    this.cells.clear();

    const cols = columns(layout, mode);
    const stitchCols = cols.filter((c): c is Extract<Col, { kind: "stitch" }> => c.kind === "stitch");
    const boxed = (s: number) => section.repeatWidth !== null && inRepeat(layout, s) && (mode === "full" || s < layout.first + layout.motifWidth);
    const boxIdx = stitchCols.map((c, i) => (boxed(c.stitch) ? i : -1)).filter((i) => i >= 0);
    const boxFirst = boxIdx[0] ?? -1;
    const boxLast = boxIdx[boxIdx.length - 1] ?? -1;

    this.el.style.setProperty("--cell", opts.cell + "px");
    this.el.classList.toggle("tiny", opts.cell < 16);
    const table = document.createElement("table");
    table.className = "chart";

    // Label row: the red "N stitch – repeat x times" tab, or the no-repeat width.
    const lab = table.insertRow();
    lab.insertCell().colSpan = 2; // over the row number and the left border stitch
    if (section.repeatWidth === null) {
      const c = lab.insertCell();
      c.colSpan = stitchCols.length;
      c.className = "hdr lbl plain";
      c.textContent = `No repeat · ${width} stitches`;
    } else {
      if (boxFirst > 0) lab.insertCell().colSpan = boxFirst;
      const c = lab.insertCell();
      c.colSpan = boxLast - boxFirst + 1;
      c.className = "hdr lbl";
      c.textContent =
        mode === "full"
          ? `${layout.motifWidth} stitch repeat × ${layout.repeats}`
          : `${layout.motifWidth} stitch – repeat ${layout.repeats} time${layout.repeats === 1 ? "" : "s"}`;
      const after = stitchCols.length - boxLast - 1;
      if (after > 0) lab.insertCell().colSpan = after;
    }

    const head = (cls: string) => {
      const tr = table.insertRow();
      tr.className = cls;
      tr.insertCell().className = "hdr corner";
      for (const c of cols) {
        const td = tr.insertCell();
        td.className = "hdr";
        td.textContent = c.kind === "bs" ? "BS" : c.head;
      }
      tr.insertCell().className = "hdr corner";
      tr.insertCell().className = "hdr corner";
    };
    head("top");

    const topRow = this.stack.length - 1;
    for (let k = topRow; k >= 0; k--) {
      const row = this.stack[k]!;
      const isFr = row.source.kind === "foundation";
      const label = isFr ? `FR${(row.source as { index: number }).index + 1}` : String((row.source as { row: number }).row + 1);
      const tr = table.insertRow();
      if (isFr) tr.className = "fr";
      else if ((row.source as { row: number }).row % 5 === 4) tr.className = "fifth";
      const l = tr.insertCell();
      l.className = "rn";
      l.textContent = label;

      const rowCells: Cell[] = [];
      let si = 0;
      for (const c of cols) {
        const td = tr.insertCell();
        if (c.kind === "bs") {
          td.className = `c bs k${row.colour}`;
          td.dataset.bs = "1";
          td.textContent = opts.cell >= 18 ? "BS" : "";
          continue;
        }
        let base = "c";
        if (!isFr && boxFirst >= 0 && si >= boxFirst && si <= boxLast) {
          const edges: string[] = [];
          if (si === boxFirst) edges.push("rb-l");
          if (si === boxLast) edges.push("rb-r");
          if (k === topRow) edges.push("rb-t");
          if (k === this.offset) edges.push("rb-b");
          if (mode === "full" && c.stitch > layout.first && (c.stitch - layout.first) % layout.motifWidth === 0) edges.push("rb-d");
          if (edges.length) base += " edge " + edges.join(" ");
        }
        td.dataset.k = String(k);
        td.dataset.s = String(c.stitch);
        rowCells.push({ td, stitch: c.stitch, base });
        si++;
      }
      this.cells.set(k, rowCells);
      this.paintRow(k);

      const cc = tr.insertCell();
      cc.className = "cc";
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `colchip k${row.colour}`;
      chip.dataset.k = String(k);
      chip.textContent = LETTERS[row.colour] ?? "?";
      chip.title = `Change the colour of row ${label}`;
      chip.setAttribute("aria-label", `Row ${label}: colour ${LETTERS[row.colour]} ${project.palette[row.colour]?.name ?? ""}. Change colour`);
      cc.appendChild(chip);
      const r = tr.insertCell();
      r.className = "rn";
      r.textContent = label;
    }
    head("bottom");
    this.el.replaceChildren(table);
  }

  private paintRow(k: number) {
    const row = this.stack[k];
    const cells = this.cells.get(k);
    if (!row || !cells) return;
    for (const cell of cells) {
      const colour = shownColour(this.stack, k, cell.stitch);
      const x = row.xAt(cell.stitch);
      const cls = `${cell.base} k${colour}${x ? " x" : ""}`;
      if (cell.td.className !== cls) cell.td.className = cls;
      const text = x ? "X" : "";
      if (cell.td.textContent !== text) cell.td.textContent = text;
    }
  }

  /** Repaint just the rows touched by an X change in section row `row` (that row and the one below). */
  refreshAfterX(project: Project, section: Section, row: number) {
    this.stack = sectionStack(project, section, this.withFoundation);
    const k = row + this.offset;
    this.paintRow(k);
    if (k > 0) this.paintRow(k - 1);
  }

  /**
   * Outline in red the stitches that can't show the colour they should.
   * `misses` holds "row:column" keys in the section's stored columns.
   */
  markMisses(project: Project, section: Section, misses: Set<string>) {
    const layout = layoutOf(section, designWidth(project));
    for (const [k, cells] of this.cells) {
      const src = this.stack[k]?.source;
      if (src?.kind !== "section") continue;
      for (const cell of cells) {
        const col = motifColumn(section, layout, cell.stitch);
        if (col !== null && misses.has(`${src.row}:${col}`)) cell.td.classList.add("miss");
      }
    }
  }

  /** Briefly outline a stitch (e.g. the X that's in the way). */
  flash(row: number, stitch: number) {
    const td = this.cells.get(row + this.offset)?.find((c) => c.stitch === stitch)?.td;
    if (!td) return;
    td.classList.remove("flash");
    void td.offsetWidth;
    td.classList.add("flash");
    td.addEventListener("animationend", () => td.classList.remove("flash"), { once: true });
  }
}

/** Display columns, left to right: BS, stitches from the highest number down to 1, BS. */
function columns(layout: Layout, mode: ChartMode): Col[] {
  const cols: Col[] = [{ kind: "bs" }];
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

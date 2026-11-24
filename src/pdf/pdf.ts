import {
  PDFDocument,
  PDFName,
  PDFNull,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFForm,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import {
  colourGrid,
  designWidth,
  foundationChain,
  hasRowOverrides,
  inRepeat,
  layoutOf,
  LETTERS,
  shownColour,
  wholeStack,
  type Project,
} from "../mosaic";
import { CHART_HEADER, FOOTER, PAGE, planChart, ROW_NUMBER_WIDTH, sectionsInOrder, SIDE_GAP, type ChartPlan, type Segment } from "./plan";

/**
 * The pattern PDF: a cover (whole design, colour key, legend, how to start), a
 * section checklist, then a chart for each section. Made for reading on a tablet:
 * every row and section has a tick box you can tap, and the checklist links to the charts.
 */

const INK = rgb(0.11, 0.14, 0.13);
const MUTED = rgb(0.42, 0.47, 0.45);
const GRID = rgb(0, 0, 0);
const RED = rgb(0xd2 / 255, 0x30 / 255, 0x2a / 255);
const BS = rgb(0x9d / 255, 0xc3 / 255, 0xe6 / 255);
const WHITE = rgb(1, 1, 1);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

function hex(h: string): RGB {
  const v = parseInt(h.slice(1), 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}
function lightness(h: string) {
  const v = parseInt(h.slice(1), 16);
  return 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
}
const inkOn = (h: string) => (lightness(h) > 150 ? INK : WHITE);

/** Standard PDF fonts only cover Western European letters: swap anything else for "?". */
function makeSafe(font: PDFFont) {
  const ok = new Set(font.getCharacterSet());
  return (text: string) =>
    [...text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')]
      .map((ch) => (ok.has(ch.codePointAt(0)!) ? ch : "?"))
      .join("");
}

/** Text helper working from the top of the page. */
class Writer {
  readonly safe: (t: string) => string;
  constructor(
    readonly page: PDFPage,
    readonly fonts: Fonts,
  ) {
    this.safe = makeSafe(fonts.regular);
  }
  y(top: number) {
    return PAGE.height - top;
  }
  width(text: string, size: number, bold = false) {
    return (bold ? this.fonts.bold : this.fonts.regular).widthOfTextAtSize(this.safe(text), size);
  }
  text(text: string, x: number, top: number, size: number, opts: { bold?: boolean; colour?: RGB; align?: "left" | "centre" | "right" } = {}) {
    const t = this.safe(text);
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const w = font.widthOfTextAtSize(t, size);
    const dx = opts.align === "centre" ? -w / 2 : opts.align === "right" ? -w : 0;
    this.page.drawText(t, { x: x + dx, y: this.y(top) - size * 0.8, size, font, color: opts.colour ?? INK });
    return w;
  }
  /** Centre text in a box given by its top-left corner. */
  inBox(text: string, x: number, top: number, w: number, h: number, size: number, colour: RGB = INK, bold = false) {
    const t = this.safe(text);
    const font = bold ? this.fonts.bold : this.fonts.regular;
    const tw = font.widthOfTextAtSize(t, size);
    this.page.drawText(t, { x: x + (w - tw) / 2, y: this.y(top + h / 2) - size * 0.35, size, font, color: colour });
  }
  /** Wrap text to a width; returns the height used. */
  para(text: string, x: number, top: number, width: number, size: number, opts: { bold?: boolean; colour?: RGB } = {}) {
    const words = this.safe(text).split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && this.width(next, size, opts.bold) > width) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    const lh = size * 1.35;
    lines.forEach((l, i) => this.text(l, x, top + i * lh, size, opts));
    return lines.length * lh;
  }
  rect(x: number, top: number, w: number, h: number, opts: { fill?: RGB; stroke?: RGB; width?: number; opacity?: number }) {
    this.page.drawRectangle({
      x,
      y: this.y(top + h),
      width: w,
      height: h,
      color: opts.fill,
      opacity: opts.opacity,
      borderColor: opts.stroke,
      borderWidth: opts.stroke ? (opts.width ?? 0.5) : 0,
    });
  }
  line(x1: number, top1: number, x2: number, top2: number, width: number, colour: RGB = GRID, opacity = 1) {
    this.page.drawLine({ start: { x: x1, y: this.y(top1) }, end: { x: x2, y: this.y(top2) }, thickness: width, color: colour, opacity });
  }
}

function tick(form: PDFForm, page: PDFPage, name: string, x: number, top: number, size: number) {
  let box;
  try {
    box = form.getCheckBox(name);
  } catch {
    box = form.createCheckBox(name);
  }
  box.addToPage(page, { x, y: PAGE.height - top - size, width: size, height: size, borderWidth: 0.6, borderColor: MUTED, backgroundColor: WHITE });
}

function link(doc: PDFDocument, from: PDFPage, to: PDFPage, x: number, top: number, w: number, h: number) {
  const annot = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, PAGE.height - top - h, x + w, PAGE.height - top],
    Border: [0, 0, 0],
    Dest: [to.ref, "XYZ", PDFNull, PDFNull, PDFNull],
  });
  from.node.addAnnot(doc.context.register(annot));
}

function footer(w: Writer, project: Project, pageNo: number, pages: number) {
  const top = PAGE.height - PAGE.margin - 10;
  let x = PAGE.margin;
  project.palette.forEach((yarn, i) => {
    w.rect(x, top, 10, 10, { fill: hex(yarn.hex), stroke: GRID, width: 0.3 });
    x += 13;
    x += w.text(`${LETTERS[i]} ${yarn.name}`, x, top + 1.5, 7.5, { colour: MUTED }) + 9;
  });
  w.text(`${project.name} · page ${pageNo} of ${pages}`, PAGE.width - PAGE.margin, top + 1.5, 7.5, { colour: MUTED, align: "right" });
}

function sectionSummary(project: Project, plan: ChartPlan): string {
  const s = plan.section;
  const layout = layoutOf(s, designWidth(project));
  const parts: string[] = [];
  if (s.repeatWidth === null) parts.push(`No repeat · ${layout.width} stitches across`);
  else {
    let t = `${layout.motifWidth}-stitch repeat × ${layout.repeats}`;
    if (layout.spare)
      t += ` + ${layout.spare} spare (${[layout.first ? `${layout.first} FS` : "", layout.last ? `${layout.last} LS` : ""].filter(Boolean).join(", ")}, ${s.spareFill === "plain" ? "plain" : "continuing the pattern"})`;
    parts.push(t);
  }
  parts.push(`${s.rows.length} rows` + (plan.foundationRows ? ` + ${plan.foundationRows} foundation rows` : ""));
  parts.push(`Rows ${s.colourSequence.map((c) => LETTERS[c]).join(", ")} repeating${hasRowOverrides(s) ? ", with some rows changed" : ""}`);
  parts.push(`Step${plan.steps.length === 1 ? "" : "s"} ${plan.steps.map((i) => i + 1).join(", ")}`);
  return parts.join(" · ");
}

function drawChartPage(w: Writer, form: PDFForm, project: Project, plan: ChartPlan, seg: Segment, part: number) {
  const { cell, cols, stack, labelHeight, numberHeight, section } = plan;
  const pal = project.palette;
  const width = designWidth(project);
  const layout = layoutOf(section, width);
  const pages = plan.segments.length;

  // Title lines.
  let top = PAGE.margin;
  w.text(section.name + (pages > 1 ? ` (part ${part} of ${pages})` : ""), PAGE.margin, top, 15, { bold: true });
  top += 21;
  top += w.para(sectionSummary(project, plan), PAGE.margin, top, PAGE.width - 2 * PAGE.margin, 8.5, { colour: MUTED });
  if (seg.repeated) {
    const lab = (k: number) => rowLabel(stack, k);
    top += w.para(
      `The faded rows ${lab(seg.start)}–${lab(seg.start + seg.repeated - 1)} at the bottom repeat the top of the previous page, to help you find your place.`,
      PAGE.margin,
      top + 2,
      PAGE.width - 2 * PAGE.margin,
      8.5,
      { colour: MUTED },
    );
  }

  const gridW = cols.length * cell;
  const usedW = 2 * ROW_NUMBER_WIDTH + gridW + 2 * SIDE_GAP + 2 * cell;
  const left = PAGE.margin + Math.max(0, (PAGE.width - 2 * PAGE.margin - usedW) / 2);
  const gx = left + ROW_NUMBER_WIDTH;
  const rows = seg.end - seg.start;
  const labelTop = PAGE.margin + CHART_HEADER;
  const headTop = labelTop + labelHeight;
  const gridTop = headTop + numberHeight;
  const footTop = gridTop + rows * cell;
  const rowTop = (k: number) => gridTop + (seg.end - 1 - k) * cell;
  const fs = Math.min(8, Math.max(4, cell * 0.55));

  // Which columns the red repeat box covers.
  const boxed = cols.map((c) => c.kind === "stitch" && section.repeatWidth !== null && inRepeat(layout, c.stitch) && c.stitch < layout.first + layout.motifWidth);
  const b0 = boxed.indexOf(true);
  const b1 = boxed.lastIndexOf(true);

  // Label row.
  if (section.repeatWidth === null) {
    w.inBox(`No repeat · ${width} stitches`, gx, labelTop, gridW, labelHeight - 2, Math.min(8, labelHeight * 0.6), MUTED, true);
  } else if (b0 >= 0) {
    const text = `${layout.motifWidth} stitch – repeat ${layout.repeats} time${layout.repeats === 1 ? "" : "s"}`;
    const tw = (b1 - b0 + 1) * cell;
    const size = Math.min(8, labelHeight * 0.6);
    const textW = w.width(text, size, true) + 6;
    const lw = Math.max(tw, textW);
    const lx = gx + b0 * cell + (tw - lw) / 2;
    w.rect(lx, labelTop, lw, labelHeight - 2, { stroke: RED, width: 1.2, fill: WHITE });
    w.inBox(text, lx, labelTop, lw, labelHeight - 2, size, RED, true);
  }

  // Stitch numbers, top and bottom.
  for (const at of [headTop, footTop]) {
    cols.forEach((c, i) => {
      const t = c.kind === "bs" ? "BS" : c.head;
      if (t) w.inBox(t, gx + i * cell, at, cell, numberHeight, Math.min(fs, (cell * 1.6) / Math.max(1, t.length)), MUTED);
    });
  }

  // Stitches: runs of one colour as one rectangle, then the X's.
  for (let k = seg.start; k < seg.end; k++) {
    const row = stack[k]!;
    const y = rowTop(k);
    const colours = cols.map((c) => (c.kind === "bs" ? -1 : shownColour(stack, k, c.stitch)));
    let i = 0;
    while (i < cols.length) {
      let j = i;
      while (j + 1 < cols.length && colours[j + 1] === colours[i]) j++;
      const fill = colours[i] === -1 ? BS : hex(pal[colours[i]!]?.hex ?? "#999999");
      w.rect(gx + i * cell, y, (j - i + 1) * cell, cell, { fill });
      i = j + 1;
    }
    cols.forEach((c, ci) => {
      if (c.kind === "bs") {
        if (cell >= 13) w.inBox("BS", gx + ci * cell, y, cell, cell, cell * 0.38, INK);
      } else if (row.xAt(c.stitch)) {
        w.inBox("X", gx + ci * cell, y, cell, cell, cell * 0.62, inkOn(pal[colours[ci]!]?.hex ?? "#999999"), true);
      }
    });

    // Row numbers, colour letter, tick box.
    const label = rowLabel(stack, k);
    w.inBox(label, left, y, ROW_NUMBER_WIDTH - 2, cell, fs, INK);
    w.inBox(label, gx + gridW + 2, y, ROW_NUMBER_WIDTH - 2, cell, fs, INK);
    const lx = gx + gridW + ROW_NUMBER_WIDTH + SIDE_GAP;
    const yarn = pal[row.colour];
    w.rect(lx, y + 0.5, cell, cell - 1, { fill: hex(yarn?.hex ?? "#999999"), stroke: GRID, width: 0.3 });
    w.inBox(LETTERS[row.colour] ?? "?", lx, y + 0.5, cell, cell - 1, cell * 0.55, inkOn(yarn?.hex ?? "#999999"), true);
    const src = row.source;
    const name = src.kind === "foundation" ? `fr_${src.index}` : `row_${section.id}_${src.row}`;
    const t = Math.max(4, cell - 3);
    tick(form, w.page, name, lx + cell + SIDE_GAP + (cell - t) / 2, y + (cell - t) / 2, t);
  }

  // Grid lines, with a darker line under every fifth row.
  for (let i = 0; i <= cols.length; i++) w.line(gx + i * cell, gridTop, gx + i * cell, footTop, 0.25, GRID, 0.3);
  for (let k = seg.start; k <= seg.end; k++) {
    const y = k === seg.end ? gridTop : rowTop(k) + cell;
    const src = stack[k]?.source;
    const fifth = src?.kind === "section" && src.row % 5 === 0 && src.row > 0;
    w.line(gx, y, gx + gridW, y, fifth ? 0.7 : 0.25, GRID, fifth ? 0.6 : 0.3);
  }

  // The red repeat box, over the section's rows on this page (not the foundation rows).
  const firstRow = Math.max(seg.start, plan.foundationRows);
  if (b0 >= 0 && firstRow < seg.end) {
    const y0 = rowTop(seg.end - 1);
    const y1 = rowTop(firstRow) + cell;
    w.rect(gx + b0 * cell, y0, (b1 - b0 + 1) * cell, y1 - y0, { stroke: RED, width: 1.6 });
  }

  // Fade the rows repeated from the previous page.
  if (seg.repeated) {
    const y = rowTop(seg.start + seg.repeated - 1);
    w.rect(gx, y, gridW, seg.repeated * cell, { fill: WHITE, opacity: 0.55 });
  }
}

function rowLabel(stack: ChartPlan["stack"], k: number) {
  const src = stack[k]!.source;
  return src.kind === "foundation" ? `FR${src.index + 1}` : String(src.row + 1);
}

function drawCover(w: Writer, project: Project, totalRows: number) {
  const pal = project.palette;
  const M = PAGE.margin;
  let top = M;
  w.text(project.name, M, top, 22, { bold: true });
  top += 30;
  w.text(
    `${project.stitchesPerRow} stitches per row (including 2 border stitches) · ${project.foundation.length} foundation rows + ${totalRows} pattern rows · UK terms`,
    M,
    top,
    9,
    { colour: MUTED },
  );
  top += 24;

  // Whole design, one square per stitch.
  const grid = colourGrid(project);
  const rows = grid.length;
  const cols = grid[0]?.length ?? 1;
  const maxW = 190;
  const maxH = PAGE.height - top - M - FOOTER - 20;
  const s = Math.min(maxW / cols, maxH / rows, 6);
  const imgTop = top + 12;
  w.text("Whole design", M, top, 8, { bold: true, colour: MUTED });
  for (let r = 0; r < rows; r++) {
    const line = grid[r]!;
    const y = imgTop + (rows - 1 - r) * s;
    let i = 0;
    while (i < cols) {
      let j = i;
      while (j + 1 < cols && line[j + 1] === line[i]) j++;
      // A hair of overlap hides seams between rows in PDF viewers.
      w.rect(M + i * s, y, (j - i + 1) * s, s + 0.05, { fill: hex(pal[line[i]!]?.hex ?? "#999999") });
      i = j + 1;
    }
  }
  w.rect(M, imgTop, cols * s, rows * s, { stroke: GRID, width: 0.4 });

  // Right-hand column: colours, legend, how to start.
  const x = M + Math.max(cols * s, 120) + 24;
  const colW = PAGE.width - M - x;
  let y = top;
  const heading = (t: string) => {
    w.text(t, x, y, 11, { bold: true });
    y += 18;
  };
  heading("Colours");
  pal.forEach((yarn, i) => {
    w.rect(x, y, 22, 14, { fill: hex(yarn.hex), stroke: GRID, width: 0.4 });
    w.inBox(LETTERS[i] ?? "?", x, y, 22, 14, 8, inkOn(yarn.hex), true);
    w.text(yarn.name, x + 30, y + 3, 9.5);
    y += 19;
  });
  y += 12;

  heading("Key");
  const key: [string, string][] = [
    ["", "Blank square: DC in the back loop."],
    ["X", "X: TR in the front loop of the stitch two rows below (in the same column)."],
    ["BS", "Border stitch, first and last of every row: DC through both loops. Never an X."],
    ["FS", "First stitches: spare stitches before the repeats, on the right."],
    ["LS", "Last stitches: spare stitches after the repeats, on the left."],
    ["FR", "Foundation rows: plain rows worked once, at the start."],
  ];
  for (const [sym, text] of key) {
    w.rect(x, y, 16, 14, { fill: sym === "BS" ? BS : WHITE, stroke: GRID, width: 0.4 });
    if (sym) w.inBox(sym, x, y, 16, 14, sym.length > 1 ? 6 : 8.5, INK, true);
    y += Math.max(19, w.para(text, x + 24, y + 3, colW - 24, 9) + 7);
  }
  y += 10;

  heading("How to work it");
  const fr1 = pal[project.foundation[0] ?? 0];
  const steps = [
    `With ${LETTERS[project.foundation[0] ?? 0]} (${fr1?.name ?? ""}), chain ${foundationChain(project)}.`,
    `FR1: DC in the 2nd chain from the hook and in each chain to the end: ${project.stitchesPerRow} stitches. Fasten off.`,
    project.foundation.length > 1
      ? `FR2${project.foundation.length > 2 ? `–FR${project.foundation.length}` : ""}: in the colour shown, DC in each stitch across. Fasten off.`
      : "",
    "Every row is worked on the right side, from right to left: join the row's colour in the first stitch, work across, fasten off. Don't turn.",
    "Read each chart from the bottom up and from right to left, as the stitch numbers run. The colour letter on the right of each row is the yarn for that row.",
    "Work the sections in the order of the checklist, from step 1, ticking off rows as you go.",
  ].filter(Boolean);
  steps.forEach((t, i) => {
    w.text(`${i + 1}.`, x, y, 9, { bold: true });
    y += w.para(t, x + 16, y, colW - 16, 9) + 5;
  });
}

/** Build the pattern PDF for a project. */
export async function buildPdf(project: Project): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(project.name);
  doc.setCreator("Mosaic Chart Designer");
  doc.setProducer("Mosaic Chart Designer");
  doc.setAuthor("");
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const form = doc.getForm();

  const plans = sectionsInOrder(project).map((s) => planChart(project, s));
  const steps = project.arrangement;
  const perChecklist = 30;
  const checklistPages = Math.max(1, Math.ceil(steps.length / perChecklist));
  const chartPages = plans.reduce((n, p) => n + p.segments.length, 0);
  const total = 1 + checklistPages + chartPages;
  const add = () => doc.addPage([PAGE.width, PAGE.height]);

  const cover = add();
  const checklist = Array.from({ length: checklistPages }, add);
  const firstPage = new Map<string, { page: PDFPage; no: number }>();
  let no = 1 + checklistPages;
  const totalRows = wholeStack(project).length - project.foundation.length;

  // Charts first, so the checklist can link to them.
  for (const plan of plans) {
    plan.segments.forEach((seg, i) => {
      const page = add();
      no++;
      if (i === 0) firstPage.set(plan.section.id, { page, no });
      const w = new Writer(page, fonts);
      drawChartPage(w, form, project, plan, seg, i + 1);
      footer(w, project, no, total);
      w.text("Checklist", PAGE.width / 2, PAGE.height - PAGE.margin - 8.5, 7.5, { colour: RED, align: "centre" });
      link(doc, page, checklist[0]!, PAGE.width / 2 - 20, PAGE.height - PAGE.margin - 11, 40, 12);
    });
  }

  const cw = new Writer(cover, fonts);
  drawCover(cw, project, totalRows);
  footer(cw, project, 1, total);

  // Checklist.
  let rowStart = 0;
  const sections = new Map(project.sections.map((s) => [s.id, s]));
  checklist.forEach((page, pi) => {
    const w = new Writer(page, fonts);
    const M = PAGE.margin;
    let top = M;
    w.text(pi ? "Section checklist (continued)" : "Section checklist", M, top, 18, { bold: true });
    top += 26;
    top += w.para("Work from step 1 down, ticking each section off when it's done. Tap a section's name to go to its chart.", M, top, PAGE.width - 2 * M, 9, { colour: MUTED }) + 10;
    const colX = [M, M + 26, M + 70, M + 300, M + 360];
    ["", "Step", "Section", "Rows", "Rows in the piece"].forEach((h, i) => w.text(h, colX[i]!, top, 8, { bold: true, colour: MUTED }));
    w.text("Chart", PAGE.width - M, top, 8, { bold: true, colour: MUTED, align: "right" });
    top += 14;
    for (let i = pi * perChecklist; i < Math.min(steps.length, (pi + 1) * perChecklist); i++) {
      const s = sections.get(steps[i]!);
      if (!s) continue;
      const rows = s.rows.length;
      w.line(M, top, PAGE.width - M, top, 0.3, GRID, 0.25);
      tick(form, page, `step_${i}`, colX[0]! + 2, top + 5, 12);
      w.text(String(i + 1), colX[1]!, top + 7, 10, { bold: true });
      const target = firstPage.get(s.id);
      const nameW = w.text(s.name, colX[2]!, top + 7, 10, { colour: target ? RED : INK });
      w.text(String(rows), colX[3]!, top + 7, 10);
      w.text(`${rowStart + 1}–${rowStart + rows}`, colX[4]!, top + 7, 10, { colour: MUTED });
      if (target) {
        w.text(`page ${target.no}`, PAGE.width - M, top + 7, 10, { colour: MUTED, align: "right" });
        link(doc, page, target.page, colX[2]!, top + 2, Math.min(nameW, 220), 18);
        link(doc, page, target.page, PAGE.width - M - 50, top + 2, 50, 18);
      }
      rowStart += rows;
      top += 22;
    }
    w.line(M, top, PAGE.width - M, top, 0.3, GRID, 0.25);
    footer(w, project, 2 + pi, total);
  });

  // Keep the reading order sensible: cover, checklist, charts (they were added in that order).
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseNone"));
  // pdf-lib pauses for a timer tick every few objects by default; browsers slow timers
  // right down in background tabs, which made saving take many seconds. Save in big chunks.
  return doc.save({ objectsPerTick: 20_000 });
}

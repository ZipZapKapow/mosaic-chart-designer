import { fitPicture, type Fit, type FitOptions, type Target } from "./picture";
import { MAX_ROWS } from "./sections";
import type { ColourIndex, Row, Section } from "./types";

/**
 * Turning a picture into a section: split it into picture and background, fill
 * outlined letters if asked, turn it, shrink it to one cell per stitch, then let
 * the picture engine place the X's. Pure functions on plain arrays, so the browser
 * only has to supply the pixels.
 */

/** RGBA pixels, as in the browser's ImageData. */
export interface Pixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/** 1 = picture (shape), 0 = background, row by row from the top-left. */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Quarter turns clockwise. */
export type Turn = 0 | 90 | 180 | 270;

/** Brightness of each pixel (0 black – 255 white), with see-through parts counted as white. */
export function brightness(px: Pixels): Float32Array {
  const out = new Float32Array(px.width * px.height);
  const d = px.data;
  for (let i = 0; i < out.length; i++) {
    const a = d[i * 4 + 3]! / 255;
    const lum = 0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!;
    out[i] = a * lum + (1 - a) * 255;
  }
  return out;
}

/** A good starting threshold between dark and light (Otsu's method). */
export function autoThreshold(light: Float32Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of light) hist[Math.min(255, Math.max(0, Math.round(v)))]!++;
  const total = light.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i]!;
  let wB = 0;
  let sumB = 0;
  let best = 128;
  let bestVar = -1;
  for (let t = 0; t < 255; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > bestVar) {
      bestVar = between;
      best = t + 1; // pixels darker than this are "dark"
    }
  }
  return best;
}

/** Pixels darker than `threshold` are picture; `swap` makes the light parts the picture instead. */
export function toMask(light: Float32Array, width: number, height: number, threshold: number, swap = false): Mask {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (light[i]! < threshold) !== swap ? 1 : 0;
  return { width, height, data };
}

/**
 * Fill the bodies of outline-style letters. Background areas are counted by how
 * many outlines you cross to reach them from outside the picture: inside one
 * outline (a letter's body) gets filled; inside a second (the hole in an O) stays
 * background; and so on, alternating. Outlines with a gap can't be filled.
 */
export function fillLetterBodies(mask: Mask): Mask {
  // Work on a copy with a one-pixel background border, so "outside" is one area.
  const W = mask.width + 2;
  const H = mask.height + 2;
  const val = new Uint8Array(W * H);
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) val[(y + 1) * W + x + 1] = mask.data[y * mask.width + x]!;

  // Label areas: background joins up/down/left/right; picture also joins diagonally
  // (so a diagonal outline still closes a letter).
  const label = new Int32Array(W * H).fill(-1);
  const stack: number[] = [];
  let count = 0;
  for (let start = 0; start < W * H; start++) {
    if (label[start] !== -1) continue;
    const v = val[start]!;
    label[start] = count;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % W;
      const y = (p - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (dx && dy && v === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (label[q] === -1 && val[q] === v) {
            label[q] = count;
            stack.push(q);
          }
        }
    }
    count++;
  }

  // Which areas touch which.
  const links = Array.from({ length: count }, () => new Set<number>());
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = label[y * W + x]!;
      if (x + 1 < W) {
        const b = label[y * W + x + 1]!;
        if (a !== b) {
          links[a]!.add(b);
          links[b]!.add(a);
        }
      }
      if (y + 1 < H) {
        const b = label[(y + 1) * W + x]!;
        if (a !== b) {
          links[a]!.add(b);
          links[b]!.add(a);
        }
      }
    }

  // Steps from outside: 0 outside, 1 an outline, 2 a letter body, 3 an inner outline, 4 a hole…
  const depth = new Int32Array(count).fill(-1);
  const outside = label[0]!;
  depth[outside] = 0;
  const queue = [outside];
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i]!;
    for (const b of links[a]!)
      if (depth[b] === -1) {
        depth[b] = depth[a]! + 1;
        queue.push(b);
      }
  }

  const data = mask.data.slice();
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      const i = y * mask.width + x;
      if (data[i] === 0 && depth[label[(y + 1) * W + x + 1]!]! % 4 === 2) data[i] = 1;
    }
  return { width: mask.width, height: mask.height, data };
}

/** Turn a mask clockwise by a quarter-turn multiple. */
export function turnMask(mask: Mask, turn: Turn): Mask {
  if (turn === 0) return mask;
  const { width: w, height: h } = mask;
  const nw = turn === 180 ? w : h;
  const nh = turn === 180 ? h : w;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++) {
      const [sx, sy] = turn === 90 ? [y, h - 1 - x] : turn === 270 ? [w - 1 - y, x] : [w - 1 - x, h - 1 - y];
      data[y * nw + x] = mask.data[sy * w + sx]!;
    }
  return { width: nw, height: nh, data };
}

/**
 * Shrink (or stretch) a mask to `cols` × `rows` cells. Each cell is picture when
 * at least half the area it covers is picture. Result is top row first.
 */
export function toCells(mask: Mask, cols: number, rows: number): boolean[][] {
  const { width: w, height: h } = mask;
  const sx = w / cols;
  const sy = h / rows;
  const out: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const y0 = r * sy;
    const y1 = y0 + sy;
    const line: boolean[] = [];
    for (let c = 0; c < cols; c++) {
      const x0 = c * sx;
      const x1 = x0 + sx;
      let on = 0;
      let all = 0;
      for (let y = Math.floor(y0); y < Math.min(h, Math.ceil(y1)); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.min(w, Math.ceil(x1)); x++) {
          const wgt = wy * (Math.min(x + 1, x1) - Math.max(x, x0));
          all += wgt;
          if (mask.data[y * w + x]) on += wgt;
        }
      }
      line.push(on * 2 >= all && on > 0);
    }
    out.push(line);
  }
  return out;
}

/** Rows for a picture `cols` stitches wide, keeping its proportions (stitches taken as square). */
export function proportionalRows(mask: Pick<Mask, "width" | "height">, cols: number): number {
  return Math.max(1, Math.round((cols * mask.height) / mask.width));
}

export interface PictureSectionOptions {
  id: string;
  name: string;
  /** Design width: stitches between the border stitches. */
  width: number;
  /** Picture size in stitches and rows; it's centred across the width. */
  pictureWidth: number;
  pictureRows: number;
  /**
   * Rows of plain background added below and above the picture. One more goes on
   * top when needed, so the top row is in the background colour.
   */
  marginRows: number;
  /** Colours of row 1 and row 2; rows alternate. */
  rowColours: [ColourIndex, ColourIndex];
  /** The colour the picture parts show; the background shows the other. */
  pictureColour: ColourIndex;
  /** Where a stitch can't match, whether picture shapes thin or thicken. */
  mode: "thin" | "thicken";
}

export interface PictureResult {
  section: Section;
  target: Target;
  misses: Fit["misses"];
}

/** Build a no-repeat section that shows `cells` (top row first, left to right). */
export function pictureSection(cells: boolean[][], opts: PictureSectionOptions): PictureResult {
  const [c1, c2] = opts.rowColours;
  const background = opts.pictureColour === c1 ? c2 : c1;
  const pw = Math.min(opts.pictureWidth, opts.width);
  // Nothing sits above the top row, so it has to be the background colour: add a row if needed.
  let rows = Math.min(MAX_ROWS, opts.pictureRows + 2 * opts.marginRows);
  if ((rows % 2 === 1 ? c1 : c2) !== background && c1 !== c2) rows += rows < MAX_ROWS ? 1 : -1;
  const left = Math.floor((opts.width - pw) / 2); // display columns before the picture, from the left

  const target: Target = [];
  for (let r = 0; r < rows; r++) {
    // r counts from the bottom; picture row 0 is its top line.
    const pr = opts.marginRows + opts.pictureRows - 1 - r;
    const line: ColourIndex[] = [];
    for (let s = 0; s < opts.width; s++) {
      // Stitches are numbered from the right; display column from the left is width-1-s.
      const pc = opts.width - 1 - s - left;
      const on = pr >= 0 && pr < opts.pictureRows && pc >= 0 && pc < pw && cells[pr]?.[pc] === true;
      line.push(on ? opts.pictureColour : background);
    }
    target.push(line);
  }

  const rowColours = Array.from({ length: rows }, (_, r) => (r % 2 === 0 ? c1 : c2));
  const fitOpts: FitOptions = { prefer: { colour: opts.pictureColour, mode: opts.mode } };
  const fit = fitPicture(rowColours, target, fitOpts);
  const sectionRows: Row[] = rowColours.map((colour, r) => ({ colour, x: fit.x[r]! }));
  return {
    section: {
      id: opts.id,
      name: opts.name,
      repeatWidth: null,
      spareFill: "continue",
      oddSpareSide: "left",
      colourSequence: c1 === c2 ? [c1] : [c1, c2],
      rows: sectionRows,
    },
    target,
    misses: fit.misses,
  };
}

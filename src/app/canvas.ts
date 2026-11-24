import { colourGrid, type Project, type StackRow } from "../mosaic";
import { hexToRgb } from "./ui";

/** Draw rows as one pixel per stitch (row 1 at the bottom); CSS scales it up. */
export function drawStack(canvas: HTMLCanvasElement, project: Project, stack: StackRow[]) {
  const grid = colourGrid(project, stack);
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx || !w || !h) return;
  const rgb = project.palette.map((y) => hexToRgb(y.hex));
  const img = ctx.createImageData(w, h);
  grid.forEach((line, r) => {
    const y = h - 1 - r;
    line.forEach((colour, x) => {
      const [cr, cg, cb] = rgb[colour] ?? [153, 153, 153];
      const o = (y * w + x) * 4;
      img.data[o] = cr;
      img.data[o + 1] = cg;
      img.data[o + 2] = cb;
      img.data[o + 3] = 255;
    });
  });
  ctx.putImageData(img, 0, 0);
}

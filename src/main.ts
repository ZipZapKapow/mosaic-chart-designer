import { colourGrid, exampleProject } from "./mosaic";

// Placeholder until the editor is built: draw the example design from the rules module.
const project = exampleProject();
const grid = colourGrid(project);
const canvas = document.querySelector<HTMLCanvasElement>("#preview");
const ctx = canvas?.getContext("2d");

if (canvas && ctx) {
  const scale = 6;
  canvas.width = (grid[0]?.length ?? 0) * scale;
  canvas.height = grid.length * scale;
  grid.forEach((line, r) => {
    const y = (grid.length - 1 - r) * scale; // row 1 at the bottom
    line.forEach((colour, c) => {
      ctx.fillStyle = project.palette[colour]?.hex ?? "#999";
      ctx.fillRect(c * scale, y, scale, scale);
    });
  });
}

import {
  autoThreshold,
  brightness,
  designWidth,
  fillLetterBodies,
  LETTERS,
  MAX_ROWS,
  pictureSection,
  proportionalRows,
  shownColumns,
  toCells,
  toMask,
  turnMask,
  type ColourIndex,
  type Mask,
  type PictureSectionOptions,
  type Project,
  type Target,
  type Turn,
} from "../mosaic";
import { $, el, hexToRgb } from "./ui";

/** Longest side the picture is read at: plenty for 400 stitches, and quick to work with. */
const MAX_SIDE = 1200;

export type PictureChoice = Omit<PictureSectionOptions, "id" | "width">;

/** The Import picture sheet. Calls `onAdd` with the picture cells and the chosen options. */
export function setUpImportPicture(getProject: () => Project, onAdd: (cells: boolean[][], opts: PictureChoice) => void) {
  const dlg = $("imgDlg");
  const form = $<HTMLFormElement>("imgForm");
  const fileInput = $<HTMLInputElement>("imgFile");
  const c1 = $<HTMLSelectElement>("imgC1");
  const c2 = $<HTMLSelectElement>("imgC2");
  const pic = $<HTMLSelectElement>("imgPic");
  const threshold = $<HTMLInputElement>("imgThreshold");
  const wIn = $<HTMLInputElement>("imgW");
  const hIn = $<HTMLInputElement>("imgH");
  const marginIn = $<HTMLInputElement>("imgMargin");
  const keep = $<HTMLInputElement>("imgKeep");
  const turnSel = $<HTMLSelectElement>("imgTurn");
  let opener: HTMLElement | null = null;
  let mode: "thin" | "thicken" = "thicken";

  // The picture, read once, and each later stage kept until something before it changes.
  let light: { data: Float32Array; width: number; height: number } | null = null;
  let maskKey = "";
  let mask: Mask | null = null;
  let cells: boolean[][] = [];
  let ready = false;
  let pending = 0;

  const int = (input: HTMLInputElement, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(input.value) || lo)));
  const turn = () => Number(turnSel.value) as Turn;

  function luminance(project: Project, c: ColourIndex) {
    const [r, g, b] = hexToRgb(project.palette[c]?.hex ?? "#888888");
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function colourOptions(select: HTMLSelectElement, project: Project, only?: ColourIndex[]) {
    const keepValue = select.value;
    const list = only ?? project.palette.map((_, i) => i);
    select.replaceChildren(...list.map((i) => Object.assign(el("option", { text: `${LETTERS[i]} ${project.palette[i]!.name}` }), { value: String(i) })));
    if (list.includes(Number(keepValue)) && keepValue !== "") select.value = keepValue;
  }

  function fillPictureColour(project: Project) {
    const a = Number(c1.value);
    const b = Number(c2.value);
    const before = pic.value;
    colourOptions(pic, project, a === b ? [a] : [a, b]);
    if (before === "" || ![String(a), String(b)].includes(before)) pic.value = String(luminance(project, a) <= luminance(project, b) ? a : b);
  }

  function open() {
    const project = getProject();
    opener = document.activeElement as HTMLElement | null;
    colourOptions(c1, project);
    colourOptions(c2, project);
    if (c1.value === c2.value || c1.value === "") {
      c1.value = "0";
      c2.value = "1";
    }
    fillPictureColour(project);
    wIn.max = String(designWidth(project));
    if (!light) wIn.value = String(designWidth(project));
    wIn.value = String(Math.min(int(wIn, 1, designWidth(project)), designWidth(project)));
    dlg.hidden = false;
    if (light) update();
    $("imgChoose").focus();
  }

  function close() {
    dlg.hidden = true;
    opener?.focus();
  }

  async function load(file: File) {
    $("imgFileName").textContent = file.name;
    const sum = $("imgSum");
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      light = { data: brightness(ctx.getImageData(0, 0, w, h)), width: w, height: h };
      maskKey = "";
      threshold.value = String(autoThreshold(light.data));
      const name = $<HTMLInputElement>("imgName");
      name.value = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Picture";
      $("imgBody").hidden = false;
      wIn.value = String(designWidth(getProject()));
      keep.checked = true;
      update();
    } catch {
      light = null;
      $("imgBody").hidden = false;
      sum.replaceChildren(el("div", { text: "Couldn't read that picture. Try a PNG, JPG or WebP file." }));
      $<HTMLButtonElement>("imgAdd").disabled = true;
    }
  }

  /** Width ↔ height when keeping proportions. */
  function syncSize(changed: "w" | "h" | "turn") {
    if (!light || !mask || !keep.checked) return;
    const max = designWidth(getProject());
    if (changed === "h") {
      const h = int(hIn, 1, MAX_ROWS);
      wIn.value = String(Math.max(1, Math.min(max, Math.round((h * mask.width) / mask.height))));
    } else {
      hIn.value = String(Math.min(MAX_ROWS, proportionalRows(mask, int(wIn, 1, max))));
    }
  }

  function buildMask() {
    if (!light) return;
    const key = [threshold.value, $<HTMLInputElement>("imgSwap").checked, $<HTMLInputElement>("imgFill").checked, turnSel.value].join("|");
    if (key === maskKey && mask) return;
    maskKey = key;
    let m = toMask(light.data, light.width, light.height, Number(threshold.value), $<HTMLInputElement>("imgSwap").checked);
    if ($<HTMLInputElement>("imgFill").checked) m = fillLetterBodies(m);
    mask = turnMask(m, turn());
  }

  function choice(): PictureChoice {
    const project = getProject();
    return {
      name: $<HTMLInputElement>("imgName").value,
      pictureWidth: int(wIn, 1, designWidth(project)),
      pictureRows: int(hIn, 1, MAX_ROWS),
      marginRows: int(marginIn, 0, 100),
      rowColours: [Number(c1.value), Number(c2.value)],
      pictureColour: Number(pic.value),
      mode,
    };
  }

  function update(changed?: "w" | "h" | "turn") {
    $("imgThresholdVal").textContent = threshold.value;
    if (!light) return;
    buildMask();
    syncSize(changed === "h" ? "h" : "w");
    if (!hIn.value && mask) hIn.value = String(Math.min(MAX_ROWS, proportionalRows(mask, int(wIn, 1, designWidth(getProject())))));
    // Redraw at most once per frame while sliders move.
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(draw);
  }

  function draw() {
    if (!mask) return;
    const project = getProject();
    const opts = choice();
    const sum: string[] = [];
    ready = opts.rowColours[0] !== opts.rowColours[1];
    if (!ready) {
      sum.push("Row 1 and row 2 need different colours.");
    } else {
      cells = toCells(mask, opts.pictureWidth, opts.pictureRows);
      const res = pictureSection(cells, { ...opts, id: "preview", width: designWidth(project) });
      paint($<HTMLCanvasElement>("imgTarget"), project, res.target);
      const missed = new Set(res.misses.map((m) => `${m.row}:${m.col}`));
      paint($<HTMLCanvasElement>("imgResult"), project, shownColumns(res.section), $<HTMLInputElement>("imgRed").checked ? missed : undefined);
      const rows = res.section.rows.length;
      sum.push(`New section: ${designWidth(project)} stitches × ${rows} rows, added on top of the arrangement.`);
      if (opts.pictureRows + 2 * opts.marginRows > MAX_ROWS) sum.push(`That's more than ${MAX_ROWS} rows, so the top is cut off.`);
      sum.push(
        res.misses.length
          ? `${res.misses.length} stitch${res.misses.length === 1 ? "" : "es"} differ from the picture, at edges where a shape can't start or end on a row of its own colour. Try ${mode === "thicken" ? "Thin" : "Thicken"} to see if it looks better.`
          : "Every stitch matches the picture.",
      );
    }
    $("imgSum").replaceChildren(...sum.map((t) => el("div", { text: t })));
    $<HTMLButtonElement>("imgAdd").disabled = !ready;
  }

  /** One pixel per stitch, row 1 at the bottom, stitch 1 on the right; red where `missed`. */
  function paint(canvas: HTMLCanvasElement, project: Project, grid: Target, missed?: Set<string>) {
    const h = grid.length;
    const w = grid[0]?.length ?? 0;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx || !w || !h) return;
    const rgb = project.palette.map((y) => hexToRgb(y.hex));
    const img = ctx.createImageData(w, h);
    grid.forEach((line, r) => {
      line.forEach((colour, s) => {
        const [cr, cg, cb] = missed?.has(`${r}:${s}`) ? [255, 31, 61] : (rgb[colour ?? 0] ?? [153, 153, 153]);
        const o = ((h - 1 - r) * w + (w - 1 - s)) * 4;
        img.data[o] = cr;
        img.data[o + 1] = cg;
        img.data[o + 2] = cb;
        img.data[o + 3] = 255;
      });
    });
    ctx.putImageData(img, 0, 0);
  }

  function setMode(m: "thin" | "thicken") {
    mode = m;
    $("imgThicken").setAttribute("aria-pressed", String(m === "thicken"));
    $("imgThin").setAttribute("aria-pressed", String(m === "thin"));
    update();
  }

  $("imgChoose").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) void load(file);
  });
  for (const s of [c1, c2]) s.addEventListener("change", () => (fillPictureColour(getProject()), update()));
  wIn.addEventListener("input", () => update("w"));
  hIn.addEventListener("input", () => update("h"));
  turnSel.addEventListener("change", () => update("turn"));
  keep.addEventListener("change", () => update("w"));
  form.addEventListener("input", (e) => {
    if (e.target !== wIn && e.target !== hIn && e.target !== turnSel) update();
  });
  $("imgThicken").addEventListener("click", () => setMode("thicken"));
  $("imgThin").addEventListener("click", () => setMode("thin"));
  $("imgCancel").addEventListener("click", close);
  dlg.addEventListener("pointerdown", (e) => e.target === dlg && close());
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!light || !mask) return;
    cancelAnimationFrame(pending);
    draw();
    if (!ready) return;
    const opts = choice();
    dlg.hidden = true;
    onAdd(cells, opts);
  });

  return { open };
}

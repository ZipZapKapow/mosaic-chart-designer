import { createProject, LETTERS, type Project } from "../mosaic";
import { $ } from "./ui";

type Mode = "total" | "repeats";

interface Reading {
  mode: Mode;
  width: number; // design width (without border stitches)
  repeatWidth: number | null;
  repeats: number;
  spare: number;
  rows: number;
  first: number;
  foundationRows: number;
}

const num = (id: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number($<HTMLInputElement>(id).value) || lo)));

/** The New project sheet. Calls `onCreate` with the new project. */
export function setUpNewProject(onCreate: (p: Project) => void, projectCount: () => number) {
  const dlg = $("newDlg");
  const form = $<HTMLFormElement>("newForm");
  let mode: Mode = "total";
  let opener: HTMLElement | null = null;

  function read(): Reading {
    const base = { mode, rows: num("npRows", 2, 2000), first: Number($<HTMLSelectElement>("npFirst").value), foundationRows: num("npFR", 1, 3) };
    if (mode === "total") {
      const width = num("npTotal", 8, 400) - 2;
      if ($<HTMLSelectElement>("npStart").value === "free") return { ...base, width, repeatWidth: null, repeats: 1, spare: 0 };
      const w = Math.min(width, num("npTRep", 1, 398));
      const n = Math.floor(width / w);
      return { ...base, width, repeatWidth: w, repeats: n, spare: width - n * w };
    }
    const w = num("npW", 1, 398);
    const n = num("npN", 1, 200);
    const x = num("npX", 0, 200);
    const width = Math.min(398, w * n + x);
    return { ...base, width, repeatWidth: w, repeats: n, spare: width - w * n };
  }

  function summary() {
    $("npTRepField").hidden = $<HTMLSelectElement>("npStart").value !== "rep";
    const v = read();
    const fs = Math.floor(v.spare / 2);
    const ls = v.spare - fs;
    const spareLine = v.spare
      ? `Spare stitches: ${fs ? `${fs} first (FS) and ` : ""}${ls} last (LS).${v.spare % 2 ? " You can swap the odd one to the other side later." : ""}`
      : "No spare stitches: the repeats fill the width exactly.";
    const lines: string[] = [];
    if (v.mode === "total") {
      lines.push(`${v.width + 2} stitches per row: ${v.width} to design with, plus 2 border stitches. Foundation chain: ${v.width + 3}.`);
      lines.push(v.repeatWidth === null ? "Pattern 1 has no repeat: you draw across the whole width. You can add repeating sections later." : `A ${v.repeatWidth}-stitch repeat fits ${v.repeats} times. ${spareLine}`);
    } else {
      lines.push(`${v.repeatWidth} × ${v.repeats} + ${v.spare} spare = ${v.width} stitches between the border stitches, ${v.width + 2} per row.`, `Foundation chain: ${v.width + 3}.`, spareLine);
    }
    const other = v.first === 0 ? 1 : 0;
    const fr = Array.from({ length: v.foundationRows }, (_, k) => ((v.foundationRows - 1 - k) % 2 === 0 ? other : v.first));
    lines.push(`Rows: ${fr.map((c, j) => `FR${j + 1} ${LETTERS[c]}`).join(", ")}, then row 1 in ${LETTERS[v.first]}, alternating.`);
    $("npSum").replaceChildren(...lines.map((t) => Object.assign(document.createElement("div"), { textContent: t })));
  }

  function setMode(m: Mode) {
    mode = m;
    $("npModeTotal").setAttribute("aria-pressed", String(m === "total"));
    $("npModeRep").setAttribute("aria-pressed", String(m === "repeats"));
    $("npTotalBox").hidden = m !== "total";
    $("npRepBox").hidden = m !== "repeats";
    summary();
  }

  function open() {
    opener = document.activeElement as HTMLElement | null;
    const name = $<HTMLInputElement>("npName");
    name.value = `My mosaic project ${projectCount() + 1}`;
    dlg.hidden = false;
    setMode(mode);
    name.focus();
    name.select();
  }

  function close() {
    dlg.hidden = true;
    opener?.focus();
  }

  $("npModeTotal").addEventListener("click", () => setMode("total"));
  $("npModeRep").addEventListener("click", () => setMode("repeats"));
  $("npCancel").addEventListener("click", close);
  dlg.addEventListener("pointerdown", (e) => e.target === dlg && close());
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });
  form.addEventListener("input", summary);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = read();
    const val = (id: string) => $<HTMLInputElement>(id).value;
    const project = createProject({
      name: val("npName"),
      palette: [
        { name: val("npNameA").trim() || "Colour A", hex: val("npHexA") },
        { name: val("npNameB").trim() || "Colour B", hex: val("npHexB") },
      ],
      stitchesPerRow: v.width + 2,
      repeatWidth: v.repeatWidth,
      rows: v.rows,
      firstColour: v.first,
      foundationRows: v.foundationRows,
    });
    dlg.hidden = true;
    onCreate(project);
  });

  return { open };
}

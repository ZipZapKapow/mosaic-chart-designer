import {
  addColour,
  addFlippedCopy,
  addPictureSection,
  addRowOnTop,
  addSection,
  addStep,
  applySequence,
  BLOCK_MESSAGES,
  clearAllX,
  deleteSection,
  describeProblem,
  designWidth,
  fileNameFor,
  findProblems,
  foundationChain,
  hasRowOverrides,
  hasX,
  isOffCentre,
  layoutOf,
  LETTERS,
  MAX_COLOURS,
  mirrorRightToLeft,
  moveStep,
  parseProject,
  removeStep,
  removeTopRow,
  replaceSection,
  sectionStack,
  serialiseProject,
  setFoundationColour,
  setRowColour,
  setRowCount,
  setStitchesPerRow,
  setX,
  toNoRepeat,
  updateColour,
  wholeStack,
  withRepeatWidth,
  type Project,
  type Section,
} from "../mosaic";
import { drawStack } from "./canvas";
import { Chart, type CellTarget, type ChipTarget } from "./chart";
import { setUpImportPicture } from "./importPicture";
import { setUpNewProject } from "./newProject";
import { loadPrefs, savePrefs, type Prefs } from "./storage";
import { Store } from "./store";
import { $, applyPalette, button, colourLabel, el, hideNotice, notify, openMenu } from "./ui";

const ZOOM_MIN = 10;
const ZOOM_MAX = 40;

export function startEditor() {
  const store = new Store();
  const prefs: Prefs = loadPrefs();
  let selected = store.project.arrangement[0] ?? store.project.sections[0]!.id;
  let lastChartKey = "";
  let movedStep: number | null = null;
  /** Stitches a flipped copy couldn't make, shown in red until that section is changed. */
  let missMarks: { section: Section; keys: Set<string> } | null = null;

  const current = (): Section => {
    const p = store.project;
    let s = p.sections.find((x) => x.id === selected);
    if (!s) {
      s = p.sections.find((x) => x.id === p.arrangement[0]) ?? p.sections[0]!;
      selected = s.id;
    }
    return s;
  };
  const width = () => designWidth(store.project);
  const updateSection = (s: Section) => store.set(replaceSection(store.project, s));

  // ---------- Chart and painting X's ----------
  let drag: { want: boolean; changed: boolean; last: string; warned: boolean } | null = null;

  const chart = new Chart({
    onCellDown(t) {
      if (t.kind === "bs") return notify("Border stitches (BS) are always a double crochet through both loops, so they can't take an X.");
      if (t.kind === "foundation") return notify("Foundation rows are plain double crochet, so they can't take an X.");
      const s = current();
      drag = { want: !hasX(s, layoutOf(s, width()), t.row, t.stitch), changed: false, last: "", warned: false };
      paintAt(t);
    },
    onCellEnter(t) {
      if (drag && t.kind === "stitch") paintAt(t);
    },
    onChip: chooseRowColour,
  });
  $("chartScroll").append(chart.el);

  function paintAt(t: Extract<CellTarget, { kind: "stitch" }>) {
    if (!drag) return;
    const key = `${t.row}:${t.stitch}`;
    if (drag.last === key) return;
    drag.last = key;
    const res = setX(current(), width(), t.row, t.stitch, drag.want);
    if (res.kind === "unchanged") return;
    if (res.kind === "blocked") {
      if (!drag.warned) {
        const prefix =
          res.reason === "x-below"
            ? `Can't add an X on row ${t.row + 1}: row ${t.row} already has an X in this stitch. `
            : res.reason === "x-above"
              ? `Can't add an X on row ${t.row + 1}: row ${t.row + 2} has an X directly above this stitch. `
              : "";
        notify(prefix + BLOCK_MESSAGES[res.reason]);
        drag.warned = true;
      }
      if (res.conflictRow !== undefined) chart.flash(res.conflictRow, t.stitch);
      return;
    }
    if (!drag.changed) {
      store.checkpoint();
      drag.changed = true;
    }
    store.set(replaceSection(store.project, res.section), { undo: false, quiet: true });
    chart.refreshAfterX(store.project, res.section, t.row);
    drawWhole();
    if (res.noVisibleEffect) {
      notify(`X added. Row ${t.row} is the same colour as row ${t.row + 1}, so this X won't change what you see.`, "info");
    }
  }

  const endDrag = () => {
    if (drag?.changed) store.refresh();
    drag = null;
  };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  function chooseRowColour(target: ChipTarget, anchor: HTMLElement) {
    const p = store.project;
    const title = target.kind === "foundation" ? `Foundation row ${target.index + 1} colour` : `Row ${target.row + 1} colour`;
    openMenu(
      anchor,
      title,
      p.palette.map((y, i) => ({
        label: colourLabel(p.palette, i),
        swatch: y.hex,
        onPick: () => {
          if (target.kind === "foundation") store.set(setFoundationColour(store.project, target.index, i));
          else updateSection(setRowColour(current(), target.row, i));
        },
      })),
    );
  }

  // ---------- Rendering ----------
  function drawWhole() {
    const p = store.project;
    const canvas = $<HTMLCanvasElement>("wholeCanvas");
    const stack = wholeStack(p);
    drawStack(canvas, p, stack);
    const scale = Math.max(1, Math.min(4, Math.floor(264 / p.stitchesPerRow)));
    canvas.style.width = `${p.stitchesPerRow * scale}px`;
    canvas.style.height = `${stack.length * scale}px`;
    $("wholeMeta").textContent = `${p.stitchesPerRow} sts × ${stack.length} rows`;
    // Tall designs scroll; a newly opened project starts at row 1, at the bottom.
    if (wholeShownFor !== store.id) {
      const box = $("wholeScroll");
      box.scrollTop = box.scrollHeight;
      wholeShownFor = store.id;
    }
  }
  let wholeShownFor = "";

  function render() {
    const p = store.project;
    const s = current();
    applyPalette(p.palette);
    renderProjects();
    drawWhole();
    renderSections();
    renderArrangement();
    renderPalette();
    renderProjectCard();
    renderSectionSettings(s);
    $<HTMLButtonElement>("undoBtn").disabled = !store.canUndo;
    $<HTMLButtonElement>("redoBtn").disabled = !store.canRedo;

    const cell = prefs.view === "full" || s.repeatWidth === null ? Math.max(ZOOM_MIN, Math.round(prefs.zoom * 0.75)) : prefs.zoom;
    chart.render(p, s, { mode: prefs.view, cell, withFoundation: p.arrangement[0] === s.id });
    if (missMarks && missMarks.section !== s && !p.sections.includes(missMarks.section)) missMarks = null;
    if (missMarks?.section === s) chart.markMisses(p, s, missMarks.keys);
    // A different section (or project) starts scrolled to row 1, at the bottom.
    const key = `${store.id}:${s.id}`;
    if (key !== lastChartKey) {
      const scroll = $("chartScroll");
      scroll.scrollTop = scroll.scrollHeight;
      lastChartKey = key;
    }
  }
  store.subscribe(render);

  function renderProjects() {
    const sel = $<HTMLSelectElement>("projSelect");
    sel.replaceChildren(
      ...store.entries.map((e) => {
        const o = el("option", { text: e.id === store.id ? store.project.name : e.name });
        o.value = e.id;
        return o;
      }),
    );
    sel.value = store.id;
  }

  function renderSections() {
    const p = store.project;
    $("secList").replaceChildren(
      ...p.sections.map((s) => {
        const b = el("button", { className: "sec-item", type: "button" });
        b.setAttribute("aria-current", String(s.id === selected));
        const thumb = el("canvas");
        drawStack(thumb, p, sectionStack(p, s));
        const used = p.arrangement.filter((a) => a === s.id).length;
        const kind = s.repeatWidth === null ? "no repeat" : `${s.repeatWidth}-st repeat`;
        b.append(thumb, el("div", {}, el("div", { className: "nm", text: s.name }), el("div", { className: "meta", text: `${kind} · ${s.rows.length} rows · used ${used}×` })));
        b.addEventListener("click", () => select(s.id));
        return b;
      }),
    );
  }

  function renderArrangement() {
    const p = store.project;
    const list = $("arrList");
    const last = p.arrangement.length - 1;
    const items = p.arrangement.map((id, k) => {
      const sec = p.sections.find((s) => s.id === id)!;
      const li = el("li", { className: "arr-row" + (id === selected ? " current" : "") + (movedStep === k ? " moved" : "") });
      li.draggable = true;
      li.dataset.k = String(k);
      const name = button(sec.name, () => select(id), { className: "t", title: `Open ${sec.name}` });
      // Shown bottom-up like the fabric: step 1 at the bottom, so ↑ means later in the work.
      const acts = el(
        "span",
        { className: "acts" },
        button("↑", () => doMove(k, k + 1), { label: `Move step ${k + 1} up (later)`, disabled: k === last }),
        button("↓", () => doMove(k, k - 1), { label: `Move step ${k + 1} down (earlier)`, disabled: k === 0 }),
        button("×", () => {
          if (store.project.arrangement.length <= 1) return notify("The arrangement needs at least one step.");
          store.set(removeStep(store.project, k));
        }, { label: `Remove step ${k + 1}` }),
      );
      li.append(el("span", { className: "grip", text: "⋮⋮", title: "Drag to move" }), el("span", { className: "n", text: String(k + 1) }), name, acts);
      return li;
    });
    list.replaceChildren(...items.reverse());
    movedStep = null;

    const sel = $<HTMLSelectElement>("arrSelect");
    const keep = sel.value;
    sel.replaceChildren(
      ...p.sections.map((s) => {
        const o = el("option", { text: s.name });
        o.value = s.id;
        return o;
      }),
    );
    sel.value = p.sections.some((s) => s.id === keep) ? keep : selected;

    const stack = wholeStack(p);
    const problems = findProblems(p, stack);
    const joins = $("joins");
    if (problems.length) {
      joins.className = "joins bad";
      const more = problems.length > 1 ? ` (${problems.length} clashes in all.)` : "";
      joins.textContent = "⚠ " + describeProblem(p, stack, problems[0]!) + more;
    } else {
      joins.className = "joins ok";
      joins.textContent = "✓ All joins between sections are OK";
    }
  }

  function doMove(from: number, to: number) {
    const next = moveStep(store.project, from, to);
    if (next === store.project) return;
    movedStep = to;
    store.set(next);
    const dir = from < to ? "later" : "earlier";
    const b = document.querySelector<HTMLButtonElement>(`#arrList li[data-k="${to}"] .acts button[aria-label*="${dir}"]`);
    if (b && !b.disabled) b.focus();
  }

  let colourEditing = false;
  function renderPalette() {
    const p = store.project;
    $("palList").replaceChildren(
      ...p.palette.map((y, i) => {
        const colour = el("input", { label: `Colour ${LETTERS[i]}` });
        colour.type = "color";
        colour.value = y.hex;
        colour.addEventListener("input", () => {
          if (!colourEditing) {
            store.checkpoint();
            colourEditing = true;
          }
          store.set(updateColour(store.project, i, { hex: colour.value }), { undo: false, quiet: true });
          applyPalette(store.project.palette);
          drawWhole();
        });
        colour.addEventListener("change", () => {
          colourEditing = false;
          store.refresh();
        });
        const name = el("input", { label: `Name of colour ${LETTERS[i]}` });
        name.type = "text";
        name.value = y.name;
        name.addEventListener("change", () => {
          const v = name.value.trim();
          if (!v) return render();
          store.set(updateColour(store.project, i, { name: v }));
        });
        return el("div", { className: "pal-row" }, el("span", { className: "letter", text: LETTERS[i] }), colour, name);
      }),
    );
    $<HTMLButtonElement>("addColour").disabled = p.palette.length >= MAX_COLOURS;
  }

  function setValue(id: string, value: string) {
    const input = $<HTMLInputElement>(id);
    if (document.activeElement !== input && input.value !== value) input.value = value;
  }

  function renderProjectCard() {
    const p = store.project;
    setValue("projName", p.name);
    setValue("widthInput", String(p.stitchesPerRow));
    $("chainInfo").textContent = `Includes the 2 border stitches, so ${width()} to design with. Foundation chain: ${foundationChain(p)}.`;
  }

  function renderSectionSettings(s: Section) {
    const p = store.project;
    const layout = layoutOf(s, width());
    const noRepeat = s.repeatWidth === null;
    $("secTitle").textContent = s.name;
    const parts = [noRepeat ? `No repeat · ${layout.width} stitches across` : `${layout.motifWidth}-stitch repeat × ${layout.repeats}`];
    if (layout.first) parts.push(`${layout.first} first stitch${layout.first > 1 ? "es" : ""} (FS)`);
    if (layout.last) parts.push(`${layout.last} last stitch${layout.last > 1 ? "es" : ""} (LS)`);
    parts.push("2 border stitches", `${s.rows.length} rows`);
    $("secSum").textContent = parts.join(" · ");

    setValue("secName", s.name);
    setValue("motifInput", String(layout.motifWidth));
    $<HTMLInputElement>("motifInput").disabled = noRepeat;
    $<HTMLInputElement>("motifInput").max = String(layout.width);
    $<HTMLInputElement>("noRepeat").checked = noRepeat;
    $("fillField").hidden = noRepeat || layout.spare === 0;
    $("fillContinue").setAttribute("aria-pressed", String(s.spareFill === "continue"));
    $("fillPlain").setAttribute("aria-pressed", String(s.spareFill === "plain"));
    $("sideField").hidden = layout.spare % 2 === 0;
    $("sideLeft").setAttribute("aria-pressed", String(s.oddSpareSide === "left"));
    $("sideRight").setAttribute("aria-pressed", String(s.oddSpareSide === "right"));
    setValue("rowsInput", String(s.rows.length));
    $("viewSeg").hidden = noRepeat;
    $("viewRepeat").setAttribute("aria-pressed", String(prefs.view === "repeat"));
    $("viewFull").setAttribute("aria-pressed", String(prefs.view === "full"));

    const note = $("centreNote");
    note.hidden = !isOffCentre(layout);
    if (!note.hidden) {
      note.textContent = `${layout.spare} spare stitches can't split evenly: ${layout.first} go${layout.first === 1 ? "es" : ""} before the repeats (right) and ${layout.last} after (left), so this band sits 1 stitch off-centre. Use "Odd spare stitch goes" to swap sides, or change the width by 1 to centre it.`;
    }
    renderSequence(s, p);
  }

  function renderSequence(s: Section, p: Project) {
    const box = $("seqBox");
    const seq = s.colourSequence;
    const parts: Node[] = [];
    seq.forEach((c, k) => {
      if (k) parts.push(el("span", { className: "hint", text: "then" }));
      const sel = el("select", { label: `Colour ${k + 1} in the sequence` });
      p.palette.forEach((_, i) => {
        const o = el("option", { text: colourLabel(p.palette, i) });
        o.value = String(i);
        sel.append(o);
      });
      sel.value = String(c);
      sel.addEventListener("change", () => setSequence(seq.map((v, j) => (j === k ? Number(sel.value) : v))));
      parts.push(sel);
    });
    parts.push(button("+", () => setSequence([...seq, seq[seq.length % 2] ?? seq[0]!]), { className: "btn small", label: "Add a colour to the sequence" }));
    if (seq.length > 1) parts.push(button("−", () => setSequence(seq.slice(0, -1)), { className: "btn small", label: "Remove the last colour from the sequence" }));
    if (hasRowOverrides(s)) parts.push(el("span", { className: "hint", text: "Some rows changed by hand. Changing the sequence resets them." }));
    box.replaceChildren(...parts);
  }

  function setSequence(seq: number[]) {
    updateSection(applySequence(current(), seq));
    notify(
      new Set(seq).size === 1
        ? `Every row is now colour ${LETTERS[seq[0]!]}. X's won't show until rows differ in colour.`
        : `Rows recoloured: ${seq.map((c) => LETTERS[c]).join(", ")}, repeating up the section. Undo to go back.`,
      "info",
    );
  }

  function select(id: string) {
    if (id === selected) return;
    selected = id;
    hideNotice();
    render();
  }

  // ---------- Whole design: click to open a section ----------
  $("wholeCanvas").addEventListener("click", (e) => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const stack = wholeStack(store.project);
    const fromTop = Math.floor(((e.clientY - rect.top) / rect.height) * stack.length);
    const src = stack[stack.length - 1 - fromTop]?.source;
    if (src?.kind === "section") select(src.sectionId);
    else if (src) select(store.project.arrangement[0]!);
  });

  // ---------- Section settings ----------
  $<HTMLInputElement>("secName").addEventListener("change", (e) => {
    const v = (e.target as HTMLInputElement).value.trim();
    if (!v) return render();
    updateSection({ ...current(), name: v });
  });
  $<HTMLInputElement>("motifInput").addEventListener("change", (e) => {
    const v = Math.max(1, Math.min(width(), Math.round(Number((e.target as HTMLInputElement).value) || 1)));
    const s = current();
    if (v === s.repeatWidth) return render();
    updateSection(withRepeatWidth(s, v, width()));
  });
  $<HTMLInputElement>("noRepeat").addEventListener("change", (e) => {
    const s = current();
    if ((e.target as HTMLInputElement).checked) {
      updateSection(toNoRepeat(s, width()));
      notify("This section now has no repeat. Every stitch across the width can be edited on its own.", "info");
    } else {
      const w = Math.min(12, width());
      updateSection(withRepeatWidth(s, w, width()));
      notify(`This section repeats again, every ${w} stitches, keeping the right-hand ${w} stitches of the pattern. Change the repeat width to suit, or undo.`, "info");
    }
  });
  $("fillContinue").addEventListener("click", () => updateSection({ ...current(), spareFill: "continue" }));
  $("fillPlain").addEventListener("click", () => updateSection({ ...current(), spareFill: "plain" }));
  $("sideLeft").addEventListener("click", () => updateSection({ ...current(), oddSpareSide: "left" }));
  $("sideRight").addEventListener("click", () => updateSection({ ...current(), oddSpareSide: "right" }));
  $<HTMLInputElement>("rowsInput").addEventListener("change", (e) => {
    const s = current();
    const next = setRowCount(s, Number((e.target as HTMLInputElement).value) || s.rows.length, width());
    if (next === s) return render();
    updateSection(next);
    if (next.rows.length < s.rows.length) notify(`Removed ${s.rows.length - next.rows.length} rows from the top. Undo brings them back.`, "info");
  });
  $("rowAdd").addEventListener("click", () => updateSection(addRowOnTop(current(), width())));
  $("rowDel").addEventListener("click", () => {
    const s = current();
    if (s.rows.length <= 2) return notify("A section needs at least 2 rows.");
    updateSection(removeTopRow(s));
  });

  // ---------- Toolbar ----------
  $("undoBtn").addEventListener("click", () => store.undo());
  $("redoBtn").addEventListener("click", () => store.redo());
  $("mirrorBtn").addEventListener("click", () => {
    const s = current();
    const w = layoutOf(s, width()).motifWidth;
    updateSection(mirrorRightToLeft(s));
    notify(`Mirrored: stitches ${Math.ceil(w / 2) + 1}–${w} now copy stitches 1–${Math.floor(w / 2)} in reverse.`, "info");
  });
  $("flipBtn").addEventListener("click", (e) => {
    const s = current();
    openMenu(e.currentTarget as HTMLElement, "Duplicate flipped", [
      { label: "Turn upside down (rotate 180°)", onPick: () => duplicateFlipped(s.id, true) },
      { label: "Flip top to bottom only (mirror image)", onPick: () => duplicateFlipped(s.id, false) },
    ]);
  });

  const importPicture = setUpImportPicture(
    () => store.project,
    (cells, opts) => {
      const res = addPictureSection(store.project, cells, opts);
      selected = res.id;
      const added = res.project.sections.find((s) => s.id === res.id)!;
      missMarks = res.misses.length ? { section: added, keys: new Set(res.misses.map((m) => `${m.row}:${m.col}`)) } : null;
      store.set(res.project);
      const n = res.misses.length;
      notify(
        `Added ${added.name} on top of the arrangement: move it into place with ↑ ↓. ` +
          (n ? `${n} stitch${n === 1 ? "" : "es"} that differ${n === 1 ? "s" : ""} from the picture ${n === 1 ? "is" : "are"} outlined in red. ` : "") +
          "It's an ordinary section now, so you can edit it like any other.",
        "info",
      );
    },
  );
  $("importBtn").addEventListener("click", () => {
    if (store.project.palette.length < 2) return notify("A picture needs two colours: add another yarn colour first.");
    importPicture.open();
  });

  function duplicateFlipped(id: string, rotate: boolean) {
    const res = addFlippedCopy(store.project, id, rotate);
    selected = res.id;
    const copy = res.project.sections.find((s) => s.id === res.id)!;
    missMarks = res.misses.length ? { section: copy, keys: new Set(res.misses.map((m) => `${m.row}:${m.col}`)) } : null;
    store.set(res.project);
    const where = `Added ${copy.name} on top of the arrangement.`;
    if (!res.misses.length) return notify(`${where} Its X's were worked out again, and every stitch matches the original.`, "info");
    const rows = [...new Set(res.misses.map((m) => m.row + 1))].sort((a, b) => a - b);
    notify(
      `${where} ${res.misses.length} stitch${res.misses.length === 1 ? "" : "es"} on row${rows.length === 1 ? "" : "s"} ${rows.join(", ")} can't match and ${res.misses.length === 1 ? "is" : "are"} outlined in red. ` +
        "This usually happens where the original's bottom row took its colour from an X above: turned over, that row has nothing above it. Edit them by hand, or ignore them if the next section covers it.",
      "info",
    );
  }

  $("clearBtn").addEventListener("click", () => updateSection(clearAllX(current())));
  $("delSection").addEventListener("click", () => {
    const p = store.project;
    if (p.sections.length <= 1) return notify("A project needs at least one section.");
    const s = current();
    const i = p.sections.findIndex((x) => x.id === s.id);
    const next = deleteSection(p, s.id);
    selected = next.sections[Math.max(0, i - 1)]!.id;
    store.set(next);
    notify(`Deleted ${s.name}. Undo brings it back.`, "info");
  });
  const setPrefs = (change: Partial<Prefs>) => {
    Object.assign(prefs, change);
    savePrefs(prefs);
    render();
  };
  $("zoomIn").addEventListener("click", () => setPrefs({ zoom: Math.min(ZOOM_MAX, prefs.zoom + 4) }));
  $("zoomOut").addEventListener("click", () => setPrefs({ zoom: Math.max(ZOOM_MIN, prefs.zoom - 4) }));
  $("viewRepeat").addEventListener("click", () => setPrefs({ view: "repeat" }));
  $("viewFull").addEventListener("click", () => setPrefs({ view: "full" }));

  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
    if ((e.target as Element).closest("input, select, textarea") || !$("newDlg").hidden) return;
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  });

  // ---------- Sidebar actions ----------
  $("addSection").addEventListener("click", () => {
    const { project, id } = addSection(store.project);
    selected = id;
    store.set(addStep(project, id));
    const name = store.project.sections.find((s) => s.id === id)!.name;
    notify(`Added ${name} on top of the arrangement. Move it with ↑ ↓ if it belongs somewhere else.`, "info");
  });
  $("arrAdd").addEventListener("click", () => store.set(addStep(store.project, $<HTMLSelectElement>("arrSelect").value)));
  $("addColour").addEventListener("click", () => {
    store.set(addColour(store.project));
    const i = store.project.palette.length - 1;
    notify(`Added colour ${LETTERS[i]}. Change its shade and name in Yarn colours, then use it in a row colour sequence or on single rows.`, "info");
  });
  $<HTMLInputElement>("projName").addEventListener("change", (e) => {
    const v = (e.target as HTMLInputElement).value.trim();
    if (!v) return render();
    store.set({ ...store.project, name: v });
  });
  $<HTMLInputElement>("widthInput").addEventListener("change", (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    if (!v) return render();
    const next = setStitchesPerRow(store.project, v);
    if (next === store.project) return render();
    store.set(next);
  });

  // Arrangement drag and drop
  const arrList = $("arrList");
  let dragFrom: number | null = null;
  const clearMarks = () => arrList.querySelectorAll(".drop-before, .drop-after").forEach((e) => e.classList.remove("drop-before", "drop-after"));
  arrList.addEventListener("dragstart", (e) => {
    const li = (e.target as Element).closest<HTMLElement>(".arr-row");
    if (!li) return;
    dragFrom = Number(li.dataset.k);
    li.classList.add("dragging");
    e.dataTransfer?.setData("text/plain", String(dragFrom));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  });
  arrList.addEventListener("dragover", (e) => {
    const li = (e.target as Element).closest<HTMLElement>(".arr-row");
    if (!li || dragFrom === null) return;
    e.preventDefault();
    clearMarks();
    const r = li.getBoundingClientRect();
    li.classList.add(e.clientY < r.top + r.height / 2 ? "drop-before" : "drop-after");
  });
  arrList.addEventListener("drop", (e) => {
    const li = (e.target as Element).closest<HTMLElement>(".arr-row");
    if (!li || dragFrom === null) return;
    e.preventDefault();
    const k = Number(li.dataset.k);
    const r = li.getBoundingClientRect();
    // The upper half of a step on screen means later in the work.
    let to = e.clientY < r.top + r.height / 2 ? k + 1 : k;
    if (to > dragFrom) to -= 1;
    const from = dragFrom;
    dragFrom = null;
    clearMarks();
    doMove(from, to);
  });
  arrList.addEventListener("dragend", () => {
    dragFrom = null;
    clearMarks();
    arrList.querySelectorAll(".dragging").forEach((e) => e.classList.remove("dragging"));
  });

  // ---------- Projects and files ----------
  const switchedProject = () => {
    selected = store.project.arrangement[0] ?? store.project.sections[0]!.id;
    hideNotice();
  };
  $<HTMLSelectElement>("projSelect").addEventListener("change", (e) => {
    const id = (e.target as HTMLSelectElement).value;
    const before = store.id;
    store.flush();
    const p = store.entries.find((x) => x.id === id);
    if (!p) return;
    selected = "";
    if (!store.open(id)) {
      notify(`Couldn't open ${p.name}: it's missing from this browser's storage.`);
      selected = current().id;
      $<HTMLSelectElement>("projSelect").value = before;
      return;
    }
  });
  store.subscribe(() => {
    if (!store.project.sections.some((s) => s.id === selected)) switchedProject();
  });

  const newProject = setUpNewProject((p) => {
    selected = "";
    store.add(p);
    notify(`Created ${p.name}. Every row is plain so far: click stitches to add X's. Your other projects are in the project menu.`, "info");
  }, () => store.entries.length);
  $("newProjBtn").addEventListener("click", newProject.open);

  function saveBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $("downloadBtn").addEventListener("click", () => {
    store.flush();
    saveBlob(new Blob([serialiseProject(store.project)], { type: "application/json" }), fileNameFor(store.project));
  });

  const pdfBtn = $<HTMLButtonElement>("pdfBtn");
  pdfBtn.addEventListener("click", async () => {
    const project = store.project;
    if (!project.arrangement.length) return notify("Add a section to the arrangement first: the PDF follows the arrangement.");
    pdfBtn.disabled = true;
    pdfBtn.textContent = "Making PDF…";
    try {
      // The PDF code is loaded only when it's needed.
      const { buildPdf } = await import("../pdf/pdf");
      const bytes = await buildPdf(project);
      saveBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), fileNameFor(project).replace(/\.mosaic\.json$/, ".pdf"));
      const unused = project.sections.filter((s) => !project.arrangement.includes(s.id)).length;
      notify(
        "PDF downloaded. Open it in a PDF app to tap the tick boxes." +
          (unused ? ` ${unused} section${unused === 1 ? " isn't" : "s aren't"} in the arrangement, so ${unused === 1 ? "it's" : "they're"} left out.` : ""),
        "info",
      );
    } catch (err) {
      notify(`Couldn't make the PDF${err instanceof Error ? `: ${err.message}` : "."}`);
    } finally {
      pdfBtn.disabled = false;
      pdfBtn.textContent = "Download PDF";
    }
  });

  const fileInput = $<HTMLInputElement>("fileInput");
  $("openFileBtn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const project = parseProject(await file.text());
      selected = "";
      store.add(project);
      notify(`Opened ${project.name}. It's saved in this browser too, as a separate copy.`, "info");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Couldn't open that file.");
    }
  });

  $("deleteProjBtn").addEventListener("click", () => {
    const name = store.project.name;
    const ok = window.confirm(`Delete "${name}" from this browser?\n\nThis can't be undone. Download a file first if you might want it again.`);
    if (!ok) return;
    selected = "";
    store.removeCurrent();
    notify(`Deleted ${name}.`, "info");
  });

  // ---------- Saving ----------
  const saveState = $("saveState");
  store.onSaveState = (state) => {
    saveState.className = "save-state" + (state === "failed" ? " failed" : "");
    saveState.textContent =
      state === "saved" ? "Saved in this browser" : state === "saving" ? "Saving…" : "Couldn't save in this browser: download a file to keep your work";
  };
  store.onSaveState(store.saveState);
  window.addEventListener("pagehide", () => store.flush());
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && store.flush());

  render();
}

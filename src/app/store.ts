import { exampleProject, type Project } from "../mosaic";
import * as storage from "./storage";

export type SaveState = "saved" | "saving" | "failed";

const UNDO_LIMIT = 200;
const SAVE_DELAY = 400;

/**
 * Holds the open project, its undo history and the list of projects saved in
 * this browser. Projects are immutable, so undo just keeps earlier versions.
 */
export class Store {
  project: Project;
  id: string;
  entries: storage.Entry[];
  saveState: SaveState = "saved";
  private undoStack: Project[] = [];
  private redoStack: Project[] = [];
  private saveTimer: number | undefined;
  private listeners = new Set<() => void>();
  onSaveState: (state: SaveState) => void = () => {};

  constructor() {
    this.entries = storage.loadIndex();
    const wanted = storage.loadCurrentId();
    const order = [wanted, ...this.entries.map((e) => e.id)].filter((x): x is string => !!x);
    for (const id of order) {
      const p = storage.loadProject(id);
      if (p && this.entries.some((e) => e.id === id)) {
        this.project = p;
        this.id = id;
        return;
      }
    }
    // Nothing saved yet (or storage unavailable): start with the example.
    this.id = storage.newId();
    this.project = exampleProject();
    this.entries = [{ id: this.id, name: this.project.name, updated: Date.now() }, ...this.entries];
    this.saveNow();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** Remember the current version so the next change(s) can be undone in one step. */
  checkpoint() {
    this.undoStack.push(this.project);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  /**
   * Change the project. By default this is one undo step and everything redraws.
   * `undo: false` skips the undo step (after a checkpoint); `quiet` skips the redraw.
   */
  set(next: Project, opts: { undo?: boolean; quiet?: boolean } = {}) {
    if (next === this.project) return;
    if (opts.undo !== false) this.checkpoint();
    this.project = next;
    this.scheduleSave();
    if (!opts.quiet) this.emit();
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.project);
    this.project = prev;
    this.scheduleSave();
    this.emit();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.project);
    this.project = next;
    this.scheduleSave();
    this.emit();
  }

  /** Redraw without changing anything (e.g. after a quiet change). */
  refresh() {
    this.emit();
  }

  private setSaveState(s: SaveState) {
    this.saveState = s;
    this.onSaveState(s);
  }

  private scheduleSave() {
    this.setSaveState("saving");
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), SAVE_DELAY);
  }

  /** Write the open project and the project list to browser storage now. */
  saveNow() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    const entry = this.entries.find((e) => e.id === this.id);
    if (entry) {
      entry.name = this.project.name;
      entry.updated = Date.now();
    }
    const ok =
      storage.saveProject(this.id, this.project) && storage.saveIndex(this.entries) && storage.saveCurrentId(this.id);
    this.setSaveState(ok ? "saved" : "failed");
  }

  /** Save any pending change straight away (when leaving the page). */
  flush() {
    if (this.saveTimer !== undefined) this.saveNow();
  }

  /** Open a project saved in this browser. */
  open(id: string) {
    if (id === this.id) return;
    this.flush();
    const p = storage.loadProject(id);
    if (!p) return false;
    this.id = id;
    this.project = p;
    this.undoStack = [];
    this.redoStack = [];
    storage.saveCurrentId(id);
    this.emit();
    return true;
  }

  /** Add a project (new or from a file) to this browser and open it. */
  add(project: Project) {
    this.flush();
    this.id = storage.newId();
    this.project = project;
    this.entries = [{ id: this.id, name: project.name, updated: Date.now() }, ...this.entries];
    this.undoStack = [];
    this.redoStack = [];
    this.saveNow();
    this.emit();
  }

  /** Remove the open project from this browser, then open another (or the example). */
  removeCurrent() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    storage.deleteProject(this.id);
    this.entries = this.entries.filter((e) => e.id !== this.id);
    storage.saveIndex(this.entries);
    const next = this.entries.find((e) => storage.loadProject(e.id));
    if (next) {
      this.id = "";
      this.open(next.id);
    } else {
      this.add(exampleProject());
    }
  }
}

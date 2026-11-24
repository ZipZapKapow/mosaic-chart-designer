import { parseProject, serialiseProject, type Project } from "../mosaic";

/**
 * Autosave in this browser's local storage. Every access is wrapped, because
 * storage can be full, blocked or cleared (private windows, site data settings).
 */
const PREFIX = "mosaic.v1.";

export interface Entry {
  id: string;
  name: string;
  updated: number;
}

export interface Prefs {
  zoom: number;
  view: "repeat" | "full";
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function loadIndex(): Entry[] {
  try {
    const data: unknown = JSON.parse(read("index") ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e): e is Entry => typeof e?.id === "string" && typeof e?.name === "string" && typeof e?.updated === "number",
    );
  } catch {
    return [];
  }
}

export const saveIndex = (entries: Entry[]) => write("index", JSON.stringify(entries));

export function loadProject(id: string): Project | null {
  const text = read("project." + id);
  if (!text) return null;
  try {
    return parseProject(text);
  } catch {
    return null;
  }
}

export const saveProject = (id: string, project: Project) => write("project." + id, serialiseProject(project));
export const deleteProject = (id: string) => remove("project." + id);
export const loadCurrentId = () => read("current");
export const saveCurrentId = (id: string) => write("current", id);

export function loadPrefs(): Prefs {
  const fallback: Prefs = { zoom: 24, view: "repeat" };
  try {
    const p = JSON.parse(read("prefs") ?? "{}");
    return {
      zoom: typeof p.zoom === "number" ? Math.max(10, Math.min(40, p.zoom)) : fallback.zoom,
      view: p.view === "full" ? "full" : "repeat",
    };
  } catch {
    return fallback;
  }
}

export const savePrefs = (prefs: Prefs) => write("prefs", JSON.stringify(prefs));

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

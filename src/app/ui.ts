import { LETTERS, type Yarn } from "../mosaic";

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; title?: string; type?: string; label?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props.className) e.className = props.className;
  if (props.text !== undefined) e.textContent = props.text;
  if (props.title) e.title = props.title;
  if (props.label) e.setAttribute("aria-label", props.label);
  if (props.type && e instanceof HTMLButtonElement) e.type = props.type as "button";
  e.append(...children);
  return e;
}

export function button(text: string, onClick: () => void, opts: { className?: string; label?: string; title?: string; disabled?: boolean } = {}) {
  const b = el("button", { className: opts.className, text, type: "button", label: opts.label, title: opts.title ?? opts.label });
  b.disabled = !!opts.disabled;
  b.addEventListener("click", onClick);
  return b;
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Dark or light text, whichever reads better on the colour. */
export function inkFor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1b1b1b" : "#ffffff";
}

/** Publish the palette as CSS variables (--c0 background, --i0 text) used by the k0–k5 classes. */
export function applyPalette(palette: Yarn[]) {
  const root = document.documentElement.style;
  palette.forEach((y, i) => {
    root.setProperty(`--c${i}`, y.hex);
    root.setProperty(`--i${i}`, inkFor(y.hex));
  });
}

export const colourLabel = (palette: Yarn[], i: number) => `${LETTERS[i]} · ${palette[i]?.name ?? ""}`;

let noticeTimer: number | undefined;

/** Show a message above the chart. Warnings stay longer than information. */
export function notify(message: string, kind: "warn" | "info" = "warn") {
  const box = $("notice");
  box.className = "notice " + kind;
  box.hidden = false;
  const close = button("×", () => (box.hidden = true), { className: "x", label: "Dismiss" });
  box.replaceChildren(el("span", { text: message }), close);
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (box.hidden = true), kind === "warn" ? 9000 : 6000);
}

export function hideNotice() {
  $("notice").hidden = true;
}

/** A small menu next to an anchor, e.g. to pick a row colour. */
export function openMenu(anchor: HTMLElement, title: string, items: { label: string; swatch?: string; onPick: () => void }[]) {
  const pop = $("popover");
  pop.replaceChildren(el("div", { className: "ph", text: title }));
  for (const item of items) {
    const b = el("button", { type: "button" });
    b.setAttribute("role", "menuitem");
    if (item.swatch) {
      const sw = el("span", { className: "sw" });
      sw.style.background = item.swatch;
      b.append(sw);
    }
    b.append(el("span", { text: item.label }));
    b.addEventListener("click", () => {
      closeMenu();
      item.onPick();
    });
    pop.append(b);
  }
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const left = Math.min(window.innerWidth - pop.offsetWidth - 12, r.right + 6);
  const top = Math.min(window.innerHeight - pop.offsetHeight - 12, r.top);
  pop.style.left = Math.max(12, left) + "px";
  pop.style.top = Math.max(12, top) + "px";
  pop.querySelector("button")?.focus();
}

export function closeMenu() {
  $("popover").hidden = true;
}

document.addEventListener("pointerdown", (e) => {
  const pop = document.getElementById("popover");
  if (pop && !pop.hidden && !pop.contains(e.target as Node) && !(e.target as Element).closest?.(".colchip")) closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});

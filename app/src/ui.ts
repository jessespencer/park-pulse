import { NATIONAL, type IndexFile } from './data';
import { setState, type Mode } from './state';

type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

/** Tiny DOM builder: h('div', {class: 'x', onclick: fn}, child, 'text'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Attrs = {}, ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of children) if (c != null && c !== false) node.append(c);
  return node;
}

export function segmented<T extends string>(
  label: string, options: { value: T; label: string }[], current: T, onChange: (v: T) => void,
): HTMLElement {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label },
    ...options.map((o) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(o.value === current),
      class: o.value === current ? 'active' : undefined,
      onclick: () => onChange(o.value),
    }, o.label)));
}

export const modeToggle = (mode: Mode): HTMLElement =>
  segmented<Mode>('Color by', [
    { value: 'visits', label: 'Visits' },
    { value: 'share', label: 'Share of year' },
    { value: 'index', label: 'Index vs normal' },
  ], mode, (m) => setState({ mode: m }));

export function select(
  label: string, options: { value: string; label: string }[], current: string, onChange: (v: string) => void,
): HTMLElement {
  const s = h('select', { onchange: (e) => onChange((e.target as HTMLSelectElement).value) },
    ...options.map((o) => h('option', { value: o.value, selected: o.value === current }, o.label)));
  return h('label', { class: 'field' }, h('span', {}, label), s);
}

export function parkOptions(idx: IndexFile, includeNational = true): { value: string; label: string }[] {
  const opts = [...idx.parks]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ value: p.code, label: idx.hasMetadata ? `${p.name} (${p.code})` : p.code }));
  return includeNational ? [{ value: NATIONAL, label: 'All NPS units (national total)' }, ...opts] : opts;
}

export const loading = (): HTMLElement => h('p', { class: 'muted loading' }, 'Loading…');
export const errorBox = (msg: string): HTMLElement => h('p', { class: 'error', role: 'alert' }, msg);

/** replaceChildren that skips conditional `false`/null entries. */
export const fill = (root: HTMLElement, ...children: (Node | string | null | undefined | false)[]): void =>
  root.replaceChildren(...children.filter((c): c is Node | string => c != null && c !== false));

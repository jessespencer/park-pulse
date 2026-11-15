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

/* ---------- Motion helpers ----------
 * Views re-render on every state change, so stateful controls remember where
 * they were (keyed by label) and animate from the old state to the new one.
 */
export const reduceMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Run once the node is in the document (views build off-DOM, then mount). */
const whenMounted = (node: Element, fn: () => void): void => {
  // Frames drive the motion; a timer backs them up, because hidden tabs get no frames
  // and the control must still land in its true state. Whichever comes first runs once.
  let done = false;
  const run = () => { if (!done && node.isConnected) { done = true; fn(); } };
  const tryRun = (left: number) => { run(); if (!done && left > 0) requestAnimationFrame(() => tryRun(left - 1)); };
  requestAnimationFrame(() => tryRun(30));
  [300, 1000, 3000].forEach((ms) => setTimeout(run, ms));
};

/** Restart a one-shot CSS animation class. */
export function replay(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/** Tween a number in an element's text with an ease-out (e.g. a visit total). */
export function countUp(el: HTMLElement, from: number, to: number, format: (n: number) => string, dur = 640): void {
  if (reduceMotion() || from === to) { el.textContent = format(to); return; }
  el.textContent = format(from); // start on the old value: no flash of the final one
  const t0 = performance.now();
  const tick = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    el.textContent = format(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const segMemory = new Map<string, { left: number; width: number }>();

/** Segmented control with a sliding selection pill that glides from the previous choice. */
export function segmented<T extends string>(
  label: string, options: { value: T; label: string }[], current: T, onChange: (v: T) => void,
): HTMLElement {
  const indicator = h('span', { class: 'seg-indicator', 'aria-hidden': 'true' });
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label }, indicator,
    ...options.map((o) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(o.value === current),
      class: o.value === current ? 'active' : undefined,
      onclick: () => onChange(o.value),
    }, o.label)));
  whenMounted(group, () => {
    const b = group.querySelector<HTMLElement>('button.active');
    if (!b) { indicator.hidden = true; return; }
    const to = { left: b.offsetLeft, width: b.offsetWidth };
    const from = segMemory.get(label);
    segMemory.set(label, to);
    const put = (r: { left: number; width: number }) => { indicator.style.left = `${r.left}px`; indicator.style.width = `${r.width}px`; };
    if (!from || reduceMotion() || (from.left === to.left && from.width === to.width)) { put(to); group.classList.add('is-ready'); return; }
    put(from); // snap to where it was, then glide
    group.classList.add('is-ready');
    void indicator.offsetWidth;
    indicator.classList.add('is-moving');
    put(to);
    indicator.addEventListener('transitionend', () => { indicator.classList.remove('is-moving'); replay(indicator, 'is-pop'); }, { once: true });
  });
  return group;
}

const switchMemory = new Map<string, boolean>();

/** On/off switch (role="switch"); the thumb springs across when the value changes. */
export function toggleSwitch(label: string, on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const was = switchMemory.get(label);
  switchMemory.set(label, on);
  const startOn = was !== undefined && was !== on && !reduceMotion() ? was : on;
  const b = h('button', {
    type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(startOn),
    onclick: () => onChange(!on),
  }, h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-thumb' })), h('span', { class: 'switch-label' }, label));
  if (startOn !== on) whenMounted(b, () => b.setAttribute('aria-checked', String(on)));
  return b;
}

export const modeToggle = (mode: Mode): HTMLElement =>
  segmented<Mode>('Color by', [
    { value: 'visits', label: 'Visits' },
    { value: 'share', label: 'Share of year' },
    { value: 'index', label: 'Index vs normal' },
  ], mode, (m) => setState({ mode: m }));

export const loading = (): HTMLElement => h('p', { class: 'muted loading' }, 'Loading…');
export const errorBox = (msg: string): HTMLElement => h('p', { class: 'error', role: 'alert' }, msg);

/** replaceChildren that skips conditional `false`/null entries. */
export const fill = (root: HTMLElement, ...children: (Node | string | null | undefined | false)[]): void =>
  root.replaceChildren(...children.filter((c): c is Node | string => c != null && c !== false));

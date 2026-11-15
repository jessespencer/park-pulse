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
  // Views fill their stage synchronously, so a microtask usually finds the node mounted
  // (hidden, but laid out) before the page swaps in. Frames and timers back that up;
  // hidden tabs get no frames. Whichever comes first runs once.
  let done = false;
  const run = () => { if (!done && node.isConnected) { done = true; fn(); } };
  queueMicrotask(run);
  const tryRun = (left: number) => { run(); if (!done && left > 0) requestAnimationFrame(() => tryRun(left - 1)); };
  requestAnimationFrame(() => tryRun(30));
  [300, 1000, 3000].forEach((ms) => setTimeout(run, ms));
};

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

/** Read a duration token (e.g. --dur-3) in ms, so JS motion obeys the same tokens and reduced motion. */
export const durMs = (token: string): number => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(token)) || 0;

type Rect = { left: number; width: number };
/** Per control: where the pill is headed, where it started, and when (performance.now()). */
const segMemory = new Map<string, { from: Rect; to: Rect; start: number }>();

/**
 * Glide the pill from→to, starting `elapsed` ms into the motion (continues a slide begun
 * elsewhere). The pill carries a dark copy of the labels that counter-moves inside it, so
 * every letter is exactly the right color at every point of the slide: no crossfade blur.
 */
function glide(indicator: HTMLElement, from: Rect, to: Rect, elapsed: number): void {
  const ink = indicator.firstElementChild as HTMLElement;
  indicator.style.left = `${to.left}px`;
  indicator.style.width = `${to.width}px`;
  ink.style.left = `${-to.left}px`;
  const dur = durMs('--dur-3');
  if (!dur || elapsed >= dur || (from.left === to.left && from.width === to.width)) return;
  const timing = { duration: dur, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };
  const pill = indicator.animate([{ left: `${from.left}px`, width: `${from.width}px` }, { left: `${to.left}px`, width: `${to.width}px` }], timing);
  const text = ink.animate([{ left: `${-from.left}px` }, { left: `${-to.left}px` }], timing);
  pill.currentTime = elapsed;
  text.currentTime = elapsed;
}

/**
 * A button's left and width in its group's padding box, in exact layout pixels. Built from
 * computed widths, not getBoundingClientRect (which includes page zoom and transforms) or
 * offsetLeft/Width (which round to whole pixels).
 */
function boxIn(b: HTMLElement): Rect {
  const g = b.parentElement!, cs = getComputedStyle(g);
  const gap = parseFloat(cs.columnGap) || 0;
  let left = parseFloat(cs.paddingLeft) || 0;
  for (const x of g.querySelectorAll<HTMLElement>(':scope > button')) {
    if (x === b) break;
    left += parseFloat(getComputedStyle(x).width) + gap;
  }
  return { left, width: parseFloat(getComputedStyle(b).width) };
}

/**
 * Segmented control with a sliding selection pill. The pill starts moving on the click itself;
 * views then re-render, and the rebuilt control picks the same slide up at the same moment,
 * so the motion runs continuously across the swap with one highlight at all times.
 */
export function segmented<T extends string>(
  label: string, options: { value: T; label: string }[], current: T, onChange: (v: T) => void,
): HTMLElement {
  const ink = h('span', { class: 'seg-ink' }, ...options.map((o) => h('span', { class: 'seg-ink-label' }, o.label)));
  const indicator = h('span', { class: 'seg-indicator', 'aria-hidden': 'true' }, ink);
  const rectOf = boxIn;
  const buttons = options.map((o) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(o.value === current),
    class: o.value === current ? 'active' : undefined,
  }, o.label));
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label }, indicator, ...buttons);
  buttons.forEach((b, i) => b.addEventListener('click', () => {
    const o = options[i];
    if (o.value === current) return;
    const was = group.querySelector<HTMLElement>('button.active');
    const from = was ? rectOf(was) : rectOf(b);
    buttons.forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); });
    const move = { from, to: rectOf(b), start: performance.now() };
    segMemory.set(label, move);
    glide(indicator, move.from, move.to, 0);
    onChange(o.value);
  }));
  whenMounted(group, () => {
    const b = group.querySelector<HTMLElement>('button.active');
    if (!b) { indicator.hidden = true; return; }
    const to = rectOf(b);
    const mem = segMemory.get(label);
    group.classList.add('is-ready');
    // Continue a slide that is still running (same target); otherwise just sit on the choice.
    if (mem && mem.to.left === to.left && mem.to.width === to.width) glide(indicator, mem.from, to, performance.now() - mem.start);
    else glide(indicator, to, to, 0);
    segMemory.set(label, { from: to, to, start: mem?.start ?? 0 });
    // Fonts arriving or a resize change the buttons' widths: keep the pill exact.
    const resync = () => {
      if (!group.isConnected) return;
      const now = group.querySelector<HTMLElement>('button.active');
      if (now && !indicator.getAnimations().length) glide(indicator, rectOf(now), rectOf(now), 0);
    };
    const ro = new ResizeObserver(resync);
    buttons.forEach((x) => ro.observe(x));
    indicator.getAnimations().forEach((an) => an.finished.then(resync, () => {}));
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
    { value: 'index', label: 'Vs. usual' },
  ], mode, (m) => setState({ mode: m }));

export const loading = (): HTMLElement => h('p', { class: 'muted loading' }, 'Loading…');
export const errorBox = (msg: string): HTMLElement => h('p', { class: 'error', role: 'alert' }, msg);

/** replaceChildren that skips conditional `false`/null entries. */
export const fill = (root: HTMLElement, ...children: (Node | string | null | undefined | false)[]): void =>
  root.replaceChildren(...children.filter((c): c is Node | string => c != null && c !== false));

/** "2026-03-26" → "Mar 26, 2026" (no time zone shift). */
export const fmtDate = (iso: string | null): string => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'date unknown';
};

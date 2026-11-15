/**
 * The site's one search bar (Airbnb-style).
 *
 * There is a single finder element. It lives in one of three slots:
 *   hero   — the home page's hero, full size (while the hero is on screen)
 *   header — the header's center, as a compact pill
 *   panel  — under the header, full size, over a dimmed page (after clicking the pill)
 * Moving between slots is one continuous motion of that same element: its real box
 * (left, top, width, height) animates from where it was to where it lands, while its
 * full and compact layouts crossfade inside it. No second copy, no scaling of text.
 * Durations come from the motion tokens, so reduced motion turns the motion off.
 */
import { NATIONAL, type IndexFile } from './data';
import type { AppState } from './state';
import { renderFinder, type PanelId } from './views/finder';
import { durMs, h, reduceMotion } from './ui';

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
type Where = 'hero' | 'header' | 'panel';
export interface Dock { update: (s: AppState) => void }

const isPhone = () => matchMedia('(max-width: 760px)').matches;
const px = (n: number) => `${n}px`;

export function mountDock(headerSlot: HTMLElement, header: HTMLElement, idx: IndexFile): Dock {
  const now = new Date().getMonth();
  let where: Where = 'header';
  let desired: Where = 'header';
  let heroSlot: HTMLElement | null = null;
  let heroInView = false;
  let finishMorph: (() => void) | null = null;

  const finder = renderFinder(idx, {
    now, uid: 'sbar',
    onSubmit: () => collapse(),
    onCompact: (id) => expand(id),
  });
  const form = finder.el;
  const bar = form.querySelector<HTMLElement>('.finder-bar')!;
  const full = bar.querySelector<HTMLElement>('.sbar-full')!;
  const compact = bar.querySelector<HTMLElement>('.sbar-compact')!;

  const panelSlot = h('div', { class: 'sbar-panel-slot' });
  const panel = h('div', { class: 'dock-panel', hidden: true }, panelSlot);
  header.append(panel);
  const scrim = h('div', { class: 'dock-scrim', hidden: true });
  scrim.addEventListener('click', () => collapse());
  // While moving between slots the bar rides on this layer, above header and page alike.
  const layer = h('div', { class: 'sbar-layer' });
  document.body.append(scrim, layer);

  const slotFor = (w: Where): HTMLElement => (w === 'hero' && heroSlot ? heroSlot : w === 'panel' ? panelSlot : headerSlot);

  function showPanel(on: boolean): void {
    if (on) {
      const top = header.getBoundingClientRect().top;
      // Desktop: under the header row. Phones: over the pill's own row, replacing it in place.
      panel.style.top = isPhone() ? px(headerSlot.getBoundingClientRect().top - top - 6) : px(header.querySelector('.header-inner')!.getBoundingClientRect().bottom - top);
    }
    panel.hidden = !on; scrim.hidden = !on;
    header.classList.toggle('dock-expanded', on);
  }

  /** Move the one bar to a slot; animate its box from here to there. */
  function place(to: Where, animate: boolean): void {
    desired = to;
    if (finishMorph) {
      if (to === where) return;                  // already heading there: let the motion finish
      finishMorph();                             // otherwise complete it, then move on
    }
    if (to === where && form.parentElement === slotFor(to)) return;
    const from = where;
    const first = bar.getBoundingClientRect();
    const fromCompact = form.classList.contains('is-compact');
    const before = (fromCompact ? compact : full).getBoundingClientRect();

    where = to;
    if (to === 'panel') showPanel(true);
    slotFor(to).append(form);
    const toCompact = to === 'header';
    form.classList.toggle('is-compact', toCompact);
    const last = bar.getBoundingClientRect();
    const after = (toCompact ? compact : full).getBoundingClientRect();
    const dur = durMs('--dur-3');

    const done = () => {
      finishMorph = null;
      if (from === 'panel' && to !== 'panel') showPanel(false);
    };
    if (!animate || !dur || reduceMotion() || !first.width || !last.width) { done(); return; }

    // Lift the bar onto the top layer at its landing box, then animate the box from the start.
    layer.append(form);
    bar.classList.add('is-morphing');
    const fullW = fromCompact ? after.width : before.width;
    const compactW = fromCompact ? before.width : after.width;
    full.style.width = px(fullW);
    compact.style.width = px(compactW);
    Object.assign(bar.style, { position: 'fixed', margin: '0', left: px(last.left), top: px(last.top), width: px(last.width), height: px(last.height) });
    const t = { duration: dur, easing: EASE };
    const anims: Animation[] = [
      bar.animate([
        { left: px(first.left), top: px(first.top), width: px(first.width), height: px(first.height) },
        { left: px(last.left), top: px(last.top), width: px(last.width), height: px(last.height) },
      ], t),
    ];
    if (fromCompact !== toCompact) {
      const out = fromCompact ? compact : full, inn = fromCompact ? full : compact;
      anims.push(out.animate([{ opacity: 1 }, { opacity: 0, offset: 0.35 }, { opacity: 0 }], t));
      anims.push(inn.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], t));
    } else {
      // Same layout at both ends: keep only the active one showing.
      (toCompact ? full : compact).style.opacity = '0';
    }
    if (to === 'panel' && from !== 'panel') {
      anims.push(panel.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], t));
      anims.push(scrim.animate([{ opacity: 0 }, { opacity: 1 }], t));
    } else if (from === 'panel' && to !== 'panel') {
      anims.push(panel.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { ...t, fill: 'forwards' }));
      anims.push(scrim.animate([{ opacity: 1 }, { opacity: 0 }], { ...t, fill: 'forwards' }));
    }

    const cleanup = () => {
      anims.forEach((a) => a.cancel());
      bar.classList.remove('is-morphing');
      ['position', 'margin', 'left', 'top', 'width', 'height'].forEach((k) => bar.style.removeProperty(k));
      full.style.width = ''; compact.style.width = ''; full.style.opacity = ''; compact.style.opacity = '';
      slotFor(where).append(form);
      done();
      // Something asked for a different slot while we were moving: go there now.
      if (desired !== where) place(desired, false);
    };
    finishMorph = cleanup;
    anims[0].finished.then(() => { if (finishMorph === cleanup) cleanup(); }, () => {});
  }

  /* ---------- expand / collapse (header pill ↔ panel) ---------- */
  function expand(open: PanelId): void {
    if (where !== 'header') { finder.open(open); return; }
    place('panel', true);
    // Open the picker as the bar lands, not after a pause.
    window.setTimeout(() => { if (where === 'panel') finder.open(open); }, durMs('--dur-3') * 0.6);
  }
  function collapse(): void {
    if (where !== 'panel') return;
    finder.open(null);
    place(heroSlot && heroInView ? 'hero' : 'header', true);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && where === 'panel' && !finder.isOpen()) { e.preventDefault(); collapse(); }
  }, { capture: true });

  /* ---------- home: hero ↔ header as the hero scrolls ---------- */
  // Dock the moment the bar's top edge meets the header's bottom edge, while it is still fully
  // in view, so it rises straight into the header instead of sliding under it first. It drops
  // back only once there is clear room in the hero; the gap between the two stops flicker.
  const DOCK_AT = 8, UNDOCK_AT = 32;
  const gap = () => (heroSlot ? heroSlot.getBoundingClientRect().top - header.getBoundingClientRect().bottom : -1);
  let ticking = false;
  function checkHero(): void {
    ticking = false;
    if (!heroSlot) return;
    const g = gap();
    if (where === 'panel') { heroInView = g > UNDOCK_AT; return; } // the panel decides on collapse
    if (isPhone()) { heroInView = true; place('hero', false); return; } // header doesn't stick on phones
    if (where === 'hero' && g < DOCK_AT) place('header', true);
    else if (where === 'header' && g > UNDOCK_AT) place('hero', true);
    heroInView = where === 'hero' ? g >= DOCK_AT : g > UNDOCK_AT;
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(checkHero); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);

  // Dev only: lets tooling trigger and step moves when the page gets no frames (hidden tab).
  if (import.meta.env.DEV) (window as unknown as { __sbar: unknown }).__sbar = { place, bar, where: () => where, check: checkHero };

  return {
    update(s: AppState) {
      finder.set({
        park: (s.view === 'park' || s.view === 'drift') && s.park !== NATIONAL ? s.park : null,
        month: s.view === 'when' ? s.month - 1 : now,
        region: s.view === 'when' ? s.region : '',
        scope: s.view === 'when' ? s.scope : 'np',
      });
      const slot = s.view === 'home' ? document.querySelector<HTMLElement>('.stage:not(.is-pending) .sbar-slot') : null;
      if (slot !== heroSlot) {
        heroSlot = slot;
        heroInView = !!slot && gap() >= DOCK_AT;
      }
      // A new page settles the bar where it belongs, without motion; scrolling animates from here on.
      place(heroSlot && (heroInView || isPhone()) ? 'hero' : 'header', false);
    },
  };
}

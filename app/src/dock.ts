/**
 * The site's search (Airbnb-style), in two places:
 *   hero   — the home page's full four-part bar, in the hero's `.sbar-slot`
 *   header — a small pill in the header's center, on every page
 * On home the pill waits until you scroll past the hero's bar: the hero (copy and bar) fades
 * as it reaches the clear header, then the pill pops in and the header fills behind it.
 * Each part of the pill opens its own picker anchored under it (finder.ts).
 */
import { NATIONAL, type IndexFile } from './data';
import type { AppState } from './state';
import { renderFinder, type FinderHandle } from './views/finder';
import { durMs, reduceMotion } from './ui';

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
export interface Dock { update: (s: AppState) => void }

const isPhone = () => matchMedia('(max-width: 760px)').matches;
/** The pill appears once the hero bar's top is this close to the header (it's mostly faded by
 *  then) and leaves once it's back past HIDE_AT; the gap stops it flickering at the edge. */
const SHOW_AT = 20, HIDE_AT = 44;
/** Hero lines fade over this distance as they reach the header. */
const FADE_PX = 72;

export function mountDock(headerSlot: HTMLElement, header: HTMLElement, idx: IndexFile): Dock {
  const now = new Date().getMonth();
  const pill = renderFinder(idx, { now, uid: 'hdr', compact: true });
  headerSlot.append(pill.el);

  let heroSlot: HTMLElement | null = null;
  let hero: FinderHandle | null = null;
  let shown = true;
  let anim: Animation | null = null;

  /** Pop the pill in, or let it go. */
  function show(on: boolean, animate: boolean): void {
    header.classList.toggle('has-bar', on);           // the header fills with the pill
    if (on === shown) return;
    shown = on;
    anim?.cancel();
    if (!on) pill.open(null);
    const still = !animate || reduceMotion() || !durMs('--dur-3');
    if (on) {
      headerSlot.classList.remove('is-away');
      if (!still) anim = pill.el.animate(
        [{ opacity: 0, transform: 'translateY(10px) scale(0.92)' }, { opacity: 1, transform: 'none' }],
        { duration: durMs('--dur-3'), easing: EASE });
    } else if (still) {
      headerSlot.classList.add('is-away');
    } else {
      anim = pill.el.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(0.95)' }],
        { duration: durMs('--dur-2'), easing: EASE });
      anim.finished.then(() => { if (!shown) headerSlot.classList.add('is-away'); }, () => {});
    }
  }

  /** Home: fade the hero's lines (bar included) as they reach the header, and hand off to the pill. */
  function check(animate = true): void {
    ticking = false;
    if (!heroSlot) { show(true, false); return; }
    if (isPhone()) { show(false, false); clearFade(); return; } // header doesn't stick on phones
    const hb = header.getBoundingClientRect().bottom;
    heroSlot.parentElement!.querySelectorAll<HTMLElement>(':scope > *').forEach((el) => {
      el.style.opacity = String(Math.max(0, Math.min(1, (el.getBoundingClientRect().top - hb + 12) / FADE_PX)));
    });
    const gap = heroSlot.getBoundingClientRect().top - hb;
    if (!shown && gap < SHOW_AT) show(true, animate);
    else if (shown && gap > HIDE_AT) show(false, animate);
    if (shown && hero?.isOpen()) hero.open(null);       // don't leave a picker hanging off a faded bar
  }
  const clearFade = () => heroSlot?.parentElement?.querySelectorAll<HTMLElement>(':scope > *').forEach((el) => (el.style.opacity = ''));

  let ticking = false;
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => check()); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);

  // Dev only: lets tooling run a check when the page gets no frames (hidden tab).
  if (import.meta.env.DEV) (window as unknown as { __sbar: unknown }).__sbar = { check, pill, shown: () => shown };

  return {
    update(s: AppState) {
      pill.set({
        park: (s.view === 'park' || s.view === 'drift') && s.park !== NATIONAL ? s.park : null,
        // Month and region are search inputs, not filters on this page: show them as placeholders
        // everywhere except When to go, where they mirror the page.
        month: s.view === 'when' ? s.month - 1 : null,
        region: s.view === 'when' ? s.region : '',
        scope: s.view === 'when' ? s.scope : 'np',
      });
      const slot = s.view === 'home' ? document.querySelector<HTMLElement>('.stage:not(.is-pending) .sbar-slot') : null;
      if (slot !== heroSlot) {
        heroSlot = slot;
        hero = slot ? renderFinder(idx, { now, uid: 'hero' }) : null;
        if (slot && hero) slot.replaceChildren(hero.el);
      }
      // A new page settles the pill without motion; scrolling animates from here on.
      shown = !heroSlot;
      headerSlot.classList.toggle('is-away', !shown);
      header.classList.toggle('has-bar', shown);
      check(false);
    },
  };
}

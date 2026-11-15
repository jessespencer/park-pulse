/**
 * Header search dock (Airbnb-style).
 *
 * A compact pill in the header ("Rocky Mountain · November · Anywhere") that
 * expands into the full four-part finder under the header, and collapses back.
 * On the home page the pill stays hidden while the hero finder is on screen;
 * scrolling the hero bar under the header morphs it into the pill (and back).
 *
 * Every morph is FLIP: the arriving shape starts with a transform that makes it
 * look like the departing one, then animates to rest, while contents crossfade.
 * Durations come from the motion tokens, so reduced motion turns it all off.
 */
import { NATIONAL, type IndexFile } from './data';
import type { AppState } from './state';
import { renderFinder, type FinderHandle, type PanelId } from './views/finder';
import { durMs, h, reduceMotion } from './ui';

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const svg = (body: string, cls: string) =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const MOUNTAIN = svg('<path d="M2.5 19.5 9 8.5l3.6 6 2.4-3.8 6.5 8.8z"/>', 'dock-ic');
const SEARCH = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', 'dock-search');

export interface Dock { update: (s: AppState) => void }

/** Transform that maps box `to` onto box `from` (FLIP "invert"), origin top-left. */
function invert(from: DOMRect, to: DOMRect): string {
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}

export function mountDock(host: HTMLElement, header: HTMLElement, idx: IndexFile): Dock {
  const now = new Date().getMonth();
  let expanded = false;
  let docked = true; // whether the pill is showing (false on home while the hero bar is in view)
  let heroBar: HTMLElement | null = null;
  let io: IntersectionObserver | null = null;

  /* ---------- compact pill ---------- */
  const parkVal = h('span', { class: 'dock-val' });
  const monthVal = h('span', { class: 'dock-val' });
  const regionVal = h('span', { class: 'dock-val' });
  const seg = (id: PanelId, label: string, val: HTMLElement, icon = '') => {
    const b = h('button', { type: 'button', class: `dock-seg dock-${id}`, 'aria-label': `${label}: ` }, val);
    if (icon) b.insertAdjacentHTML('afterbegin', icon);
    b.addEventListener('click', () => expand(id));
    return b;
  };
  const go = h('button', { type: 'button', class: 'dock-go', 'aria-label': 'Search parks' });
  go.innerHTML = SEARCH;
  go.addEventListener('click', () => expand('park'));
  const pill = h('div', { class: 'dock-pill', role: 'search', 'aria-label': 'Search parks' },
    seg('park', 'Park', parkVal, MOUNTAIN), h('span', { class: 'dock-sep', 'aria-hidden': 'true' }),
    seg('month', 'Month', monthVal), h('span', { class: 'dock-sep dock-sep-region', 'aria-hidden': 'true' }),
    seg('region', 'Region', regionVal), go);
  host.replaceChildren(pill);

  /* ---------- expanded panel (a second finder, under the header) ---------- */
  const finder: FinderHandle = renderFinder(idx, { now, uid: 'dock-finder', onSubmit: () => collapse() });
  const panel = h('div', { class: 'dock-panel', hidden: true }, h('div', { class: 'dock-panel-inner' }, finder.el));
  header.append(panel);
  const scrim = h('div', { class: 'dock-scrim', hidden: true });
  scrim.addEventListener('click', () => collapse());
  document.body.append(scrim);
  const bar = () => finder.el.querySelector<HTMLElement>('.finder-bar')!;

  function syncPill(): void {
    const s = finder.summary();
    parkVal.textContent = s.park;
    monthVal.textContent = s.month;
    regionVal.textContent = s.region;
    pill.querySelectorAll<HTMLElement>('.dock-seg').forEach((b, i) => b.setAttribute('aria-label', `${['Park', 'Month', 'Region'][i]}: ${[s.park, s.month, s.region][i]}`));
  }

  /* ---------- expand / collapse ---------- */
  async function expand(open: PanelId): Promise<void> {
    if (expanded) { finder.open(open); return; }
    expanded = true;
    const from = pill.getBoundingClientRect();
    // Desktop: the panel opens under the logo row, over the nav row. Phones: the pill has its
    // own row, so the panel opens right over it and the full search replaces the pill in place.
    const top = header.getBoundingClientRect().top;
    panel.style.top = matchMedia('(max-width: 760px)').matches
      ? `${from.top - top - 6}px`
      : `${header.querySelector('.brand')!.getBoundingClientRect().bottom - top}px`;
    panel.hidden = false; scrim.hidden = false;
    header.classList.add('dock-expanded');
    const dur = durMs('--dur-3');
    const target = bar();
    const to = target.getBoundingClientRect();
    if (dur && !reduceMotion()) {
      const t = { duration: dur, easing: EASE };
      const anims = [
        // The full bar grows out of the pill's shape; its contents arrive a beat later.
        target.animate([{ transform: invert(from, to), transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }], t),
        ...[...target.children].map((c) => (c as HTMLElement).animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], t)),
        // The pill swells toward the bar while fading, so the two read as one shape.
        pill.animate([{ transform: 'none', opacity: 1, transformOrigin: '0 0' }, { transform: invert(to, from), opacity: 0, offset: 0.45, transformOrigin: '0 0' }, { transform: invert(to, from), opacity: 0, transformOrigin: '0 0' }], { ...t, fill: 'forwards' }),
        panel.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], t),
        scrim.animate([{ opacity: 0 }, { opacity: 1 }], t),
        // Pill labels leave before they get visibly stretched.
        ...[...pill.children].map((k) => (k as HTMLElement).animate([{ opacity: 1 }, { opacity: 0, offset: 0.2 }, { opacity: 0 }], t)),
      ];
      // Open the picker as the bar lands (60% in), so it doesn't feel like a wait.
      await new Promise((r) => setTimeout(r, dur * 0.6));
      void anims[0].finished.then(() => { if (expanded) { pill.style.visibility = 'hidden'; pill.getAnimations().forEach((a) => a.cancel()); } }, () => {});
      // (collapse() also clears the pill's held end state, in case it lands before this does)
    } else {
      pill.style.visibility = 'hidden';
    }
    if (expanded) finder.open(open);
  }

  async function collapse(): Promise<void> {
    if (!expanded) return;
    expanded = false;
    finder.open(null);
    pill.getAnimations().forEach((a) => a.cancel()); // drop the expand morph's held "faded out" state
    const target = bar();
    const from = target.getBoundingClientRect();
    pill.style.visibility = '';
    const to = pill.getBoundingClientRect();
    const dur = durMs('--dur-3');
    if (dur && !reduceMotion()) {
      const t = { duration: dur * 0.85, easing: EASE };
      const anims = [
        target.animate([{ transform: 'none', opacity: 1, transformOrigin: '0 0' }, { transform: invert(to, from), opacity: 0, transformOrigin: '0 0' }], { ...t, fill: 'forwards' }),
        pill.animate([{ transform: invert(from, to), opacity: 0, transformOrigin: '0 0' }, { opacity: 0, offset: 0.3 }, { transform: 'none', opacity: 1, transformOrigin: '0 0' }], t),
        panel.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { ...t, fill: 'forwards' }),
        scrim.animate([{ opacity: 1 }, { opacity: 0 }], { ...t, fill: 'forwards' }),
        ...[...pill.children].map((k) => (k as HTMLElement).animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], t)),
      ];
      await anims[1].finished.catch(() => {});
      if (expanded) return; // re-opened mid-collapse
      [target, panel, scrim].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    }
    panel.hidden = true; scrim.hidden = true;
    header.classList.remove('dock-expanded');
  }

  // Escape closes the panel, unless a picker is open (the finder closes that first).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && expanded && !finder.isOpen()) { e.preventDefault(); void collapse(); pill.querySelector<HTMLElement>('.dock-seg')?.focus(); }
  }, { capture: true });

  /* ---------- home: hero bar ↔ pill ---------- */
  function setDocked(on: boolean, animate: boolean): void {
    if (on === docked) return;
    docked = on;
    document.body.classList.toggle('dock-hidden', !on);
    const dur = durMs('--dur-3');
    if (!animate || !heroBar || !dur || reduceMotion()) return;
    const hero = heroBar.getBoundingClientRect();
    const rest = pill.getBoundingClientRect();
    // Pin the hero box at least under the header, so a fast scroll doesn't start the morph off-screen.
    const hb = header.getBoundingClientRect().bottom;
    const src = new DOMRect(hero.left, Math.max(hero.top, hb - hero.height * 0.5), hero.width, hero.height);
    const t = { duration: dur, easing: EASE };
    const kids = [...pill.children] as HTMLElement[];
    if (on) {
      // The hero bar slides up into the header and becomes the pill: the shell shows early,
      // the labels only once it's nearly pill-sized (scaled text reads as a glitch).
      pill.animate([{ transform: invert(src, rest), opacity: 0, transformOrigin: '0 0' }, { opacity: 1, offset: 0.25 }, { transform: 'none', opacity: 1, transformOrigin: '0 0' }], t);
      kids.forEach((k) => k.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], t));
    } else {
      // The pill drops back down into the hero bar's place: labels go first, then the shell.
      pill.animate([{ transform: 'none', opacity: 1, transformOrigin: '0 0' }, { opacity: 1, offset: 0.5 }, { transform: invert(src, rest), opacity: 0, transformOrigin: '0 0' }], t);
      kids.forEach((k) => k.animate([{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], t));
    }
  }

  function watchHero(): void {
    io?.disconnect();
    heroBar = document.querySelector<HTMLElement>('.stage:not(.is-pending) .hero .finder-bar');
    if (!heroBar) { setDocked(true, false); return; }
    let first = true;
    io = new IntersectionObserver(([en]) => {
      // Docked once the hero bar's bottom passes under the header.
      const under = !en.isIntersecting && en.boundingClientRect.top < header.getBoundingClientRect().bottom;
      setDocked(under, !first);
      first = false;
    }, { rootMargin: `-${Math.round(header.getBoundingClientRect().height)}px 0px 0px 0px`, threshold: 0 });
    io.observe(heroBar);
  }

  return {
    update(s: AppState) {
      void collapse();
      finder.set({
        park: (s.view === 'park' || s.view === 'drift') && s.park !== NATIONAL ? s.park : null,
        month: s.view === 'when' ? s.month - 1 : now,
        region: s.view === 'when' ? s.region : '',
        scope: s.view === 'when' ? s.scope : 'np',
      });
      syncPill();
      if (s.view === 'home') { docked = true; setDocked(false, false); watchHero(); }
      else { io?.disconnect(); heroBar = null; setDocked(true, false); }
    },
  };
}

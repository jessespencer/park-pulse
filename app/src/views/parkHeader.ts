/**
 * A park's pages share one header: the entrance sign, then tabs for Overview, Season drift and
 * Compare. The views stay separate (`park`, `drift`, `compare` in state) so URLs keep working;
 * this module just makes them read as one place.
 */
import { topo } from '../art';
import { NATIONAL, fmtInt, stateLine, type ParkDetail } from '../data';
import { PARK_TABS } from '../pages';
import { setState, type View } from '../state';
import { countUp, h } from '../ui';

/** Last visit total shown on the sign, so switching parks ticks from it. */
let lastVisits: number | null = null;

export const isParkView = (v: View): boolean => PARK_TABS.some((t) => t.id === v);

export function parkSign(park: ParkDetail): HTMLElement {
  const isNat = park.code === NATIONAL;
  const visitsEl = h('b', {}, park.latestAnnual != null ? fmtInt(park.latestAnnual) : String(park.firstYear));
  if (park.latestAnnual != null) {
    if (lastVisits != null && lastVisits !== park.latestAnnual) countUp(visitsEl, lastVisits, park.latestAnnual, fmtInt);
    lastVisits = park.latestAnnual;
  }
  const seed = [...park.code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const eyebrow = [
    !isNat && !['Unknown', 'Other', 'Not in NPS API'].includes(park.designation) ? park.designation : null,
    stateLine(park.states),
  ].filter(Boolean).join(' · ');
  return h('section', { class: 'park-sign' },
    topo({ seed, scale: 440, levels: 20, grid: 160 }),
    h('div', { class: 'sign-text' },
      h('p', { class: 'eyebrow' }, eyebrow || 'National Park System'),
      h('h1', {}, isNat ? 'All park units' : park.shortName && park.shortName !== park.name ? park.shortName : park.name),
      isNat || park.shortName === park.name ? null : h('p', { class: 'sign-sub' }, park.name)),
    h('div', { class: 'sign-stat' },
      h('p', { class: 'eyebrow' }, park.latestAnnual != null ? `${park.lastYear} visits` : `Counted since ${park.firstYear}`),
      visitsEl));
}

export function parkTabs(view: View, code: string): HTMLElement {
  return h('nav', { class: 'park-tabs', 'aria-label': 'Park pages' },
    ...PARK_TABS.map((t) => h('a', {
      href: `?view=${t.id}&park=${code}`,
      'aria-current': t.id === view ? 'page' : undefined,
      onclick: (e: Event) => { e.preventDefault(); if (t.id !== view) setState({ view: t.id }); },
    }, t.label)));
}

/** Sign + tabs, then the tab's own content in `.tab-body` (which animates on a tab switch). */
export function parkPage(park: ParkDetail, view: View, ...body: (Node | string | null | undefined | false)[]): Node[] {
  return [parkSign(park), parkTabs(view, park.code),
    h('div', { class: 'tab-body' }, ...body.filter((c): c is Node | string => c != null && c !== false))];
}

/**
 * The entry state for pages about one park (Park profile, Season drift, Compare) when no park
 * has been chosen yet: an entrance-sign banner with a search field, then rows of small park
 * signs (topo contours, the park's name, its typical year) to pick from.
 */
import * as d3 from 'd3';
import { topo } from '../art';
import { MONTHS, MONTHS_LONG, fmtCompact, fmtPct, isNationalPark, stateLine, type IndexFile, type ParkSummary } from '../data';
import { miniFingerprint, quietestParks } from '../insights';
import { parkPicker, parkTitle } from '../parkPicker';
import { fill, h } from '../ui';

interface PickOpts {
  title: string;
  lede: string;
  label: string;
  /** Leave this park out of the suggestions (Compare's other park). */
  skip?: string;
  onPick: (code: string) => void;
}

const PER_ROW = 8;
const seedOf = (code: string) => [...code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);

export function renderPickPark(root: HTMLElement, idx: IndexFile, o: PickOpts): void {
  const now = new Date().getMonth();
  const ok = (p: ParkSummary) => p.code !== o.skip && p.profile != null;
  const nps = idx.parks.filter((p) => isNationalPark(p) && ok(p));
  const popular = nps.filter((p) => p.latestAnnual != null)
    .sort((a, b) => b.latestAnnual! - a.latestAnnual!).slice(0, PER_ROW);
  const offPeak = quietestParks(idx.parks.filter(ok), now, PER_ROW);
  // One bar scale for every card, so a tall spike means the same thing everywhere.
  const yMax = d3.quantile(nps.map((p) => d3.max(p.profile!)!).sort(d3.ascending), 0.95) ?? 0.25;

  let n = 0;
  const card = (p: ParkSummary, stat: string) => {
    const peak = p.peakMonth ? MONTHS[p.peakMonth - 1] : null;
    return h('button', {
      type: 'button', class: 'sign-card', style: `--i:${n++}`, onclick: () => o.onPick(p.code),
      'aria-label': `${parkTitle(idx, p)}, ${stateLine(p.states)}. ${stat}${peak ? `, peak in ${MONTHS_LONG[p.peakMonth! - 1]}` : ''}`,
    },
    topo({ seed: seedOf(p.code), scale: 220, levels: 14 }),
    h('span', { class: 'sign-card-top' },
      h('span', { class: 'eyebrow' }, stateLine(p.states)),
      h('span', { class: 'sign-card-name' }, parkTitle(idx, p))),
    h('span', { class: 'sign-card-year' },
      miniFingerprint(p.profile!, yMax, now, 120, 34),
      h('span', { class: 'sign-card-axis', 'aria-hidden': 'true' },
        ...MONTHS.map((m, i) => h('span', { class: i === now ? 'now' : undefined }, m[0])))),
    h('span', { class: 'sign-card-stat' }, h('span', {}, stat), peak ? h('span', { class: 'sign-card-peak' }, `Peak ${peak}`) : null));
  };

  const group = (head: string, sub: string, cards: HTMLElement[]) => cards.length
    ? h('section', { class: 'pick-group' },
      h('header', { class: 'pick-head' }, h('h2', { class: 'section-title' }, head), h('p', { class: 'muted small' }, sub)),
      h('div', { class: 'sign-grid' }, ...cards))
    : null;

  fill(root,
    h('section', { class: 'pick-hero' },
      topo({ seed: 23, scale: 520, levels: 22, grid: 200 }),
      h('div', { class: 'pick-hero-text' },
        h('h1', {}, o.title),
        h('p', {}, o.lede)),
      parkPicker(idx, { context: { kind: 'drift' }, label: o.label, includeNational: true, onPick: o.onPick })),
    group('Most visited', `National parks with the most visits in ${d3.max(popular, (p) => p.lastYear) ?? ''}. Bars show a typical year, with ${MONTHS_LONG[now]} highlighted.`,
      popular.map((p) => card(p, `${fmtCompact(p.latestAnnual!)} visits in ${p.lastYear}`))),
    group(`Off-peak in ${MONTHS_LONG[now]}`, `Open national parks with the lowest share of their year in ${MONTHS_LONG[now]}.`,
      offPeak.map((p) => card(p, `${fmtPct(p.profile![now], 1)} of its year in ${MONTHS[now]}`))),
  );
}

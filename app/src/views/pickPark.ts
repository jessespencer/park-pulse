/**
 * The entry state for pages about one park (Park profile, Season drift, Compare) when no park
 * has been chosen yet: a search field and a few suggestions instead of a silent default park.
 */
import { MONTHS_LONG, isNationalPark, type IndexFile, type ParkSummary } from '../data';
import { quietestParks } from '../insights';
import { parkPicker, parkRow } from '../parkPicker';
import { fill, h } from '../ui';

interface PickOpts {
  title: string;
  lede: string;
  label: string;
  /** Leave this park out of the suggestions (Compare's other park). */
  skip?: string;
  onPick: (code: string) => void;
}

export function renderPickPark(root: HTMLElement, idx: IndexFile, o: PickOpts): void {
  const now = new Date().getMonth();
  const ok = (p: ParkSummary) => p.code !== o.skip;
  const popular = idx.parks.filter((p) => isNationalPark(p) && p.latestAnnual != null && ok(p))
    .sort((a, b) => b.latestAnnual! - a.latestAnnual!).slice(0, 6);
  const offPeak = quietestParks(idx.parks.filter(ok), now, 6);

  const group = (head: string, parks: ParkSummary[], note: Parameters<typeof parkRow>[2]) => parks.length
    ? h('section', { class: 'pick-group' },
      h('h2', { class: 'section-title' }, head),
      h('div', { class: 'pick-grid' }, ...parks.map((p) => {
        const row = parkRow(idx, p, note);
        return h('button', { type: 'button', class: 'pick-card panel', onclick: () => o.onPick(p.code) },
          h('span', { class: 'pick-name' }, row.title), h('span', { class: 'muted small' }, row.sub));
      })))
    : null;

  fill(root,
    h('section', { class: 'page-head' },
      h('h1', { class: 'display-2' }, o.title),
      h('p', { class: 'explain' }, o.lede)),
    h('div', { class: 'pick-search' },
      parkPicker(idx, { context: { kind: 'drift' }, label: o.label, includeNational: true, onPick: o.onPick })),
    group('Most visited', popular, 'visits'),
    group(`Off-peak in ${MONTHS_LONG[now]}`, offPeak, { month: now }),
  );
}

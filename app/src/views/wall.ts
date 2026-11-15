import * as d3 from 'd3';
import { MONTHS, MONTHS_LONG, fmtCompact, fmtPct, isNationalPark, loadIndex, type ParkSummary } from '../data';
import { miniFingerprint } from '../insights';
import { setState, type AppState, type WallSort } from '../state';
import { fill, h, loading, segmented } from '../ui';

const SORTERS: Record<WallSort, (a: ParkSummary, b: ParkSummary) => number> = {
  peak: (a, b) => a.peakMonth! - b.peakMonth! || b.peakiness! - a.peakiness!,
  peakiness: (a, b) => b.peakiness! - a.peakiness!,
  total: (a, b) => (b.avgAnnual ?? 0) - (a.avgAnnual ?? 0),
};

export async function renderWall(root: HTMLElement, s: AppState): Promise<void> {
  fill(root, loading());
  const idx = await loadIndex();
  const withProfile = idx.parks.filter((p) => p.profile && p.peakMonth);
  let parks = s.scope === 'np' ? withProfile.filter(isNationalPark) : withProfile;
  const fallback = s.scope === 'np' && parks.length === 0;
  if (fallback) parks = withProfile;
  parks = [...parks].sort(SORTERS[s.sort]);

  // Robust shared scale: a few tiny, single-month units would otherwise flatten every card.
  const yMax = d3.quantile(parks.map((p) => d3.max(p.profile!)!).sort(d3.ascending), 0.95) ?? 0.2;
  const grid = h('div', { class: 'wall' });
  let lastPeak = 0;
  for (const p of parks) {
    if (s.sort === 'peak' && p.peakMonth !== lastPeak) {
      lastPeak = p.peakMonth!;
      grid.append(h('h3', { class: 'wall-group' }, h('span', {}, `Peak in ${MONTHS_LONG[lastPeak - 1]}`)));
    }
    grid.append(card(p, yMax));
  }

  fill(root, 
    h('section', { class: 'view-head' },
      h('div', {},
        h('h1', { class: 'display-2' }, 'Fingerprints'),
        h('p', { class: 'muted' },
          `Each park’s typical year: its share of year in each month, averaged over ${idx.profileYears[0]}–${idx.profileYears[idx.profileYears.length - 1]} (2020 excluded). All cards use one scale, so a tall spike means a short, concentrated season.`))),
    h('div', { class: 'controls' },
      segmented<WallSort>('Sort by', [
        { value: 'peak', label: 'Peak month' },
        { value: 'peakiness', label: 'Busiest 3 months' },
        { value: 'total', label: 'Total visits' },
      ], s.sort, (v) => setState({ sort: v })),
      idx.hasMetadata && segmented<'np' | 'all'>('Which units', [
        { value: 'np', label: 'National parks' },
        { value: 'all', label: 'All park units' },
      ], s.scope, (v) => setState({ scope: v }))),
    fallback && h('p', { class: 'warn' }, 'Park designations aren’t loaded yet (NPS API metadata missing), so this shows every unit.'),
    h('p', { class: 'hint muted' }, `${parks.length} parks. “Top 3” is the share of a typical year’s visits in the park’s busiest 3 months. Select a park to open its profile.`),
    grid,
  );
}

function card(p: ParkSummary, yMax: number): HTMLElement {
  return h('button', {
    type: 'button', class: 'fp-card',
    title: `${p.name}: peak in ${MONTHS_LONG[p.peakMonth! - 1]}; busiest 3 months hold ${fmtPct(p.peakiness!, 0)} of the year`,
    onclick: () => setState({ view: 'park', park: p.code }),
  },
  h('span', { class: 'fp-name' }, p.shortName),
  h('span', { class: 'fp-peak' }, `Peak ${MONTHS[p.peakMonth! - 1]}`),
  miniFingerprint(p.profile!, yMax, p.peakMonth! - 1, 132, 46),
  h('span', { class: 'fp-meta muted' }, `${fmtPct(p.peakiness!, 0)} in top 3 · ${p.avgAnnual ? fmtCompact(p.avgAnnual) : '—'}/yr`));
}

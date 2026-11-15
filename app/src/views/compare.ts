import { MONTHS_LONG, fmtCompact, fmtInt, fmtPct, isNationalPark, loadIndex, loadPark, type IndexFile, type ParkDetail, type ParkSummary } from '../data';
import { gridMax, renderHeatmap, type HeatmapHandle } from '../heatmap';
import { setState, type AppState } from '../state';
import { esc } from '../tooltip';
import { parkPicker } from '../parkPicker';
import { parkPage } from './parkHeader';
import { renderPickPark, signCard, signScale } from './pickPark';
import { errorBox, fill, h, loading, modeToggle } from '../ui';

export async function renderCompare(root: HTMLElement, s: AppState): Promise<void> {
  fill(root, loading());
  const idx = await loadIndex();
  if (!s.park) {
    renderPickPark(root, idx, {
      title: 'Compare', label: 'Find a park',
      lede: 'Pick a park, then choose a second one beside it to see both heatmaps month by month.',
      onPick: (v) => setState({ park: v }),
    });
    return;
  }
  const [a, b] = await Promise.all([loadPark(s.park).catch(() => null), s.b ? loadPark(s.b).catch(() => null) : null]);
  if (!a) {
    fill(root, errorBox(`No visitation data for park code “${s.park}”.`));
    return;
  }
  const hostA = h('div', {}), hostB = h('div', {});
  const legA = h('div', { class: 'legend' }), legB = h('div', { class: 'legend' });
  const readout = h('div', { class: 'readout', 'aria-live': 'polite' }, h('span', { class: 'muted' }, 'Point to or tap a month in either heatmap to see both parks’ counts for it.'));
  const pickB = (v: string) => setState({ b: v });

  const second = b
    ? h('div', { class: 'compare-col' },
      parkPicker(idx, { context: { kind: 'compare', other: a.code }, label: 'Compared with', value: b.code, includeNational: true, onPick: pickB }),
      legB, hostB)
    : h('div', { class: 'compare-col compare-pick' },
      parkPicker(idx, { context: { kind: 'compare', other: a.code }, label: 'Compare with', includeNational: true, onPick: pickB }),
      h('p', { class: 'muted small' }, 'Or start with one of these:'),
      h('div', { class: 'sign-grid is-tight' }, ...suggestions(idx, a).map((p, i) =>
        signCard(idx, p, { yMax: signScale(idx), now: new Date().getMonth(), i, onPick: pickB,
          stat: p.latestAnnual != null ? `${fmtCompact(p.latestAnnual)} visits in ${p.lastYear}` : p.states.join(', ') }))));

  fill(root, ...parkPage(a, 'compare',
    h('header', { class: 'tab-head' },
      h('h2', { class: 'section-title' }, b ? `${nameOf(a)} and ${nameOf(b)}` : `Compare ${nameOf(a)} with…`),
      h('p', { class: 'muted' }, b
        ? `Monthly visits to both parks, ${Math.max(a.firstYear, b.firstYear)}–${Math.min(a.lastYear, b.lastYear)}.`
        : 'Choose a second park to see its heatmap beside this one.')),
    h('div', { class: 'controls' }, modeToggle(s.mode)),
    b && h('p', { class: 'hint muted' }, s.mode === 'visits'
      ? 'Each heatmap has its own color range, since the parks differ in size. Switch to Share of year to compare colors directly.'
      : 'Both heatmaps use one color range, so colors compare directly.'),
    b && readout,
    h('div', { class: b ? 'compare is-pair' : 'compare' },
      h('div', { class: 'compare-col' },
        // Same height as the picker beside it, so the two heatmaps line up.
        h('div', { class: 'compare-fixed' }, h('span', { class: 'picker-label' }, 'This park'), h('span', { class: 'compare-fixed-name' }, nameOf(a))),
        legA, hostA),
      second)));

  let ha: HeatmapHandle | null = null, hb: HeatmapHandle | null = null;
  const sync = (year: number | null, month: number | null) => {
    ha?.highlight(year, month);
    hb?.highlight(year, month);
    if (!b || year == null || month == null) return;
    readout.innerHTML = `<strong>${MONTHS_LONG[month - 1]} ${year}</strong> ${line(a, year, month)} ${line(b, year, month)}`;
  };
  // Share and index are comparable across parks, so both maps use one color domain.
  const max = b && s.mode === 'share' ? Math.max(gridMax(a, 'share'), gridMax(b, 'share')) : undefined;
  ha = renderHeatmap(hostA, a, s.mode, b ? { onHover: sync, tooltip: false, legendHost: legA, max } : { legendHost: legA });
  if (b) hb = renderHeatmap(hostB, b, s.mode, { onHover: sync, tooltip: false, legendHost: legB, max });
}

/** Parks worth comparing with `a`: its neighbors in the same state first, then the most visited. */
function suggestions(idx: IndexFile, a: ParkDetail): ParkSummary[] {
  const ok = (p: ParkSummary) => p.code !== a.code && p.profile != null && p.latestAnnual != null;
  const byVisits = (x: ParkSummary, y: ParkSummary) => y.latestAnnual! - x.latestAnnual!;
  const near = idx.parks.filter((p) => ok(p) && isNationalPark(p) && p.states.some((st) => a.states.includes(st))).sort(byVisits).slice(0, 2);
  const top = idx.parks.filter((p) => ok(p) && isNationalPark(p) && !near.includes(p)).sort(byVisits);
  return [...near, ...top].slice(0, 4);
}

const nameOf = (p: ParkDetail): string => p.shortName || p.name;

function line(p: ParkDetail, year: number, month: number): string {
  const k = year - p.firstYear;
  const v = p.visits[k]?.[month - 1];
  const sh = p.share[k]?.[month - 1];
  const notes = p.notes.filter((n) => n.year === year && n.month === month).length;
  const body = v == null ? '<span class="muted">no data</span>'
    : `${fmtInt(v)}${sh != null ? ` <span class="muted">(${fmtPct(sh)} of year)</span>` : ''}${notes ? ' ⚑' : ''}`;
  return `<span class="readout-item"><span class="muted">${esc(p.shortName ?? p.code)}:</span> ${body}</span>`;
}

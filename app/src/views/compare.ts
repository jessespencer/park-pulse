import { MONTHS_LONG, fmtInt, fmtPct, loadIndex, loadPark, type ParkDetail } from '../data';
import { gridMax, renderHeatmap, type HeatmapHandle } from '../heatmap';
import { setState, type AppState } from '../state';
import { esc } from '../tooltip';
import { parkPicker } from '../parkPicker';
import { renderPickPark } from './pickPark';
import { errorBox, fill, h, loading, modeToggle } from '../ui';

export async function renderCompare(root: HTMLElement, s: AppState): Promise<void> {
  fill(root, loading());
  if (!s.a || !s.b) {
    const idx = await loadIndex();
    const first = s.a || s.b;
    const name = first ? idx.parks.find((p) => p.code === first)?.shortName ?? first : '';
    renderPickPark(root, idx, first
      ? { title: `Compare ${name} with…`, label: 'Find a second park', skip: first,
        lede: 'Pick a second park to see both heatmaps side by side, month by month.',
        onPick: (v) => setState(s.a ? { b: v } : { a: v }) }
      : { title: 'Compare', label: 'Find a park',
        lede: 'Pick two parks to see their monthly visits side by side. Start with the first.',
        onPick: (v) => setState({ a: v }) });
    return;
  }
  const [idx, a, b] = await Promise.all([loadIndex(), loadPark(s.a).catch(() => null), loadPark(s.b).catch(() => null)]);
  if (!a || !b) {
    fill(root, errorBox(`No visitation data for “${!a ? s.a : s.b}”.`));
    return;
  }
  const readout = h('div', { class: 'readout', 'aria-live': 'polite' }, h('span', { class: 'muted' }, 'Point to or tap a month in either heatmap to see both parks’ counts for it.'));
  const hostA = h('div', {}), hostB = h('div', {});
  const legA = h('div', { class: 'legend' }), legB = h('div', { class: 'legend' });

  fill(root, 
    h('section', { class: 'view-head' }, h('div', {}, h('p', { class: 'eyebrow dark' }, 'Compare'),
      h('h1', { class: 'display-2' }, `${nameOf(a)} and ${nameOf(b)}`),
      h('p', { class: 'muted' }, `Monthly visits to both parks, ${Math.max(a.firstYear, b.firstYear)}–${Math.min(a.lastYear, b.lastYear)}.`))),
    h('div', { class: 'controls' }, modeToggle(s.mode)),
    h('p', { class: 'hint muted' }, s.mode === 'visits'
      ? 'Each heatmap has its own color range, since the parks differ in size. Switch to Share of year to compare colors directly.'
      : 'Both heatmaps use one color range, so colors compare directly.'),
    readout,
    h('div', { class: 'compare' },
      h('div', {}, parkPicker(idx, { context: { kind: 'compare', other: b.code }, label: 'First park', value: a.code, includeNational: true, onPick: (v) => setState({ a: v }) }), legA, hostA),
      h('div', {}, parkPicker(idx, { context: { kind: 'compare', other: a.code }, label: 'Second park', value: b.code, includeNational: true, onPick: (v) => setState({ b: v }) }), legB, hostB)),
  );

  let ha: HeatmapHandle | null = null, hb: HeatmapHandle | null = null;
  const sync = (year: number | null, month: number | null) => {
    ha?.highlight(year, month);
    hb?.highlight(year, month);
    if (year == null || month == null) return;
    readout.innerHTML = `<strong>${MONTHS_LONG[month - 1]} ${year}</strong> ${line(a, year, month)} ${line(b, year, month)}`;
  };
  // Share and index are comparable across parks, so both maps use one color domain.
  const max = s.mode === 'share' ? Math.max(gridMax(a, 'share'), gridMax(b, 'share')) : undefined;
  ha = renderHeatmap(hostA, a, s.mode, { onHover: sync, tooltip: false, legendHost: legA, max });
  hb = renderHeatmap(hostB, b, s.mode, { onHover: sync, tooltip: false, legendHost: legB, max });
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

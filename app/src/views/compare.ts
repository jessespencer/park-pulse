import { MONTHS_LONG, fmtInt, fmtPct, loadIndex, loadPark, type ParkDetail } from '../data';
import { gridMax, renderHeatmap, type HeatmapHandle } from '../heatmap';
import { setState, type AppState } from '../state';
import { esc } from '../tooltip';
import { errorBox, fill, h, loading, modeToggle, parkOptions, select } from '../ui';

export async function renderCompare(root: HTMLElement, s: AppState): Promise<void> {
  fill(root, loading());
  const [idx, a, b] = await Promise.all([loadIndex(), loadPark(s.a).catch(() => null), loadPark(s.b).catch(() => null)]);
  if (!a || !b) {
    fill(root, errorBox(`No visitation data for “${!a ? s.a : s.b}”.`));
    return;
  }
  const readout = h('div', { class: 'readout', 'aria-live': 'polite' }, h('span', { class: 'muted' }, 'Hover a cell to compare the same month in both parks.'));
  const hostA = h('div', {}), hostB = h('div', {});
  const legA = h('div', { class: 'legend' }), legB = h('div', { class: 'legend' });
  const opts = parkOptions(idx);

  fill(root, 
    h('section', { class: 'view-head' }, h('div', {}, h('p', { class: 'eyebrow dark' }, 'Side by side'), h('h1', { class: 'display-2' }, 'Compare two parks'),
      h('p', { class: 'muted' }, 'In Visits mode each heatmap uses its own color range (parks differ in size). Share of year and Index use one shared scale, so colors compare directly.'))),
    h('div', { class: 'controls' }, modeToggle(s.mode)),
    readout,
    h('div', { class: 'compare' },
      h('div', {}, select('Park A', opts, a.code, (v) => setState({ a: v })), legA, hostA),
      h('div', {}, select('Park B', opts, b.code, (v) => setState({ b: v })), legB, hostB)),
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

function line(p: ParkDetail, year: number, month: number): string {
  const k = year - p.firstYear;
  const v = p.visits[k]?.[month - 1];
  const sh = p.share[k]?.[month - 1];
  const notes = p.notes.filter((n) => n.year === year && n.month === month).length;
  const body = v == null ? '<span class="muted">no data</span>'
    : `${fmtInt(v)}${sh != null ? ` <span class="muted">(${fmtPct(sh)} of year)</span>` : ''}${notes ? ' ⚑' : ''}`;
  return `<span class="readout-item"><span class="muted">${esc(p.shortName ?? p.code)}:</span> ${body}</span>`;
}

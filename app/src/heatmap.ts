import * as d3 from 'd3';
import { MONTHS, MONTHS_LONG, fmtInt, fmtPct, type Grid, type Note, type ParkDetail } from './data';
import { makeScale, renderLegend, type ColorScale } from './scales';
import type { Mode } from './state';
import { esc, hideTooltip, showTooltip } from './tooltip';

export interface HeatmapHandle {
  highlight: (year: number | null, month: number | null) => void;
  scale: ColorScale;
}

interface Options {
  onHover?: (year: number | null, month: number | null) => void;
  /** Suppress the built-in tooltip (compare view shows a shared readout instead). */
  tooltip?: boolean;
  legendHost?: HTMLElement;
  /** Fix the color domain max (compare view shares one scale across parks). */
  max?: number;
}

const KIND_LABEL: Record<Note['kind'], string> = { shutdown: 'Shutdown', covid: 'COVID closures', data: 'Data note' };

export function gridFor(park: ParkDetail, mode: Mode): Grid {
  return mode === 'share' ? park.share : mode === 'index' ? park.index : park.visits;
}

export function gridMax(park: ParkDetail, mode: Mode): number {
  return d3.max(gridFor(park, mode).flat(), (v) => v ?? 0) ?? 0;
}

export function cellDetail(park: ParkDetail, year: number, month: number): string {
  const k = year - park.firstYear;
  const v = park.visits[k]?.[month - 1];
  const s = park.share[k]?.[month - 1];
  const i = park.index[k]?.[month - 1];
  const yy = park.yoy?.[k]?.[month - 1];
  const notes = park.notes.filter((n) => n.year === year && n.month === month);
  const lines = [`<strong>${MONTHS_LONG[month - 1]} ${year}</strong>`];
  if (v == null) lines.push('<span class="muted">No data reported</span>');
  else {
    lines.push(`<span class="big">${fmtInt(v)}</span> recreation visits`);
    const extra = [
      s != null ? `${fmtPct(s)} of year` : null,
      i != null ? `index ${Math.round(i)}` : null,
      yy != null ? `${yy >= 0 ? '+' : ''}${fmtPct(yy, 0)} vs ${year - 1}` : null,
    ].filter(Boolean);
    if (extra.length) lines.push(`<span class="muted">${extra.join(' · ')}</span>`);
  }
  for (const n of notes) lines.push(`<span class="note note-${n.kind}">⚑ ${esc(n.text)}</span>`);
  return lines.join('<br>');
}

export function renderHeatmap(host: HTMLElement, park: ParkDetail, mode: Mode, opts: Options = {}): HeatmapHandle {
  host.replaceChildren();
  host.classList.add('heatmap');
  const grid = gridFor(park, mode);
  const scale = makeScale(mode, opts.max ?? gridMax(park, mode));
  if (opts.legendHost) renderLegend(opts.legendHost, scale);

  const W = Math.max(host.clientWidth, 280);
  const narrow = W < 520;
  const ml = 38;
  const mr = narrow ? 64 : 112;
  const cw = (W - ml - mr) / 12;
  const ch = narrow ? 16 : 13;
  const years = park.years;
  const H = years.length * ch;

  // Sticky month header (HTML, so it stays put while the page scrolls by year).
  const header = document.createElement('div');
  header.className = 'month-header';
  header.style.paddingLeft = `${ml}px`;
  header.style.paddingRight = `${mr}px`;
  header.setAttribute('aria-hidden', 'true');
  for (const m of MONTHS) {
    const span = document.createElement('span');
    span.textContent = narrow ? m[0] : m;
    header.append(span);
  }
  host.append(header);

  const svg = d3.select(host).append('svg')
    .attr('width', W).attr('height', H + 4).attr('viewBox', `0 0 ${W} ${H + 4}`)
    .attr('role', 'img')
    .attr('aria-label', `${park.name}: monthly recreation visits ${park.firstYear}–${park.lastYear}, ${mode === 'visits' ? 'absolute' : mode === 'share' ? 'share of year' : 'index vs normal'}`);

  const defs = svg.append('defs');
  defs.append('pattern').attr('id', 'nodata').attr('width', 4).attr('height', 4)
    .attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)')
    .call((p) => {
      p.append('rect').attr('width', 4).attr('height', 4).attr('fill', 'var(--surface-2)');
      p.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 4).attr('stroke', 'var(--border)').attr('stroke-width', 1.5);
    });

  const cells: { year: number; month: number; v: number | null }[] = [];
  years.forEach((year, k) => {
    for (let m = 1; m <= 12; m++) cells.push({ year, month: m, v: grid[k]?.[m - 1] ?? null });
  });
  // A month that exists in the raw counts but has no derived value (e.g. share of an
  // incomplete year) is "not computable", not "no data" — still hatched, tooltip explains.
  svg.append('g').selectAll('rect').data(cells).join('rect')
    .attr('x', (d) => ml + (d.month - 1) * cw)
    .attr('y', (d) => (d.year - years[0]) * ch)
    .attr('width', cw - 1).attr('height', ch - 1)
    .attr('fill', (d) => (d.v == null ? 'url(#nodata)' : scale.color(d.v)));

  // Year labels: every 5 years, plus first/last.
  const yl = svg.append('g').attr('class', 'axis-label');
  years.forEach((y, k) => {
    if (y % 5 === 0 || k === 0 || k === years.length - 1) {
      yl.append('text').attr('x', ml - 6).attr('y', k * ch + ch / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text(y);
    }
  });

  // Annotations: corner flags on cells, labels in the right margin.
  const noteCells = d3.group(park.notes, (n) => `${n.year}-${n.month}`);
  const ann = svg.append('g').attr('class', 'annotations');
  for (const [, ns] of noteCells) {
    const { year, month } = ns[0];
    if (year < years[0] || year > years[years.length - 1]) continue;
    const x = ml + (month - 1) * cw;
    const y = (year - years[0]) * ch;
    const kind = ns.some((n) => n.kind === 'covid') ? 'covid' : ns[0].kind;
    ann.append('rect').attr('class', `ann-outline ann-${kind}`).attr('x', x + 0.5).attr('y', y + 0.5)
      .attr('width', cw - 2).attr('height', ch - 2);
    ann.append('path').attr('class', `ann-flag ann-${kind}`)
      .attr('d', `M${x + cw - 1 - 6},${y} h6 v6 z`);
  }
  const byYear = d3.group(park.notes, (n) => n.year);
  for (const [year, ns] of byYear) {
    if (year < years[0] || year > years[years.length - 1]) continue;
    const kinds = [...new Set(ns.map((n) => n.kind))];
    const label = kinds.map((k) => KIND_LABEL[k]).join(', ');
    ann.append('text').attr('class', `ann-label ann-${kinds[0]}`)
      .attr('x', W - mr + 6).attr('y', (year - years[0]) * ch + ch / 2).attr('dy', '0.35em')
      .text(narrow ? (kinds.includes('covid') ? 'COVID' : kinds.includes('shutdown') ? 'Shutdown' : 'Note') : `⚑ ${label}`);
  }

  const hl = svg.append('rect').attr('class', 'cell-highlight').attr('width', cw + 1).attr('height', ch + 1)
    .attr('visibility', 'hidden').attr('pointer-events', 'none');
  const highlight = (year: number | null, month: number | null) => {
    if (year == null || month == null || year < years[0] || year > years[years.length - 1]) {
      hl.attr('visibility', 'hidden');
      return;
    }
    hl.attr('x', ml + (month - 1) * cw - 1).attr('y', (year - years[0]) * ch - 1).attr('visibility', 'visible');
  };

  const locate = (ev: PointerEvent): [number, number] | null => {
    const [px, py] = d3.pointer(ev, svg.node());
    const m = Math.floor((px - ml) / cw) + 1;
    const k = Math.floor(py / ch);
    if (m < 1 || m > 12 || k < 0 || k >= years.length) return null;
    return [years[k], m];
  };
  const move = (ev: PointerEvent) => {
    const hit = locate(ev);
    if (!hit) {
      highlight(null, null);
      hideTooltip();
      opts.onHover?.(null, null);
      return;
    }
    highlight(hit[0], hit[1]);
    if (opts.tooltip !== false) showTooltip(cellDetail(park, hit[0], hit[1]), ev.clientX, ev.clientY);
    opts.onHover?.(hit[0], hit[1]);
  };
  svg.on('pointermove', move).on('pointerdown', move).on('pointerleave', () => {
    highlight(null, null);
    hideTooltip();
    opts.onHover?.(null, null);
  });

  return { highlight, scale };
}

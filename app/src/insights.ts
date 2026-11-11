import * as d3 from 'd3';
import { MONTHS, type ParkSummary } from './data';

/** Below this share of a park's year, a month is effectively off-season (often closed). */
export const OFF_SEASON = 0.02;

/** Open months (≥ OFF_SEASON) sorted quietest first, as 0-based month indexes. */
export function quietMonths(p: ParkSummary): number[] {
  if (!p.profile) return [];
  return d3.range(12).filter((m) => p.profile![m] >= OFF_SEASON).sort((a, b) => p.profile![a] - p.profile![b]);
}

/** Months above an even 1/12 share — the park's "busy season". */
export function busyMonths(p: ParkSummary): number[] {
  return p.profile ? d3.range(12).filter((m) => p.profile![m] > 1 / 12) : [];
}

export function monthSpan(months: number[]): string {
  if (!months.length) return '—';
  const sorted = [...months].sort((a, b) => a - b);
  // Contiguous run(s), wrapping Dec→Jan for winter parks.
  const runs: number[][] = [];
  for (const m of sorted) {
    const last = runs[runs.length - 1];
    if (last && m === last[last.length - 1] + 1) last.push(m);
    else runs.push([m]);
  }
  if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1].at(-1) === 11) {
    runs[0] = [...runs.pop()!, ...runs[0]];
  }
  return runs.map((r) => (r.length === 1 ? MONTHS[r[0]] : `${MONTHS[r[0]]}–${MONTHS[r[r.length - 1]]}`)).join(', ');
}

/**
 * Tiny 12-bar fingerprint. `highlight` marks one month (0-based) in the accent,
 * with an outline as secondary encoding so it isn't color-alone.
 */
export function miniFingerprint(profile: number[], yMax: number, highlight: number | null = null, w = 120, h = 34): SVGSVGElement {
  const bw = w / 12;
  const y = d3.scaleLinear().domain([0, yMax]).range([0, h]).clamp(true);
  const svg = d3.create('svg').attr('class', 'mini-fp').attr('viewBox', `0 0 ${w} ${h + 1}`)
    .attr('width', '100%').attr('height', h + 1).attr('preserveAspectRatio', 'none').attr('aria-hidden', 'true');
  svg.selectAll('rect').data(profile).join('rect')
    .attr('x', (_, i) => i * bw + 1).attr('width', bw - 2)
    .attr('y', (v) => h - Math.max(y(v), 1)).attr('height', (v) => Math.max(y(v), 1))
    .attr('rx', 1.5)
    .attr('class', (_, i) => (i === highlight ? 'fp-bar hl' : 'fp-bar'));
  svg.append('line').attr('class', 'even-line').attr('x1', 0).attr('x2', w).attr('y1', h - y(1 / 12)).attr('y2', h - y(1 / 12));
  return svg.node()!;
}

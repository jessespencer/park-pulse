import * as d3 from 'd3';
import type { Mode } from './state';

/** Theme the page is actually rendering in (explicit choice, else OS preference). */
export function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Viridis is perceptually uniform and colorblind-safe. We orient it so "more
 * visits" always means "more contrast against the page": light→dark on the
 * light theme, dark→light on the dark theme.
 */
export function sequentialInterpolator(): (t: number) => string {
  return isDark() ? d3.interpolateViridis : (t: number) => d3.interpolateViridis(1 - t);
}

export interface ColorScale {
  color: (v: number) => string;
  /** Legend: gradient stops [0..1] → color, plus labelled ticks. */
  stops: (t: number) => string;
  ticks: { value: number; pos: number; label: string }[];
  unit: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function makeScale(mode: Mode, max: number): ColorScale {
  const interp = sequentialInterpolator();
  if (mode === 'index') {
    // Diverging around 100 (= the park's typical level for that month), log2 so
    // half and double are equidistant. PuOr is colorblind-safe.
    const lim = 2; // ¼× … 4×
    const s = d3.scaleDiverging<string>(d3.interpolatePuOr).domain([-lim, 0, lim]).clamp(true);
    const toT = (v: number) => Math.log2(Math.max(v, 1) / 100);
    const marks = [25, 50, 100, 200, 400];
    return {
      color: (v) => s(toT(v)),
      stops: (t) => d3.interpolatePuOr(t),
      ticks: marks.map((m) => ({ value: m, pos: (toT(m) + lim) / (2 * lim), label: m === 100 ? '100 (normal)' : String(m) })),
      unit: 'Index vs this park’s 1979–2019 median for the same month (100 = typical; purple below, orange above)',
    };
  }
  const domainMax = Math.max(max, mode === 'share' ? 0.01 : 1);
  const s = d3.scaleSequentialSqrt(interp).domain([0, domainMax]).clamp(true);
  const lin = d3.scaleSqrt().domain([0, domainMax]).range([0, 1]);
  const tickVals = d3.scaleSqrt().domain([0, domainMax]).ticks(4).filter((v) => v <= domainMax);
  return {
    color: (v) => s(Math.max(v, 0)),
    stops: (t) => interp(t),
    ticks: tickVals.map((v) => ({
      value: v,
      pos: lin(v),
      label: mode === 'share' ? pct(v) : d3.format('~s')(v),
    })),
    unit: mode === 'share'
      ? 'Share of that year’s recreation visits (%)'
      : 'Recreation visits per month (square-root color scale)',
  };
}

/** Draw a horizontal legend into `host`. */
export function renderLegend(host: HTMLElement, scale: ColorScale): void {
  host.replaceChildren();
  const w = Math.min(host.clientWidth || 320, 360);
  const h = 10;
  const svg = d3.select(host).append('svg').attr('width', w).attr('height', 34).attr('role', 'img')
    .attr('aria-label', `Color legend: ${scale.unit}`);
  const id = `lg-${Math.random().toString(36).slice(2, 8)}`;
  const grad = svg.append('defs').append('linearGradient').attr('id', id);
  d3.range(0, 1.0001, 0.05).forEach((t) =>
    grad.append('stop').attr('offset', `${t * 100}%`).attr('stop-color', scale.stops(t)));
  svg.append('rect').attr('x', 0.5).attr('y', 0.5).attr('width', w - 1).attr('height', h)
    .attr('fill', `url(#${id})`).attr('stroke', 'var(--border)');
  const g = svg.append('g').attr('class', 'legend-ticks');
  for (const t of scale.ticks) {
    const x = Math.min(Math.max(t.pos * (w - 1), 1), w - 2);
    g.append('line').attr('x1', x).attr('x2', x).attr('y1', h).attr('y2', h + 4).attr('stroke', 'var(--muted)');
    g.append('text').attr('x', x).attr('y', h + 16)
      .attr('text-anchor', t.pos < 0.05 ? 'start' : t.pos > 0.95 ? 'end' : 'middle').text(t.label);
  }
  const cap = document.createElement('p');
  cap.className = 'legend-unit';
  cap.textContent = scale.unit;
  host.append(cap);
}

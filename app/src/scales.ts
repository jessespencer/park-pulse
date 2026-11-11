import * as d3 from 'd3';
import type { Mode } from './state';

/** Theme the page is actually rendering in (explicit choice, else OS preference). */
export function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/*
 * "Pine" sequential ramp: one green hue family, lightness strictly monotonic
 * (OKLab L 0.92 → 0.32 light / 0.26 → 0.94 dark), checked with the dataviz
 * validator's lightness test. "More visits" always means more contrast against
 * the page: light→dark on Day, dark→light on Night.
 */
const PINE_DAY = ['#E6EAC6', '#D3E2B4', '#A2C98E', '#68A877', '#3B8463', '#225F4C', '#123B33'];
const PINE_NIGHT = ['#1A2723', '#24402F', '#33613F', '#4E8550', '#7AAA68', '#B3CF8E', '#E9F0C6'];
/* Diverging "Trail": teal (quieter than usual) ↔ warm neutral ↔ rust (busier). */
const TRAIL_DAY = ['#1D5A5E', '#3F8682', '#8EBBB2', '#E6E1D4', '#DDB27F', '#B8723A', '#7A3F1D'];
const TRAIL_NIGHT = ['#3D8F8E', '#2C6866', '#22413F', '#33322E', '#5A3E26', '#99602F', '#E09A55'];

export function sequentialInterpolator(): (t: number) => string {
  return d3.piecewise(d3.interpolateLab, isDark() ? PINE_NIGHT : PINE_DAY);
}

export function divergingInterpolator(): (t: number) => string {
  return d3.piecewise(d3.interpolateLab, isDark() ? TRAIL_NIGHT : TRAIL_DAY);
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
    // half and double are equidistant. Teal↔rust (BrBG family) is colorblind-safe.
    const lim = 2; // ¼× … 4×
    const div = divergingInterpolator();
    const s = d3.scaleDiverging<string>(div).domain([-lim, 0, lim]).clamp(true);
    const toT = (v: number) => Math.log2(Math.max(v, 1) / 100);
    const marks = [25, 50, 100, 200, 400];
    return {
      color: (v) => s(toT(v)),
      stops: div,
      ticks: marks.map((m) => ({ value: m, pos: (toT(m) + lim) / (2 * lim), label: m === 100 ? '100 (normal)' : String(m) })),
      unit: 'Index vs this park’s 1979–2019 median for the same month (100 = typical; teal = quieter, rust = busier)',
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

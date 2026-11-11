import * as d3 from 'd3';
import { MONTHS, MONTHS_LONG, NATIONAL, fmtPct, loadIndex, loadPark, type ParkDetail } from '../data';
import { sequentialInterpolator } from '../scales';
import { setState, type AppState } from '../state';
import { errorBox, fill, h, loading, parkOptions, select } from '../ui';

/** A month is "in season" when it gets more than an even 1/12 share of the year. */
const EVEN = 1 / 12;

interface Decade { label: string; start: number; years: number[]; profile: number[] }

function decades(park: ParkDetail): Decade[] {
  const complete = park.years.filter((y, k) => y !== 2020 && park.share[k].every((v) => v != null));
  const groups = d3.groups(complete, (y) => Math.floor(y / 10) * 10);
  return groups.filter(([, ys]) => ys.length >= 3).map(([start, ys]) => ({
    label: `${start}s`, start, years: ys,
    profile: d3.range(12).map((m) => d3.mean(ys, (y) => park.share[y - park.firstYear][m]!)!),
  }));
}

const seasonText = (p: number[]): string => {
  const months = p.map((v, i) => (v > EVEN ? i : -1)).filter((i) => i >= 0);
  if (!months.length) return 'no clear season';
  return `${MONTHS[months[0]]}–${MONTHS[months[months.length - 1]]} (${months.length} mo)`;
};

export async function renderDrift(root: HTMLElement, s: AppState): Promise<void> {
  fill(root, loading());
  const [idx, park] = await Promise.all([loadIndex(), loadPark(s.park).catch(() => null)]);
  if (!park) {
    fill(root, errorBox(`No visitation data for park code “${s.park}”.`));
    return;
  }
  const ds = decades(park);
  const lines = h('div', { class: 'chart' });
  const strip = h('div', { class: 'chart' });
  const table = h('table', { class: 'drift-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Decade'), h('th', {}, 'Peak month'), h('th', {}, 'Busy season'), h('th', {}, 'Peak share'))),
    h('tbody', {}, ...ds.map((d) => {
      const pk = d3.maxIndex(d.profile);
      return h('tr', {}, h('td', {}, d.label), h('td', {}, MONTHS_LONG[pk]), h('td', {}, seasonText(d.profile)), h('td', {}, fmtPct(d.profile[pk])));
    })));
  const first = ds[0], last = ds[ds.length - 1];
  const summary = first && last && first !== last
    ? `Peak went from ${MONTHS_LONG[d3.maxIndex(first.profile)]} in the ${first.label} to ${MONTHS_LONG[d3.maxIndex(last.profile)]} in the ${last.label}; busy season from ${seasonText(first.profile)} to ${seasonText(last.profile)}.`
    : 'Not enough complete years to compare decades.';

  fill(root, 
    h('section', { class: 'view-head' },
      h('div', {}, h('h1', {}, `Season drift: ${park.name}`), h('p', { class: 'lead' }, summary)),
      select('Park', parkOptions(idx), park.code === NATIONAL ? NATIONAL : park.code, (v) => setState({ park: v }))),
    h('h2', {}, 'Average monthly shape by decade'),
    h('p', { class: 'muted' }, 'Share of the year’s visits in each month, averaged over complete years in each decade (2020 excluded). Dashed line = an even 1/12 share.'),
    lines,
    h('h2', {}, 'Year by year'),
    h('p', { class: 'muted' }, 'Bars = busy season (months above an even share); dot = peak month. Hatched years are incomplete or 2020.'),
    strip,
    table,
  );
  drawLines(lines, ds);
  drawStrip(strip, park);
}

function drawLines(host: HTMLElement, ds: Decade[]): void {
  const W = Math.max(host.clientWidth, 300), H = 220, m = { t: 10, r: 60, b: 24, l: 40 };
  const x = d3.scalePoint<number>().domain(d3.range(12)).range([m.l, W - m.r]);
  const yMax = d3.max(ds, (d) => d3.max(d.profile)) ?? 0.2;
  const y = d3.scaleLinear().domain([0, yMax * 1.05]).nice().range([H - m.b, m.t]);
  const interp = sequentialInterpolator();
  const c = (i: number) => interp(0.2 + (0.8 * i) / Math.max(ds.length - 1, 1));
  const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%')
    .attr('role', 'img').attr('aria-label', 'Monthly share of visits by decade');
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickFormat((i) => MONTHS[i]).tickSizeOuter(0));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0%')));
  svg.append('line').attr('class', 'even-line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(EVEN)).attr('y2', y(EVEN));
  const line = d3.line<number>().x((_, i) => x(i)!).y((v) => y(v));
  ds.forEach((d, i) => {
    svg.append('path').datum(d.profile).attr('d', line).attr('fill', 'none').attr('stroke', c(i)).attr('stroke-width', 2);
    const lastV = d.profile[11];
    svg.append('text').attr('class', 'series-label').attr('x', W - m.r + 6).attr('y', y(lastV)).attr('dy', '0.35em')
      .attr('fill', c(i)).text(d.label);
  });
  // Nudge overlapping end labels apart.
  const labels = svg.selectAll<SVGTextElement, unknown>('.series-label').nodes().sort((a, b) => +a.getAttribute('y')! - +b.getAttribute('y')!);
  for (let i = 1; i < labels.length; i++) {
    const prev = +labels[i - 1].getAttribute('y')!, cur = +labels[i].getAttribute('y')!;
    if (cur - prev < 12) labels[i].setAttribute('y', String(prev + 12));
  }
}

function drawStrip(host: HTMLElement, park: ParkDetail): void {
  const W = Math.max(host.clientWidth, 300), m = { t: 4, r: 8, b: 24, l: 40 };
  const ch = 7, H = m.t + m.b + 12 * ch * 2;
  const x = d3.scaleBand<number>().domain(park.years).range([m.l, W - m.r]).paddingInner(0.15);
  const y = d3.scaleBand<number>().domain(d3.range(12)).range([m.t, H - m.b]);
  const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%')
    .attr('role', 'img').attr('aria-label', 'Busy season and peak month by year');
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).tickFormat((i) => MONTHS[i]).tickValues([0, 3, 6, 9, 11]).tickSizeOuter(0));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickValues(park.years.filter((yy) => yy % 10 === 0)).tickSizeOuter(0));
  park.years.forEach((yr, k) => {
    const sh = park.share[k];
    const ok = yr !== 2020 && sh.every((v) => v != null);
    if (!ok) {
      svg.append('rect').attr('x', x(yr)!).attr('y', m.t).attr('width', x.bandwidth()).attr('height', H - m.b - m.t).attr('class', 'strip-skip');
      return;
    }
    sh.forEach((v, i) => {
      if (v! > EVEN) svg.append('rect').attr('class', 'strip-season').attr('x', x(yr)!).attr('y', y(i)!).attr('width', x.bandwidth()).attr('height', y.bandwidth() - 1);
    });
    const pk = d3.maxIndex(sh as number[]);
    svg.append('circle').attr('class', 'strip-peak').attr('cx', x(yr)! + x.bandwidth() / 2).attr('cy', y(pk)! + y.bandwidth() / 2).attr('r', Math.min(x.bandwidth() / 2, 4));
  });
}

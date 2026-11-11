import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import statesTopo from 'us-atlas/states-10m.json';
import { MONTHS_LONG, REGIONS, fmtCompact, fmtPct, isNationalPark, loadIndex, type ParkSummary } from '../data';
import { sequentialInterpolator } from '../scales';
import { setState, type AppState } from '../state';
import { esc, hideTooltip, showTooltip } from '../tooltip';
import { fill, h, loading, segmented, select } from '../ui';

/** Below this share of the year a month is effectively off-season (often closed). */
const OFF_SEASON = 0.02;

export async function renderWhen(root: HTMLElement, s: AppState): Promise<void> {
  fill(root, loading());
  const idx = await loadIndex();
  const m = s.month - 1;
  let pool = idx.parks.filter((p) => p.profile);
  if (s.scope === 'np' && idx.hasMetadata) pool = pool.filter(isNationalPark);
  if (s.region && REGIONS[s.region]) pool = pool.filter((p) => p.states.some((st) => REGIONS[s.region].includes(st)));
  if (s.st) pool = pool.filter((p) => p.states.includes(s.st));
  const offSeason = pool.filter((p) => p.profile![m] < OFF_SEASON);
  const ranked = (s.open ? pool.filter((p) => p.profile![m] >= OFF_SEASON) : pool)
    .sort((a, b) => a.profile![m] - b.profile![m]);

  const states = [...new Set(idx.parks.flatMap((p) => p.states))].sort();
  const mapHost = h('div', { class: 'map' });
  const list = h('ol', { class: 'ranked' });
  ranked.slice(0, 25).forEach((p) => list.append(row(p, m)));

  fill(root, 
    h('section', { class: 'view-head' },
      h('div', {},
        h('h1', {}, `When to go: quiet parks in ${MONTHS_LONG[m]}`),
        h('p', { class: 'explain' },
          `Ranked by the share of each park’s own yearly visits that fall in ${MONTHS_LONG[m]}, so a small park and a giant one are compared on how busy the month is for them, not on raw crowd size.`))),
    h('div', { class: 'controls wrap' },
      select('Month', MONTHS_LONG.map((name, i) => ({ value: String(i + 1), label: name })), String(s.month),
        (v) => setState({ month: Number(v) })),
      select('Region', [{ value: '', label: 'All regions' }, ...Object.keys(REGIONS).map((r) => ({ value: r, label: r }))],
        s.region, (v) => setState({ region: v, st: '' })),
      select('State', [{ value: '', label: 'All states' },
        ...states.filter((st) => !s.region || REGIONS[s.region]?.includes(st)).map((st) => ({ value: st, label: st }))],
      s.st, (v) => setState({ st: v })),
      idx.hasMetadata && segmented<'np' | 'all'>('Which units', [
        { value: 'np', label: 'National Parks' }, { value: 'all', label: 'All units' }], s.scope, (v) => setState({ scope: v })),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: s.open, onchange: (e: Event) => setState({ open: (e.target as HTMLInputElement).checked }) }),
        ` Hide off-season parks (under ${fmtPct(OFF_SEASON, 0)} of the year, often closed)`)),
    !idx.hasMetadata && h('p', { class: 'warn' }, 'Park names, states and locations aren’t loaded yet (NPS API metadata missing), so filters and the map are empty.'),
    h('div', { class: 'when-layout' },
      mapHost,
      h('div', {},
        h('h2', {}, `${ranked.length} parks, quietest first`),
        ranked.length ? list : h('p', { class: 'muted' }, 'No parks match these filters.'),
        s.open && offSeason.length > 0 && h('p', { class: 'muted small' },
          `${offSeason.length} more park${offSeason.length > 1 ? 's are' : ' is'} hidden as off-season in ${MONTHS_LONG[m]}: `,
          offSeason.slice(0, 8).map((p) => p.shortName).join(', '), offSeason.length > 8 ? '…' : ''))),
  );
  drawMap(mapHost, pool, m, ranked);
}

function row(p: ParkSummary, m: number): HTMLElement {
  const share = p.profile![m];
  return h('li', {},
    h('a', { href: `?view=park&park=${p.code}`, onclick: (e: Event) => { e.preventDefault(); setState({ view: 'park', park: p.code }); } },
      p.name),
    h('span', { class: 'muted' }, ` ${p.states.join(', ')}`),
    h('span', { class: 'bar-wrap', 'aria-hidden': 'true' }, h('span', { class: 'bar', style: `width:${Math.min(share / (2 / 12), 1) * 100}%` })),
    h('span', { class: 'num' }, `${fmtPct(share)} of year`),
    h('span', { class: 'muted small' }, ` · ~${fmtCompact(Math.round((p.avgAnnual ?? 0) * share))} visits that month`));
}

function drawMap(host: HTMLElement, pool: ParkSummary[], m: number, ranked: ParkSummary[]): void {
  const W = Math.max(host.clientWidth, 300);
  const H = W * 0.62;
  const topo = statesTopo as unknown as Topology<{ states: GeometryCollection }>;
  const states = topojson.feature(topo, topo.objects.states);
  const projection = d3.geoAlbersUsa().fitSize([W, H], states);
  const path = d3.geoPath(projection);
  const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%')
    .attr('role', 'img').attr('aria-label', 'Map of parks colored by share of the year in the selected month');
  svg.append('path').datum(topojson.mesh(topo, topo.objects.states)).attr('class', 'state-borders').attr('d', path);
  svg.append('path').datum(topojson.mesh(topo, topo.objects.states, (a, b) => a === b)).attr('class', 'nation').attr('d', path);

  const max = d3.max(pool, (p) => p.profile![m]) ?? 0.2;
  const interp = sequentialInterpolator();
  const color = d3.scaleSequentialSqrt(interp).domain([0, Math.max(max, 0.05)]);
  const rank = new Map(ranked.map((p, i) => [p.code, i + 1]));
  const pts = pool
    .map((p) => ({ p, xy: p.lat != null && p.lon != null ? projection([p.lon, p.lat]) : null }))
    .filter((d): d is { p: ParkSummary; xy: [number, number] } => d.xy != null)
    .sort((a, b) => b.p.profile![m] - a.p.profile![m]); // quietest drawn last (on top)
  svg.append('g').selectAll('circle').data(pts).join('circle')
    .attr('cx', (d) => d.xy[0]).attr('cy', (d) => d.xy[1])
    .attr('r', (d) => ((rank.get(d.p.code) ?? 99) <= 10 ? 6.5 : 4.5))
    .attr('class', (d) => ((rank.get(d.p.code) ?? 99) <= 10 ? 'dot top' : 'dot'))
    .attr('fill', (d) => color(d.p.profile![m]))
    .on('pointerenter pointermove', (ev: PointerEvent, d) => showTooltip(
      `<strong>${esc(d.p.name)}</strong><br>${fmtPct(d.p.profile![m])} of its year in ${MONTHS_LONG[m]}${rank.has(d.p.code) ? ` · #${rank.get(d.p.code)} quietest` : ' · off-season'}`,
      ev.clientX, ev.clientY))
    .on('pointerleave', hideTooltip)
    .on('click', (_, d) => setState({ view: 'park', park: d.p.code }));
  const offMap = pool.length - pts.length;
  host.append(h('p', { class: 'muted small' },
    `Stronger-contrast dots are a larger share of the year (busier); faint dots are quiet. The 10 quietest are enlarged.${offMap ? ` ${offMap} park${offMap > 1 ? 's' : ''} outside the map projection or without coordinates appear only in the list.` : ''}`));
}

import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import statesTopo from 'us-atlas/states-10m.json';
import { MONTHS, MONTHS_LONG, REGIONS, STATE_NAMES, fmtCompact, fmtPct, isNationalPark, loadIndex, type ParkSummary } from '../data';
import { OFF_SEASON, miniFingerprint } from '../insights';
import { sequentialInterpolator } from '../scales';
import { setState, type AppState } from '../state';
import { esc, hideTooltip, showTooltip } from '../tooltip';
import { fill, h, loading, segmented, select } from '../ui';

const SHOW = 24;

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
  const yMax = d3.quantile(pool.map((p) => d3.max(p.profile!)!).sort(d3.ascending), 0.95) ?? 0.25;

  const states = [...new Set(idx.parks.flatMap((p) => p.states))].sort()
    .filter((st) => !s.region || REGIONS[s.region]?.includes(st));
  const mapHost = h('div', { class: 'map panel' });
  const list = h('ol', { class: 'result-list' });
  ranked.slice(0, SHOW).forEach((p, i) => list.append(resultCard(p, m, i + 1, yMax)));

  const monthStrip = h('div', { class: 'month-strip', role: 'radiogroup', 'aria-label': 'Month' },
    ...MONTHS.map((name, i) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(i === m), class: i === m ? 'active' : undefined,
      'aria-label': MONTHS_LONG[i], onclick: () => setState({ month: i + 1 }),
    }, name)));
  const regionChips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Region' },
    ...['', ...Object.keys(REGIONS)].map((r) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(r === s.region), class: r === s.region ? 'chip active' : 'chip',
      onclick: () => setState({ region: r, st: '' }),
    }, r || 'Anywhere')));

  fill(root,
    h('section', { class: 'page-head' },
      h('p', { class: 'eyebrow dark' }, 'Trip planner'),
      h('h1', { class: 'display-2' }, `Quiet parks in ${MONTHS_LONG[m]}`),
      h('p', { class: 'explain' },
        `Ranked by the share of each park’s own yearly visits that fall in ${MONTHS_LONG[m]}, so a small park and a giant one are compared on how busy the month is for them, not on raw crowd size.`)),
    h('div', { class: 'filter-bar panel' },
      monthStrip,
      h('div', { class: 'filter-row' },
        regionChips,
        select('State', [{ value: '', label: 'All states' }, ...states.map((st) => ({ value: st, label: STATE_NAMES[st] ?? st }))],
          s.st, (v) => setState({ st: v })),
        idx.hasMetadata && segmented<'np' | 'all'>('Which units', [
          { value: 'np', label: 'National Parks' }, { value: 'all', label: 'All units' }], s.scope, (v) => setState({ scope: v })),
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: s.open, onchange: (e: Event) => setState({ open: (e.target as HTMLInputElement).checked }) }),
          ` Hide off-season (under ${fmtPct(OFF_SEASON, 0)} of the year)`))),
    !idx.hasMetadata && h('p', { class: 'warn' }, 'Park names, states and locations aren’t loaded yet (NPS API metadata missing), so filters and the map are empty.'),
    h('div', { class: 'when-layout' },
      h('div', { class: 'when-results' },
        h('h2', { class: 'section-title' }, `${ranked.length} park${ranked.length === 1 ? '' : 's'}, quietest first`),
        ranked.length ? list : h('p', { class: 'muted' }, 'No parks match these filters.'),
        ranked.length > SHOW && h('p', { class: 'muted small' }, `Showing the ${SHOW} quietest. Narrow by region or state to see more.`),
        s.open && offSeason.length > 0 && h('p', { class: 'muted small' },
          `Off-season in ${MONTHS_LONG[m]} (hidden): `,
          offSeason.slice(0, 10).map((p) => p.shortName).join(', '), offSeason.length > 10 ? '…' : '')),
      h('div', { class: 'when-map' }, mapHost)),
  );
  drawMap(mapHost, pool, m, ranked);
}

function resultCard(p: ParkSummary, m: number, rank: number, yMax: number): HTMLElement {
  const share = p.profile![m];
  return h('li', {},
    h('a', { class: 'result-card', href: `?view=park&park=${p.code}`, onclick: (e: Event) => { e.preventDefault(); setState({ view: 'park', park: p.code }); } },
      h('span', { class: 'rank-badge' }, String(rank)),
      h('span', { class: 'result-main' },
        h('span', { class: 'result-name' }, p.shortName),
        h('span', { class: 'muted small' }, p.states.map((st) => STATE_NAMES[st] ?? st).join(', '))),
      h('span', { class: 'result-fp' }, miniFingerprint(p.profile!, yMax, m)),
      h('span', { class: 'result-stat' },
        h('span', { class: 'num' }, fmtPct(share)),
        h('span', { class: 'muted small' }, `of its year · ~${fmtCompact(Math.round((p.avgAnnual ?? 0) * share))} visits`))));
}

function drawMap(host: HTMLElement, pool: ParkSummary[], m: number, ranked: ParkSummary[]): void {
  const W = Math.max(host.clientWidth - 24, 280);
  const H = W * 0.64;
  const topo = statesTopo as unknown as Topology<{ states: GeometryCollection }>;
  const states = topojson.feature(topo, topo.objects.states);
  const projection = d3.geoAlbersUsa().fitSize([W, H], states);
  const path = d3.geoPath(projection);
  const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%')
    .attr('role', 'img').attr('aria-label', 'Map of parks colored by share of the year in the selected month');
  svg.append('path').datum(states).attr('class', 'land').attr('d', path);
  svg.append('path').datum(topojson.mesh(topo, topo.objects.states, (a, b) => a !== b)).attr('class', 'state-borders').attr('d', path);

  const max = d3.max(pool, (p) => p.profile![m]) ?? 0.2;
  const color = d3.scaleSequentialSqrt(sequentialInterpolator()).domain([0, Math.max(max, 0.05)]);
  const rank = new Map(ranked.map((p, i) => [p.code, i + 1]));
  const pts = pool
    .map((p) => ({ p, xy: p.lat != null && p.lon != null ? projection([p.lon, p.lat]) : null }))
    .filter((d): d is { p: ParkSummary; xy: [number, number] } => d.xy != null)
    .sort((a, b) => b.p.profile![m] - a.p.profile![m]);
  const g = svg.append('g');
  g.selectAll('circle').data(pts).join('circle')
    .attr('cx', (d) => d.xy[0]).attr('cy', (d) => d.xy[1])
    .attr('r', (d) => ((rank.get(d.p.code) ?? 99) <= 10 ? 8 : 5))
    .attr('class', (d) => ((rank.get(d.p.code) ?? 99) <= 10 ? 'dot top' : 'dot'))
    .attr('fill', (d) => color(d.p.profile![m]))
    .on('pointerenter pointermove', (ev: PointerEvent, d) => showTooltip(
      `<strong>${esc(d.p.name)}</strong><br>${fmtPct(d.p.profile![m])} of its year in ${MONTHS_LONG[m]}${rank.has(d.p.code) ? ` · #${rank.get(d.p.code)} quietest` : ' · off-season'}`,
      ev.clientX, ev.clientY))
    .on('pointerleave', hideTooltip)
    .on('click', (_, d) => setState({ view: 'park', park: d.p.code }));
  // Rank numbers on the ten quietest (identity not by color alone).
  g.selectAll('text').data(pts.filter((d) => (rank.get(d.p.code) ?? 99) <= 10)).join('text')
    .attr('class', 'dot-rank').attr('x', (d) => d.xy[0]).attr('y', (d) => d.xy[1]).attr('dy', '0.35em')
    .attr('text-anchor', 'middle').text((d) => rank.get(d.p.code)!);

  const offMap = pool.length - pts.length;
  host.append(h('p', { class: 'muted small map-key' },
    'Faint dots are quiet this month; strong green dots are busy (share of each park’s year). Numbers mark the 10 quietest.',
    offMap ? ` ${offMap} park${offMap > 1 ? 's' : ''} outside the map are listed only.` : ''));
}

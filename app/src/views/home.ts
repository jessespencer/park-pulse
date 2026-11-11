import * as d3 from 'd3';
import { topo } from '../art';
import { MONTHS_LONG, REGIONS, fmtPct, isNationalPark, loadIndex, type ParkSummary } from '../data';
import { OFF_SEASON, miniFingerprint } from '../insights';
import { bindSearch, findPark } from '../search';
import { setState, type View } from '../state';
import { fill, h } from '../ui';

const TOOLS: { view: View; title: string; blurb: string; icon: string }[] = [
  { view: 'when', title: 'When to go', blurb: 'Pick a month, get the quietest parks — ranked fairly, big or small.', icon: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M9 14h2v2H9z' },
  { view: 'park', title: 'Park heatmap', blurb: 'Every month since 1979 for one park. Shutdowns and closures flagged.', icon: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4z' },
  { view: 'wall', title: 'Fingerprints', blurb: 'All 64 national parks side by side: who peaks when, and how hard.', icon: 'M4 20V12M8 20V7M12 20V4M16 20V9M20 20v-6' },
  { view: 'drift', title: 'Season drift', blurb: 'Has the busy season stretched since the ’80s? See it decade by decade.', icon: 'M3 17c3-6 6-9 9-9s6 3 9 9M3 12c3-4 6-6 9-6s6 2 9 6' },
  { view: 'compare', title: 'Compare', blurb: 'Two parks side by side, hover linked month to month.', icon: 'M4 5h7v14H4zM13 5h7v14h-7z' },
];

const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>';

export async function renderHome(root: HTMLElement): Promise<void> {
  const idx = await loadIndex();
  const now = new Date().getMonth();
  const nps = idx.parks.filter((p) => isNationalPark(p) && p.profile);
  const pool = nps.length ? nps : idx.parks.filter((p) => p.profile);
  const open = pool.filter((p) => p.profile![now] >= OFF_SEASON);
  const quiet = [...open].sort((a, b) => a.profile![now] - b.profile![now]).slice(0, 5);
  const busy = [...pool].sort((a, b) => b.profile![now] - a.profile![now]).slice(0, 5);
  const yMax = d3.quantile(pool.map((p) => d3.max(p.profile!)!).sort(d3.ascending), 0.95) ?? 0.25;
  const lastYear = d3.max(idx.parks, (p) => p.lastYear);

  /* Finder: one pill, four fields. A park name jumps to that park; otherwise
     the month / region / type become a "When to go" query. */
  const parkInput = h('input', { type: 'search', list: 'park-list', placeholder: 'Any park', 'aria-label': 'Park', autocomplete: 'off' });
  bindSearch(parkInput, idx);
  const monthSel = h('select', { 'aria-label': 'Month' },
    ...MONTHS_LONG.map((m, i) => h('option', { value: String(i + 1), selected: i === now }, m)));
  const regionSel = h('select', { 'aria-label': 'Region' },
    h('option', { value: '' }, 'Anywhere'), ...Object.keys(REGIONS).map((r) => h('option', { value: r }, r)));
  const scopeSel = h('select', { 'aria-label': 'Type' },
    h('option', { value: 'np' }, 'National parks'), h('option', { value: 'all' }, 'All park units'));
  const field = (label: string, control: HTMLElement) => h('label', { class: 'finder-field' }, h('span', {}, label), control);
  const go = h('button', { type: 'submit', class: 'finder-go', 'aria-label': 'Find quiet parks' });
  go.innerHTML = SEARCH_ICON;
  const finder = h('form', {
    class: 'finder', role: 'search',
    onsubmit: (e: Event) => {
      e.preventDefault();
      const code = parkInput.value.trim() ? findPark(idx, parkInput.value) : null;
      if (code) { setState({ view: 'park', park: code }); return; }
      setState({ view: 'when', month: Number(monthSel.value), region: regionSel.value, st: '', scope: scopeSel.value === 'all' ? 'all' : 'np' });
    },
  }, field('Park', parkInput), field('Month', monthSel), field('Region', regionSel), field('Type', scopeSel), go);

  const hero = h('section', { class: 'hero' },
    topo({ seed: 7, step: 0.07, index: 4 }),
    h('div', { class: 'hero-inner' },
      h('h1', { class: 'display' }, 'Beat the crowds at ', h('em', {}, 'America’s'), ' national parks'),
      h('p', { class: 'lede' },
        `${lastYear! - 1979 + 1} years of monthly visits. See each park’s busy season, how it’s shifted, and which parks are quiet when you want to go.`),
      finder));

  const tile = (cls: string, seed: number, eyebrow: string, title: string, cta: string, onclick: () => void) =>
    h('button', { type: 'button', class: `tile ${cls}`, onclick },
      topo({ seed, step: 0.06 }),
      h('span', { class: 'eyebrow' }, eyebrow),
      h('span', { class: 'tile-title' }, title),
      h('span', { class: 'tile-go' }, cta));

  const monthCol = (title: string, sub: string, parks: ParkSummary[]) =>
    h('div', { class: 'now-col panel' },
      h('h3', { class: 'panel-title' }, title),
      h('p', { class: 'muted small' }, sub),
      h('ol', { class: 'now-list' }, ...parks.map((p, i) => h('li', {},
        h('span', { class: 'rank-badge' }, String(i + 1)),
        h('a', { href: `?view=park&park=${p.code}`, onclick: (e: Event) => { e.preventDefault(); setState({ view: 'park', park: p.code }); } },
          h('span', { class: 'park-name' }, p.shortName),
          h('span', { class: 'muted small' }, ` ${p.states.join(', ')}`)),
        h('span', { class: 'now-fp' }, miniFingerprint(p.profile!, yMax, now)),
        h('span', { class: 'num small' }, fmtPct(p.profile![now], 1))))));

  fill(root,
    hero,
    h('div', { class: 'tiles' },
      tile('tile-1', 31, 'When to go', `Quiet parks this ${MONTHS_LONG[now]}`, 'See the list →', () => setState({ view: 'when', month: now + 1 })),
      tile('tile-2', 41, 'Season drift', 'Has summer gotten longer?', 'See it decade by decade →', () => setState({ view: 'drift' }))),
    h('section', { class: 'section' },
      h('header', { class: 'section-head' },
        h('p', { class: 'eyebrow' }, 'Field report'),
        h('h2', { class: 'section-title' }, `This ${MONTHS_LONG[now]} in the parks`),
        h('p', { class: 'muted' }, `Share of each park’s typical year that falls in ${MONTHS_LONG[now]}. Bars show the full year; the highlighted bar is this month.`)),
      h('div', { class: 'now-grid' },
        monthCol('Quietest right now', 'Open parks with the smallest share of their year this month.', quiet),
        monthCol('Peak season right now', 'Parks where this month carries the most weight.', busy))),
    h('section', { class: 'section' },
      h('header', { class: 'section-head' },
        h('p', { class: 'eyebrow' }, 'Pick your trail'),
        h('h2', { class: 'section-title' }, 'Five ways in')),
      h('div', { class: 'tool-grid' }, ...TOOLS.map((t) => {
        const icon = h('span', { class: 'tool-icon' });
        icon.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="${t.icon}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
        return h('button', { type: 'button', class: 'tool-card', onclick: () => setState({ view: t.view }) },
          icon, h('span', { class: 'tool-title' }, t.title), h('span', { class: 'tool-blurb' }, t.blurb),
          h('span', { class: 'tool-go' }, 'Go →'));
      }))),
    h('section', { class: 'section how' },
      h('header', { class: 'section-head' },
        h('p', { class: 'eyebrow' }, 'Reading the signs'),
        h('h2', { class: 'section-title' }, 'Three ways to color a year')),
      h('div', { class: 'how-grid' },
        h('div', { class: 'how-item' }, h('h3', {}, 'Visits'), h('p', {}, 'Raw monthly count. Best for seeing growth and the 2020 closures.')),
        h('div', { class: 'how-item' }, h('h3', {}, 'Share of year'), h('p', {}, 'How much of a year’s traffic one month carries. Fair across park sizes — this is what “When to go” ranks by.')),
        h('div', { class: 'how-item' }, h('h3', {}, 'Index vs normal'), h('p', {}, '100 = that park’s typical level for the month (1979–2019 median). Teal is quieter than usual, rust is busier.')))),
  );
}

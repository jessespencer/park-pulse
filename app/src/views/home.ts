import * as d3 from 'd3';
import { tileScene, topo } from '../art';
import { MONTHS_LONG, fmtPct, isNationalPark, loadIndex, type ParkSummary } from '../data';
import { miniFingerprint, quietestParks } from '../insights';
import { setState, type View } from '../state';
import { fill, h } from '../ui';
import { renderFinder } from './finder';

const TOOLS: { view: View; title: string; blurb: string; icon: string }[] = [
  { view: 'when', title: 'When to go', blurb: 'Pick a month, get the quietest parks — ranked fairly, big or small.', icon: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M9 14h2v2H9z' },
  { view: 'park', title: 'Park heatmap', blurb: 'Every month since 1979 for one park. Shutdowns and closures flagged.', icon: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4z' },
  { view: 'wall', title: 'Fingerprints', blurb: 'All 64 national parks side by side: who peaks when, and how hard.', icon: 'M4 20V12M8 20V7M12 20V4M16 20V9M20 20v-6' },
  { view: 'drift', title: 'Season drift', blurb: 'Has the busy season stretched since the ’80s? See it decade by decade.', icon: 'M3 17c3-6 6-9 9-9s6 3 9 9M3 12c3-4 6-6 9-6s6 2 9 6' },
  { view: 'compare', title: 'Compare', blurb: 'Two parks side by side, hover linked month to month.', icon: 'M4 5h7v14H4zM13 5h7v14h-7z' },
];


export async function renderHome(root: HTMLElement): Promise<void> {
  const idx = await loadIndex();
  const now = new Date().getMonth();
  const nps = idx.parks.filter((p) => isNationalPark(p) && p.profile);
  const pool = nps.length ? nps : idx.parks.filter((p) => p.profile);
  const quiet = quietestParks(idx.parks, now, 5);
  const busy = [...pool].sort((a, b) => b.profile![now] - a.profile![now]).slice(0, 5);
  const yMax = d3.quantile(pool.map((p) => d3.max(p.profile!)!).sort(d3.ascending), 0.95) ?? 0.25;
  const lastYear = d3.max(idx.parks, (p) => p.lastYear);

  const finder = renderFinder(idx, { now, uid: 'hero-finder' }).el;

  const hero = h('section', { class: 'hero' },
    topo({ seed: 7, scale: 560, levels: 26, grid: 240 }),
    h('div', { class: 'hero-inner' },
      h('h1', { class: 'display' }, 'Beat the crowds at ', h('em', {}, 'America’s'), ' national parks'),
      h('p', { class: 'lede' },
        `${lastYear! - 1979 + 1} years of monthly visits. See each park’s busy season, how it’s shifted, and which parks are quiet when you want to go.`),
      finder),
    h('button', {
      type: 'button', class: 'hero-cue', 'aria-label': 'Scroll to explore',
      onclick: () => hero.nextElementSibling?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    }, 'Explore'));
  hero.lastElementChild!.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>');

  const tile = (cls: string, scene: 'quiet' | 'summer', eyebrow: string, title: string, cta: string, onclick: () => void) => {
    const art = h('span', { class: 'tile-scene' });
    art.innerHTML = tileScene(scene);
    return h('button', { type: 'button', class: `tile ${cls}`, onclick },
      art,
      h('span', { class: 'eyebrow' }, eyebrow),
      h('span', { class: 'tile-title' }, title),
      h('span', { class: 'tile-go' }, cta));
  };

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
      tile('tile-1', 'quiet', 'When to go', `Quiet parks this ${MONTHS_LONG[now]}`, 'See the list →', () => setState({ view: 'when', month: now + 1 })),
      tile('tile-2', 'summer', 'Season drift', 'Has summer gotten longer?', 'See it decade by decade →', () => setState({ view: 'drift' }))),
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
  );
}

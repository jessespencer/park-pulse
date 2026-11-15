import * as d3 from 'd3';
import { tileScene, topo } from '../art';
import { MONTHS_LONG, fmtPct, isNationalPark, loadIndex, type ParkSummary } from '../data';
import { miniFingerprint, quietestParks } from '../insights';
import { PAGES } from '../pages';
import { setState } from '../state';
import { fill, h } from '../ui';



export async function renderHome(root: HTMLElement): Promise<void> {
  const idx = await loadIndex();
  const now = new Date().getMonth();
  const nps = idx.parks.filter((p) => isNationalPark(p) && p.profile);
  const pool = nps.length ? nps : idx.parks.filter((p) => p.profile);
  const quiet = quietestParks(idx.parks, now, 5);
  const busy = [...pool].sort((a, b) => b.profile![now] - a.profile![now]).slice(0, 5);
  const yMax = d3.quantile(pool.map((p) => d3.max(p.profile!)!).sort(d3.ascending), 0.95) ?? 0.25;
  const lastYear = d3.max(idx.parks, (p) => p.lastYear);

  // The site's one search bar (dock.ts) sits here while the hero is on screen.
  const finder = h('div', { class: 'sbar-slot' });

  const hero = h('section', { class: 'hero' },
    topo({ seed: 7, scale: 560, levels: 26, grid: 240 }),
    h('div', { class: 'hero-inner' },
      h('h1', { class: 'display' }, 'Find the off-peak months at ', h('em', {}, 'America’s'), ' national parks'),
      h('p', { class: 'lede' },
        `Monthly visits to every park unit, 1979–${lastYear}. See when each park is busiest, how that has changed, and which parks are in their slow season when you want to go.`),
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
      tile('tile-1', 'quiet', 'Fingerprints', 'Parks that peak outside summer', 'Browse by peak month', () => setState({ view: 'wall', sort: 'peak' })),
      tile('tile-2', 'summer', 'Season drift', 'Has summer gotten longer?', 'Compare decades', () => setState({ view: 'drift' }))),
    h('section', { class: 'section' },
      h('header', { class: 'section-head' },
        h('h2', { class: 'section-title' }, `${MONTHS_LONG[now]} in the national parks`),
        h('p', { class: 'muted' }, `Share of year: the part of a park’s typical year of visits that falls in ${MONTHS_LONG[now]}. The bars show the whole year, with ${MONTHS_LONG[now]} highlighted.`)),
      h('div', { class: 'now-grid' },
        monthCol('Off-peak', `Open parks with the lowest share of year in ${MONTHS_LONG[now]}.`, quiet),
        monthCol('Peak season', `Parks with the highest share of year in ${MONTHS_LONG[now]}.`, busy)),
      h('p', {}, h('a', { class: 'chip-link', href: `?view=when&month=${now + 1}`, onclick: (e: Event) => { e.preventDefault(); setState({ view: 'when', month: now + 1 }); } }, `All off-peak parks in ${MONTHS_LONG[now]}`))),
    h('section', { class: 'section' },
      h('header', { class: 'section-head' },
        h('h2', { class: 'section-title' }, 'Explore the data')),
      h('div', { class: 'tool-grid' }, ...PAGES.map((t) => {
        const icon = h('span', { class: 'tool-icon' });
        icon.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="${t.icon}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
        return h('a', { class: 'tool-card', href: `?view=${t.id}`, onclick: (e: Event) => { e.preventDefault(); setState({ view: t.id }); } },
          icon, h('span', { class: 'tool-title' }, t.label), h('span', { class: 'tool-blurb' }, t.blurb));
      }))),
  );
}

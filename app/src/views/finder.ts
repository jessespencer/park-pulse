/**
 * Home "finder": an Airbnb-style pill with four segments (Park, Month, Region,
 * Type). Each segment opens a custom popover instead of a native <select>.
 * A chosen park jumps straight to that park; otherwise the selection becomes a
 * "When to go" query. Uses existing state keys only.
 */
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import statesTopo from 'us-atlas/states-10m.json';
import { MONTHS_LONG, REGIONS, STATE_NAMES, isNationalPark, type IndexFile, type ParkSummary } from '../data';
import { PICKER_ICON, matchParks, optionEl, parkRow, parkTitle } from '../parkPicker';
import { setState } from '../state';
import { h } from '../ui';

type PanelId = 'park' | 'month' | 'region' | 'scope';

const svg = (body: string, cls = 'ic') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  ...PICKER_ICON,
  island: svg('<path d="M3 19.5c3-1.6 6-1.6 9 0s6 1.6 9 0"/><path d="M12 16V7"/><path d="M12 7c-2.5-2-5-1.6-6.5.2M12 7c2.5-2 5-1.6 6.5.2M12 7c-1-2.6-3-3.6-5-3.4M12 7c1-2.6 3-3.6 5-3.4"/>'),
  clear: svg('<path d="M7 7l10 10M17 7 7 17"/>'),
};

const SEASONS: { name: string; months: number[] }[] = [
  { name: 'Winter', months: [11, 0, 1] },
  { name: 'Spring', months: [2, 3, 4] },
  { name: 'Summer', months: [5, 6, 7] },
  { name: 'Fall', months: [8, 9, 10] },
];

/** Region blurbs; the state count comes from REGIONS. */
const REGION_NOTE: Record<string, string> = {
  Northeast: 'Acadia to Gettysburg',
  Midwest: 'Great Lakes and prairie',
  South: 'Everglades to Big Bend',
  West: 'Rockies, deserts, Pacific',
  Territories: 'Puerto Rico, Guam, more',
};

export interface FinderOpts {
  /** 0-based current month. */
  now: number;
  /** Parks to suggest before the user types (already ranked by the caller). */
  suggested: ParkSummary[];
}

export function renderFinder(idx: IndexFile, { now, suggested }: FinderOpts): HTMLElement {
  const sel = { park: null as ParkSummary | null, month: now, region: '', scope: 'np' as 'np' | 'all' };
  const npCount = idx.parks.filter(isNationalPark).length;
  let open: PanelId | null = null;

  /* ---------- segments ---------- */
  const parkInput = h('input', {
    type: 'text', placeholder: 'Search parks', autocomplete: 'off', spellcheck: 'false',
    role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': 'finder-pop-park', 'aria-label': 'Park',
  });
  const clearBtn = h('button', { type: 'button', class: 'finder-clear', 'aria-label': 'Clear park', hidden: true });
  clearBtn.innerHTML = ICON.clear;

  const monthVal = h('span', { class: 'seg-value' });
  const regionVal = h('span', { class: 'seg-value' });
  const scopeVal = h('span', { class: 'seg-value' });

  const seg = (id: PanelId, label: string, value: HTMLElement) =>
    h('button', { type: 'button', class: 'finder-seg', 'data-seg': id, 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': `finder-pop-${id}` },
      h('span', { class: 'seg-label' }, label), value);

  const parkSeg = h('div', { class: 'finder-seg seg-park', 'data-seg': 'park' },
    h('label', { class: 'seg-label', for: 'finder-park' }, 'Park'), parkInput, clearBtn);
  parkInput.id = 'finder-park';
  const segs: Record<PanelId, HTMLElement> = {
    park: parkSeg,
    month: seg('month', 'Month', monthVal),
    region: seg('region', 'Region', regionVal),
    scope: seg('scope', 'Type', scopeVal),
  };

  const go = h('button', { type: 'submit', class: 'finder-go', 'aria-label': 'Search' });
  go.innerHTML = `${ICON.search}<span>Search</span>`;

  /* ---------- popovers ---------- */
  const pops: Record<PanelId, HTMLElement> = {
    park: h('div', { class: 'finder-pop pop-park', id: 'finder-pop-park', role: 'listbox', 'aria-label': 'Parks' }),
    month: h('div', { class: 'finder-pop pop-month', id: 'finder-pop-month', role: 'dialog', 'aria-label': 'Choose a month' }),
    region: h('div', { class: 'finder-pop pop-region', id: 'finder-pop-region', role: 'dialog', 'aria-label': 'Choose a region' }),
    scope: h('div', { class: 'finder-pop pop-scope', id: 'finder-pop-scope', role: 'dialog', 'aria-label': 'Choose park type' }),
  };
  Object.values(pops).forEach((p) => (p.hidden = true));

  const bar = h('div', { class: 'finder-bar' }, segs.park, segs.month, segs.region, segs.scope, go);
  const form = h('form', { class: 'finder', role: 'search', onsubmit: (e: Event) => { e.preventDefault(); submit(); } },
    bar, ...Object.values(pops));

  /* ---------- park list (combobox) ---------- */
  let options: ParkSummary[] = [];
  let active = -1;
  const label = (p: ParkSummary) => parkTitle(idx, p);

  const matches = (q: string): ParkSummary[] => (q.trim() ? matchParks(idx, q) : suggested);

  function renderParkList(): void {
    const q = parkInput.value;
    options = matches(q);
    active = q.trim() && options.length ? 0 : -1;
    const head = q.trim()
      ? (options.length ? 'Parks' : `No parks match “${q.trim()}”`)
      : `Quiet in ${MONTHS_LONG[now]}`;
    pops.park.replaceChildren(
      h('p', { class: 'pop-head' }, head),
      ...options.map((p, i) => optionEl(parkRow(idx, p, q.trim() ? undefined : now), `finder-opt-${i}`,
        { active: i === active, current: sel.park?.code === p.code, onPick: () => pickPark(p) })));
    syncActive();
  }

  function syncActive(): void {
    pops.park.querySelectorAll('.pop-option').forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
    parkInput.setAttribute('aria-activedescendant', active >= 0 ? `finder-opt-${active}` : '');
    pops.park.querySelector(`#finder-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }

  function pickPark(p: ParkSummary): void {
    sel.park = p;
    parkInput.value = label(p);
    clearBtn.hidden = false;
    setOpen(null);
    go.focus();
  }

  parkInput.addEventListener('focus', () => setOpen('park'));
  parkInput.addEventListener('input', () => {
    sel.park = null;
    clearBtn.hidden = !parkInput.value;
    if (open !== 'park') setOpen('park'); else renderParkList();
  });
  parkInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (open !== 'park') setOpen('park');
      const n = options.length;
      if (n) { active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; syncActive(); }
    } else if (e.key === 'Enter') {
      if (open === 'park' && active >= 0 && options[active]) { e.preventDefault(); pickPark(options[active]); }
    }
  });
  clearBtn.addEventListener('click', () => {
    sel.park = null; parkInput.value = ''; clearBtn.hidden = true; parkInput.focus();
  });

  /* ---------- month grid ---------- */
  function renderMonth(): void {
    const quick = (label: string, m: number) => h('button', {
      type: 'button', class: `pop-chip${sel.month === m ? ' on' : ''}`, onclick: () => pickMonth(m),
    }, label);
    pops.month.replaceChildren(
      h('div', { class: 'pop-row' },
        h('p', { class: 'pop-head' }, 'When are you going?'),
        h('div', { class: 'pop-chips' }, quick('This month', now), quick('Next month', (now + 1) % 12))),
      h('div', { class: 'season-grid' }, ...SEASONS.map((s) => h('div', { class: 'season' },
        h('span', { class: 'season-name' }, s.name),
        ...s.months.map((m) => h('button', {
          type: 'button', class: `month-tile${sel.month === m ? ' on' : ''}${m === now ? ' now' : ''}`,
          'aria-pressed': String(sel.month === m), onclick: () => pickMonth(m),
        }, MONTHS_LONG[m].slice(0, 3), m === now ? h('i', { 'aria-hidden': 'true' }) : null))))),
    );
  }
  function pickMonth(m: number): void { sel.month = m; syncValues(); setOpen('region'); }

  /* ---------- region cards with mini maps ---------- */
  function renderRegion(): void {
    const card = (r: string, title: string, note: string) => {
      const art = h('span', { class: 'region-art' });
      art.innerHTML = r === 'Territories' ? ICON.island : regionMap(r);
      return h('button', {
        type: 'button', class: `region-card${sel.region === r ? ' on' : ''}`, 'aria-pressed': String(sel.region === r),
        onclick: () => { sel.region = r; syncValues(); setOpen('scope'); },
      }, art, h('span', { class: 'region-name' }, title), h('span', { class: 'region-note' }, note));
    };
    pops.region.replaceChildren(
      h('p', { class: 'pop-head' }, 'Where in the country?'),
      h('div', { class: 'region-grid' },
        card('', 'Anywhere', 'All 50 states and territories'),
        ...Object.keys(REGIONS).map((r) => card(r, r, REGION_NOTE[r] ?? `${REGIONS[r].length} states`))));
  }

  /* ---------- type options ---------- */
  function renderScope(): void {
    const row = (v: 'np' | 'all', title: string, sub: string, icon: string) => {
      const tile = h('span', { class: `pop-tile ${v === 'np' ? 'np' : 'unit'}` });
      tile.innerHTML = icon;
      return h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(sel.scope === v), class: `scope-row${sel.scope === v ? ' on' : ''}`,
        onclick: () => { sel.scope = v; syncValues(); setOpen(null); go.focus(); },
      }, tile, h('span', { class: 'pop-text' }, h('span', { class: 'pop-title' }, title), h('span', { class: 'pop-sub' }, sub)),
      h('span', { class: 'radio', 'aria-hidden': 'true' }));
    };
    pops.scope.replaceChildren(
      h('p', { class: 'pop-head' }, 'What kind of park?'),
      h('div', { role: 'radiogroup', 'aria-label': 'Park type' },
        row('np', 'National parks', `The ${npCount || 'big'} headline parks, from Acadia to Zion`, ICON.mountain),
        row('all', 'All park units', `All ${idx.parks.length} units: monuments, historic sites, seashores and more`, ICON.monument)));
  }

  /* ---------- open / close ---------- */
  function syncValues(): void {
    monthVal.textContent = MONTHS_LONG[sel.month];
    regionVal.textContent = sel.region || 'Anywhere';
    scopeVal.textContent = sel.scope === 'np' ? 'National parks' : 'All park units';
  }

  function setOpen(id: PanelId | null): void {
    open = id;
    form.classList.toggle('is-open', id != null);
    (Object.keys(pops) as PanelId[]).forEach((k) => {
      const on = k === id;
      pops[k].hidden = !on;
      segs[k].classList.toggle('active', on);
      (k === 'park' ? parkInput : segs[k]).setAttribute('aria-expanded', String(on));
    });
    if (!id) return;
    ({ park: renderParkList, month: renderMonth, region: renderRegion, scope: renderScope })[id]();
    place(pops[id], segs[id]);
    if (id === 'park' && document.activeElement !== parkInput) parkInput.focus();
  }

  /** Align a popover under its segment, kept inside the bar's width. */
  function place(pop: HTMLElement, anchor: HTMLElement): void {
    if (matchMedia('(max-width: 760px)').matches) { pop.style.left = ''; return; }
    const W = form.clientWidth, w = pop.offsetWidth;
    const want = anchor.offsetLeft + anchor.offsetWidth / 2 - w / 2;
    pop.style.left = `${Math.max(0, Math.min(W - w, want))}px`;
  }

  (['month', 'region', 'scope'] as PanelId[]).forEach((k) =>
    segs[k].addEventListener('click', () => setOpen(open === k ? null : k)));
  parkSeg.addEventListener('click', (e) => { if (e.target !== clearBtn && !clearBtn.contains(e.target as Node)) parkInput.focus(); });

  const onDocDown = (e: PointerEvent) => {
    if (!form.isConnected) { document.removeEventListener('pointerdown', onDocDown); document.removeEventListener('keydown', onKey); return; }
    if (open && !form.contains(e.target as Node)) setOpen(null);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !open) return;
    const was = open;
    setOpen(null);
    (was === 'park' ? parkInput : segs[was]).focus();
  };
  document.addEventListener('pointerdown', onDocDown);
  document.addEventListener('keydown', onKey);

  function submit(): void {
    setOpen(null);
    if (!sel.park && parkInput.value.trim()) {
      const best = matches(parkInput.value)[0];
      if (best) sel.park = best;
    }
    if (sel.park) { setState({ view: 'park', park: sel.park.code }); return; }
    setState({ view: 'when', month: sel.month + 1, region: sel.region, st: '', scope: sel.scope });
  }

  syncValues();
  return form;
}

/* ---------- mini US maps (built once, on first open) ---------- */

let mapCache: { paths: { abbr: string; d: string }[]; w: number; h: number } | null = null;
const NAME_TO_ABBR = Object.fromEntries(Object.entries(STATE_NAMES).map(([a, n]) => [n, a]));

function mapPaths() {
  if (mapCache) return mapCache;
  const w = 220, hgt = 132;
  const topo = statesTopo as unknown as Topology<{ states: GeometryCollection<{ name: string }> }>;
  const fc = topojson.feature(topo, topo.objects.states);
  const proj = d3.geoAlbersUsa().fitExtent([[4, 4], [w - 4, hgt - 4]], fc);
  // Round to whole pixels and drop repeated points: at this size the 10m outlines collapse to a few hundred vertices.
  const path = d3.geoPath(proj).digits(0);
  const paths = fc.features
    .map((f) => ({ abbr: NAME_TO_ABBR[f.properties?.name ?? ''] ?? '', d: (path(f) ?? '').replace(/(L-?\d+,-?\d+)\1+/g, '$1') }))
    .filter((p) => p.abbr && p.d);
  mapCache = { paths, w, h: hgt };
  return mapCache;
}

function regionMap(region: string): string {
  const { paths, w, h: hgt } = mapPaths();
  const inRegion = new Set(region ? REGIONS[region] : paths.map((p) => p.abbr));
  const on = paths.filter((p) => inRegion.has(p.abbr)).map((p) => p.d).join('');
  const off = paths.filter((p) => !inRegion.has(p.abbr)).map((p) => p.d).join('');
  return `<svg class="mini-map" viewBox="0 0 ${w} ${hgt}" aria-hidden="true"><path class="off" d="${off}"/><path class="on" d="${on}"/></svg>`;
}

/**
 * Pickers: one combobox (Airbnb-style popover of rows with icon tiles) and two
 * wrappers, `parkPicker` and `statePicker`. Suggestions are contextual: each
 * caller says where it lives, and the empty-state list fits that place
 * (most visited in the header, same-state parks on a park page, etc.).
 */
import { MONTHS_LONG, NATIONAL, STATE_NAMES, fmtCompact, fmtPct, isNationalPark, stateLine, type IndexFile, type ParkSummary } from './data';
import { h } from './ui';

const svg = (body: string, cls = 'ic') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const PICKER_ICON = {
  mountain: svg('<path d="M2.5 19.5 9 8.5l3.6 6 2.4-3.8 6.5 8.8z"/><path d="m7.4 11.2 1.6 1.4 1.3-1.2"/>'),
  monument: svg('<path d="M12 3.5 14 8v12.5h-4V8z"/><path d="M6 20.5h12"/>'),
  all: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.3 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.3-3.8-8.5S9.4 5.9 12 3.5z"/>'),
  pin: svg('<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', 'ic-search'),
  chevron: svg('<path d="m6 9 6 6 6-6"/>', 'ic-chevron'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'ic-check'),
};

/* ---------- rows ---------- */

export interface PickRow { code: string; title: string; sub: string; kind: 'np' | 'unit' | 'all' | 'place' }
export interface PickGroup { head: string; rows: PickRow[] }

const TILE: Record<PickRow['kind'], string> = { np: PICKER_ICON.mountain, unit: PICKER_ICON.monument, all: PICKER_ICON.all, place: PICKER_ICON.pin };
const designation = (p: ParkSummary) => (['Other', 'Unknown', 'Not in NPS API'].includes(p.designation) ? '' : p.designation);
/** National parks go by their short name ("Zion"); other units keep the full name so "Colorado" reads as Colorado National Monument. */
export const parkTitle = (idx: IndexFile, p: ParkSummary): string =>
  !idx.hasMetadata ? p.code : isNationalPark(p) ? p.shortName || p.name : p.name;

/** Rank parks against free text: code, then name/short-name prefix, word prefix, substring, state. */
export function matchParks(idx: IndexFile, query: string, limit = 7): ParkSummary[] {
  const s = query.trim().toLowerCase();
  if (!s) return [];
  const score = (p: ParkSummary) => {
    const n = p.name.toLowerCase(), sn = (p.shortName || '').toLowerCase();
    if (p.code.toLowerCase() === s) return 0;
    if (sn.startsWith(s) || n.startsWith(s)) return 1;
    if (n.split(/\s+/).some((w) => w.startsWith(s))) return 2;
    if (n.includes(s)) return 3;
    if (p.states.some((st) => (STATE_NAMES[st] ?? st).toLowerCase().startsWith(s))) return 4;
    return 9;
  };
  return idx.parks
    .map((p) => [p, score(p)] as const)
    .filter(([, sc]) => sc < 9)
    .sort((a, b) => a[1] - b[1] || Number(isNationalPark(b[0])) - Number(isNationalPark(a[0])) || a[0].name.localeCompare(b[0].name))
    .slice(0, limit)
    .map(([p]) => p);
}

/** What a row's second line says. Each context picks the fact that matters there. */
export type RowNote = 'kind' | 'visits' | { month: number };

export function parkRow(idx: IndexFile, p: ParkSummary, note: RowNote = 'kind'): PickRow {
  let sub: string;
  if (typeof note === 'object' && p.profile) sub = `${fmtPct(p.profile[note.month], 1)} of its year in ${MONTHS_LONG[note.month]} · ${stateLine(p.states)}`;
  else if (note === 'visits' && p.latestAnnual != null) sub = `${fmtCompact(p.latestAnnual)} visits in ${p.lastYear} · ${stateLine(p.states)}`;
  else sub = [designation(p), stateLine(p.states)].filter(Boolean).join(' · ');
  return { code: p.code, title: parkTitle(idx, p), sub, kind: isNationalPark(p) ? 'np' : 'unit' };
}

/** One option element in a picker list. */
export function optionEl(row: PickRow, id: string, opts: { active: boolean; current?: boolean; onPick: () => void }): HTMLElement {
  const tile = h('span', { class: `pop-tile ${row.kind}` });
  tile.innerHTML = TILE[row.kind];
  const el = h('div', {
    class: `pop-option${opts.current ? ' current' : ''}`, role: 'option', id, 'aria-selected': String(opts.active),
    onpointerdown: (e: Event) => e.preventDefault(), // keep focus in the input
    onclick: opts.onPick,
  }, tile, h('span', { class: 'pop-text' }, h('span', { class: 'pop-title' }, row.title), row.sub ? h('span', { class: 'pop-sub' }, row.sub) : null));
  if (opts.current) el.insertAdjacentHTML('beforeend', PICKER_ICON.check);
  return el;
}

/* ---------- generic combobox ---------- */

export interface ComboOpts {
  /** Visible label above the field (omit for the header variant). */
  label?: string;
  /** Current value and how to show it; the label doubles as the placeholder while typing. */
  value?: string;
  display: (value: string | undefined) => string;
  placeholder: string;
  variant?: 'field' | 'header';
  /** Field width preset. */
  size?: 'md' | 'sm';
  /** Leading icon: a search glass for free search, a chevron for choosing among a list. */
  affordance?: 'search' | 'select';
  /** Empty-query suggestions, in groups. */
  suggest: () => PickGroup[];
  /** Rows for a typed query. */
  search: (q: string) => PickRow[];
  /** Popover heading for typed results. */
  resultsHead?: string;
  onPick: (value: string) => void;
}

let seq = 0;

export function combobox(o: ComboOpts): HTMLElement {
  const uid = `cb${++seq}`;
  let current = o.value;
  let rows: PickRow[] = [];
  let active = -1;

  const input = h('input', {
    type: 'text', id: `${uid}-input`, value: o.display(current), placeholder: o.placeholder,
    autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': `${uid}-pop`, 'aria-label': o.label ?? o.placeholder,
  });
  const box = h('div', { class: 'picker-box' });
  box.innerHTML = o.affordance === 'select' ? '' : PICKER_ICON.search;
  box.append(input);
  if (o.affordance === 'select') box.insertAdjacentHTML('beforeend', PICKER_ICON.chevron);
  const pop = h('div', { class: 'finder-pop picker-pop', id: `${uid}-pop`, role: 'listbox', hidden: true });
  const root = h('div', { class: `park-picker ${o.variant ?? 'field'} size-${o.size ?? 'md'}` },
    o.label ? h('label', { class: 'picker-label', for: `${uid}-input` }, o.label) : null, box, pop);

  function render(): void {
    const q = input.value.trim();
    const groups: PickGroup[] = q
      ? [{ head: o.resultsHead ?? 'Results', rows: o.search(q) }]
      : o.suggest().filter((g) => g.rows.length);
    rows = groups.flatMap((g) => g.rows);
    active = q && rows.length ? 0 : -1;
    let i = 0;
    pop.replaceChildren(...(rows.length ? groups.flatMap((g) => [
      h('p', { class: 'pop-head' }, g.head),
      ...g.rows.map((r) => {
        const k = i++;
        return optionEl(r, `${uid}-opt-${k}`, { active: k === active, current: r.code === current, onPick: () => pick(r.code) });
      }),
    ]) : [h('p', { class: 'pop-head' }, `Nothing matches “${q}”`)]));
    sync();
  }

  function sync(): void {
    pop.querySelectorAll('.pop-option').forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
    input.setAttribute('aria-activedescendant', active >= 0 ? `${uid}-opt-${active}` : '');
    if (active >= 0) pop.querySelector(`#${uid}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }

  /** Hang from the field's left edge; if that runs off the window, line up with its right edge instead. */
  function place(): void {
    const gutter = 16, vw = innerWidth;
    pop.style.left = ''; pop.style.right = ''; pop.style.width = '';
    let r = pop.getBoundingClientRect();
    // The header popover is right-aligned by CSS; field popovers flip to the field's right edge.
    if (o.variant !== 'header' && r.right > vw - gutter) { pop.style.left = 'auto'; pop.style.right = '0'; r = pop.getBoundingClientRect(); }
    // Still spilling (small screens): pin it between the window's gutters.
    if (r.left < gutter || r.right > vw - gutter) {
      pop.style.right = 'auto';
      pop.style.left = `${gutter - root.getBoundingClientRect().left}px`;
      pop.style.width = `${vw - gutter * 2}px`;
    }
  }

  function open(): void {
    if (!pop.hidden) return;
    // While open, the current choice moves to the placeholder so typing starts fresh.
    input.placeholder = o.display(current) || o.placeholder;
    input.value = '';
    pop.hidden = false; root.classList.add('open'); input.setAttribute('aria-expanded', 'true');
    render(); place();
  }
  function close(): void {
    pop.hidden = true; root.classList.remove('open'); input.setAttribute('aria-expanded', 'false');
    input.placeholder = o.placeholder;
    input.value = o.display(current);
  }
  function pick(code: string): void {
    if (o.value !== undefined) current = code; // the header search doesn't keep a value
    close();
    input.blur();
    o.onPick(code);
  }

  input.addEventListener('focus', open);
  input.addEventListener('input', () => { if (pop.hidden) open(); render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (pop.hidden) open();
      const n = rows.length;
      if (n) { active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; sync(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = rows[active >= 0 ? active : 0];
      if (r && (active >= 0 || input.value.trim())) pick(r.code);
    } else if (e.key === 'Escape') {
      close(); input.blur();
    }
  });
  root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget as Node)) close(); });
  box.addEventListener('pointerdown', (e) => { if (e.target !== input) { e.preventDefault(); input.focus(); } });

  return root;
}

/* ---------- park picker ---------- */

/** Where the picker lives; decides what it suggests before you type. */
export type ParkContext =
  | { kind: 'header' }
  | { kind: 'park'; current: string }
  | { kind: 'compare'; other: string }
  | { kind: 'drift' };

export interface ParkPickerOpts {
  context: ParkContext;
  label?: string;
  value?: string;
  includeNational?: boolean;
  onPick: (code: string) => void;
}

const mostVisited = (idx: IndexFile, n: number, skip: Set<string>) =>
  idx.parks.filter((p) => isNationalPark(p) && p.latestAnnual != null && !skip.has(p.code))
    .sort((a, b) => b.latestAnnual! - a.latestAnnual!).slice(0, n);

export function parkPicker(idx: IndexFile, o: ParkPickerOpts): HTMLElement {
  const byCode = new Map(idx.parks.map((p) => [p.code, p]));
  const display = (code?: string) =>
    !code ? '' : code === NATIONAL ? 'All park units (national total)' : (() => { const p = byCode.get(code); return p ? (idx.hasMetadata ? p.name : p.code) : code; })();
  const systemWide: PickGroup = {
    head: 'System-wide',
    rows: o.includeNational ? [{ code: NATIONAL, title: 'All park units', sub: `National total across ${idx.parks.length} units`, kind: 'all' }] : [],
  };
  const ctx = o.context;

  const suggest = (): PickGroup[] => {
    const skip = new Set<string>([o.value ?? '']);
    if (ctx.kind === 'park') {
      const here = byCode.get(ctx.current);
      const st = here?.states[0];
      const near = st ? idx.parks.filter((p) => p.code !== ctx.current && p.states.includes(st) && p.latestAnnual != null)
        .sort((a, b) => b.latestAnnual! - a.latestAnnual!).slice(0, 4) : [];
      near.forEach((p) => skip.add(p.code));
      return [
        { head: st ? `Also in ${STATE_NAMES[st] ?? st}` : 'Nearby', rows: near.map((p) => parkRow(idx, p, 'visits')) },
        { head: 'Most visited national parks', rows: mostVisited(idx, near.length ? 4 : 6, skip).map((p) => parkRow(idx, p, 'visits')) },
        systemWide,
      ];
    }
    if (ctx.kind === 'compare') skip.add(ctx.other);
    return [
      { head: 'Most visited national parks', rows: mostVisited(idx, 6, skip).map((p) => parkRow(idx, p, 'visits')) },
      systemWide,
    ];
  };

  return combobox({
    label: o.label, value: o.value, display, placeholder: 'Search parks',
    variant: ctx.kind === 'header' ? 'header' : 'field', affordance: 'search', resultsHead: 'Parks',
    suggest, search: (q) => matchParks(idx, q).map((p) => parkRow(idx, p)),
    onPick: o.onPick,
  });
}

/* ---------- state picker ---------- */

export function statePicker(opts: {
  label: string; value: string; states: string[]; counts: Map<string, number>; unit: string; onPick: (st: string) => void;
}): HTMLElement {
  const name = (st: string) => STATE_NAMES[st] ?? st;
  const row = (st: string): PickRow => {
    const n = opts.counts.get(st) ?? 0;
    return { code: st, title: name(st), sub: `${n} ${opts.unit}${n === 1 ? '' : 's'}`, kind: 'place' };
  };
  const all: PickRow = { code: '', title: 'All states', sub: 'No state filter', kind: 'all' };
  // Only states that have parks under the current filters (plus the current choice, so it stays visible).
  const sorted = opts.states.filter((st) => (opts.counts.get(st) ?? 0) > 0 || st === opts.value)
    .sort((a, b) => name(a).localeCompare(name(b)));
  return combobox({
    label: opts.label, value: opts.value, display: (v) => (v ? name(v) : 'All states'), placeholder: 'All states',
    size: 'sm', affordance: 'select', resultsHead: 'States',
    suggest: () => [{ head: 'Filter by state', rows: [all, ...sorted.map(row)] }],
    search: (q) => {
      const s = q.toLowerCase();
      return sorted.filter((st) => name(st).toLowerCase().includes(s) || st.toLowerCase() === s)
        .sort((a, b) => Number(!name(a).toLowerCase().startsWith(s)) - Number(!name(b).toLowerCase().startsWith(s)))
        .map(row);
    },
    onPick: opts.onPick,
  });
}

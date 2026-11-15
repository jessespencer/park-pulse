/**
 * Shared park picker: a combobox with an Airbnb-style suggestion popover.
 * Used by the header search, the "Change park" / Compare / Season drift
 * fields, and (for matching + rows) the home finder.
 */
import { MONTHS_LONG, NATIONAL, STATE_NAMES, fmtPct, isNationalPark, stateLine, type IndexFile, type ParkSummary } from './data';
import { quietestParks } from './insights';
import { h } from './ui';

const svg = (body: string, cls = 'ic') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const PICKER_ICON = {
  mountain: svg('<path d="M2.5 19.5 9 8.5l3.6 6 2.4-3.8 6.5 8.8z"/><path d="m7.4 11.2 1.6 1.4 1.3-1.2"/>'),
  monument: svg('<path d="M12 3.5 14 8v12.5h-4V8z"/><path d="M6 20.5h12"/>'),
  all: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.3 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.3-3.8-8.5S9.4 5.9 12 3.5z"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', 'ic-search'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'ic-check'),
};

export interface PickRow { code: string; title: string; sub: string; kind: 'np' | 'unit' | 'all' }

const designation = (p: ParkSummary) => (['Other', 'Unknown', 'Not in NPS API'].includes(p.designation) ? '' : p.designation);
export const parkTitle = (idx: IndexFile, p: ParkSummary): string => (idx.hasMetadata ? p.shortName || p.name : p.code);

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

/** Row for a park: designation + state when searching, this month's share when suggesting. */
export function parkRow(idx: IndexFile, p: ParkSummary, month?: number): PickRow {
  const sub = month != null && p.profile
    ? `${fmtPct(p.profile[month], 1)} of its year in ${MONTHS_LONG[month]} · ${stateLine(p.states)}`
    : [designation(p), stateLine(p.states)].filter(Boolean).join(' · ');
  return { code: p.code, title: parkTitle(idx, p), sub, kind: isNationalPark(p) ? 'np' : 'unit' };
}

const NATIONAL_ROW = (idx: IndexFile): PickRow =>
  ({ code: NATIONAL, title: 'All park units', sub: `National total across ${idx.parks.length} units`, kind: 'all' });

/** One option element in a picker list. */
export function optionEl(row: PickRow, id: string, opts: { active: boolean; current?: boolean; onPick: () => void }): HTMLElement {
  const tile = h('span', { class: `pop-tile ${row.kind}` });
  tile.innerHTML = row.kind === 'np' ? PICKER_ICON.mountain : row.kind === 'all' ? PICKER_ICON.all : PICKER_ICON.monument;
  const el = h('div', {
    class: `pop-option${opts.current ? ' current' : ''}`, role: 'option', id, 'aria-selected': String(opts.active),
    onpointerdown: (e: Event) => e.preventDefault(), // keep focus in the input
    onclick: opts.onPick,
  }, tile, h('span', { class: 'pop-text' }, h('span', { class: 'pop-title' }, row.title), h('span', { class: 'pop-sub' }, row.sub)));
  if (opts.current) el.insertAdjacentHTML('beforeend', PICKER_ICON.check);
  return el;
}

export interface ParkPickerOpts {
  /** Visible label above the field (omit for the header variant). */
  label?: string;
  /** Currently selected park code, shown in the field. */
  value?: string;
  placeholder?: string;
  /** Offer the national total as an option. */
  includeNational?: boolean;
  variant?: 'field' | 'header';
  /** Which edge the popover aligns to. */
  align?: 'left' | 'right';
  onPick: (code: string) => void;
}

let pickerSeq = 0;

export function parkPicker(idx: IndexFile, o: ParkPickerOpts): HTMLElement {
  const uid = `pp${++pickerSeq}`;
  const month = new Date().getMonth();
  const byCode = new Map(idx.parks.map((p) => [p.code, p]));
  const labelFor = (code?: string) =>
    !code ? '' : code === NATIONAL ? 'All park units (national total)' : (() => { const p = byCode.get(code); return p ? (idx.hasMetadata ? p.name : p.code) : code; })();

  let current = o.value;
  let dirty = false;
  let rows: PickRow[] = [];
  let active = -1;

  const input = h('input', {
    type: 'text', id: `${uid}-input`, value: labelFor(current), placeholder: o.placeholder ?? 'Search parks',
    autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': `${uid}-pop`, 'aria-label': o.label ?? 'Search parks',
  });
  const box = h('div', { class: 'picker-box' });
  box.innerHTML = PICKER_ICON.search;
  box.append(input);
  const pop = h('div', { class: `finder-pop pop-park picker-pop${o.align === 'right' ? ' align-right' : ''}`, id: `${uid}-pop`, role: 'listbox', hidden: true });
  const root = h('div', { class: `park-picker ${o.variant ?? 'field'}` },
    o.label ? h('label', { class: 'picker-label', for: `${uid}-input` }, o.label) : null, box, pop);

  function render(): void {
    const q = dirty ? input.value.trim() : '';
    let head: string;
    if (q) {
      rows = matchParks(idx, q).map((p) => parkRow(idx, p));
      head = rows.length ? 'Parks' : `No parks match “${q}”`;
    } else {
      rows = [
        ...(o.includeNational ? [NATIONAL_ROW(idx)] : []),
        ...quietestParks(idx.parks, month, 5).map((p) => parkRow(idx, p, month)),
      ];
      head = `Quiet in ${MONTHS_LONG[month]}`;
    }
    active = q && rows.length ? 0 : -1;
    pop.replaceChildren(h('p', { class: 'pop-head' }, head),
      ...rows.map((r, i) => optionEl(r, `${uid}-opt-${i}`, { active: i === active, current: r.code === current, onPick: () => pick(r.code) })));
    sync();
  }

  function sync(): void {
    pop.querySelectorAll('.pop-option').forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
    input.setAttribute('aria-activedescendant', active >= 0 ? `${uid}-opt-${active}` : '');
    if (active >= 0) pop.querySelector(`#${uid}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }

  function open(): void { pop.hidden = false; root.classList.add('open'); input.setAttribute('aria-expanded', 'true'); render(); }
  function close(restore = true): void {
    pop.hidden = true; root.classList.remove('open'); input.setAttribute('aria-expanded', 'false');
    dirty = false;
    if (restore) input.value = labelFor(current);
  }
  function pick(code: string): void {
    current = o.value != null ? code : undefined; // header search doesn't keep a value
    close();
    input.blur();
    o.onPick(code);
  }

  input.addEventListener('focus', () => { input.select(); open(); });
  // A click would place the caret and undo select(); take focus ourselves so typing replaces the name.
  input.addEventListener('pointerdown', (e) => { if (document.activeElement !== input) { e.preventDefault(); input.focus(); } });
  input.addEventListener('input', () => { dirty = true; if (pop.hidden) open(); else render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (pop.hidden) open();
      const n = rows.length;
      if (n) { active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; sync(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = rows[active >= 0 ? active : 0];
      if (r && (active >= 0 || dirty)) pick(r.code);
    } else if (e.key === 'Escape') {
      close(); input.blur();
    }
  });
  root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget as Node)) close(); });
  box.addEventListener('pointerdown', (e) => { if (e.target !== input) { e.preventDefault(); input.focus(); } });

  return root;
}

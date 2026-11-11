export type View = 'home' | 'park' | 'wall' | 'when' | 'drift' | 'compare';
export type Mode = 'visits' | 'share' | 'index';
export type WallSort = 'peak' | 'peakiness' | 'total';

export interface AppState {
  view: View;
  park: string;
  mode: Mode;
  sort: WallSort;
  month: number;
  region: string;
  st: string;
  scope: 'np' | 'all';
  open: boolean; // when-to-go: hide parks that are mostly closed that month
  a: string;
  b: string;
}

const VIEWS: View[] = ['home', 'park', 'wall', 'when', 'drift', 'compare'];
const MODES: Mode[] = ['visits', 'share', 'index'];
const SORTS: WallSort[] = ['peak', 'peakiness', 'total'];

const DEFAULTS: AppState = {
  view: 'home', park: 'ROMO', mode: 'visits', sort: 'peak', month: new Date().getMonth() + 1,
  region: '', st: '', scope: 'np', open: true, a: 'ROMO', b: 'GRSM',
};

const pick = <T extends string>(v: string | null, allowed: readonly T[], d: T): T =>
  allowed.includes(v as T) ? (v as T) : d;
const code = (v: string | null, d: string): string => (v && /^[A-Za-z]{3,5}$/.test(v) ? v.toUpperCase() : d);

export function readState(): AppState {
  const q = new URLSearchParams(location.search);
  const m = Number(q.get('month'));
  return {
    view: pick(q.get('view'), VIEWS, DEFAULTS.view),
    park: code(q.get('park'), DEFAULTS.park),
    mode: pick(q.get('mode'), MODES, DEFAULTS.mode),
    sort: pick(q.get('sort'), SORTS, DEFAULTS.sort),
    month: Number.isInteger(m) && m >= 1 && m <= 12 ? m : DEFAULTS.month,
    region: q.get('region') ?? '',
    st: (q.get('state') ?? '').toUpperCase(),
    scope: q.get('scope') === 'all' ? 'all' : 'np',
    open: q.get('open') !== '0',
    a: code(q.get('a'), DEFAULTS.a),
    b: code(q.get('b'), DEFAULTS.b),
  };
}

/** Keys each view cares about — only those go in the URL, so links stay short. */
const VIEW_KEYS: Record<View, (keyof AppState)[]> = {
  home: [],
  park: ['park', 'mode'],
  wall: ['sort', 'scope'],
  when: ['month', 'region', 'st', 'scope', 'open'],
  drift: ['park'],
  compare: ['a', 'b', 'mode'],
};

export function toSearch(s: AppState): string {
  if (s.view === 'home') return location.pathname;
  const q = new URLSearchParams({ view: s.view });
  for (const k of VIEW_KEYS[s.view]) {
    const v = s[k];
    // Identity keys (and month, whose default moves with the calendar) always go in the URL.
    if (v === DEFAULTS[k] && !['park', 'a', 'b', 'month'].includes(k)) continue;
    if (v === '') continue;
    q.set(k === 'st' ? 'state' : k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  return `?${q}`;
}

type Listener = (s: AppState) => void;
let current = readState();
const listeners: Listener[] = [];

export const getState = (): AppState => current;
export const subscribe = (fn: Listener): void => void listeners.push(fn);

/** Update state. View changes push history (back button works); tweaks replace. */
export function setState(patch: Partial<AppState>): void {
  const next = { ...current, ...patch };
  const push = next.view !== current.view || next.park !== current.park;
  current = next;
  const url = toSearch(current);
  if (push) history.pushState(null, '', url);
  else history.replaceState(null, '', url);
  listeners.forEach((fn) => fn(current));
}

window.addEventListener('popstate', () => {
  current = readState();
  listeners.forEach((fn) => fn(current));
});

export type Grid = (number | null)[][];

export interface Note {
  year: number;
  month: number;
  kind: 'shutdown' | 'covid' | 'data';
  text: string;
}

export interface ParkSummary {
  code: string;
  name: string;
  shortName: string;
  designation: string;
  states: string[];
  lat: number | null;
  lon: number | null;
  firstYear: number;
  lastYear: number;
  profile: number[] | null;
  profileYears: number[];
  peakMonth: number | null;
  peakiness: number | null;
  avgAnnual: number | null;
  latestAnnual: number | null;
}

export interface ParkDetail extends ParkSummary {
  years: number[];
  visits: Grid;
  share: Grid;
  index: Grid;
  yoy?: Grid;
  annual?: (number | null)[];
  notes: Note[];
}

export interface IndexFile {
  asOf: string | null;
  built: string;
  hasMetadata: boolean;
  baseline: [number, number];
  profileYears: number[];
  source: string;
  parks: ParkSummary[];
}

const base = import.meta.env.BASE_URL;
let indexPromise: Promise<IndexFile> | null = null;
const parkCache = new Map<string, Promise<ParkDetail>>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}data/${path}`);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

export const loadIndex = (): Promise<IndexFile> => (indexPromise ??= getJson<IndexFile>('index.json'));

export const NATIONAL = 'NPS';

export function loadPark(code: string): Promise<ParkDetail> {
  const key = code.toUpperCase();
  let p = parkCache.get(key);
  if (!p) {
    p = key === NATIONAL
      ? getJson<ParkDetail>('national.json')
      : getJson<ParkDetail>(`parks/${encodeURIComponent(key)}.json`);
    parkCache.set(key, p);
  }
  return p;
}

/** The 64 "National Parks": NP, NP & Preserve, and Redwood ("National and State Parks"). */
export const isNationalPark = (p: ParkSummary): boolean =>
  /^National Parks?( (&|and) Preserve)?$|^National and State Parks$/.test(p.designation);

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const fmtInt = (n: number): string => n.toLocaleString('en-US');
export const fmtPct = (x: number, digits = 1): string => `${(x * 100).toFixed(digits)}%`;
export const fmtCompact = (n: number): string =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** US Census regions; territories grouped separately. */
export const REGIONS: Record<string, string[]> = {
  Northeast: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA'],
  Midwest: ['IL', 'IN', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'],
  South: ['DE', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'DC', 'WV', 'AL', 'KY', 'MS', 'TN', 'AR', 'LA', 'OK', 'TX'],
  West: ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY', 'AK', 'CA', 'HI', 'OR', 'WA'],
  Territories: ['PR', 'VI', 'GU', 'AS', 'MP'],
};

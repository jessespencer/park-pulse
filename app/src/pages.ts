import type { View } from './state';

/** Each page's one name and one-line description, shared by the menu, the home page and the tab title. */
export interface PageInfo { id: View; label: string; blurb: string; icon: string }

export const PAGES: PageInfo[] = [
  { id: 'when', label: 'When to go', blurb: 'Parks at their least busy in any month', icon: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M9 14h2v2H9z' },
  { id: 'park', label: 'Park profile', blurb: 'One park’s busy season, how it has shifted, and how it compares', icon: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4z' },
  { id: 'wall', label: 'Fingerprints', blurb: 'Every national park’s year at a glance', icon: 'M4 20V12M8 20V7M12 20V4M16 20V9M20 20v-6' },
];

/** The tabs under a park's sign. Each is its own view, so it has its own URL. */
export const PARK_TABS: { id: View; label: string }[] = [
  { id: 'park', label: 'Overview' },
  { id: 'drift', label: 'Season drift' },
  { id: 'compare', label: 'Compare' },
];

/** Name for the tab title: the page, or "Season drift" / "Compare" for a park tab. */
export const pageLabel = (v: View): string =>
  v === 'home' ? 'Home' : v === 'drift' || v === 'compare' ? PARK_TABS.find((t) => t.id === v)!.label : PAGES.find((p) => p.id === v)!.label;

/** The menu entry a view belongs to (park tabs all live under Park profile). */
export const menuPage = (v: View): View => (v === 'drift' || v === 'compare' ? 'park' : v);

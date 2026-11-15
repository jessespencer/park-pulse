import type { View } from './state';

/** Each page's one name and one-line description, shared by the menu, the home page and the tab title. */
export interface PageInfo { id: View; label: string; blurb: string; icon: string }

export const PAGES: PageInfo[] = [
  { id: 'when', label: 'When to go', blurb: 'Parks at their least busy in any month', icon: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M9 14h2v2H9z' },
  { id: 'park', label: 'Park profile', blurb: 'One park’s busy season, every month since 1979', icon: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4z' },
  { id: 'wall', label: 'Fingerprints', blurb: 'Every national park’s year at a glance', icon: 'M4 20V12M8 20V7M12 20V4M16 20V9M20 20v-6' },
  { id: 'drift', label: 'Season drift', blurb: 'How one park’s busy season has shifted by decade', icon: 'M3 17c3-6 6-9 9-9s6 3 9 9M3 12c3-4 6-6 9-6s6 2 9 6' },
  { id: 'compare', label: 'Compare', blurb: 'Two parks’ monthly visits side by side', icon: 'M4 5h7v14H4zM13 5h7v14h-7z' },
];

export const pageLabel = (v: View): string => PAGES.find((p) => p.id === v)?.label ?? 'Home';

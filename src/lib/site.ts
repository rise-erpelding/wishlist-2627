import { BRIGHTS, brightFor } from './colors';

export const SITE_NAME = 'Erp Wish List';
export const SITE_TITLE = `${SITE_NAME} 2026–2027`;

const [orange, blue, mint, yellow] = BRIGHTS;

// Per-person look, keyed by page slug. Anyone not listed gets the next bright in order.
const PEOPLE: Record<string, { color: (typeof BRIGHTS)[number]; note?: string }> = {
  'both-kids': { color: yellow, note: 'Gifts for David and James to share.' },
  dave: { color: blue },
  david: { color: mint },
  james: { color: orange },
  rise: { color: orange },
};

export const colorFor = (slug: string, index: number) => PEOPLE[slug]?.color ?? brightFor(index);
export const noteFor = (slug: string) => PEOPLE[slug]?.note;

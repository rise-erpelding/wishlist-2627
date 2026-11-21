// Brights are the same in both themes. Only blue carries white text.
export const BRIGHTS = [
  { bg: 'var(--orange)', fg: 'var(--on-bright)' },
  { bg: 'var(--blue)', fg: 'var(--on-blue)' },
  { bg: 'var(--mint)', fg: 'var(--on-bright)' },
  { bg: 'var(--yellow)', fg: 'var(--on-bright)' },
] as const;

export const brightFor = (index: number) => BRIGHTS[index % BRIGHTS.length];

export const CATEGORY_COLOR = {
  items: BRIGHTS[0],
  books: BRIGHTS[2],
  'gift-cards': BRIGHTS[3],
} as const;

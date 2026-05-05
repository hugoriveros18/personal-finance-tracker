// Categorical palette for pie/donut/bar charts. Each adjacent pair contrasts
// strongly in hue so a small set of slices (3-5 categories) reads cleanly,
// and the colors are tuned to remain legible on both light and dark Mantine
// backgrounds.
export const CATEGORY_COLORS = [
  '#0c8599', // teal
  '#fd7e14', // orange
  '#7950f2', // violet
  '#37b24d', // green
  '#1c7ed6', // blue
  '#e64980', // pink
  '#f59f00', // amber
  '#15aabf', // cyan
  '#fa5252', // red
  '#82c91e', // lime
] as const;

export const colorAt = (i: number): string =>
  CATEGORY_COLORS[i % CATEGORY_COLORS.length] as string;

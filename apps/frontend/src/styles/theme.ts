import { createTheme, type MantineColorsTuple } from '@mantine/core';

const teal: MantineColorsTuple = [
  '#e0f7fa',
  '#b8e9ee',
  '#8fdae3',
  '#65cad7',
  '#3dbbcc',
  '#229db0',
  '#0c8599',
  '#0a6e80',
  '#085867',
  '#06434f',
];

export const theme = createTheme({
  primaryColor: 'teal',
  colors: { teal },
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  defaultRadius: 'md',
  cursorType: 'pointer',
});

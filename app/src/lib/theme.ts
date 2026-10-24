// Colours for light and dark mode. Every screen takes its colours from here.

import { useColorScheme } from 'react-native';

const light = {
  background: '#F4F6F3', // a faint green-grey, like a topographic map
  surface: '#FFFFFF',
  text: '#1B2420',
  muted: '#5C6B63',
  border: '#D5DDD7',
  accent: '#1F6B4F', // forest green
  accentText: '#FFFFFF',
  danger: '#B3261E',
  estimated: '#9A6200', // amber: positions that are only estimates
};

const dark: typeof light = {
  background: '#101613',
  surface: '#18211C',
  text: '#E4EBE6',
  muted: '#93A39A',
  border: '#2B3830',
  accent: '#5FC096',
  accentText: '#08130D',
  danger: '#F2B8B5',
  estimated: '#F0B44C',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

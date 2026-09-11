import { Platform, useColorScheme } from 'react-native';

/**
 * Red Letter's appeal is restraint, so the palette is almost entirely paper and
 * ink with a single red reserved for one job: marking a day. Red never appears
 * as decoration, a button colour or a heading, because the moment it does it
 * stops meaning "something happens here".
 */

export interface Theme {
  dark: boolean;
  paper: string;
  /** Slightly raised surface, for cards and sheets. */
  surface: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  rule: string;
  /** The one accent. Reserved for marked days. */
  red: string;
  redSoft: string;
  danger: string;
}

const light: Theme = {
  dark: false,
  paper: '#FBFAF8',
  surface: '#FFFFFF',
  ink: '#1A1917',
  inkMuted: '#6B6862',
  inkFaint: '#A8A49C',
  rule: '#E6E3DC',
  red: '#B3261E',
  redSoft: '#F6E4E2',
  danger: '#B3261E',
};

const dark: Theme = {
  dark: true,
  paper: '#141312',
  surface: '#1F1E1C',
  ink: '#F2F0EC',
  inkMuted: '#9C988F',
  inkFaint: '#6A6761',
  rule: '#2E2C29',
  red: '#E8635A',
  redSoft: '#3A2320',
  danger: '#E8635A',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** A 4pt rhythm. Generous by default — empty space is the product. */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 64,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
} as const;

export const type = {
  /** Year numeral and other display text. */
  display: { fontSize: 34, fontWeight: '300' as const, letterSpacing: 0.5 },
  title: { fontSize: 22, fontWeight: '600' as const, letterSpacing: 0.2 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  small: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.6 },
} as const;

export const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

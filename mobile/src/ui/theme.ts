import { Platform, useColorScheme } from 'react-native';

/**
 * Red Letter's palette, taken from the web version so the two products look
 * like one product.
 *
 * Red is spent on exactly one thing: a day worth marking. It is never a button,
 * a heading or a decoration, because the moment it is, it stops meaning
 * anything. The single exception is a security warning, which outranks the
 * palette.
 */

export interface Theme {
  dark: boolean;
  /** The page behind everything. */
  ground: string;
  /** Cells, cards and sheets sit on the ground in this. */
  surface: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  line: string;
  red: string;
  /** Wash behind a marked day's cell. */
  redSoft: string;
  /** Border for chips and other red-on-wash elements. */
  redLine: string;
  danger: string;
}

const light: Theme = {
  dark: false,
  ground: '#EDEDED',
  surface: '#FFFFFF',
  ink: '#000000',
  inkMuted: '#767676',
  inkFaint: '#C4C4C4',
  line: '#D6D6D6',
  red: '#B01E28',
  redSoft: '#FBF1F1',
  redLine: '#E8CDCE',
  danger: '#B01E28',
};

/**
 * The web version has no dark mode — it is a single HTML file that has only
 * ever been a light document. A phone does, and an app that ignores it burns
 * the reader's eyes at night, so this is derived rather than copied: the same
 * relationships, inverted, with the red lifted enough to stay legible on a dark
 * ground. #B01E28 on near-black fails contrast badly; #E05A55 does not.
 */
const dark: Theme = {
  dark: true,
  ground: '#121212',
  surface: '#1C1C1C',
  ink: '#F2F2F2',
  inkMuted: '#9A9A9A',
  inkFaint: '#5A5A5A',
  line: '#2E2E2E',
  red: '#E05A55',
  redSoft: '#2C1A1A',
  redLine: '#4A2A2A',
  danger: '#E05A55',
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
  sm: 2,
  md: 6,
  lg: 12,
} as const;

/**
 * The web version sets its masthead, month names and headings in a serif and
 * everything else in the system sans. Keeping that split is most of why the two
 * read as the same product.
 */
export const serif = Platform.select({
  ios: 'Iowan Old Style',
  android: 'serif',
  default: 'serif',
});

export const type = {
  /** "Red Letter" in the masthead. Serif, red. */
  mark: { fontSize: 30, fontWeight: '400' as const, fontFamily: serif, letterSpacing: -0.3 },
  /** The year or month being shown, beside the stepper. Serif. */
  period: { fontSize: 21, fontWeight: '400' as const, fontFamily: serif },
  /** Triage heading, month names in the year grid. Serif. */
  serifHeading: { fontSize: 18, fontWeight: '400' as const, fontFamily: serif },
  serifSmall: { fontSize: 15.5, fontWeight: '400' as const, fontFamily: serif },

  title: { fontSize: 20, fontWeight: '600' as const, letterSpacing: 0.2 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  small: { fontSize: 14, fontWeight: '400' as const },
  tiny: { fontSize: 12.5, fontWeight: '400' as const },
  caption: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.5 },
} as const;

export const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

/**
 * Resolve a palette for a theme mode.
 *
 * Every screen reads colours through `useTheme().colors` so the whole app
 * can flip between light and dark. The dark palette is the original
 * `colors` object below; light mode gets its own surfaces/ink.
 */
export function getColors(mode = 'dark') {
  if (mode === 'light') {
    return {
      mode,
      bg: {
        primary:   '#F4F5F9',   // app background
        secondary: '#FFFFFF',   // card background
        tertiary:  '#EAECF4',   // elevated card / input
        overlay:   'rgba(15,23,42,0.45)',
      },
      brand: COLORS.brand,
      accent: COLORS.accent,
      text: {
        primary:   '#0F172A',
        secondary: '#475569',
        muted:     '#8A94A6',
        inverse:   '#FFFFFF',
        link:      '#4F46E5',
      },
      border: {
        default: '#E2E6EF',
        subtle:  '#EBEEF5',
        focus:   '#6366F1',
      },
      status: COLORS.status,
      white: '#FFFFFF',
      transparent: 'transparent',
    };
  }
  return { mode: 'dark', ...COLORS };
}

// NexorCRM Mobile — Color Palette (Dark Theme)
const COLORS = {
  mode: 'dark',
  // Backgrounds
  bg: {
    primary:   '#0D0F14',   // deepest background
    secondary: '#13161E',   // card background
    tertiary:  '#1A1E2A',   // elevated card / input
    overlay:   'rgba(0,0,0,0.6)',
  },

  // Brand
  brand: {
    primary:   '#6366F1',   // indigo-500
    secondary: '#8B5CF6',   // violet-500
    gradient:  ['#6366F1', '#8B5CF6'],
    light:     '#818CF8',
    dark:      '#4338CA',
  },

  // Accent
  accent: {
    cyan:    '#22D3EE',
    green:   '#10B981',
    amber:   '#F59E0B',
    red:     '#EF4444',
    pink:    '#EC4899',
    orange:  '#F97316',
  },

  // Text
  text: {
    primary:   '#F1F5F9',
    secondary: '#94A3B8',
    muted:     '#475569',
    inverse:   '#0D0F14',
    link:      '#818CF8',
  },

  // Border / Divider
  border: {
    default: '#1E2333',
    subtle:  '#252B3A',
    focus:   '#6366F1',
  },

  // Status badges
  status: {
    new:       { bg: '#1E293B', text: '#38BDF8' },
    open:      { bg: '#1C3349', text: '#60A5FA' },
    qualified: { bg: '#1A2E22', text: '#34D399' },
    won:       { bg: '#14281A', text: '#10B981' },
    lost:      { bg: '#2D1B1B', text: '#F87171' },
    pending:   { bg: '#2D2416', text: '#FBBF24' },
    active:    { bg: '#1A2E22', text: '#10B981' },
    inactive:  { bg: '#2D1B1B', text: '#F87171' },
  },

  // Transparent utilities
  white:       '#FFFFFF',
  transparent: 'transparent',
};

export const colors = COLORS;

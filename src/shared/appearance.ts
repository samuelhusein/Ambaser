// Light/dark mode and colour theme. No Electron imports so it can be unit tested.
import type { Appearance } from './types';

export const MODES: readonly Appearance['mode'][] = ['system', 'light', 'dark'];
export const THEMES: readonly Appearance['theme'][] = ['default', 'midnight', 'titanium', 'aurora', 'rose', 'champagne', 'emerald'];

// Dark with no tint is how the app looked before there was a choice.
export const parseAppearance = (input: unknown): Appearance => {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  return {
    mode: MODES.includes(raw.mode as Appearance['mode']) ? (raw.mode as Appearance['mode']) : 'dark',
    theme: THEMES.includes(raw.theme as Appearance['theme']) ? (raw.theme as Appearance['theme']) : 'default',
  };
};

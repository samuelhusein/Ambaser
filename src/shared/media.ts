// Checking what a page reports about its player. No Electron imports so it can be unit tested.
import type { MediaCommand, MediaInfo } from './types';

export const MEDIA_COMMANDS: MediaCommand[] = ['playpause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto', 'pip'];

type PageMedia = Omit<MediaInfo, 'tabId' | 'host' | 'favicon'>;

// The page wrote this, so every field is checked and long text is cut.
export function parseMedia(input: unknown): PageMedia | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');
  const seconds = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
  const artwork = text(raw.artwork, 4096);
  const duration = seconds(raw.duration);
  return {
    title: text(raw.title, 300),
    artist: text(raw.artist, 300),
    // Shown in an <img> in the browser's own UI: only plain web or inline images.
    artwork: /^(https?:|data:image\/)/i.test(artwork) ? artwork : '',
    playing: raw.playing === true,
    duration,
    time: Math.min(seconds(raw.time), duration),
    canPrevious: raw.canPrevious === true,
    canNext: raw.canNext === true,
    canPip: raw.canPip === true,
  };
}

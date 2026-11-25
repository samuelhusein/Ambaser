// Which site permissions are harmless, which the user is asked about; everything else is refused.
// No Electron imports so it can be unit tested.
const HARMLESS = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write']);

const QUESTIONS: Record<string, string> = {
  notifications: 'show notifications',
  geolocation: 'know your location',
  camera: 'use your camera',
  microphone: 'use your microphone',
  'clipboard-read': 'read your clipboard',
};

export const isHarmless = (permission: string): boolean => HARMLESS.has(permission);

export const question = (kind: string): string | undefined => (Object.hasOwn(QUESTIONS, kind) ? QUESTIONS[kind] : undefined);

// Electron groups camera and microphone under "media"; they are asked and remembered separately.
export function kindsOf(permission: string, mediaTypes: readonly string[] = []): string[] {
  if (permission !== 'media') return [permission];
  return mediaTypes.flatMap((t) => (t === 'video' ? ['camera'] : t === 'audio' ? ['microphone'] : []));
}

// Only secure pages (and this computer itself) can be given anything.
export function secureOrigin(url: string): string | null {
  if (!URL.canParse(url)) return null;
  const { protocol, hostname, origin } = new URL(url);
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  return protocol === 'https:' || (protocol === 'http:' && local) ? origin : null;
}

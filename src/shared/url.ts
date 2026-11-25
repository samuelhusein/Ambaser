// Pure URL helpers used by the main process. Kept free of Electron imports so they can be unit tested.

// "mybrowser:" is our own protocol: it only serves the fixed pages bundled with the app.
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mybrowser:']);
export const BLANK_URL = 'about:blank';
export const HOME_URL = 'mybrowser://home/';
export const CERT_ERROR_HOST = 'cert-error';

export const LOAD_ERROR_HOST = 'load-error';

export const isAppUrl = (url: string): boolean => url.startsWith('mybrowser:');

export function certErrorUrl(target: string, errorCode: number): string {
  return `mybrowser://${CERT_ERROR_HOST}/?url=${encodeURIComponent(target)}&code=${errorCode}`;
}

export function loadErrorUrl(target: string, errorCode: number, errorName: string): string {
  return `mybrowser://${LOAD_ERROR_HOST}/?url=${encodeURIComponent(target)}&code=${errorCode}&name=${encodeURIComponent(errorName)}`;
}

// The address a tab stands for: an error page stands for the page that failed.
export function displayUrl(url: string): string {
  const isError = url.startsWith(`mybrowser://${LOAD_ERROR_HOST}/`) || url.startsWith(`mybrowser://${CERT_ERROR_HOST}/`);
  return (isError && URL.canParse(url) && new URL(url).searchParams.get('url')) || url;
}

// Returns true only for http(s) URLs, about:blank and our own pages. Blocks file:, javascript:, data:, custom schemes.
export function isAllowedUrl(raw: string): boolean {
  if (raw === BLANK_URL) return true;
  try {
    const parsed = new URL(raw);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export const SEARCH_URL = 'https://www.google.com/search?q=';

// A domain with a dot, localhost or [IPv6] (each with an optional port), or any single name with a port.
const HOST_LIKE = /^((localhost|\[[0-9a-f:.]+\]|[^\s:@]+\.[^\s:@]+)(:\d+)?|[a-z0-9-]+:\d+)$/i;

// Turns what the user typed into a navigable URL: an address as is, anything else as a Google search.
// Returns null if the input is empty or not allowed.
export function normalizeInput(input: string): string | null {
  const text = input.trim();
  if (text === '') return null;
  // Any other "scheme://" (file://, chrome://, ...) is refused outright, not rewritten or searched.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !/^https?:\/\//i.test(text)) return null;
  // Same for the schemes written without "//". With spaces it is a search phrase, e.g. "data: types".
  if (/^(javascript|data|file|vbscript):\S*$/i.test(text)) return null;

  let candidate: string;
  if (/^(https?:\/\/|about:blank$)/i.test(text)) candidate = text;
  else if (!/\s/.test(text) && HOST_LIKE.test(text.split(/[/?#]/)[0])) candidate = `https://${text}`;
  else candidate = SEARCH_URL + encodeURIComponent(text);

  return isAllowedUrl(candidate) ? new URL(candidate).toString() : null;
}

// Chat and mail sites announce unread messages at the start of their title, e.g. "(2) WhatsApp".
const UNREAD = /^\((\d{1,4})\+?\)\s*/;
export const unreadCount = (title: string): number => Number(UNREAD.exec(title)?.[1] ?? 0);
export const withoutUnread = (title: string): string => title.replace(UNREAD, '');

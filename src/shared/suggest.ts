// Pure helpers for history and search suggestions. No Electron imports so they can be unit tested.
import { normalizeInput, SEARCH_URL } from './url';
import type { HistoryEntry } from './types';

const MAX_ENTRIES = 1000;

// Newest first, one entry per URL. Only web pages are remembered.
export function addVisit(list: HistoryEntry[], url: string, title: string, time = Date.now()): HistoryEntry[] {
  if (!/^https?:\/\//i.test(url)) return list;
  const favicon = list.find((e) => e.url === url)?.favicon; // a revisit keeps its icon
  return [{ url, title, time, ...(favicon ? { favicon } : {}) }, ...list.filter((e) => e.url !== url)].slice(0, MAX_ENTRIES);
}

// Every typed word must appear in the title or URL. An empty query returns the latest visits.
export function searchHistory(list: HistoryEntry[], query: string, limit = 5): HistoryEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return list
    .filter((e) => {
      const text = `${e.title} ${e.url}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .slice(0, limit);
}

// The text to send to Google for suggestions, or null if it must not leave the machine:
// empty, very long, or anything that is an address rather than a search.
export function suggestQuery(input: string): string | null {
  const text = input.trim();
  if (text === '' || text.length > 200) return null;
  return normalizeInput(text)?.startsWith(SEARCH_URL) ? text : null;
}

// Google answers ["query", ["suggestion", ...], ...]. Anything else yields no suggestions.
export function parseSuggestions(body: unknown, limit = 6): string[] {
  if (!Array.isArray(body) || !Array.isArray(body[1])) return [];
  return body[1].filter((s): s is string => typeof s === 'string').slice(0, limit);
}

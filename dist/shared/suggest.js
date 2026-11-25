"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addVisit = addVisit;
exports.searchHistory = searchHistory;
exports.suggestQuery = suggestQuery;
exports.parseSuggestions = parseSuggestions;
// Pure helpers for history and search suggestions. No Electron imports so they can be unit tested.
const url_1 = require("./url");
const MAX_ENTRIES = 1000;
// Newest first, one entry per URL. Only web pages are remembered.
function addVisit(list, url, title, time = Date.now()) {
    if (!/^https?:\/\//i.test(url))
        return list;
    const favicon = list.find((e) => e.url === url)?.favicon; // a revisit keeps its icon
    return [{ url, title, time, ...(favicon ? { favicon } : {}) }, ...list.filter((e) => e.url !== url)].slice(0, MAX_ENTRIES);
}
// Every typed word must appear in the title or URL. An empty query returns the latest visits.
function searchHistory(list, query, limit = 5) {
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
function suggestQuery(input) {
    const text = input.trim();
    if (text === '' || text.length > 200)
        return null;
    return (0, url_1.normalizeInput)(text)?.startsWith(url_1.SEARCH_URL) ? text : null;
}
// Google answers ["query", ["suggestion", ...], ...]. Anything else yields no suggestions.
function parseSuggestions(body, limit = 6) {
    if (!Array.isArray(body) || !Array.isArray(body[1]))
        return [];
    return body[1].filter((s) => typeof s === 'string').slice(0, limit);
}

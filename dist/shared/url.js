"use strict";
// Pure URL helpers used by the main process. Kept free of Electron imports so they can be unit tested.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEARCH_URL = exports.isAppUrl = exports.LOAD_ERROR_HOST = exports.CERT_ERROR_HOST = exports.HOME_URL = exports.BLANK_URL = void 0;
exports.certErrorUrl = certErrorUrl;
exports.loadErrorUrl = loadErrorUrl;
exports.displayUrl = displayUrl;
exports.isAllowedUrl = isAllowedUrl;
exports.normalizeInput = normalizeInput;
// "mybrowser:" is our own protocol: it only serves the fixed pages bundled with the app.
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mybrowser:']);
exports.BLANK_URL = 'about:blank';
exports.HOME_URL = 'mybrowser://home/';
exports.CERT_ERROR_HOST = 'cert-error';
exports.LOAD_ERROR_HOST = 'load-error';
const isAppUrl = (url) => url.startsWith('mybrowser:');
exports.isAppUrl = isAppUrl;
function certErrorUrl(target, errorCode) {
    return `mybrowser://${exports.CERT_ERROR_HOST}/?url=${encodeURIComponent(target)}&code=${errorCode}`;
}
function loadErrorUrl(target, errorCode, errorName) {
    return `mybrowser://${exports.LOAD_ERROR_HOST}/?url=${encodeURIComponent(target)}&code=${errorCode}&name=${encodeURIComponent(errorName)}`;
}
// The address a tab stands for: an error page stands for the page that failed.
function displayUrl(url) {
    const isError = url.startsWith(`mybrowser://${exports.LOAD_ERROR_HOST}/`) || url.startsWith(`mybrowser://${exports.CERT_ERROR_HOST}/`);
    return (isError && URL.canParse(url) && new URL(url).searchParams.get('url')) || url;
}
// Returns true only for http(s) URLs, about:blank and our own pages. Blocks file:, javascript:, data:, custom schemes.
function isAllowedUrl(raw) {
    if (raw === exports.BLANK_URL)
        return true;
    try {
        const parsed = new URL(raw);
        return ALLOWED_PROTOCOLS.has(parsed.protocol);
    }
    catch {
        return false;
    }
}
exports.SEARCH_URL = 'https://www.google.com/search?q=';
// A domain with a dot, localhost or [IPv6] (each with an optional port), or any single name with a port.
const HOST_LIKE = /^((localhost|\[[0-9a-f:.]+\]|[^\s:@]+\.[^\s:@]+)(:\d+)?|[a-z0-9-]+:\d+)$/i;
// Turns what the user typed into a navigable URL: an address as is, anything else as a Google search.
// Returns null if the input is empty or not allowed.
function normalizeInput(input) {
    const text = input.trim();
    if (text === '')
        return null;
    // Any other "scheme://" (file://, chrome://, ...) is refused outright, not rewritten or searched.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !/^https?:\/\//i.test(text))
        return null;
    // Same for the schemes written without "//". With spaces it is a search phrase, e.g. "data: types".
    if (/^(javascript|data|file|vbscript):\S*$/i.test(text))
        return null;
    let candidate;
    if (/^(https?:\/\/|about:blank$)/i.test(text))
        candidate = text;
    else if (!/\s/.test(text) && HOST_LIKE.test(text.split(/[/?#]/)[0]))
        candidate = `https://${text}`;
    else
        candidate = exports.SEARCH_URL + encodeURIComponent(text);
    return isAllowedUrl(candidate) ? new URL(candidate).toString() : null;
}

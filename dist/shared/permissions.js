"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.question = exports.isHarmless = exports.KINDS = void 0;
exports.kindsOf = kindsOf;
exports.secureOrigin = secureOrigin;
// Which site permissions are harmless, which the user is asked about; everything else is refused.
// No Electron imports so it can be unit tested.
const HARMLESS = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write']);
const QUESTIONS = {
    notifications: 'show notifications',
    geolocation: 'know your location',
    camera: 'use your camera',
    microphone: 'use your microphone',
    'clipboard-read': 'read your clipboard',
};
exports.KINDS = Object.keys(QUESTIONS);
const isHarmless = (permission) => HARMLESS.has(permission);
exports.isHarmless = isHarmless;
const question = (kind) => (Object.hasOwn(QUESTIONS, kind) ? QUESTIONS[kind] : undefined);
exports.question = question;
// Electron groups camera and microphone under "media"; they are asked and remembered separately.
function kindsOf(permission, mediaTypes = []) {
    if (permission !== 'media')
        return [permission];
    return mediaTypes.flatMap((t) => (t === 'video' ? ['camera'] : t === 'audio' ? ['microphone'] : []));
}
// Only secure pages (and this computer itself) can be given anything.
function secureOrigin(url) {
    if (!URL.canParse(url))
        return null;
    const { protocol, hostname, origin } = new URL(url);
    const local = hostname === 'localhost' || hostname === '127.0.0.1';
    return protocol === 'https:' || (protocol === 'http:' && local) ? origin : null;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEDIA_COMMANDS = void 0;
exports.parseMedia = parseMedia;
exports.MEDIA_COMMANDS = ['playpause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto', 'pip'];
// The page wrote this, so every field is checked and long text is cut.
function parseMedia(input) {
    if (typeof input !== 'object' || input === null)
        return null;
    const raw = input;
    const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
    const seconds = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
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

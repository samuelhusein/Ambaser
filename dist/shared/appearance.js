"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAppearance = exports.WALLPAPERS = exports.THEMES = exports.MODES = void 0;
exports.MODES = ['system', 'light', 'dark'];
exports.THEMES = ['default', 'midnight', 'titanium', 'aurora', 'rose', 'champagne', 'emerald'];
exports.WALLPAPERS = ['none', 'daily'];
// Dark with no tint is how the app looked before there was a choice.
const parseAppearance = (input) => {
    const raw = (typeof input === 'object' && input !== null ? input : {});
    return {
        mode: exports.MODES.includes(raw.mode) ? raw.mode : 'dark',
        theme: exports.THEMES.includes(raw.theme) ? raw.theme : 'default',
        // On by default: it is the point of asking for this feature; the toggle in Settings turns it off.
        wallpaper: exports.WALLPAPERS.includes(raw.wallpaper) ? raw.wallpaper : 'daily',
    };
};
exports.parseAppearance = parseAppearance;

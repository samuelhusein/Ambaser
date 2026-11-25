"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAppearance = exports.THEMES = exports.MODES = void 0;
exports.MODES = ['system', 'light', 'dark'];
exports.THEMES = ['default', 'midnight', 'titanium', 'aurora', 'rose', 'champagne', 'emerald'];
// Dark with no tint is how the app looked before there was a choice.
const parseAppearance = (input) => {
    const raw = (typeof input === 'object' && input !== null ? input : {});
    return {
        mode: exports.MODES.includes(raw.mode) ? raw.mode : 'dark',
        theme: exports.THEMES.includes(raw.theme) ? raw.theme : 'default',
    };
};
exports.parseAppearance = parseAppearance;

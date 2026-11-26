"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PROFILES = exports.DEFAULT_PROFILE = void 0;
exports.parseProfiles = parseProfiles;
exports.newProfile = newProfile;
exports.editProfile = editProfile;
// The list of browser profiles. No Electron imports so it can be unit tested.
const groups_1 = require("./groups");
exports.DEFAULT_PROFILE = { id: '', name: 'Default', color: 'blue' };
exports.MAX_PROFILES = 10;
const MAX_NAME = 30;
// An id becomes a folder name, so only plain letters and digits are accepted.
const isId = (id) => typeof id === 'string' && /^[a-z0-9]{1,32}$/.test(id);
const isColor = (color) => groups_1.GROUP_COLORS.includes(color);
// The default profile is always first; it is stored only to keep its new name and colour.
function parseProfiles(input) {
    const saved = (Array.isArray(input) ? input : [])
        .filter((p) => (p?.id === '' || isId(p?.id)) && typeof p?.name === 'string')
        .map(({ id, name, color }) => ({ id, name, color: isColor(color) ? color : exports.DEFAULT_PROFILE.color }));
    return [saved.find((p) => p.id === '') ?? exports.DEFAULT_PROFILE, ...saved.filter((p) => p.id !== '')];
}
// The name tidied up, or a message saying why it cannot be used by the profile with this id.
function checkName(profiles, input, id) {
    const name = input.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
    if (!name)
        return 'Enter a name';
    if (profiles.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase()))
        return 'That name is already used';
    return { name };
}
// The new profile, or a message. It gets a colour no other profile has, while there is one.
function newProfile(profiles, input, id) {
    const checked = checkName(profiles, input, id);
    if (typeof checked === 'string')
        return checked;
    if (profiles.length >= exports.MAX_PROFILES)
        return `There can be at most ${exports.MAX_PROFILES} profiles`;
    const color = groups_1.GROUP_COLORS.find((c) => c !== 'grey' && !profiles.some((p) => p.color === c)) ?? 'grey';
    return { id, name: checked.name, color };
}
// The list with one profile renamed or recoloured, or a message.
function editProfile(profiles, id, input, color) {
    if (!profiles.some((p) => p.id === id))
        return 'That profile no longer exists';
    const checked = checkName(profiles, input, id);
    if (typeof checked === 'string')
        return checked;
    return profiles.map((p) => (p.id === id ? { id, name: checked.name, color: isColor(color) ? color : p.color } : p));
}

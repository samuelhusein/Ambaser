"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GROUP_ICONS = exports.GROUP_COLORS = void 0;
exports.moveToGroup = moveToGroup;
exports.patchGroup = patchGroup;
exports.placeTab = placeTab;
exports.GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
exports.GROUP_ICONS = ['none', 'star', 'briefcase', 'book', 'code', 'play', 'cart', 'heart'];
// Moves a tab into a group (or out, with null), keeping the members of every group next to each other.
function moveToGroup(tabs, tab, groupId) {
    const from = tabs.indexOf(tab);
    const old = tab.groupId;
    if (from === -1 || old === groupId)
        return;
    tabs.splice(from, 1);
    tab.groupId = groupId;
    const lastOf = (id) => (id === null ? -1 : tabs.map((t) => t.groupId).lastIndexOf(id));
    // Join the end of the new group; otherwise step past the old one; otherwise stay put.
    const anchor = lastOf(groupId) !== -1 ? lastOf(groupId) : lastOf(old);
    tabs.splice(anchor === -1 ? from : anchor + 1, 0, tab);
}
// Applies only the valid fields of an untrusted change request.
function patchGroup(group, patch) {
    if (typeof patch !== 'object' || patch === null)
        return;
    const { name, color, icon, collapsed } = patch;
    if (typeof name === 'string')
        group.name = name.slice(0, 30);
    if (exports.GROUP_COLORS.includes(color))
        group.color = color;
    if (exports.GROUP_ICONS.includes(icon))
        group.icon = icon;
    if (typeof collapsed === 'boolean')
        group.collapsed = collapsed;
}
// Drag and drop: puts a tab next to the target and into the target's group. No target means the end, ungrouped.
function placeTab(tabs, tab, target, after) {
    const from = tabs.indexOf(tab);
    if (from === -1 || tab === target)
        return;
    tabs.splice(from, 1);
    tab.groupId = target ? target.groupId : null;
    tabs.splice(target ? tabs.indexOf(target) + (after ? 1 : 0) : tabs.length, 0, tab);
}

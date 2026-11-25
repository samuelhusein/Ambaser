// Tab group rules. No Electron imports so they can be unit tested.
import type { GroupColor, GroupIcon, GroupState } from './types';

export const GROUP_COLORS: readonly GroupColor[] = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
export const GROUP_ICONS: readonly GroupIcon[] = ['none', 'star', 'briefcase', 'book', 'code', 'play', 'cart', 'heart'];

// Moves a tab into a group (or out, with null), keeping the members of every group next to each other.
export function moveToGroup<T extends { groupId: number | null }>(tabs: T[], tab: T, groupId: number | null): void {
  const from = tabs.indexOf(tab);
  const old = tab.groupId;
  if (from === -1 || old === groupId) return;
  tabs.splice(from, 1);
  tab.groupId = groupId;
  const lastOf = (id: number | null): number => (id === null ? -1 : tabs.map((t) => t.groupId).lastIndexOf(id));
  // Join the end of the new group; otherwise step past the old one; otherwise stay put.
  const anchor = lastOf(groupId) !== -1 ? lastOf(groupId) : lastOf(old);
  tabs.splice(anchor === -1 ? from : anchor + 1, 0, tab);
}

// Applies only the valid fields of an untrusted change request.
export function patchGroup(group: GroupState, patch: unknown): void {
  if (typeof patch !== 'object' || patch === null) return;
  const { name, color, icon, collapsed } = patch as Record<string, unknown>;
  if (typeof name === 'string') group.name = name.slice(0, 30);
  if (GROUP_COLORS.includes(color as GroupColor)) group.color = color as GroupColor;
  if (GROUP_ICONS.includes(icon as GroupIcon)) group.icon = icon as GroupIcon;
  if (typeof collapsed === 'boolean') group.collapsed = collapsed;
}

// Drag and drop: puts a tab next to the target and into the target's group. No target means the end, ungrouped.
export function placeTab<T extends { groupId: number | null }>(tabs: T[], tab: T, target: T | null, after: boolean): void {
  const from = tabs.indexOf(tab);
  if (from === -1 || tab === target) return;
  tabs.splice(from, 1);
  tab.groupId = target ? target.groupId : null;
  tabs.splice(target ? tabs.indexOf(target) + (after ? 1 : 0) : tabs.length, 0, tab);
}

// Rebuilds saved (untrusted) groups for the restored tabs, under fresh ids. Keyed by the saved id.
export function reviveGroups(saved: unknown, used: (number | null | undefined)[], newId: () => number): Map<number, GroupState> {
  const groups = new Map<number, GroupState>();
  for (const item of Array.isArray(saved) ? saved : []) {
    if (!used.includes(item?.id) || groups.has(item.id)) continue;
    const group: GroupState = { id: newId(), name: '', color: 'grey', icon: 'none', collapsed: false };
    patchGroup(group, item);
    groups.set(item.id, group);
  }
  return groups;
}

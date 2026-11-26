// The list of browser profiles. No Electron imports so it can be unit tested.
import { GROUP_COLORS } from './groups';
import type { GroupColor, Profile } from './types';

export const DEFAULT_PROFILE: Profile = { id: '', name: 'Default', color: 'blue' };
export const MAX_PROFILES = 10;
const MAX_NAME = 30;

// An id becomes a folder name, so only plain letters and digits are accepted.
const isId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9]{1,32}$/.test(id);
const isColor = (color: unknown): color is GroupColor => GROUP_COLORS.includes(color as GroupColor);

// The default profile is always first; it is stored only to keep its new name and colour.
export function parseProfiles(input: unknown): Profile[] {
  const saved: Profile[] = (Array.isArray(input) ? input : [])
    .filter((p) => (p?.id === '' || isId(p?.id)) && typeof p?.name === 'string')
    .map(({ id, name, color }) => ({ id, name, color: isColor(color) ? color : DEFAULT_PROFILE.color }));
  return [saved.find((p) => p.id === '') ?? DEFAULT_PROFILE, ...saved.filter((p) => p.id !== '')];
}

// The name tidied up, or a message saying why it cannot be used by the profile with this id.
function checkName(profiles: Profile[], input: string, id: string): { name: string } | string {
  const name = input.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
  if (!name) return 'Enter a name';
  if (profiles.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) return 'That name is already used';
  return { name };
}

// The new profile, or a message. It gets a colour no other profile has, while there is one.
export function newProfile(profiles: Profile[], input: string, id: string): Profile | string {
  const checked = checkName(profiles, input, id);
  if (typeof checked === 'string') return checked;
  if (profiles.length >= MAX_PROFILES) return `There can be at most ${MAX_PROFILES} profiles`;
  const color = GROUP_COLORS.find((c) => c !== 'grey' && !profiles.some((p) => p.color === c)) ?? 'grey';
  return { id, name: checked.name, color };
}

// The list with one profile renamed or recoloured, or a message.
export function editProfile(profiles: Profile[], id: string, input: string, color: unknown): Profile[] | string {
  if (!profiles.some((p) => p.id === id)) return 'That profile no longer exists';
  const checked = checkName(profiles, input, id);
  if (typeof checked === 'string') return checked;
  return profiles.map((p) => (p.id === id ? { id, name: checked.name, color: isColor(color) ? color : p.color } : p));
}

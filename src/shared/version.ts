// "1.10.0" is newer than "1.9.0". No Electron imports so it can be unit tested.
export const isNewer = (latest: string, current: string): boolean => {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
};

export interface ReleaseNotes {
  features: string[];
  fixes: string[];
  other: string[];
}

// Sorts commit subjects ("feat: …", "fix: …") into what the update popup lists. Release bumps are noise.
export function releaseNotes(subjects: string[]): ReleaseNotes {
  const notes: ReleaseNotes = { features: [], fixes: [], other: [] };
  for (const subject of subjects) {
    const [, type = '', text = subject] = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/.exec(subject.trim()) ?? [];
    if (!text || (type === 'chore' && text.startsWith('release'))) continue;
    const list = type === 'feat' ? notes.features : type === 'fix' ? notes.fixes : notes.other;
    list.push(text.charAt(0).toUpperCase() + text.slice(1));
  }
  return notes;
}

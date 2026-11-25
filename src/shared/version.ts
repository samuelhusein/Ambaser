// "1.10.0" is newer than "1.9.0". No Electron imports so it can be unit tested.
export const isNewer = (latest: string, current: string): boolean => {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
};

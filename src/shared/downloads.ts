// "report.pdf", then "report (1).pdf" and so on, so a download never overwrites a file.
export function freeName(name: string, taken: (candidate: string) => boolean): string {
  const dot = name.lastIndexOf('.');
  const end = dot > 0 ? (name.slice(0, dot).endsWith('.tar') ? dot - 4 : dot) : name.length;
  let candidate = name;
  for (let i = 1; taken(candidate); i++) candidate = `${name.slice(0, end)} (${i})${name.slice(end)}`;
  return candidate;
}

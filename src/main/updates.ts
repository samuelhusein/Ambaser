// What a git checkout is missing compared with the branch it follows. No Electron imports.
import { execFile } from 'child_process';
import { promisify } from 'util';
import { releaseNotes } from '../shared/version';
import type { UpdateInfo } from '../shared/types';

export async function gitUpdate(root: string): Promise<UpdateInfo | null> {
  // Never stop to ask for a password: this runs in the background.
  const git = async (...args: string[]): Promise<string> =>
    (await promisify(execFile)('git', args, { cwd: root, timeout: 60000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout;
  await git('fetch', '--quiet');
  const notes = releaseNotes((await git('log', '--format=%s', 'HEAD..@{upstream}')).split('\n').filter(Boolean));
  if (!notes.features.length && !notes.fixes.length && !notes.other.length) return null;
  const { version } = JSON.parse(await git('show', '@{upstream}:package.json')) as { version?: unknown };
  return { version: typeof version === 'string' ? version : '', ...notes };
}

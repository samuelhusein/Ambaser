"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitUpdate = gitUpdate;
// What a git checkout is missing compared with the branch it follows. No Electron imports.
const child_process_1 = require("child_process");
const util_1 = require("util");
const version_1 = require("../shared/version");
async function gitUpdate(root) {
    // Never stop to ask for a password: this runs in the background.
    const git = async (...args) => (await (0, util_1.promisify)(child_process_1.execFile)('git', args, { cwd: root, timeout: 60000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout;
    await git('fetch', '--quiet');
    const notes = (0, version_1.releaseNotes)((await git('log', '--format=%s', 'HEAD..@{upstream}')).split('\n').filter(Boolean));
    if (!notes.features.length && !notes.fixes.length && !notes.other.length)
        return null;
    const { version } = JSON.parse(await git('show', '@{upstream}:package.json'));
    return { version: typeof version === 'string' ? version : '', ...notes };
}

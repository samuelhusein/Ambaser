// macOS refuses every notification from an app whose signature does not verify, and the Electron from npm
// is only partly signed. A local (ad-hoc) signature is enough and needs no Apple developer account.
const { execFileSync } = require('child_process');
const path = require('path');

if (process.platform === 'darwin') {
  try {
    // require('electron') is the path to the binary, three folders inside Electron.app.
    const app = process.argv[2] || path.resolve(require('electron'), '../../..');
    const codesign = (...args) => execFileSync('codesign', [...args, app], { stdio: 'pipe' });
    try {
      codesign('--verify', '--deep'); // already signed
    } catch {
      codesign('--force', '--deep', '--sign', '-');
      console.log('Signed Electron so that macOS allows notifications');
    }
  } catch (err) {
    // The browser works without it, so never fail the install or the build.
    console.warn(`Could not sign Electron, notifications will not show: ${String(err.stderr || err.message).trim()}`);
  }
}

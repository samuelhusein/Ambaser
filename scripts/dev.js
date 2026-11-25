// npm run dev: builds, starts the app on its own throwaway profile, and rebuilds and restarts on every change in src/.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const electron = require('electron'); // outside Electron this is the path to its binary
// Next to the real data, never inside it, so testing cannot touch history, pins or logins.
const support = { darwin: path.join(os.homedir(), 'Library/Application Support'), win32: process.env.APPDATA }[process.platform] || path.join(os.homedir(), '.config');
const profile = path.join(support, 'Ambaser-dev');

let app = null;
let restarting = false;

const build = () => spawnSync('npm', ['run', 'build', '--silent'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }).status === 0;

function start() {
  app = spawn(electron, [root, `--user-data-dir=${profile}`], { stdio: 'inherit' });
  app.on('exit', () => {
    app = null;
    if (restarting) {
      restarting = false;
      start();
    } else process.exit(0); // the user quit the app
  });
}

function rebuild() {
  console.log('[dev] change detected, rebuilding...');
  if (!build()) return console.log('[dev] build failed; the app keeps running the last good build');
  if (!app) return start();
  restarting = true;
  app.kill();
}

if (!build()) process.exit(1);
console.log(`[dev] test profile: ${profile}`);
start();

let timer = null;
fs.watch(path.join(root, 'src'), { recursive: true }, (_event, file) => {
  if (!file || path.basename(file).startsWith('.')) return;
  clearTimeout(timer); // editors often write several times per save
  timer = setTimeout(rebuild, 300);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restarting = false;
    if (app) app.kill();
    else process.exit(0);
  });
}

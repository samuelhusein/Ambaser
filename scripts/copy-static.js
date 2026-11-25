// Copies the chrome page and the home and cert-warning pages' static assets next to their compiled scripts.
const fs = require('fs');
const path = require('path');

function copyDir(name, files) {
  const from = path.join(__dirname, '..', 'src', name);
  const to = path.join(__dirname, '..', 'dist', name);
  fs.mkdirSync(to, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(from, file), path.join(to, file));
  }
}

copyDir('renderer', ['index.html', 'style.css']);
copyDir('home', ['index.html', 'home.css', 'home.js']);
copyDir('load-error', ['index.html', 'load-error.css', 'load-error.js']);
copyDir('cert-error', ['index.html', 'cert-error.css', 'cert-error.js']);

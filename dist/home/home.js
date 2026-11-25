// Plain script, no build step. Reads mybrowser://home/api/data; changes go through action addresses.
const byId = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// The site's icon, or its first letter on a colour that stays the same for that site.
function icon(entry) {
  const name = host(entry.url);
  const box = el('span', 'icon');
  const letter = () => {
    box.className = `icon tone-${[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 5}`;
    box.textContent = name.charAt(0).toUpperCase();
  };
  if (!entry.favicon) letter();
  else {
    const img = el('img');
    img.src = entry.favicon;
    img.alt = '';
    img.addEventListener('error', letter);
    box.append(img);
  }
  return box;
}

function link(entry) {
  const a = el('a');
  a.href = entry.url;
  a.title = `${entry.title || entry.url}\n${entry.url}`;
  return a;
}

function tile(entry) {
  const wrap = el('div', 'tile');
  const a = link(entry);
  a.append(icon(entry), el('span', 'label', entry.title || host(entry.url)));
  const unpin = el('button', 'unpin', '×');
  unpin.title = 'Unpin';
  // The app handles this address itself: it unpins the site and reloads the page.
  unpin.addEventListener('click', () => {
    location.href = `mybrowser://home/unpin?url=${encodeURIComponent(entry.url)}`;
  });
  wrap.append(a, unpin);
  return wrap;
}

function row(entry) {
  const li = el('li');
  const a = link(entry);
  const text = el('span', 'text');
  text.append(el('span', 'label', entry.title || entry.url), el('span', 'label site', host(entry.url)));
  a.append(icon(entry), text);
  li.append(a);
  return li;
}

function render(list, id, make) {
  byId(id).replaceChildren(...list.map(make));
  byId(`${id}-empty`).hidden = list.length > 0;
}

function tick() {
  const now = new Date();
  const hour = now.getHours();
  byId('greeting').textContent = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  byId('date').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  byId('clock').textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
tick();
setInterval(tick, 1000);

const mac = navigator.platform.startsWith('Mac');
for (const key of document.querySelectorAll('kbd')) {
  const shift = 'shift' in key.dataset;
  key.textContent = mac ? `${shift ? '⇧' : ''}⌘${key.dataset.keys}` : `Ctrl+${shift ? 'Shift+' : ''}${key.dataset.keys}`;
}

// The app decides whether this is an address or a search, the same way the address bar does.
byId('search').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = byId('query').value.trim();
  if (text) location.href = `mybrowser://home/open?q=${encodeURIComponent(text)}`;
});

function setCredit(credit) {
  const link = byId('wallpaper-credit');
  if (!credit) return (link.hidden = true);
  link.href = credit.url;
  link.textContent = `Photo by ${credit.author} on Unsplash`;
  link.hidden = false;
}

// A new photo from Unsplash (served by Lorem Picsum, no account needed) once a day; the server
// picks the day, so the photo and its credit below always agree on which day it is.
function applyWallpaper(wallpaper, day, credit) {
  if (wallpaper !== 'daily') {
    document.body.classList.remove('has-wallpaper');
    return setCredit(null);
  }
  const width = Math.min(2400, Math.round((screen.width || 1600) * (window.devicePixelRatio || 1)));
  const height = Math.min(1500, Math.round((screen.height || 1000) * (window.devicePixelRatio || 1)));
  const url = `https://picsum.photos/seed/${day}/${width}/${height}`;
  // Swap the image in only once it has actually loaded, so a blocked or offline network just
  // leaves today's gradient background instead of a broken image or a flash of grey; the credit
  // follows the same fate, so it is never shown next to a photo that isn't actually there.
  const probe = new Image();
  probe.onload = () => {
    byId('wallpaper').src = url;
    document.body.classList.add('has-wallpaper');
    setCredit(credit);
  };
  probe.onerror = () => {
    document.body.classList.remove('has-wallpaper');
    setCredit(null);
  };
  probe.src = url;
}

fetch('mybrowser://home/api/data')
  .then((res) => res.json())
  .then((data) => {
    document.documentElement.dataset.theme = data.theme;
    byId('incognito-note').hidden = !data.incognito;
    byId('activity').hidden = data.incognito;
    render(data.pinned, 'pinned', tile);
    render(data.recent, 'recent', row);
    applyWallpaper(data.wallpaper, data.wallpaperDay, data.wallpaperCredit);
  });

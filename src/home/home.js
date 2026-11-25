// Plain script, no build step. Reads mybrowser://home/api/data; changes go through action addresses.
function card(entry, { unpinnable }) {
  const a = document.createElement('a');
  a.className = 'card';
  a.href = entry.url;
  a.title = entry.title || entry.url;
  if (entry.favicon) {
    const img = document.createElement('img');
    img.src = entry.favicon;
    img.alt = '';
    img.addEventListener('error', () => img.remove());
    a.append(img);
  }
  const span = document.createElement('span');
  span.textContent = entry.title || entry.url;
  a.append(span);

  if (unpinnable) {
    const btn = document.createElement('button');
    btn.className = 'unpin';
    btn.textContent = '×';
    btn.title = 'Unpin';
    // The app handles this address itself: it unpins the site and reloads the page.
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      location.href = `mybrowser://home/unpin?url=${encodeURIComponent(entry.url)}`;
    });
    a.append(btn);
  }
  return a;
}

function render(list, gridId, emptyId, options) {
  const grid = document.getElementById(gridId);
  grid.replaceChildren(...list.map((entry) => card(entry, options)));
  document.getElementById(emptyId).hidden = list.length > 0;
}

fetch('mybrowser://home/api/data')
  .then((res) => res.json())
  .then((data) => {
    render(data.pinned, 'pinned', 'pinned-empty', { unpinnable: true });
    render(data.lastSession, 'last-session', 'last-session-empty', { unpinnable: false });
  });

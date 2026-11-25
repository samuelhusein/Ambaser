// Plain script, no build step. Explains Chromium's common network error codes in plain words.
const HINTS = {
  '0': 'The page stopped working. Try loading it again.',
  '-7': 'The site took too long to answer. It may be busy or down.',
  '-21': 'The network changed while loading. Try again.',
  '-100': 'The connection was closed before the page arrived.',
  '-101': 'The connection was reset. The site, or a firewall on this network, cut it off.',
  '-102': 'The server refused the connection. Check the address and port, or whether the server is running.',
  '-105': 'That address could not be found. Check the spelling, or whether you need a VPN or another network.',
  '-106': 'You appear to be offline. Check your Wi-Fi or cable.',
  '-107': 'A secure connection could not be set up with this site.',
  '-109': 'The address cannot be reached from this network.',
  '-118': 'The site took too long to answer. It may be down or unreachable from this network.',
  '-130': 'The proxy server could not be reached. Check the network proxy settings.',
  '-137': 'That address could not be found.',
  '-312': 'This port is blocked for safety. Use a different port.',
  '-310': 'The site redirected too many times. Clearing its cookies may help.',
  '-324': 'The server sent nothing back.',
};

const params = new URLSearchParams(location.search);
const target = params.get('url') || '';
let host = target;
try {
  host = new URL(target).host || target;
} catch {
  // keep the raw string if it doesn't parse
}

document.getElementById('summary').textContent = `${host} could not be loaded.`;
document.getElementById('hint').textContent = HINTS[params.get('code')] || 'Something went wrong while loading this page.';
document.getElementById('detail').textContent = `${params.get('name') || 'Error'} (${params.get('code')})`;

document.getElementById('retry').addEventListener('click', () => {
  if (/^https?:/i.test(target)) location.href = target;
});
document.getElementById('home').addEventListener('click', () => {
  location.href = 'mybrowser://home/';
});

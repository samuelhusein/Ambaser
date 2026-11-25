// Plain script, no build step. Mirrors the common net error codes for certificate/SSL problems.
const MESSAGES = {
  '-200': 'The certificate does not match this site’s address (common name invalid).',
  '-201': 'The certificate has expired or is not yet valid.',
  '-202': 'The certificate was not issued by a trusted authority.',
  '-203': 'The certificate contains errors.',
  '-206': 'The certificate has been revoked.',
  '-207': 'The certificate is invalid.',
  '-208': 'The certificate uses a weak signature algorithm.',
  '-210': 'The certificate violates a name constraint.',
};

const params = new URLSearchParams(location.search);
const target = params.get('url') || '';
const code = params.get('code') || '';
let host = target;
try {
  host = new URL(target).host;
} catch {
  // keep the raw string if it doesn't parse
}

document.getElementById('summary').textContent =
  `There is a problem with the security certificate for ${host}. This may mean someone is ` +
  `trying to impersonate this site, or it may simply be using a certificate your computer ` +
  `doesn’t recognize — common for an internal or self-signed certificate.`;
document.getElementById('detail').textContent = MESSAGES[code] || `Error code: ${code}`;

document.getElementById('back').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = 'mybrowser://home/';
});

// The app handles this address itself: it trusts the host and loads the page.
document.getElementById('proceed').addEventListener('click', () => {
  if (target) location.href = `mybrowser://cert-error/trust?url=${encodeURIComponent(target)}`;
});

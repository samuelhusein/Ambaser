// Cloudflare Worker: the download page and updater endpoint for the private repo.
// The GitHub token lives here as a secret and never reaches a browser or the app.
//   wrangler secret put GITHUB_TOKEN   (fine-grained token, read-only "Contents" on this repo)
//   wrangler secret put PIN
// GET /          the page            GET /version   {"version"} (public)
// POST /download the ZIP of main     (PIN in the "pin" form field or the X-Pin header)

const gh = (env, path, accept) =>
  fetch(`https://api.github.com/repos/${env.REPO}/${path}`, {
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: accept, 'User-Agent': 'ambaser-worker', 'X-GitHub-Api-Version': '2022-11-28' },
  });

async function version(env) {
  const res = await gh(env, 'contents/package.json?ref=main', 'application/vnd.github.raw+json');
  return res.ok ? (await res.json()).version : null;
}

const digest = (text) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
const samePin = async (given, real) => !!given && !!real && crypto.subtle.timingSafeEqual(await digest(given), await digest(real));

const PAGE = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ambaser</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.6 system-ui, sans-serif; background: light-dark(#f5f5f7, #17171a); color: light-dark(#1d1d1f, #f2f2f5); }
    main { max-width: 520px; padding: 32px 24px; text-align: center; }
    h1 { margin: 16px 0 4px; font-size: 32px; }
    h1 small { font-size: 14px; font-weight: 500; color: light-dark(#777, #999); }
    p { margin: 8px 0; color: light-dark(#555, #aaa); }
    input, button { font: inherit; padding: 10px 16px; border-radius: 10px; border: 1px solid light-dark(#ccc, #444); }
    button { background: #2f6fed; border-color: #2f6fed; color: #fff; font-weight: 600; cursor: pointer; }
    button:hover { background: #2559c4; }
    form { margin: 24px 0 8px; display: flex; gap: 8px; justify-content: center; }
    ol { text-align: left; display: inline-block; margin: 16px 0 0; }
    code { padding: 2px 6px; border-radius: 4px; background: light-dark(#e6e6ea, #2a2a30); }
    a { color: inherit; }
  </style>
</head>
<body>
  <main>
    <h1>Ambaser <small id="version"></small></h1>
    <p>Ambaser adalah browser dari Ngawi Timur, di-develop oleh Mas Amba di Ambarawa.</p>
    <form method="post" action="/download">
      <input name="pin" type="password" placeholder="PIN" autocomplete="off" required>
      <button id="download" type="submit">Download ZIP</button>
    </form>
    <ol>
      <li>Install <a href="https://nodejs.org">Node.js</a>, lalu ekstrak ZIP.</li>
      <li>Di folder hasil ekstrak: <code>npm install</code></li>
      <li>Jalankan: <code>npm start</code></li>
    </ol>
  </main>
  <script>
    fetch("/version").then((r) => r.json()).then((p) => {
      document.getElementById("version").textContent = "v" + p.version;
      document.getElementById("download").textContent = "Download ZIP v" + p.version;
    }).catch(() => {});
  </script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/version') return Response.json({ version: await version(env) }, { headers: { 'Cache-Control': 'no-store' } });
    if (pathname === '/download' && request.method === 'POST') {
      const pin = request.headers.get('X-Pin') ?? (await request.formData().catch(() => null))?.get('pin');
      // shortcut: no rate limit, a short PIN can be guessed; add a Cloudflare rate-limit rule on /download when sharing widely
      if (!(await samePin(pin, env.PIN))) return new Response('Wrong PIN', { status: 401 });
      const zip = await gh(env, 'zipball/main', 'application/vnd.github+json');
      if (!zip.ok) return new Response('GitHub refused the download', { status: 502 });
      return new Response(zip.body, {
        headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="Ambaser-v${await version(env)}.zip"` },
      });
    }
    return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  },
};

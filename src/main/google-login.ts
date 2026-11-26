// Google refuses sign-in from browsers built on Electron ("this browser or app may not be secure"), so its
// sign-in host, and only that host, is told this is Firefox. Google can stop accepting this at any time.
import { session } from 'electron';

const OS: Partial<Record<NodeJS.Platform, string>> = { darwin: 'Macintosh; Intel Mac OS X 10.15', win32: 'Windows NT 10.0; Win64; x64' };
const registered = new Set<string>();

export function allowGoogleLogin(partition: string): void {
  if (registered.has(partition)) return;
  registered.add(partition);
  // Firefox and Chrome release at about the same pace, so the engine's version keeps this one current.
  const version = `${process.versions.chrome.split('.')[0]}.0`;
  const userAgent = `Mozilla/5.0 (${OS[process.platform] ?? 'X11; Linux x86_64'}; rv:${version}) Gecko/20100101 Firefox/${version}`;
  session.fromPartition(partition).webRequest.onBeforeSendHeaders({ urls: ['https://accounts.google.com/*'] }, ({ requestHeaders }, callback) => {
    // Firefox sends no client hints; leaving Chromium's in would contradict the name above.
    for (const name of Object.keys(requestHeaders)) {
      if (/^(user-agent$|sec-ch-ua)/i.test(name)) delete requestHeaders[name];
    }
    callback({ requestHeaders: { ...requestHeaders, 'User-Agent': userAgent } });
  });
}

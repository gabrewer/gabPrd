import { protocol } from 'electron';
import type { Session } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
const ASSETS = Object.freeze({
  'gabprd://app/main_window/index.html': { file: 'index.html', mime: 'text/html; charset=utf-8' },
  'gabprd://app/main_window/index.js': { file: 'index.js', mime: 'text/javascript; charset=utf-8' },
  'gabprd://app/main_window/shell.css': { file: 'shell.css', mime: 'text/css; charset=utf-8' },
});
function headers(mime: string): Record<string, string> {
  return { 'Content-Type': mime, 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
}
function notFound(): Response { return new Response('Not found.', { status: 404, headers: headers('text/plain; charset=utf-8') }); }
/** Main owner calls before app ready; no OS protocol-handler registration. */
export function registerBootstrapScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: 'gabprd', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}
/** Main owner calls after ready for the window's actual session. */
export function installAssetProtocol(session: Session, appPath: string): void {
  const files = new Map(Object.entries(ASSETS).map(([url, asset]) => [url, { file: path.join(appPath, '.webpack', 'renderer', 'main_window', asset.file), mime: asset.mime }]));
  session.protocol.handle('gabprd', async request => {
    try {
      // Literal match rejects credentials, ports, queries, fragments, encodings and siblings.
      if (request.method !== 'GET') return notFound();
      const asset = files.get(request.url);
      if (!asset) return notFound();
      const bytes = await readFile(asset.file);
      return new Response(new Uint8Array(bytes), { status: 200, headers: headers(asset.mime) });
    } catch { return notFound(); }
  });
}

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml', '.json':'application/json', '.wasm':'application/wasm'
};

// Local preview only: no text processing, uploads or external network requests.
export async function startPreview({ root, models, port = 4173, openBrowser = false }) {
  root = await realpath(root);
  if (models) models = await realpath(models);
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const modelRequest = models && pathname.startsWith('/models/');
      const base = modelRequest ? models : root;
      const relativePath = modelRequest ? pathname.slice('/models/'.length) : `.${pathname === '/' ? '/index.html' : pathname}`;
      const file = await realpath(resolve(base, relativePath));
      if (!file.startsWith(base + sep)) { response.writeHead(403).end(); return; }
      const details = await stat(file);
      if (!details.isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Content-Length': details.size, 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache'
      });
      if (request.method === 'HEAD') response.end();
      else {
        const stream = createReadStream(file);
        stream.on('error', () => response.destroy());
        response.on('close', () => stream.destroy());
        stream.pipe(response);
      }
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => { server.off('error', fail); ok(); });
  });
  const address = `http://127.0.0.1:${server.address().port}/`;
  if (openBrowser && process.platform === 'win32') {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${address}'`], { stdio:'ignore' });
    child.on('error', () => {}); child.unref();
  }
  return { server, address };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { address } = await startPreview({ root: dirname(fileURLToPath(import.meta.url)), openBrowser: true });
    process.stdout.write(`ブラウザで ${address} を開いてください。終了は Ctrl+C です。\n`);
  } catch {
    process.stderr.write('起動できませんでした。ポート4173と配置を確認してください。\n'); process.exitCode = 1;
  }
}

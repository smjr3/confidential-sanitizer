import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const address = 'http://127.0.0.1:4173/';
const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.wasm':'application/wasm'
};

const server = createServer(async (request,response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, address).pathname);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const details = await stat(file);
    if (!details.isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200,{'Content-Type':mime[extname(file)] ?? 'application/octet-stream','Content-Length':details.size,'X-Content-Type-Options':'nosniff'});
    if (request.method === 'HEAD') response.end();
    else {
      const stream=createReadStream(file);
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    }
  } catch { response.writeHead(404).end(); }
});

server.on('error', () => { process.stderr.write('起動できませんでした。ポート4173が使用中か確認してください。\n'); process.exitCode=1; });
server.listen(4173,'127.0.0.1', () => {
  process.stdout.write(`ブラウザで ${address} を開いてください。終了は Ctrl+C です。\n`);
  if (process.platform === 'win32') {
    const child = spawn('powershell.exe',['-NoProfile','-Command',`Start-Process '${address}'`],{stdio:'ignore'});
    child.on('error', () => {});
    child.unref();
  }
});

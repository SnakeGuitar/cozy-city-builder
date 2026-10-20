// Zero-dependency static server for development. The page is served at / (from src/index.html), so its relative
// paths (./src/..., ./node_modules/...) resolve from the repository root; there is no build step. The built page is
// at /index.html. Open http://localhost:8766/ (not /src/index.html).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname, port = +(process.env.PORT || 8766);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(root, url === '/' ? 'src/index.html' : url));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Villa Limón dev server: http://localhost:${port}/`));

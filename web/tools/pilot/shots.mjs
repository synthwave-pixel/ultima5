// The bot's screenshots: `bot.shot(name)` posts a PNG of the canvas here, and it lands in screenshots/ at the
// repository's root (ignored by git). `node web/tools/pilot/shots.mjs` from anywhere.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../screenshots');
fs.mkdirSync(out, { recursive: true });
http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.end('ok');
      return;
    }
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^\w.-]/g, '');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      fs.writeFileSync(path.join(out, `${name}.png`), Buffer.concat(chunks));
      res.end('saved');
    });
  })
  .listen(5198, '127.0.0.1', () => console.log(`screenshots to ${out}`));

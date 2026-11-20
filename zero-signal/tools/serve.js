'use strict';
const http = require('http'),
  fs = require('fs'),
  path = require('path');
const root = path.resolve(__dirname, '..'),
  port = +(process.argv[2] || 8765);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
};
http
  .createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/' || !rel) rel = '/index.html';
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.writeHead(200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`ZERO SIGNAL preview: http://127.0.0.1:${port}/`));

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
const root = resolve('dist'),
  files = [];
function walk(p) {
  for (const x of readdirSync(p)) {
    const f = resolve(p, x);
    statSync(f).isDirectory() ? walk(f) : files.push(f);
  }
}
walk(root);
let out =
  '#pragma once\n#include <Arduino.h>\nstruct WebAsset {const char* path;const char* mime;const uint8_t* bytes;size_t length;};\n';
files.forEach((f, i) => {
  const bytes = gzipSync(readFileSync(f), { level: 9 });
  out += `static const uint8_t asset${i}[] PROGMEM={${[...bytes].join(',')}};\n`;
});
out += 'static const WebAsset webAssets[]={\n';
files.forEach((f, i) => {
  const path = '/' + relative(root, f).replaceAll('\\', '/');
  const mime =
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
    }[extname(f)] || 'application/octet-stream';
  out += `{${JSON.stringify(path)},${JSON.stringify(mime)},asset${i},sizeof(asset${i})},\n`;
});
out += '};\n';
writeFileSync('firmware/src/web_assets.hpp', out);
console.log('Tabletoberfläche in Firmware eingebettet.');

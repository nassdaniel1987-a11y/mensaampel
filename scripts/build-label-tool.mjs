// Bundles tools/etiketten into one self-contained, offline HTML file: Etiketten-Tool.html.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = 'tools/etiketten';
const read = f => readFileSync(join(dir, f), 'utf8');
// Modules in dependency order; imports are dropped and exports become plain declarations in one module scope.
const js = ['layout.mjs', 'motive.mjs', 'render.mjs', 'app.mjs']
  .map(f =>
    read(f)
      .replace(/^import[^;]+;\n/gm, '')
      .replace(/^export (const|function|let)/gm, '$1'),
  )
  .join('\n');
const html = read('index.html')
  .replace('<link rel="stylesheet" href="style.css" />', () => `<style>\n${read('style.css')}</style>`)
  .replace('<script type="module" src="app.mjs"></script>', () => `<script type="module">\n${js}</script>`);
if (html.includes('src="app.mjs"') || html.includes('href="style.css"')) throw new Error('Einbetten fehlgeschlagen');
writeFileSync('Etiketten-Tool.html', html);
console.log('Etiketten-Tool.html erzeugt (' + Math.round(html.length / 1024) + ' KB).');

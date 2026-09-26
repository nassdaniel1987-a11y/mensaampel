// Printable card labels: A4 sheets with 24 labels of 70x37 mm (common label sheets, e.g. Zweckform 3474), plus a card-size cutting template.
// Numbers follow the default stock: K01-K48 (Küche, blue) and M01-M64 (Mensa, red).
import { writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
const rooms = [
  { prefix: 'K', name: 'Küche', count: 48, color: '#1f5fa8' },
  { prefix: 'M', name: 'Mensa', count: 64, color: '#b3261e' },
];
const labels = rooms.flatMap(r =>
  Array.from({ length: r.count }, (_, i) => ({ ...r, label: r.prefix + String(i + 1).padStart(2, '0') })),
);
const label = l =>
  `<div class="label"><div class="band" style="background:${l.color}">${l.name}</div><div class="num" style="color:${l.color}">${l.label}</div><div class="brand">Mensaampel · Platzkarte</div></div>`;
const card = l =>
  `<div class="card"><div class="band" style="background:${l.color}">${l.name}</div><div class="num" style="color:${l.color}">${l.label}</div><div class="brand">Mensaampel · bitte nach dem Essen zurückgeben</div></div>`;
const pages = (items, per, render, cls) =>
  Array.from(
    { length: Math.ceil(items.length / per) },
    (_, p) =>
      `<section class="${cls}">${items
        .slice(p * per, p * per + per)
        .map(render)
        .join('')}</section>`,
  ).join('');
const html = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Mensaampel · Kartenetiketten</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Arial,sans-serif;color:#183345}
.intro{padding:14mm 12mm;page-break-after:always}.intro h1{margin:0 0 4mm;color:#174e55}.intro li{margin:2mm 0}
.sheet{width:210mm;height:297mm;padding:0;display:grid;grid-template-columns:repeat(3,70mm);grid-auto-rows:37.125mm;page-break-after:always}
.label{border:0.2mm dashed #c5d3d6;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm;overflow:hidden}
.label .band{color:#fff;font-weight:700;font-size:10pt;padding:0.6mm 5mm;border-radius:3mm;letter-spacing:.5pt}.label .num{font-size:34pt;font-weight:800;line-height:1}.label .brand{font-size:6.5pt;color:#557080}
.cards{width:210mm;height:297mm;padding:10mm 12mm;display:grid;grid-template-columns:repeat(2,85.6mm);grid-auto-rows:54mm;gap:4mm 8mm;align-content:start;page-break-after:always}
.card{border:0.3mm solid #9fb3b8;border-radius:3.2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2mm}
.card .band{color:#fff;font-weight:700;font-size:12pt;padding:1mm 8mm;border-radius:4mm}.card .num{font-size:46pt;font-weight:800;line-height:1}.card .brand{font-size:7pt;color:#557080}
@media screen{body{background:#edf3f2}.sheet,.cards,.intro{background:#fff;margin:8mm auto;box-shadow:0 2mm 6mm #0002;width:210mm}}
</style>
<section class="intro"><h1>Kartenetiketten</h1><ul>
<li><b>Seiten ${2}–${1 + Math.ceil(labels.length / 24)}:</b> Etiketten 70 × 37 mm, 24 pro A4-Bogen (z. B. Zweckform 3474 oder gleiches Raster). Beim Drucken „Tatsächliche Größe / 100 %“ wählen, keine Seitenanpassung.</li>
<li><b>Danach:</b> Schnittvorlage im Kartenformat 85,6 × 54 mm zum Ausdrucken, Ausschneiden und Laminieren oder als Vorlage für den Kartendruck.</li>
<li>Küche = blau (K01–K48), Mensa = rot (M01–M64). Die Nummer muss zur Zuordnung im System passen: Karten am besten in derselben Reihenfolge einlernen („Karten am Stück einlernen“).</li></ul></section>
${pages(labels, 24, label, 'sheet')}${pages(labels, 10, card, 'cards')}</html>`;
writeFileSync('KARTEN-ETIKETTEN.html', html);
async function playwright() {
  try {
    return await import('playwright');
  } catch {}
  try {
    const p = join(execSync('npm root -g').toString().trim(), 'playwright/index.mjs');
    if (existsSync(p)) return await import(p);
  } catch {}
  return null;
}
const pw = await playwright();
if (pw) {
  const b = await pw.chromium.launch();
  const page = await b.newPage();
  await page.goto('file://' + resolve('KARTEN-ETIKETTEN.html'));
  await page.pdf({ path: 'KARTEN-ETIKETTEN.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
  await b.close();
  console.log('Kartenetiketten als HTML und PDF erzeugt.');
} else console.log('Kartenetiketten als HTML erzeugt (PDF übersprungen: Playwright fehlt).');

// Builds the illustrated Dial guide from the real booking core: screen images (PNG), the help data for the tablet,
// the A4 guide, the pocket card and, when Playwright/Chromium is available, PDFs of both.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import { createEngine } from '../server/engine.mjs';
import { paintDial, dialSize } from '../src/dial-paint.mjs';
import { VERSION } from '../src/version.mjs';

// --- Screens: each scenario is played on a fresh engine so the pictures are exactly what the device shows. ---
async function scenario(steps, extras = {}, { hardware = false } = {}) {
  const e = await createEngine();
  let now = 100000;
  if (hardware) e.call({ op: 'hardware' });
  const cmd = c => {
      const r = e.command(c, now);
      if (r.ok === false && !c.allowFail) throw Error(`${c.type}: ${r.message}`);
      return r;
    },
    tap = uid => {
      cmd({ type: 'scan', uid });
      cmd({ type: 'remove' });
    };
  cmd({ type: 'confirm' });
  cmd({ type: 'measurementContext', weekday: 1, minute: 720, queue: 0 });
  cmd({ type: 'flowSettings', yellow: 5, batch: 3 });
  cmd({ type: 'pause', paused: false });
  cmd({ type: 'autoSettings', on: true, start: 20, startGroup: 6 });
  await steps({ cmd, tap, wait: ms => (now += ms) });
  return e.call({ op: 'dial', now, ...extras });
}
const K = n => `sim:K${String(n).padStart(2, '0')}`;
const screens = [
  {
    id: 'bestand',
    title: 'Bestand bestätigen',
    meaning: 'Nach dem Einschalten oder einem Neustart ist der Einlass gesperrt, bis jemand den Bestand bestätigt.',
    action: 'Kurz prüfen, ob die Karten stimmen, dann die Taste 3 Sekunden halten.',
    items: await scenario(({ cmd }) => cmd({ type: 'restart' })),
  },
  {
    id: 'start',
    title: 'Startgruppe',
    meaning: 'Grün: Kinder dürfen kommen. Die erste Gruppe ist größer, damit sich an der Ausgabe eine Schlange bildet.',
    action: 'Nichts tun.',
    items: await scenario(() => {}),
  },
  {
    id: 'gruppe',
    title: 'Gruppe läuft',
    meaning: 'Es dürfen noch so viele Kinder dieser Gruppe hinein.',
    action: 'Nichts tun.',
    items: await scenario(({ tap }) => {
      tap(K(1));
      tap(K(2));
    }),
  },
  {
    id: 'countdown',
    title: 'Warten auf die nächste Gruppe',
    meaning: 'Rot mit Ring: Die Gruppe ist voll. Der Ring läuft ab, dann öffnet die Ampel von selbst.',
    action: 'Nichts tun. Ausgabe schon frei? Taste drücken. Zu voll? Orange Fläche antippen.',
    items: await scenario(({ tap, wait }) => {
      for (let i = 1; i <= 6; i++) tap(K(i));
      wait(20000);
    }),
  },
  {
    id: 'rueckmeldung',
    title: 'Karte gebucht',
    meaning: 'Nach jedem Scan steht kurz eine Rückmeldung im schwarzen Feld, mit Piepton.',
    action: 'Nichts tun.',
    items: await scenario(({ tap }) => tap(K(7)), {
      feedback: 'K07 ausgegeben. Ein Platz reserviert.',
      feedbackOk: true,
    }),
  },
  {
    id: 'abgewiesen',
    title: 'Karte abgewiesen',
    meaning: 'Orange Schrift und tiefer Ton: Die Karte wurde nicht gebucht, z. B. weil sie gerade erst gescannt wurde.',
    action: 'Kind kurz warten lassen oder Karte prüfen.',
    items: await scenario(() => {}, { feedback: 'Sperrzeit aktiv. Bitte später erneut vorhalten.', feedbackOk: false }),
  },
  {
    id: 'fastvoll',
    title: 'Fast voll',
    meaning: 'Gelb: Nur noch wenige freie Plätze.',
    action: 'Nichts tun. Rückgaben machen wieder Plätze frei.',
    items: await scenario(({ cmd }) => {
      cmd({ type: 'autoSettings', on: false, start: 20 });
      cmd({ type: 'flowSettings', yellow: 5, batch: 0 });
      cmd({ type: 'room', room: 'K', capacity: 48, limit: 4, open: true });
    }),
  },
  {
    id: 'entlastung',
    title: 'Ausgabe entlasten',
    meaning: 'Rot: Jemand hat „ENTLASTEN“ gedrückt. Niemand wird eingelassen, Rückgaben gehen weiter.',
    action: 'Wenn die Ausgabe wieder frei ist: Taste drücken.',
    items: await scenario(({ cmd }) => cmd({ type: 'relief' })),
  },
  {
    id: 'pause',
    title: 'Pause',
    meaning: 'Rot: Der Einlass ist von Hand pausiert.',
    action: 'Weiter mit der Taste.',
    items: await scenario(({ cmd }) => cmd({ type: 'pause', paused: true })),
  },
  {
    id: 'mensa',
    title: 'Mensa freigeben',
    meaning:
      'Nach Drehen am Ring (mindestens zwei Rasten – eine einzelne Raste aus Versehen zählt nicht): Anzahl der Mensaplätze für das freie Essen einstellen.',
    action:
      'Ring drehen bis zur Zahl, dann Taste drücken. 0 = Mensa sperren. Ohne Eingabe bricht es nach 15 Sekunden ab.',
    items: await scenario(({ cmd }) => cmd({ type: 'dialTurn', steps: 30 })),
  },
  {
    id: 'karten',
    title: 'Karten fehlen',
    meaning: '20 Minuten kein Scan, aber es sind noch Karten ausgegeben.',
    action: 'Karten einsammeln. Die Liste steht am Tablet unter „Betreuung“.',
    items: await scenario(({ tap, wait }) => {
      tap(K(1));
      tap(K(2));
      wait(21 * 60000);
    }),
  },
  {
    id: 'ampel',
    title: 'Ampel draußen getrennt',
    meaning: 'Das Tablet vor der Tür fragt nicht mehr nach (Akku leer, Bildschirm aus, WLAN weg).',
    action: 'Tablet vor der Tür prüfen und die Ampelseite wieder öffnen.',
    items: await scenario(() => {}, { hint: 'Ampel draussen getrennt!' }),
  },
  {
    id: 'stoerung',
    title: 'Störung',
    meaning: 'Rot: Kartenleser oder Speicher melden einen Fehler. Kein Einlass.',
    action: 'Betreuung verständigen. Am Tablet unter „Gerät“ steht die Ursache.',
    items: await scenario(() => {}, { blocked: true, hint: 'Leser pruefen!' }),
  },
  {
    id: 'einlernen',
    title: 'Karten am Stück einlernen',
    meaning:
      'Am Tablet gestartet: Jede vorgehaltene Karte bekommt die angezeigte Nummer, dann springt das Dial zur nächsten freien Nummer.',
    action: 'Karte vorhalten, mit der angezeigten Nummer beschriften. Taste = Nummer überspringen, 3 s halten = Ende.',
    items: await scenario(({ cmd }) => cmd({ type: 'seriesStart', room: 'K' }), {}, { hardware: true }),
  },
  {
    id: 'halten',
    title: 'Taste halten',
    meaning: 'Beim Halten läuft ein weißer Ring. Nach 3 Sekunden steht „Loslassen“ – dann ist die Aktion ausgelöst.',
    action: 'Loslassen, sobald „Loslassen: 3 s erreicht“ erscheint. Weiterhalten bis 10 s nur zum Zurücksetzen.',
    items: await scenario(({ cmd }) => cmd({ type: 'restart' }), { holdMs: 1800 }),
  },
  {
    id: 'neuertag',
    title: 'Neuer Tag wartet',
    meaning:
      'Der neue Essenstag startet sonst von selbst. Sind noch Karten von gestern draußen, wartet das Dial auf eine Person.',
    action: 'Karten einsammeln, dann Taste 3 Sekunden halten. Fehlende Karten bleiben gesperrt, bis sie auftauchen.',
    items: await scenario(({ cmd, tap, wait }) => {
      cmd({ type: 'autoSettings', on: true, start: 20, startGroup: 6, dayStart: 600 });
      tap(K(1));
      wait(24 * 3600000);
      cmd({ type: 'clockSync', weekday: 2, minute: 700 });
    }),
  },
  {
    id: 'betreuung',
    title: 'Betreuermenü',
    meaning: 'Eine Betreuerkarte am Dial öffnet dieses Menü. Sie bucht keinen Platz.',
    action: 'Ring drehen = Auswahl, Taste = ausführen. Karte erneut vorhalten = schließen.',
    items: await scenario(({ cmd, tap }) => {
      cmd({ type: 'staffLearn' });
      tap('BETREUER');
      tap('BETREUER');
    }),
  },
  {
    id: 'geraetetest',
    title: 'Gerätetest',
    meaning:
      'Am Tablet unter „Gerät“ gestartet: zeigt Leser, Kartenkennung, Lesungen, Drehring, Taste, Tablets, Speicher und Uhr. Scans buchen nicht.',
    action: 'Nur für die Abnahme und Fehlersuche. Am Tablet beenden.',
    items: await scenario(() => {}, {
      screen: 'test',
      lines: [
        'Leser: extern ok',
        'Karte: 04:A2:3F:11',
        'Lesungen: 12  vor 1 s',
        'Ring: 3  Taste: kurz',
        'Tablets: 2  Ampel: ok',
        'Speicher frei: 96 KB',
        'Uhr: 11:42:07',
        'Version ' + VERSION,
      ],
    }),
  },
  {
    id: 'wlan',
    title: 'WLAN-Daten',
    meaning: 'Taste 3 Sekunden halten (bei bestätigtem Bestand) zeigt 30 Sekunden lang WLAN-Name und Kennwort.',
    action: 'Tablet mit diesem WLAN verbinden und http://192.168.4.1 öffnen. Kurz drücken schließt die Anzeige.',
    items: await scenario(() => {}, {
      screen: 'credentials',
      ssid: 'Mensaampel-4F2A',
      wifi: 'Beispiel-Kennwort-123',
      configured: true,
    }),
  },
  {
    id: 'reset',
    title: 'Zugang zurücksetzen',
    meaning: 'Nur bei vergessenem Betreuungskennwort: Taste 10 Sekunden halten.',
    action:
      'Zur Sicherheit nochmal 3 Sekunden halten = Ja. Kurz drücken oder warten = Abbruch. Karten und Bestand bleiben erhalten.',
    items: await scenario(() => {}, { screen: 'reset' }),
  },
];
const handgriffe = [
  ['Morgens / nach dem Einschalten', 'bestand', 'Bestand ok? Taste 3 Sekunden halten.'],
  ['Mensa für freies Essen öffnen', 'mensa', 'Ring drehen bis zur Platzzahl, Taste drücken.'],
  ['Es wird zu voll an der Ausgabe', 'entlastung', 'Orange Fläche „ENTLASTEN“ antippen. Weiter: Taste.'],
  ['Ausgabe ist schon frei, Ring läuft noch', 'countdown', 'Taste drücken: nächste Gruppe sofort.'],
  ['Betreuerkarte vorhalten', 'betreuung', 'Menü: Ring = Auswahl, Taste = ausführen.'],
  ['Neuer Tag, Karten noch draußen', 'neuertag', 'Karten einsammeln, Taste 3 Sekunden halten.'],
  ['Alles läuft', 'start', 'Nichts tun.'],
];
writeFileSync('src/dial-screens.json', JSON.stringify({ screens, handgriffe }));

// --- PNG without extra libraries: nearest-neighbour upscale, round mask with transparent corners. ---
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = b => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function png(items, scale = 2) {
  const px = paintDial(items, { round: true }),
    s = dialSize * scale,
    raw = Buffer.alloc((s * 4 + 1) * s);
  for (let y = 0; y < s; y++) {
    raw[y * (s * 4 + 1)] = 0;
    for (let x = 0; x < s; x++) {
      const i = (Math.floor(y / scale) * dialSize + Math.floor(x / scale)) * 4,
        o = y * (s * 4 + 1) + 1 + x * 4;
      raw[o] = px[i];
      raw[o + 1] = px[i + 1];
      raw[o + 2] = px[i + 2];
      raw[o + 3] = px[i + 3];
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(s, 0);
  head.writeUInt32BE(s, 4);
  head[8] = 8;
  head[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
mkdirSync('docs/dial', { recursive: true });
const uri = {};
for (const sc of screens) {
  const b = png(sc.items);
  writeFileSync(`docs/dial/${sc.id}.png`, b);
  uri[sc.id] = 'data:image/png;base64,' + b.toString('base64');
}

// --- Printable pages (self-contained, images embedded). ---
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const css = `*{box-sizing:border-box}body{margin:0;background:#edf3f2;color:#183345;font:15px/1.55 "Segoe UI",Arial,sans-serif}main{max-width:900px;margin:24px auto;background:#fff;border-radius:18px;padding:36px 48px}h1{font-size:34px;margin:0 0 6px;color:#174e55}h2{font-size:22px;margin:34px 0 12px;color:#245d62;border-top:2px solid #dceae7;padding-top:18px;break-after:avoid}.lead{color:#557080;margin:0 0 18px}.dial{width:150px;height:150px;border-radius:50%;box-shadow:0 0 0 9px #2e373a,0 0 0 13px #c8d3d6;margin:14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 26px}.screen{display:flex;gap:6px;align-items:center;break-inside:avoid}.screen h3{margin:0 0 4px;font-size:16px}.screen p{margin:0 0 4px}.do{font-weight:700;color:#174e55}table{border-collapse:collapse;width:100%}td,th{padding:9px;border-bottom:1px solid #dce4e4;text-align:left;vertical-align:middle}th{background:#eaf3f1}.small{width:74px;height:74px;box-shadow:0 0 0 5px #2e373a;margin:8px}.print{float:right;border:0;border-radius:8px;background:#326d72;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}ol li,ul li{margin:6px 0}.note{background:#fff7e0;border-left:4px solid #f0a800;padding:10px 14px;border-radius:6px}@media print{body{background:#fff}main{margin:0;padding:0;max-width:none;border-radius:0}.print{display:none}@page{size:A4;margin:14mm}}@media(max-width:700px){main{padding:20px}.grid{grid-template-columns:1fr}}`;
const img = (id, cls = 'dial') =>
  `<img class="${cls}" src="${uri[id]}" alt="Dial-Bildschirm: ${esc(screens.find(s => s.id === id).title)}">`;
const device = `<svg viewBox="0 0 760 430" width="100%" role="img" aria-label="M5Stack Dial mit Bedienelementen" font-family="Segoe UI,Arial" font-size="15">
 <defs><pattern id="knurl" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="10" height="10" fill="#3b4548"/><rect width="5" height="10" fill="#2a3235"/></pattern><clipPath id="round"><circle cx="380" cy="215" r="112"/></clipPath></defs>
 <circle cx="380" cy="215" r="168" fill="#c8d3d6"/><circle cx="380" cy="215" r="160" fill="url(#knurl)"/><circle cx="380" cy="215" r="120" fill="#111"/>
 <image href="${uri.countdown}" x="268" y="103" width="224" height="224" clip-path="url(#round)"/>
 <rect x="296" y="236" width="168" height="33" rx="8" fill="none" stroke="#e11d74" stroke-width="3" stroke-dasharray="6 4"/>
 <g fill="none" stroke="#183345" stroke-width="1.5"><path d="M231 150 L130 90"/><path d="M464 252 L600 300"/><path d="M380 55 L380 22"/><path d="M252 300 L130 350"/><path d="M510 130 L610 90"/></g>
 <g fill="#183345"><circle cx="231" cy="150" r="4"/><circle cx="464" cy="252" r="4"/><circle cx="380" cy="55" r="4"/><circle cx="252" cy="300" r="4"/><circle cx="510" cy="130" r="4"/></g>
 <text x="20" y="72" font-weight="700">Drehring</text><text x="20" y="92">drehen = Mensaplätze</text><text x="20" y="110">einstellen</text>
 <text x="520" y="298" font-weight="700" fill="#e11d74">Fläche „ENTLASTEN“</text><text x="520" y="318">antippen = zu voll</text>
 <text x="280" y="18" font-weight="700">Taste = Dial-Front drücken</text>
 <text x="20" y="340" font-weight="700">Karte hier vorhalten</text><text x="20" y="360">(Leser im Gerät, ca. 1–3 cm)</text>
 <text x="560" y="70" font-weight="700">Farbe = Zustand</text><text x="560" y="90">grün · gelb · rot</text><text x="560" y="108">Ring = Countdown</text>
 <text x="380" y="420" text-anchor="middle" fill="#557080">Rückseite: USB-C für Strom · G0-Taste nur zum Aufspielen der Software</text>
</svg>`;
const presses = `<table><tr><th>Taste (Dial-Front drücken)</th><th>Wirkung</th></tr>
<tr><td>kurz drücken</td><td>Grün: Pause · Rot (Pause/Entlastung): weiter · Countdown: nächste Gruppe sofort · Mensa-Einstellung: übernehmen</td></tr>
<tr><td>3 Sekunden halten (weißer Ring)</td><td>Bestand unbestätigt: <b>Bestand bestätigen</b> · „Neuer Tag?“: neuen Essenstag starten · sonst: WLAN-Daten anzeigen</td></tr>
<tr><td>10 Sekunden halten</td><td>Zugang zurücksetzen (nur bei vergessenem Kennwort; zur Bestätigung nochmal 3 s halten)</td></tr>
<tr><td>Ring drehen (ab 2 Rasten)</td><td>Mensaplätze einstellen, Taste übernimmt</td></tr>
<tr><td>Fläche „ENTLASTEN“ antippen</td><td>Einlass sofort stoppen, weil es an der Ausgabe zu voll ist</td></tr>
<tr><td>Betreuerkarte vorhalten</td><td>Menü: Bestand ok · Pause/Weiter · Mensa freigeben · Abbrechen (Ring = Auswahl, Taste = ausführen)</td></tr></table>`;
const guide = `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mensaampel · Bedienung am Dial</title><style>${css}</style><main>
<button class="print" onclick="window.print()">Drucken / als PDF speichern</button><h1>Bedienung am Dial</h1><p class="lead">Für alle, die in der Mensa Dienst haben. Das Dial steht drinnen, das Tablet vor der Tür ist nur die Ampel.</p>
${device}
<h2>Die fünf Handgriffe</h2><table>${handgriffe.map(([w, id, a]) => `<tr><td>${img(id, 'dial small')}</td><td><b>${esc(w)}</b><br><span class="do">${esc(a)}</span></td></tr>`).join('')}</table>
<h2>Taste, Ring und Fläche</h2>${presses}
<h2>Was zeigt das Dial?</h2><div class="grid">${screens.map(s => `<div class="screen">${img(s.id, 'dial small')}<div><h3>${esc(s.title)}</h3><p>${esc(s.meaning)}</p><p class="do">${esc(s.action)}</p></div></div>`).join('')}</div>
<h2>Ablauf an einem Tag</h2><ol><li><b>Einschalten</b> (USB-Strom). Das Dial zeigt „Bestand ok?“ → Karten kurz prüfen → <b>Taste 3 s halten</b>. Ist der automatische Essenstag eingestellt, sind die Belegungen vom Vortag schon zurückgesetzt.</li><li><b>Tablet vor der Tür</b>: Ampelseite öffnen (http://192.168.4.1/ampel), Vollbild. Optional „Ton an“ für einen Gong bei Grün.</li><li><b>Mittag</b>: Kinder halten ihre Platzkarte ans Dial. Die erste Gruppe ist größer, danach öffnet die Ampel im Takt von selbst.</li><li><b>Begleitete Kinder fertig</b>: Ring drehen, Mensaplätze einstellen, Taste.</li><li><b>Nur bei Bedarf</b>: zu voll → ENTLASTEN; Ausgabe schon frei → Taste.</li><li><b>Ende</b>: Fehlen Karten, zeigt das Dial „Karten fehlen“ – einsammeln.</li></ol>
<h2>iPad vor der Tür (Ampel)</h2><p><b>Einmalig:</b> im Dial-WLAN „Automatisch verbinden“ an, beim Schul-WLAN aus · Safari: http://192.168.4.1/ampel zum Home-Bildschirm · Automatische Sperre „Nie“, Stromsparmodus aus, „Nicht stören“ an · Bedienungshilfen → <b>Geführter Zugriff</b> an, Code festlegen, Anzeige-Autosperre „Nie“.</p><p><b>Täglich / nach iPad-Neustart:</b> Ampelseite öffnen, Vollbild · <b>dreimal die obere Taste</b> drücken · Tasten aus → Starten · bei „Ton an“ einmal auf den Bildschirm tippen. Beenden: dreimal drücken, Code. iPad am Ladekabel lassen.</p>
<h2>Wenn etwas nicht stimmt</h2><ul><li><b>Alles rot, „Stoerung“</b>: Leser oder Speicher. Betreuung verständigen; am Tablet unter „Gerät“ steht die Ursache.</li><li><b>„Ampel draussen getrennt!“</b>: Tablet vor der Tür prüfen (Akku, Bildschirm, WLAN).</li><li><b>Kind wird abgewiesen</b> (orange Schrift, tiefer Ton): Karte wurde gerade erst gescannt, Raum ist gesperrt oder die Karte ist unbekannt.</li><li><b>Strom weg</b>: Der Bestand bleibt gespeichert. Nach dem Einschalten wieder Taste 3 s halten.</li></ul>
<p class="note">Die Automatik lernt aus euren Eingriffen: „ENTLASTEN“ nach einer automatischen Freigabe = künftig länger warten, Taste im Countdown = künftig schneller. Ohne Eingriff wird sie vorsichtig etwas schneller.</p>
<h2>Karten einrichten</h2><p>Am Tablet unter „Betreuung“ bzw. „Gerät“: <b>Karten am Stück einlernen</b> für Küche oder Mensa starten. Das Dial zeigt die nächste freie Nummer groß an; Karte vorhalten, mit dieser Nummer beschriften (Etiketten: <code>Etiketten-Tool.html</code> am PC öffnen). <b>Betreuerkarte</b>: am Tablet unter Einstellungen „Neue Betreuerkarte einlernen“, dann die Karte ans Dial halten. Sie ist kein Sicherheitsschlüssel und öffnet nur das Alltagsmenü.</p>
<h2>Nur für die Einlernphase (zweite Person)</h2><p>Mit Handy oder Tablet im Dial-WLAN anmelden → „Einlass &amp; Messungen“ → vor einer Gruppe „Gruppe messen“, wenn das letzte Kind sein Essen hat „Alle haben Essen“. Jede Messung verbessert die Automatik.</p>
</main></html>`;
const card = `<section class="card"><h1>Mensaampel · Dial</h1>${handgriffe.map(([w, id, a]) => `<div class="row"><img src="${uri[id]}" alt=""><div><b>${esc(w)}</b><span>${esc(a)}</span></div></div>`).join('')}<p class="foot">Taste = Dial-Front drücken · Rot mit Ring = Ampel öffnet gleich von selbst</p></section>`;
const cards = `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mensaampel · Kurzkarte Dial</title><style>*{box-sizing:border-box}body{margin:0;font:13px/1.35 "Segoe UI",Arial,sans-serif;color:#183345;background:#edf3f2}.sheet{display:grid;gap:6mm;padding:10mm;justify-content:center}.card{width:148mm;min-height:0;background:#fff;border:1.5px dashed #9fb3b8;border-radius:6mm;padding:5mm 9mm}.card h1{font-size:18px;margin:0 0 3mm;color:#174e55}.row{display:flex;align-items:center;gap:4mm;margin:1.2mm 0}.row img{width:16mm;height:16mm;border-radius:50%;box-shadow:0 0 0 1.3mm #2e373a;flex:none}.row b{display:block;font-size:13.5px}.row span{font-size:14px;font-weight:700;color:#174e55}.foot{color:#557080;margin:3mm 0 0;font-size:11px}@media print{body{background:#fff}.sheet{padding:0}@page{size:A4;margin:10mm}}</style><div class="sheet">${card}${card}</div></html>`;
writeFileSync('BEDIENUNG-DIAL.html', guide);
writeFileSync('DIAL-KURZKARTE.html', cards);

// --- PDFs (optional, needs Playwright with Chromium; skipped otherwise). ---
async function playwright() {
  try {
    return await import('playwright');
  } catch {}
  try {
    const root = execSync('npm root -g').toString().trim();
    const p = join(root, 'playwright/index.mjs');
    if (existsSync(p)) return await import(p);
  } catch {}
  return null;
}
const pw = await playwright();
if (pw) {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage();
  for (const [html, pdf] of [
    ['BEDIENUNG-DIAL.html', 'BEDIENUNG-DIAL.pdf'],
    ['DIAL-KURZKARTE.html', 'DIAL-KURZKARTE.pdf'],
  ]) {
    await page.goto('file://' + resolve(html));
    await page.pdf({
      path: pdf,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
  }
  await browser.close();
  console.log('Anleitung, Kurzkarte, Bilder und PDFs erzeugt.');
} else console.log('Anleitung, Kurzkarte und Bilder erzeugt (PDF übersprungen: Playwright fehlt).');

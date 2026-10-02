import http from 'node:http';
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
  openSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { createEngine } from './engine.mjs';
import { VERSION } from '../src/version.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function createApp({ dataDir = resolve(root, 'data') } = {}) {
  const engine = await createEngine();
  mkdirSync(dataDir, { recursive: true });
  const file = resolve(dataDir, 'bestand.json');
  const recent = new Map();
  let offset = 0,
    offlineUntil = 0,
    storageError = '',
    loadError = '',
    forceWriteFailure = false,
    feedback = { text: '', ok: true, at: 0 },
    ampelSeenAt = 0,
    readySince = 0,
    ampelWarned = false,
    test = null;
  const now = () => Date.now() + offset;
  const hash = s => createHash('sha256').update(s).digest('hex');
  function save() {
    if (forceWriteFailure) throw Error('Simulierter Speicherfehler');
    const payload = JSON.stringify({ state: engine.snapshot(), offset });
    const data = JSON.stringify({ version: 1, checksum: hash(payload), payload }, null, 2);
    const tmp = file + '.tmp';
    const fd = openSync(tmp, 'w');
    try {
      writeFileSync(fd, data, 'utf8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, file);
  }
  if (existsSync(file)) {
    try {
      const envelope = JSON.parse(readFileSync(file, 'utf8'));
      if (
        envelope.version !== 1 ||
        typeof envelope.payload !== 'string' ||
        hash(envelope.payload) !== envelope.checksum
      )
        throw Error('Prüfsumme oder Speicherformat ungültig');
      const data = JSON.parse(envelope.payload);
      if (!Number.isSafeInteger(data.offset) || data.offset < 0) throw Error('Ungültige Simulationszeit');
      const r = engine.restore(data.state);
      if (!r.ok) throw Error(r.message);
      offset = data.offset;
      engine.command({ type: 'restart' }, now());
      save();
    } catch (e) {
      loadError = 'Gespeicherter Bestand konnte nicht geladen werden. Die Datei bleibt unverändert. ' + e.message;
    }
  } else {
    try {
      save();
    } catch (e) {
      storageError = 'Bestand kann nicht gespeichert werden: ' + e.message;
    }
  }
  const token = randomBytes(24).toString('hex');
  function state() {
    const s = engine.status(now()),
      error = storageError || loadError;
    // Same main screen as the Dial; the note stays visible for 3.5 s like on the device.
    // Device test in the simulation: same screen as on the Dial, simulated values.
    if (test) {
      const lines = [
        'Leser: Simulation ok',
        'Karte: ' + (test.uid || '-'),
        'Lesungen: ' + test.reads + (test.at ? '  vor ' + Math.floor((Date.now() - test.at) / 1000) + ' s' : ''),
        'Ring: ' + test.turn + '  Taste: ' + test.button,
        'Tablets: 1  Ampel: ' + (ampelSeenAt && !ampelLost() ? 'ok' : '-'),
        'Speicher frei: PC',
        'Uhr: ' + new Date(now()).toLocaleTimeString('de-DE'),
        'Version ' + VERSION,
      ];
      return {
        ...s,
        dial: engine.call({ op: 'dial', now: now(), screen: 'test', lines }),
        feedback,
        testMode: true,
        storageError: error,
        recoveryRequired: !!loadError,
        sim: { offset, offline: Date.now() < offlineUntil, forceWriteFailure },
      };
    }
    const dial = engine.call({
      op: 'dial',
      now: now(),
      blocked: !!error,
      hint: error
        ? 'Speicher prüfen!'
        : ampelLost()
          ? ampelSeenAt
            ? 'Ampel draußen getrennt!'
            : 'Ampel nicht verbunden!'
          : '',
      ...(Date.now() - feedback.at < 3500 ? { feedback: feedback.text, feedbackOk: feedback.ok } : {}),
    });
    return {
      ...s,
      dial,
      feedback,
      storageError: error,
      recoveryRequired: !!loadError,
      sim: { offset, offline: Date.now() < offlineUntil, forceWriteFailure },
    };
  }
  const note = (text, ok) => {
    if (text) feedback = { text, ok: !!ok, at: Date.now() };
  };
  // Like the Dial: missing polls for more than 10 s are reported inside, and no Ampel at all a minute after the stock
  // was confirmed.
  const ampelLost = () => {
    const ready = engine.status(now()).ready;
    if (!ready) readySince = 0;
    else if (!readySince) readySince = Date.now();
    return ampelSeenAt > 0 ? Date.now() - ampelSeenAt > 10000 : readySince > 0 && Date.now() - readySince > 60000;
  };
  // The PC has a reliable clock: take weekday and time for the learned half-hour values automatically.
  // Also while a group runs: then only the clock (clockSync), so the running group stays untouched.
  function syncClock() {
    const f = engine.status(now()).flow;
    if (loadError || f.clockValid) return;
    const t = new Date(now()),
      idle = !f.armed && f.started < 0 && f.issued === 0;
    const r = engine.command(
      {
        type: idle ? 'measurementContext' : 'clockSync',
        weekday: t.getDay(),
        minute: t.getHours() * 60 + t.getMinutes(),
        date: [t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds()],
        ...(idle ? { queue: f.queue } : {}),
      },
      now(),
    );
    if (/Neustart/.test(r.message || '')) note(r.message, true);
  }
  // Commands are processed synchronously after body collection; memory and disk form one transaction.
  function transact(command) {
    if (loadError && command.type !== 'recover') return { ok: false, message: loadError, state: state() };
    if (command.type === 'recover') {
      if (command.confirmed !== true) return { ok: false, message: 'Wiederherstellung bestätigen.', state: state() };
      try {
        if (existsSync(file)) renameSync(file, file + '.beschädigt-' + Date.now());
        engine.reset();
        offset = 0;
        save();
        loadError = '';
        storageError = '';
        return { ok: true, message: 'Leerer Grundbestand angelegt. Bestand vor Freigabe prüfen.', state: state() };
      } catch (e) {
        return { ok: false, message: 'Wiederherstellung fehlgeschlagen: ' + e.message, state: state() };
      }
    }
    if (command.type === 'disconnect') {
      offlineUntil = Date.now() + 8000;
      return { ok: true, message: 'Verbindung für acht Sekunden unterbrochen.', state: state() };
    }
    // Sounds play on the tablet itself (WebAudio, src/sounds.mjs); the PC has no buzzer.
    if (command.type === 'soundTest') return { ok: true, message: 'Klang wird am Tablet abgespielt.', state: state() };
    if (command.type === 'deviceTest') {
      test = command.on ? { uid: '', reads: 0, at: 0, turn: 0, button: '-' } : null;
      return {
        ok: true,
        message: test ? 'Gerätetest gestartet. Scans buchen nicht.' : 'Gerätetest beendet.',
        state: state(),
      };
    }
    if (test && ['tap', 'scan', 'remove', 'dialTurn', 'dialPress', 'dialHold', 'relief'].includes(command.type)) {
      if (command.type === 'tap' || command.type === 'scan') {
        if (command.uid === test.uid) test.reads++;
        else {
          test.uid = command.uid;
          test.reads = 1;
        }
        test.at = Date.now();
        note('Karte gelesen', true);
      } else if (command.type === 'dialTurn') test.turn += command.steps | 0;
      else if (command.type !== 'remove')
        test.button = { dialPress: 'kurz', dialHold: '3 s', relief: 'Touch' }[command.type];
      return { ok: true, message: '', state: state() };
    }
    if (command.type === 'storageFailure') {
      forceWriteFailure = !!command.enabled;
      return {
        ok: true,
        message: forceWriteFailure
          ? 'Speicherfehler eingeschaltet. Buchungen werden nicht bestätigt.'
          : 'Speicherfehler beendet. Bitte erneut speichern oder buchen.',
        state: state(),
      };
    }
    const previous = engine.snapshot(),
      oldOffset = offset;
    let result;
    if (command.type === 'advance') {
      if (!Number.isInteger(command.seconds) || command.seconds < 1 || command.seconds > 3600)
        return { ok: false, message: 'Zeitspanne ungültig.', state: state() };
      offset += command.seconds * 1000;
      result = { ok: true, message: `${command.seconds} Sekunden vorgespult.` };
    } else if (command.type === 'tap') {
      result = engine.command({ type: 'scan', uid: command.uid }, now());
      engine.command({ type: 'remove' }, now());
    } else result = engine.command(command, now());
    if (command.type !== 'advance') note(result.message, result.ok);
    if (result.changed === false) return { ...result, state: state() };
    syncClock();
    if (command.type === 'advance') {
      const r = engine.command({ type: 'tick' }, now());
      if (r.changed) note(r.message, r.ok);
    }
    try {
      save();
      storageError = '';
    } catch (e) {
      engine.restore(previous, true);
      offset = oldOffset;
      storageError = 'Speicherfehler. Aktion nicht übernommen. Bitte Speicher prüfen.';
      note(storageError, false);
      return { ok: false, message: storageError, state: state() };
    }
    return { ...result, state: state() };
  }
  const server = http.createServer(async (req, res) => {
    const reply = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(data));
    };
    // Local-only service, no permissive CORS; reject foreign Host and Origin (DNS-rebinding / drive-by writes).
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || ''))
      return reply(403, { message: 'Nur lokaler Zugriff erlaubt.' });
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
      return reply(403, { message: 'Fremder Ursprung abgelehnt.' });
    let url, decodedPath;
    try {
      url = new URL(req.url, `http://${req.headers.host}`);
      decodedPath = decodeURIComponent(url.pathname);
    } catch {
      return reply(400, { message: 'Ungültige Adresse.' });
    }
    if (url.pathname === '/api/health') return reply(200, { app: 'mensaampel', version: 1 });
    if (url.pathname === '/api/info') return reply(200, { mode: 'pc', version: VERSION });
    if (url.pathname === '/api/signal') {
      if (Date.now() < offlineUntil) return reply(503, { message: 'Simulierte Verbindungsunterbrechung.' });
      ampelSeenAt = Date.now();
      const s = state();
      return reply(200, {
        signal: s.signal,
        storageError: s.storageError,
        now: s.now,
        clockValid: s.flow.clockValid,
        version: VERSION,
      });
    }
    if (url.pathname === '/api/state') {
      if (Date.now() < offlineUntil) return reply(503, { message: 'Simulierte Verbindungsunterbrechung.' });
      return reply(200, { ...state(), token });
    }
    if (url.pathname === '/api/backup') {
      if (req.headers['x-mensa-token'] !== token) return reply(403, { message: 'Sitzung ungültig. Seite neu laden.' });
      return reply(200, { format: 'mensa-pc-backup-1', state: engine.snapshot() });
    }
    if (url.pathname === '/api/restore' && req.method === 'POST') {
      if (req.headers['x-mensa-token'] !== token) return reply(403, { message: 'Sitzung ungültig. Seite neu laden.' });
      let body = '';
      try {
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 500000) return reply(413, { message: 'Sicherung zu groß.' });
        }
        return reply(200, restoreBackup(JSON.parse(body)));
      } catch (e) {
        return reply(400, { ok: false, message: 'Ungültige Sicherung: ' + e.message });
      }
    }
    if (url.pathname === '/api/command' && req.method === 'POST') {
      if (req.headers['x-mensa-token'] !== token) return reply(403, { message: 'Sitzung ungültig. Seite neu laden.' });
      if (Date.now() < offlineUntil) return reply(503, { message: 'Verbindung unterbrochen.' });
      let body = '';
      try {
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 16000) return reply(413, { message: 'Anfrage zu groß.' });
        }
        const command = JSON.parse(body);
        // Same id again (tablet retry after a timeout): answer from memory, never run it twice.
        const rid = typeof command?.rid === 'string' ? command.rid : '';
        const known = rid && recent.get(rid);
        if (known) return reply(200, { ...known, state: state() });
        const r = transact(command);
        if (rid) {
          recent.set(rid, { ok: r.ok, message: r.message });
          if (recent.size > 20) recent.delete(recent.keys().next().value);
        }
        return reply(200, r);
      } catch (e) {
        return reply(400, { ok: false, message: 'Ungültige Anfrage: ' + e.message });
      }
    }
    if (url.pathname.startsWith('/api/')) return reply(404, { message: 'Nicht gefunden.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(405, { message: 'Methode nicht erlaubt.' });
    const publicDir = resolve(root, 'dist');
    let path = resolve(publicDir, '.' + decodedPath);
    if (!path.startsWith(publicDir + '/') && !path.startsWith(publicDir + '\\') && path !== publicDir)
      return reply(403, {});
    if (!extname(path)) path = resolve(publicDir, 'index.html');
    try {
      const content = readFileSync(path);
      const type =
        {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.woff2': 'font/woff2',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
        }[extname(path)] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Nicht gefunden. Anwendung zuerst bauen.');
    }
  });
  syncClock();
  const timer = setInterval(() => {
    if (!loadError && !forceWriteFailure) transact({ type: 'tick' });
    const lost = ampelLost();
    if (lost && !ampelWarned) note('Ampel draußen getrennt!', false);
    if (!lost && ampelWarned && ampelSeenAt) note('Ampel wieder verbunden.', true);
    ampelWarned = lost;
  }, 500);
  timer.unref();
  // Restore a downloaded backup (PC or Dial format); afterwards the stock has to be confirmed again.
  function restoreBackup(body) {
    if (loadError) return { ok: false, message: loadError, state: state() };
    if (body?.confirmed !== true) return { ok: false, message: 'Einspielen ausdrücklich bestätigen.', state: state() };
    const backup = body.backup;
    if (
      !backup ||
      !['mensa-pc-backup-1', 'mensa-device-backup-1'].includes(backup.format) ||
      typeof backup.state !== 'object'
    )
      return { ok: false, message: 'Keine gültige Mensaampel-Sicherung.', state: state() };
    const previous = engine.snapshot();
    const r = engine.restore(backup.state);
    if (!r.ok) return { ok: false, message: 'Sicherung ungültig: ' + r.message, state: state() };
    engine.command({ type: 'restart' }, now());
    try {
      save();
      storageError = '';
    } catch {
      engine.restore(previous, true);
      storageError = 'Speicherfehler. Sicherung nicht übernommen.';
      return { ok: false, message: storageError, state: state() };
    }
    const message = 'Sicherung eingespielt. Bestand prüfen und bestätigen.';
    note(message, true);
    return { ok: true, message, state: state() };
  }
  return { server, engine, state, transact, restoreBackup, stop: () => clearInterval(timer) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp({ dataDir: process.env.MENSA_DATA_DIR || undefined });
  const port = Number(process.env.PORT || 4317);
  app.server.on('error', e => {
    console.error('Start fehlgeschlagen:', e.message);
    process.exitCode = 1;
  });
  app.server.listen(port, '127.0.0.1', () => console.log(`Mensaampel bereit: http://127.0.0.1:${port}`));
}

#!/usr/bin/env python3
"""Geräteprüfung über das USB-Kabel (ab Firmware 0.17.1).

Das Dial hängt per USB am PC, Ampel- und Betreuungs-Tablet laufen ganz normal über das Dial-WLAN. Das Skript
beobachtet das Dial über die Prüf-Schnittstelle der Firmware ("@mensa <befehl>" -> "@mensa-reply {json}"), startet
den Speicher-Dauertest und schreibt einen Bericht nach pruefbericht/<Datum-Uhrzeit>/. Es bucht nichts und ändert
keine Einstellungen. Anleitung: PRUEFUNG-AM-PC.md

  python scripts/device-check.py                 # 10 Minuten, Anschluss automatisch
  python scripts/device-check.py --minuten 3 --port COM5
  python scripts/device-check.py --selbsttest    # prüft nur die Auswertung, ohne Gerät
"""
import argparse
import datetime
import json
import os
import sys
import time

MIN_VERSION = (0, 17, 1)
LIMITS = {'block_kb': 32, 'ampel_s': 3, 'bench_ms': 1500, 'web_ms': 1500, 'rssi_ok': -70, 'rssi_weak': -80}


REPLY = '@mensa-reply '


def parse_reply(line, command):
    """Answer to `command` anywhere in a line (a library log line may stand before it without a line end); None for
    other lines and for answers to another command (firmware 0.17.2+ names it in "cmd")."""
    at = line.find(REPLY)
    if at < 0:
        return None
    try:
        reply = json.loads(line[at + len(REPLY):])
    except ValueError:
        return None
    if not isinstance(reply, dict) or reply.get('cmd', command) != command:
        return None
    return reply


def pauses(samples):
    """Ampel pauses (ampelAgo >= 4 s) with their probable cause from the counters around them."""
    found, current = [], None
    for prev, s in zip([None] + samples[:-1], samples):
        ago = s.get('ampelAgo', -1)
        if ago >= 4:
            if current is None:
                current = {'from': s.get('t', 0) - ago, 'longest': ago, 'start': prev or s, 'samples': []}
            current['longest'] = max(current['longest'], ago)
            current['samples'].append(s)
        elif current is not None:
            current['end'] = s
            found.append(current)
            current = None
    if current is not None:
        current['end'] = current['samples'][-1]
        found.append(current)
    result = []
    for p in found:
        a, b = p['start'], p['end']
        ha, hb = a.get('health') or {}, b.get('health') or {}
        rows = p['samples'] + [b]
        router = any(r.get('wifiMode') == 'router' for r in rows)
        if router and (hb.get('wlanDrops', 0) > ha.get('wlanDrops', 0) or any(r.get('routerConnected') is False for r in rows)):
            cause = 'Dial hatte keine Verbindung zum Router (Router-Strom, Abstand, Kanal prüfen)'
        elif not router and (hb.get('wlanDrops', 0) > ha.get('wlanDrops', 0) or any(r.get('clients', 1) == 0 for r in rows)):
            rssi = [st.get('rssi', 0) for r in [a] + rows for st in (r.get('health') or {}).get('stations') or []]
            weakest = min(rssi) if rssi else None
            if weakest is not None and weakest < LIMITS['rssi_weak']:
                cause = f'Tablet war kurz aus dem Dial-WLAN – Signal schwach ({weakest} dBm)'
            elif weakest is not None:
                cause = f'Tablet hat sich abgemeldet, obwohl das Signal gut war ({weakest} dBm) – Einstellung am Tablet'
            else:
                cause = 'Tablet war kurz aus dem Dial-WLAN'
        elif hb.get('sendAborts', 0) > ha.get('sendAborts', 0) or hb.get('sendMaxMs', 0) > max(1500, ha.get('sendMaxMs', 0)):
            cause = 'Dial hat eine Antwort nicht losbekommen'
        else:
            cause = 'Tablet hat in der Zeit nicht gefragt (Bildschirm aus, Energiesparen, Browser im Hintergrund?)'
        result.append({'at': time.strftime('%H:%M:%S', time.localtime(p['from'])) if p['from'] else '?',
                       'seconds': p['longest'], 'cause': cause})
    return result


def version_tuple(text):
    parts = []
    for p in str(text).split('-')[0].split('.'):
        try:
            parts.append(int(p))
        except ValueError:
            parts.append(0)
    return tuple((parts + [0, 0, 0])[:3])


def evaluate(record):
    """Bewertet eine Aufzeichnung. record: info, samples (health-Antworten mit 't'), test_samples (während des
    Dauertests), memory (Endzustand des Dauertests), bench, backup, usb_missed, log (andere USB-Zeilen)."""
    checks = []

    def add(name, status, value, limit, todo):
        checks.append({'name': name, 'status': status, 'value': value, 'limit': limit, 'todo': todo})

    info = record.get('info') or {}
    samples = record.get('samples') or []
    version = info.get('version', '?')
    add('Verbindung über USB', 'ok' if info.get('ok') else 'fehler', f"Version {version}", 'Antwort vom Dial',
        'USB-Datenkabel (nicht nur Ladekabel) prüfen, anderen Anschluss probieren.' if not info.get('ok') else '')
    if info.get('ok') and version_tuple(version) < MIN_VERSION:
        add('Firmware-Version', 'fehler', version, 'mindestens 0.17.1',
            'Zuerst das Update einspielen (Tablet: Gerät → Firmware-Update).')
    if not samples:
        add('Messwerte', 'fehler', 'keine', 'Antworten alle 2 s', 'Dial antwortet nicht über USB.')
        return checks
    samples = [s for s in samples if 'uptime' in s]
    if not samples:
        add('Messwerte', 'fehler', 'keine gültigen', 'Antworten alle 2 s', 'Dial antwortet nicht über USB.')
        return checks
    first, last = samples[0], samples[-1]
    restarts = sum(1 for a, b in zip(samples, samples[1:]) if b['uptime'] < a['uptime'])
    add('Keine Neustarts', 'ok' if restarts == 0 else 'fehler', f'{restarts} Neustart(s)', '0',
        'Neustart während der Prüfung: Uhrzeit und USB-Meldungen unten notieren und melden.' if restarts else '')
    crash = bool((last.get('health') or {}).get('crash'))
    add('Letzter Start ohne Absturz', 'warnung' if crash else 'ok', 'Absturz' if crash else 'normal', 'normal',
        'Das Dial ist vor dieser Prüfung einmal abgestürzt (Startgrund unter Gerät). Melden.' if crash else '')
    blocks = [s['maxAllocHeap'] for s in samples if 'maxAllocHeap' in s]
    blocks += [(s.get('health') or {})['minBlock'] for s in samples if 'minBlock' in (s.get('health') or {})]
    blocks += [s['maxAllocHeap'] for s in record.get('test_samples') or [] if 'maxAllocHeap' in s]
    blocks = blocks or [0]
    block_kb = min(blocks) // 1024
    add('Größter freier Speicherblock', 'ok' if block_kb >= LIMITS['block_kb'] else 'fehler', f'{block_kb} KB',
        f"≥ {LIMITS['block_kb']} KB", 'Wert melden; Dial nach dem Mittag einmal neu starten.'
        if block_kb < LIMITS['block_kb'] else '')
    ampel = [s.get('ampelAgo', -1) for s in samples if s.get('ampelAgo', -1) >= 0]
    if not ampel:
        add('Ampel wird bedient', 'übersprungen', 'Ampel-Tablet war nicht verbunden', f"≤ {LIMITS['ampel_s']} s",
            'Ampel-Tablet mit dem Dial-WLAN verbinden, /ampel öffnen und die Prüfung wiederholen.')
    else:
        worst = max(ampel)
        found = pauses(samples)
        record['pauses'] = found
        causes = {p['cause'] for p in found}
        if any(c.startswith('Dial') for c in causes):
            todo = 'Das Dial hat Antworten nicht losbekommen – Bericht an den Entwickler.'
        elif causes:
            todo = ('Am Ampel-Tablet WLAN stabil halten (ANLEITUNG-DIAL.md „Ampel-Tablet: WLAN stabil halten“): '
                    'beim Dial-WLAN „Verbunden bleiben/ohne Internet“, mobile Daten und Netzwechsel aus, '
                    'Bildschirm nie aus, Ladekabel.')
        else:
            todo = ''
        add('Ampel wird bedient', 'ok' if worst <= LIMITS['ampel_s'] else 'fehler',
            f'längste Pause {worst} s, {len(found)} Pause(n)', f"≤ {LIMITS['ampel_s']} s", todo)
    during = [s.get('ampelAgo', -1) for s in record.get('test_samples') or [] if s.get('ampelAgo', -1) >= 0]
    if during:
        worst = max(during)
        add('Ampel während des Dauertests', 'ok' if worst <= LIMITS['ampel_s'] else 'fehler',
            f'längste Pause {worst} s', f"≤ {LIMITS['ampel_s']} s",
            'Der Dauertest hält die Ampel auf – Bericht an den Entwickler.' if worst > LIMITS['ampel_s'] else '')
    memory = record.get('memory') or {}
    if memory:
        add('Speicher-Dauertest', 'ok' if memory.get('ok') else 'fehler', memory.get('message', '?'),
            '20× gespeichert ohne Fehler', '' if memory.get('ok') else 'Meldung an den Entwickler; Sicherung ziehen.')
    else:
        add('Speicher-Dauertest', 'fehler', 'nicht gestartet', '20× gespeichert', 'Siehe USB-Meldungen.')
    bench = record.get('bench') or {}
    if bench.get('ok'):
        ms = bench.get('statusMaxMs', 0)
        add('Status für das Tablet bauen', 'ok' if ms <= LIMITS['bench_ms'] else 'fehler', f'max {ms} ms',
            f"≤ {LIMITS['bench_ms']} ms", 'Zu langsam – melden.' if ms > LIMITS['bench_ms'] else '')
    backup = record.get('backup') or {}
    add('Sicherung lesbar', 'ok' if backup.get('ok') else 'fehler',
        f"{backup.get('cards', 0)} Karten, {backup.get('bytes', 0) // 1024} KB" if backup.get('ok')
        else backup.get('message', 'nicht geprüft'), 'gültig', '' if backup.get('ok')
        else 'Am Tablet unter Gerät eine Sicherung herunterladen und dem Entwickler schicken.')
    h0, h1 = first.get('health') or {}, last.get('health') or {}
    faults = h1.get('readerFaults', 0) - h0.get('readerFaults', 0)
    unclear = h1.get('unclearReads', 0) - h0.get('unclearReads', 0)
    add('Kartenleser', 'ok' if faults == 0 else 'fehler', f'{faults} Störung(en)', '0',
        'Stecker der RFID-Unit prüfen.' if faults else '')
    if unclear:
        add('Karten unklar gelesen', 'hinweis', f'{unclear}×', '–',
            'Karte schräg, zwei Karten oder zu schnell weggezogen – normal beim Ausprobieren.')
    fails = h1.get('saveFailures', 0) - h0.get('saveFailures', 0)
    errors = sorted({s.get('storageError') for s in samples if s.get('storageError')})
    add('Speichern', 'ok' if fails == 0 and not errors else 'fehler',
        f"{fails} Fehler" + (f" ({'; '.join(errors)})" if errors else ''), '0',
        'Sicherung herunterladen, Meldung an den Entwickler.' if fails or errors else '')
    web = last.get('webMaxMs', 0)
    add('Längste Antwort ans Tablet', 'ok' if web <= LIMITS['web_ms'] else 'warnung', f'{web} ms',
        f"≤ {LIMITS['web_ms']} ms", 'Nur ein Browserfenster mit der Betreuung offen lassen.'
        if web > LIMITS['web_ms'] else '')
    rssi = [st.get('rssi', 0) for s in samples for st in (s.get('health') or {}).get('stations') or []]
    rssi += [(s.get('health') or {}).get('rssiMin', 0) for s in samples if (s.get('health') or {}).get('rssiMin')]
    if rssi:
        weakest = min(rssi)
        level = 'ok' if weakest >= LIMITS['rssi_ok'] else 'warnung' if weakest >= LIMITS['rssi_weak'] else 'fehler'
        add('Signalstärke der Tablets', level, f'schwächster Wert {weakest} dBm', f"≥ {LIMITS['rssi_ok']} dBm",
            '' if level == 'ok' else 'Tablet näher ans Dial stellen; Metall/Gehäuse zwischen beiden vermeiden.')
    draw = max(((s.get('health') or {}).get('drawMaxMs', 0) for s in samples), default=0)
    if any('drawMaxMs' in (s.get('health') or {}) for s in samples):
        level = 'ok' if draw <= 40 else 'warnung' if draw <= 80 else 'fehler'
        add('Bild zeichnen (längstes)', level, f'{draw} ms', '≤ 40 ms',
            '' if level == 'ok' else 'Animationen ruckeln noch etwas – Wert an den Entwickler melden.')
    if any('frameGapMaxMs' in (s.get('health') or {}) for s in samples):
        gap = max(((s.get('health') or {}).get('frameGapMaxMs', 0) for s in samples), default=0)
        wait = max(((s.get('health') or {}).get('lockWaitMaxMs', 0) for s in samples), default=0)
        level = 'ok' if gap <= 80 else 'warnung' if gap <= 150 else 'fehler'
        add('Flüssige Animation (längste Pause)', level, f'{gap} ms (davon auf Sperre gewartet {wait} ms)', '≤ 80 ms',
            '' if level == 'ok' else 'Animationen stocken – Bericht an den Entwickler; Wartezeit zeigt, ob Tablet-Anfragen bremsen.')
    probes = h1.get('probeAnswers')
    if probes is not None:
        add('Internetprüfung der Tablets beantwortet', 'hinweis', f'{probes}×', '–',
            'Das Dial beantwortet die „Habe ich Internet?“-Prüfung, damit Tablets im WLAN bleiben.')
    ota = record.get('otatest')
    if ota:
        detail = (f"{ota.get('message', 'keine Antwort')} · läuft {ota.get('running', '?')}, Ziel {ota.get('target', '?')}"
                  f" ({int(ota.get('targetSize', 0)) // 1024} KB), {ota.get('ms', '?')} ms, Speicher "
                  f"{int(ota.get('minBlockBefore', 0)) // 1024} → {int(ota.get('minBlockAfter', 0)) // 1024} KB")
        add('Update-Speicher beschreibbar (Test, nichts installiert)', 'ok' if ota.get('ok') else 'fehler', detail,
            '64 KB geschrieben', '' if ota.get('ok') else
            'Updates können nicht geschrieben werden – diese Zeile an den Entwickler schicken.')
    missed = record.get('usb_missed', 0)
    if missed:
        add('USB-Antworten', 'warnung', f'{missed} ohne Antwort', '0',
            'Kabel prüfen; bei vielen Aussetzern war das Dial beschäftigt oder hat neu gestartet.')
    if any(s.get('wifiMode') == 'router' for s in samples):
        lost = sum(1 for s in samples if s.get('routerConnected') is False)
        add('Dial mit dem Router verbunden', 'ok' if lost == 0 else 'warnung', f'{lost} Messungen ohne Router', '0',
            '' if lost == 0 else 'Router-Strom, Abstand zum Dial und festen 2,4-GHz-Kanal prüfen.')
        if any(s.get('rescue') for s in samples):
            add('Rettungs-WLAN', 'warnung', 'eigenes WLAN des Dials war an', 'aus',
                'Das Dial hat den Router 30 s nicht gefunden. Router-Name und -Kennwort am Tablet prüfen.')
    else:
        clients = max((s.get('clients', 0) for s in samples), default=0)
        add('Tablets im Dial-WLAN', 'ok' if clients >= 1 else 'übersprungen', f'bis zu {clients}', '≥ 1',
            '' if clients else 'Für die WLAN-Werte Ampel- und Betreuungs-Tablet verbinden.')
    return checks


def report_md(record, checks):
    mark = {'ok': '✓', 'fehler': '✗', 'warnung': '!', 'übersprungen': '–', 'hinweis': 'i'}
    info = record.get('info') or {}
    bad = [c for c in checks if c['status'] == 'fehler']
    lines = [
        '# Prüfbericht Mensaampel-Dial',
        '',
        f"Erstellt: {record.get('started', '')} · Dauer: {record.get('minutes', 0)} Minuten · "
        f"Version {info.get('version', '?')} · Startgrund: {info.get('resetReason', '?')}",
        '',
        '**Ergebnis: ' + ('alles in Ordnung' if not bad else f'{len(bad)} Prüfung(en) nicht bestanden') + '**',
        '',
        '| | Prüfung | Wert | Grenze | Was tun |',
        '|---|---|---|---|---|',
    ]
    for c in checks:
        lines.append(f"| {mark.get(c['status'], '?')} | {c['name']} | {c['value']} | {c['limit']} | {c['todo']} |")
    found = record.get('pauses') or []
    if found:
        lines += ['', '## Pausen der Ampel', '', '| Uhrzeit | Dauer | Vermutliche Ursache |', '|---|---|---|']
        lines += [f"| {p['at']} | {p['seconds']} s | {p['cause']} |" for p in found]
    events = []
    for s in record.get('samples') or []:
        for e in s.get('wlanEvents') or []:
            key = (e.get('at'), e.get('joined'), e.get('mac'))
            if key not in events:
                events.append(key)
    if events:
        lines += ['', '## WLAN-Ereignisse (Sekunden seit Start des Dials)', '', '| Zeit | Ereignis | Gerät |',
                  '|---|---|---|']
        lines += [f"| {at} s | {'verbunden' if joined else 'getrennt'} | …{mac} |" for at, joined, mac in sorted(events)]
    log = record.get('log') or []
    lines += ['', '## Weitere USB-Meldungen des Dials', '']
    lines += [f'- {t} {text}' for t, text in log[-50:]] or ['- keine']
    lines += ['', 'Nicht geprüft (von Hand, siehe ANLEITUNG-DIAL.md „Abnahme am echten Gerät“): Karten vorhalten, '
              'Drehring, Taste, Stromausfall.', '']
    return '\n'.join(lines)


class Dial:
    def __init__(self, port):
        import serial  # pyserial
        self.s = serial.Serial()
        self.s.port = port
        self.s.baudrate = 115200
        self.s.timeout = 0.2
        # Do not toggle DTR/RTS on open: on the ESP32-S3 that may reset the Dial.
        self.s.dtr = False
        self.s.rts = False
        self.s.open()
        self.buffer = b''
        self.log = []

    def lines(self, until):
        while time.time() < until:
            data = self.s.read(4096)
            if data:
                self.buffer += data
            while b'\n' in self.buffer:
                line, self.buffer = self.buffer.split(b'\n', 1)
                yield line.decode('utf-8', 'replace').strip()
            if not data:
                time.sleep(0.02)

    def ask(self, command, timeout=4.0):
        # Leftovers of an earlier, late answer must not be taken for this one.
        self.buffer += self.s.read(self.s.in_waiting or 0)
        for line in self.lines(time.time()):
            self.note(line)
        self.s.write(f'@mensa {command}\n'.encode())
        self.s.flush()
        for line in self.lines(time.time() + timeout):
            reply = parse_reply(line, command)
            if reply is not None:
                return reply
            self.note(line)
        return None

    def note(self, line):
        before = line.split(REPLY, 1)[0].strip()
        if before:
            self.log.append((datetime.datetime.now().strftime('%H:%M:%S'), before))


def find_port():
    from serial.tools import list_ports
    ports = list(list_ports.comports())
    for p in ports:
        if p.vid == 0x303A:
            return p.device
    names = ', '.join(p.device for p in ports) or 'keine'
    raise SystemExit(f'Kein Dial gefunden (Anschlüsse: {names}). Mit --port COMx angeben.')


def run(port, minutes):
    dial = Dial(port)
    time.sleep(0.5)
    record = {'started': datetime.datetime.now().strftime('%d.%m.%Y %H:%M'), 'minutes': minutes, 'samples': [],
              'test_samples': [], 'usb_missed': 0}
    record['info'] = dial.ask('info') or dial.ask('info') or {}
    print(f"Dial: Version {record['info'].get('version', '?')}, Prüfung läuft {minutes} Minuten …")
    end = time.time() + minutes * 60
    test_at = time.time() + min(120, minutes * 60 / 3)
    test_state = 'wartet'
    while time.time() < end or test_state == 'läuft':
        h = dial.ask('health', 3.0)
        if h is None:
            record['usb_missed'] += 1
        else:
            h['t'] = round(time.time(), 1)
            record['samples'].append(h)
            if test_state == 'läuft':
                record['test_samples'].append(h)
                mt = h.get('memoryTest') or {}
                if not mt.get('running'):
                    record['memory'] = mt
                    test_state = 'fertig'
                    print('Dauertest:', mt.get('message'))
        if test_state == 'wartet' and time.time() >= test_at:
            r = dial.ask('memorytest') or {}
            test_state = 'läuft' if r.get('ok') else 'fertig'
            if not r.get('ok'):
                record['memory'] = {'ok': False, 'message': r.get('message', 'keine Antwort')}
            print('Dauertest gestartet' if r.get('ok') else f"Dauertest nicht gestartet: {r.get('message')}")
        if test_state == 'läuft' and time.time() > end + 120:
            record['memory'] = {'ok': False, 'message': 'Dauertest nach 2 Minuten nicht fertig'}
            break
        time.sleep(2)
    record['bench'] = dial.ask('bench', 15) or {}
    record['backup'] = dial.ask('backupcheck', 15) or {}
    # Write test of the free update area (0.25.3): writes 64 KB and discards them, installs nothing.
    record['otatest'] = dial.ask('otatest', 20) or {'ok': False, 'message': 'keine Antwort (Version vor 0.25.3?)'}
    record['log'] = dial.log
    return record


def save(record, checks):
    folder = os.path.join('pruefbericht', datetime.datetime.now().strftime('%Y-%m-%d_%H-%M'))
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, 'bericht.md'), 'w', encoding='utf-8') as f:
        f.write(report_md(record, checks))
    with open(os.path.join(folder, 'bericht.json'), 'w', encoding='utf-8') as f:
        json.dump({'record': record, 'checks': checks}, f, ensure_ascii=False, indent=1)
    return folder


def selftest():
    good = lambda t, **o: {'ok': True, 'uptime': 100000 + t * 2000, 'maxAllocHeap': 60000, 'ampelAgo': 1,
                           'clients': 2, 'readerHealthy': True, 'storageError': '', 'webMaxMs': 300,
                           'health': {'crash': False, 'readerFaults': 0, 'saveFailures': 0, 'minBlock': 52000},
                           **o}
    record = {'info': {'ok': True, 'version': '0.17.1-preview', 'resetReason': 'Einschalten'},
              'samples': [good(t) for t in range(10)], 'test_samples': [good(t) for t in range(3)],
              'memory': {'ok': True, 'message': 'Dauertest ok'}, 'bench': {'ok': True, 'statusMaxMs': 120},
              'backup': {'ok': True, 'cards': 112, 'bytes': 22000}, 'log': [],
              'otatest': {'ok': True, 'message': '64 KB geschrieben und verworfen', 'running': 'app0',
                          'target': 'app1', 'targetSize': 3145728, 'ms': 900, 'minBlockBefore': 90000,
                          'minBlockAfter': 90000}}
    checks = evaluate(record)
    assert not [c for c in checks if c['status'] != 'ok'], checks
    broken = dict(record, otatest={'ok': False, 'message': 'Flash Erase Failed'})
    assert [c for c in evaluate(broken) if c['name'].startswith('Update-Speicher') and c['status'] == 'fehler']
    # Problems are found: restart, small block, Ampel pause, old version, failed saves.
    bad = dict(record)
    bad['info'] = {'ok': True, 'version': '0.16.0-preview'}
    bad['samples'] = record['samples'][:5] + [good(0, maxAllocHeap=20000, ampelAgo=7,
                                                   health={'saveFailures': 2, 'minBlock': 20000})]
    names = {c['name'] for c in evaluate(bad) if c['status'] == 'fehler'}
    for n in ['Firmware-Version', 'Keine Neustarts', 'Größter freier Speicherblock', 'Ampel wird bedient',
              'Speichern']:
        assert n in names, (n, names)
    # Without an Ampel tablet the check is skipped, not failed.
    none = dict(record)
    none['samples'] = [good(t, ampelAgo=-1) for t in range(3)]
    status = {c['name']: c['status'] for c in evaluate(none)}
    assert status['Ampel wird bedient'] == 'übersprungen', status
    text = report_md(record, checks)
    assert 'alles in Ordnung' in text and '| ✓ |' in text
    # A log line without its line end in front of an answer; answers to other commands are not taken.
    glued = '[322372][E][WebServer.cpp:638] _handleRequest(): request handler' + REPLY + '{"ok": true, "cmd": "info"}'
    assert parse_reply(glued, 'info') == {'ok': True, 'cmd': 'info'}
    assert parse_reply(REPLY + '{"ok": true, "cmd": "memorytest"}', 'health') is None
    assert parse_reply(REPLY + '{"ok": true}', 'health') == {'ok': True}, 'Firmware ohne cmd'
    assert parse_reply('Neustart nach Fehler', 'health') is None
    # A foreign answer among the samples is not taken for a restart or a 0 KB block.
    mixed = dict(record)
    mixed['samples'] = record['samples'][:3] + [{'ok': True, 'message': 'Dauertest läuft'}] + record['samples'][3:]
    status = {c['name']: c['status'] for c in evaluate(mixed)}
    assert status['Keine Neustarts'] == 'ok' and status['Größter freier Speicherblock'] == 'ok', status
    # Pauses and their causes.
    def at(t, ago, clients=2, drops=0, aborts=0):
        return dict(good(t), ampelAgo=ago, clients=clients, t=1000 + t * 2,
                    health={'crash': False, 'readerFaults': 0, 'saveFailures': 0, 'minBlock': 52000,
                            'wlanDrops': drops, 'sendAborts': aborts, 'sendMaxMs': 200})
    seq = [at(0, 0), at(1, 4), at(2, 6), at(3, 0), at(4, 5, clients=0, drops=1), at(5, 0, drops=1),
           at(6, 0, drops=1), at(7, 7, drops=1, aborts=1), at(8, 0, drops=1, aborts=1)]
    found = pauses(seq)
    assert [p['cause'][:5] for p in found] == ['Table', 'Table', 'Dial '], found
    assert 'nicht gefragt' in found[0]['cause'] and 'WLAN' in found[1]['cause']
    rec = dict(record)
    rec['samples'] = seq
    checks = evaluate(rec)
    assert '## Pausen der Ampel' in report_md(rec, checks)
    # Router mode: a pause without router connection names the router; the rescue WLAN is a warning.
    rseq = [dict(at(0, 0), wifiMode='router', routerConnected=True),
            dict(at(1, 6, drops=1), wifiMode='router', routerConnected=False, clients=0),
            dict(at(2, 0, drops=1), wifiMode='router', routerConnected=True, rescue=True)]
    assert 'Router' in pauses(rseq)[0]['cause'], pauses(rseq)
    rec = dict(record)
    rec['samples'] = rseq
    status = {c['name']: c['status'] for c in evaluate(rec)}
    assert status['Dial mit dem Router verbunden'] == 'warnung' and status['Rettungs-WLAN'] == 'warnung', status
    assert 'Tablets im Dial-WLAN' not in status
    smooth = dict(record)
    smooth['samples'] = [dict(good(0), health={'minBlock': 52000, 'frameGapMaxMs': 40, 'lockWaitMaxMs': 2}),
                         dict(good(1), health={'minBlock': 52000, 'frameGapMaxMs': 170, 'lockWaitMaxMs': 120})]
    status = {c['name']: c['status'] for c in evaluate(smooth)}
    assert status['Flüssige Animation (längste Pause)'] == 'fehler', status
    # Unclear card reads are a hint, not a reader fault.
    soft = dict(record)
    soft['samples'] = [good(0), good(1, health={'readerFaults': 0, 'unclearReads': 2, 'minBlock': 52000})]
    status = {c['name']: c['status'] for c in evaluate(soft)}
    assert status['Kartenleser'] == 'ok' and status['Karten unklar gelesen'] == 'hinweis', status
    # Signal strength and WLAN events.
    sig = dict(record)
    st = lambda rssi: {'crash': False, 'readerFaults': 0, 'saveFailures': 0, 'minBlock': 52000, 'probeAnswers': 4,
                       'stations': [{'mac': 'AA:BB:CC', 'rssi': rssi}]}
    sig['samples'] = [dict(good(0), health=st(-55), wlanEvents=[{'at': 10, 'joined': True, 'mac': 'AA:BB:CC'}]),
                      dict(good(1), health=st(-83), wlanEvents=[{'at': 10, 'joined': True, 'mac': 'AA:BB:CC'},
                                                               {'at': 70, 'joined': False, 'mac': 'AA:BB:CC'}])]
    checks = evaluate(sig)
    status = {c['name']: c['status'] for c in checks}
    assert status['Signalstärke der Tablets'] == 'fehler', status
    assert status['Internetprüfung der Tablets beantwortet'] == 'hinweis'
    text = report_md(sig, checks)
    assert '## WLAN-Ereignisse' in text and '| 70 s | getrennt | …AA:BB:CC |' in text
    drop = [dict(good(0), ampelAgo=0, t=1000, health=dict(st(-50), wlanDrops=0)),
            dict(good(1), ampelAgo=6, t=1002, health=dict(st(-50), wlanDrops=1)),
            dict(good(2), ampelAgo=0, t=1004, health=dict(st(-50), wlanDrops=1))]
    assert 'Signal gut war' in pauses(drop)[0]['cause']
    slow = dict(record)
    slow['samples'] = [dict(good(0), health={'minBlock': 52000, 'drawMaxMs': 30}),
                       dict(good(1), health={'minBlock': 52000, 'drawMaxMs': 95})]
    assert {c['name']: c['status'] for c in evaluate(slow)}['Bild zeichnen (längstes)'] == 'fehler'
    print('Selbsttest ok')


def main():
    ap = argparse.ArgumentParser(description='Geräteprüfung über USB (siehe PRUEFUNG-AM-PC.md)')
    ap.add_argument('--port', help='z. B. COM5 (sonst automatisch)')
    ap.add_argument('--minuten', type=float, default=10)
    ap.add_argument('--selbsttest', action='store_true', help='nur die Auswertung prüfen, ohne Gerät')
    args = ap.parse_args()
    if args.selbsttest:
        return selftest()
    try:
        import serial  # noqa: F401
    except ImportError:
        raise SystemExit('pyserial fehlt: python -m pip install pyserial')
    record = run(args.port or find_port(), args.minuten)
    checks = evaluate(record)
    folder = save(record, checks)
    print(report_md(record, checks))
    print(f'\nBericht gespeichert in {folder}')
    sys.exit(1 if any(c['status'] == 'fehler' for c in checks) else 0)


if __name__ == '__main__':
    main()

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
LIMITS = {'block_kb': 32, 'ampel_s': 3, 'bench_ms': 1500, 'web_ms': 1500}


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
    first, last = samples[0], samples[-1]
    restarts = sum(1 for a, b in zip(samples, samples[1:]) if b.get('uptime', 0) < a.get('uptime', 0))
    add('Keine Neustarts', 'ok' if restarts == 0 else 'fehler', f'{restarts} Neustart(s)', '0',
        'Neustart während der Prüfung: Uhrzeit und USB-Meldungen unten notieren und melden.' if restarts else '')
    crash = bool((last.get('health') or {}).get('crash'))
    add('Letzter Start ohne Absturz', 'warnung' if crash else 'ok', 'Absturz' if crash else 'normal', 'normal',
        'Das Dial ist vor dieser Prüfung einmal abgestürzt (Startgrund unter Gerät). Melden.' if crash else '')
    blocks = [s.get('maxAllocHeap', 0) for s in samples] + [(s.get('health') or {}).get('minBlock', 10 ** 9)
                                                            for s in samples]
    blocks += [s.get('maxAllocHeap', 0) for s in record.get('test_samples') or []]
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
        add('Ampel wird bedient', 'ok' if worst <= LIMITS['ampel_s'] else 'fehler', f'längste Pause {worst} s',
            f"≤ {LIMITS['ampel_s']} s", 'Ampel-Tablet: Ladekabel, Ruhezustand aus, näher ans Dial.'
            if worst > LIMITS['ampel_s'] else '')
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
    unhealthy = sum(1 for s in samples if not s.get('readerHealthy', True))
    add('Kartenleser', 'ok' if faults == 0 and unhealthy == 0 else 'warnung',
        f'{faults} Störung(en), {unhealthy} Messung(en) ohne Leser', '0',
        'Stecker der RFID-Unit prüfen.' if faults or unhealthy else '')
    fails = h1.get('saveFailures', 0) - h0.get('saveFailures', 0)
    errors = sorted({s.get('storageError') for s in samples if s.get('storageError')})
    add('Speichern', 'ok' if fails == 0 and not errors else 'fehler',
        f"{fails} Fehler" + (f" ({'; '.join(errors)})" if errors else ''), '0',
        'Sicherung herunterladen, Meldung an den Entwickler.' if fails or errors else '')
    web = last.get('webMaxMs', 0)
    add('Längste Antwort ans Tablet', 'ok' if web <= LIMITS['web_ms'] else 'warnung', f'{web} ms',
        f"≤ {LIMITS['web_ms']} ms", 'Nur ein Browserfenster mit der Betreuung offen lassen.'
        if web > LIMITS['web_ms'] else '')
    missed = record.get('usb_missed', 0)
    if missed:
        add('USB-Antworten', 'warnung', f'{missed} ohne Antwort', '0',
            'Kabel prüfen; bei vielen Aussetzern war das Dial beschäftigt oder hat neu gestartet.')
    clients = max((s.get('clients', 0) for s in samples), default=0)
    add('Tablets im Dial-WLAN', 'ok' if clients >= 1 else 'übersprungen', f'bis zu {clients}', '≥ 1',
        '' if clients else 'Für die WLAN-Werte Ampel- und Betreuungs-Tablet verbinden.')
    return checks


def report_md(record, checks):
    mark = {'ok': '✓', 'fehler': '✗', 'warnung': '!', 'übersprungen': '–'}
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
        self.s.write(f'@mensa {command}\n'.encode())
        self.s.flush()
        for line in self.lines(time.time() + timeout):
            if line.startswith('@mensa-reply '):
                try:
                    return json.loads(line[len('@mensa-reply '):])
                except ValueError:
                    return None
            if line:
                self.log.append((datetime.datetime.now().strftime('%H:%M:%S'), line))
        return None


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
              'backup': {'ok': True, 'cards': 112, 'bytes': 22000}, 'log': []}
    checks = evaluate(record)
    assert not [c for c in checks if c['status'] != 'ok'], checks
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

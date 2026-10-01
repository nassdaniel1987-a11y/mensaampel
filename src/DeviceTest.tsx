import { useState } from 'react';
import { ClipboardCheck, Download } from 'lucide-react';
import type { State, Send } from './types';
// Guided hardware acceptance: test mode on the Dial plus a checklist kept in this browser (per tablet) and exportable.
const checks = [
  ['Erstinstallation und Tablet-Einrichtung', 'Display und Oberfläche erreichbar'],
  ['Leser automatisch: RFID2 an- und abstecken (stromlos)', 'Aktiver Leser wechselt, keine Störung'],
  ['Karte vorhalten', 'Kennung erscheint, Lesungen zählen stabil hoch'],
  ['Karte mindestens 20 s vorhalten', 'Keine zweite Buchung (im Normalbetrieb prüfen)'],
  ['Taste kurz / 3 s', 'Anzeige „Taste: kurz“ bzw. „3 s“'],
  ['Drehring eine Raste', 'Ring-Zähler ändert sich um genau 1, Richtung sinnvoll'],
  ['Fläche ENTLASTEN antippen', 'Touch wird mit Position angezeigt'],
  ['Lesbarkeit aus 1–2 m', 'Farbe und große Schrift erkennbar, kein Flackern'],
  ['Ampel-Tablet ausschalten', 'Nach 10 s „Ampel draußen getrennt!“ am Dial'],
  ['Strom nach Buchung trennen', 'Belegung bleibt, Bestand muss bestätigt werden'],
  ['Uhr nach Stromlosigkeit', 'Uhrzeit bleibt oder wird beim Öffnen der Betreuung nachgestellt'],
  ['Ein kompletter Mittag als Probelauf', 'WLAN, Scans, Stromversorgung und Speicher stabil'],
] as const;
type Result = { status: '' | 'ok' | 'nok'; note: string };
const load = (): Record<number, Result> => {
  try {
    return JSON.parse(localStorage.getItem('mensa-geraetetest') || '{}');
  } catch {
    return {};
  }
};
export function DeviceTest({ state: s, send, disabled }: { state: State; send: Send; disabled: boolean }) {
  const [results, setResults] = useState(load);
  const update = (i: number, r: Partial<Result>) => {
    const next = { ...results, [i]: { ...{ status: '' as const, note: '' }, ...results[i], ...r } };
    setResults(next);
    try {
      localStorage.setItem('mensa-geraetetest', JSON.stringify(next));
    } catch {
      /* per-tablet convenience only */
    }
  };
  const csv = () => {
    const rows = [
      'Prüfung;Erwartung;Ergebnis;Notiz',
      ...checks.map(([a, b], i) =>
        [
          a,
          b,
          results[i]?.status === 'ok' ? 'ok' : results[i]?.status === 'nok' ? 'nicht ok' : '',
          (results[i]?.note || '').replace(/;/g, ','),
        ].join(';'),
      ),
    ];
    const url = URL.createObjectURL(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Mensaampel-Geraetetest.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const done = checks.filter((_, i) => results[i]?.status).length;
  return (
    <section className="flow-section device-test">
      <div className="section-heading">
        <h2>
          <ClipboardCheck size={20} /> Gerätetest
        </h2>
        <button
          className={s.testMode ? '' : 'outline'}
          disabled={disabled}
          onClick={() => send({ type: 'deviceTest', on: !s.testMode })}
        >
          {s.testMode ? 'Gerätetest beenden' : 'Gerätetest starten'}
        </button>
        {s.device && (
          <button
            className="outline"
            disabled={disabled || !!s.device.memoryTest?.running}
            onClick={() => send({ type: 'memoryTest' })}
          >
            {s.device.memoryTest?.running ? 'Dauertest läuft …' : 'Speicher-Dauertest'}
          </button>
        )}
      </div>
      {s.device?.memoryTest?.message && (
        <p className={`banner ${s.device.memoryTest.running ? '' : s.device.memoryTest.ok ? 'success' : 'error'}`}>
          {s.device.memoryTest.message}
        </p>
      )}
      <p>
        Im Gerätetest zeigt das Dial Leser, Kartenkennung, Lesungen, Drehring, Taste, Touch, verbundene Tablets,
        Speicher und Uhr. <strong>Scans buchen dabei nicht.</strong>
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Prüfung</th>
              <th>Erwartung</th>
              <th>Ergebnis</th>
              <th>Notiz</th>
            </tr>
          </thead>
          <tbody>
            {checks.map(([a, b], i) => (
              <tr key={a}>
                <td>{a}</td>
                <td>{b}</td>
                <td className="test-result">
                  <button
                    className={results[i]?.status === 'ok' ? '' : 'outline'}
                    onClick={() => update(i, { status: results[i]?.status === 'ok' ? '' : 'ok' })}
                  >
                    ok
                  </button>
                  <button
                    className={results[i]?.status === 'nok' ? 'danger' : 'outline'}
                    onClick={() => update(i, { status: results[i]?.status === 'nok' ? '' : 'nok' })}
                  >
                    nicht ok
                  </button>
                </td>
                <td>
                  <input
                    aria-label={`Notiz zu ${a}`}
                    value={results[i]?.note || ''}
                    onChange={e => update(i, { note: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="action-row">
        <span>
          {done} von {checks.length} geprüft · gespeichert auf diesem Tablet
        </span>
        <button className="outline" onClick={csv}>
          <Download size={18} /> Ergebnis als CSV
        </button>
      </div>
    </section>
  );
}

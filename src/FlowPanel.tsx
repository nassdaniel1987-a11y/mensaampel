import { useState } from 'react';
import { DayCharts } from './Charts';
import type { State, Send, FlowState } from './types';
const queues = ['Keine Schlange', 'Kurze Schlange', 'Lange Schlange'],
  days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const duration = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')} min`;
export function FlowPanel({
  state: s,
  send,
  busy,
  connected,
}: {
  state: State;
  send: Send;
  busy: boolean;
  connected: boolean;
}) {
  const f = (s as State & { flow?: FlowState }).flow;
  const [scope, setScope] = useState('all'),
    [confirmDelete, setConfirmDelete] = useState(false),
    [confirmReset, setConfirmReset] = useState(false);
  if (!f) return <p>Bitte den Dienst beziehungsweise die Gerätesoftware aktualisieren.</p>;
  const disabled = busy || !connected,
    active = f.armed || f.started >= 0;
  const sampleCard = s.cards.find(c => c.uid === f.measuringUid)?.label;
  const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`,
    reportCsv = () => {
      const rows = [
        'Essenstag;Wochentag;Ausgaben;Rueckgaben;Gruppen;AutomatischFrei;FrueherFrei;ZuVoll;Entlastungen;ErsteAusgabe;LetzteAusgabe;NichtZurueck;SekundenProKind;HoechsteBelegung;MensaSpitze',
        ...[...f.history, f.today].map(d =>
          [
            d[0],
            d[1] >= 0 ? days[d[1]] : '',
            d[2],
            d[3],
            d[4],
            d[5],
            d[6],
            d[7],
            d[8],
            d[9] >= 0 ? clock(d[9]) : '',
            d[10] >= 0 ? clock(d[10]) : '',
            d[11] >= 0 ? d[11] : '',
            d[12] > 0 ? (d[12] / 10).toFixed(1).replace('.', ',') : '',
            (d[13] ?? -1) >= 0 ? d[13] : '',
            (d[14] ?? -1) >= 0 ? d[14] : '',
          ].join(';'),
        ),
      ];
      const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Mensa-Tagesberichte.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  const a = f.auto,
    secs = (tenths: number) => `${(tenths / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s`,
    slotTime = (slot: number) =>
      `${Math.floor(slot / 2)}:${slot % 2 ? '30' : '00'}–${Math.floor((slot + 1) / 2)}:${slot % 2 ? '00' : '30'}`;
  const slots = [...f.autoSlots].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const learnCsv = () => {
    const rows = [
      'Wochentag;Zeitfenster;SekundenProKind;Beobachtungen;Gruppengroesse',
      `Startgruppe;;;;${a.startTarget}`,
      `Alle;Alle;${(f.autoGlobal / 10).toFixed(1).replace('.', ',')};${f.autoGlobalN};${f.sizeGlobal || ''}`,
      ...slots.map(x =>
        [days[x[0]], slotTime(x[1]), (x[2] / 10).toFixed(1).replace('.', ','), x[3], x[4] || ''].join(';'),
      ),
    ];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Mensa-Automatik.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const records = f.samples.filter(x => scope === 'all' || x[2] === f.weekday);
  const csv = () => {
    const rows = [
      'Messung;Schlange;Wochentag;Uhrzeit;Kinder;Sekunden',
      ...f.samples.map(x =>
        [
          x[0] ? 'Gruppe' : 'Einzelkind',
          queues[x[1]],
          days[x[2]],
          `${Math.floor(x[3] / 60)}:${String(x[3] % 60).padStart(2, '0')}`,
          x[4],
          x[5],
        ].join(';'),
      ),
    ];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Mensa-Messungen.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <div className="intro">
        <div>
          <h1>Einlass und Messungen</h1>
          <p>Kleine Gruppen einlassen, Abläufe messen und Erfahrungen vergleichen.</p>
        </div>
      </div>
      <div className="flow-grid">
        <section className="flow-section">
          <h2>Automatik</h2>
          <p>
            Nach einer vollen Gruppe öffnet die Ampel nach der gelernten Zeit von selbst. Die Person in der Mensa greift
            nur am Dial ein: <strong>orange Fläche</strong> = zu voll, <strong>Taste</strong> im Countdown = Ausgabe
            schon frei. Beides lernt das System.
          </p>
          <p className="auto-status" role="status">
            {!a.on
              ? 'Automatik aus'
              : f.waiting && a.releaseIn >= 0
                ? `Nächste Gruppe in ${duration(a.releaseIn)}`
                : f.waiting
                  ? 'Gruppe voll · wartet auf Freigabebedingungen'
                  : f.issued === 0 && f.batch
                    ? `${a.nextIsStart ? 'Startgruppe' : 'Nächste Gruppe'}: ${a.nextSize} Kinder`
                    : `${a.nextIsStart ? 'Startgruppe' : 'Gruppe'} läuft · ${f.issued} von ${a.nextSize}`}
          </p>
          <p>
            Aktuell {secs(a.perChild)} pro Kind · Startgruppe {a.startTarget} Kinder{f.startLearned ? ' (gelernt)' : ''}{' '}
            · normale Gruppe {a.normalSize} Kinder (erlaubt {a.sizeLow}–{a.sizeHigh}) · Takt{' '}
            {duration(Math.round((a.normalSize * a.perChild) / 10))}. Grundlage:{' '}
            {a.level === 'slot'
              ? 'passender Wochentag und halbe Stunde'
              : a.level === 'global'
                ? `alle bisherigen Beobachtungen (${a.observations})`
                : 'Startwert, noch nichts gelernt'}
            .
          </p>
          <p className="hint">
            Heute: {a.faster} × früher freigegeben (Taste), {a.slower} × zu voll (Entlasten nach automatischer
            Freigabe).
          </p>
          <form
            key={`${a.on}-${a.start}-${f.startSize}-${f.sizeMin}-${f.sizeMax}-${f.idleMinutes}-${f.dayStart}`}
            onSubmit={e => {
              e.preventDefault();
              const d = new FormData(e.currentTarget),
                day = String(d.get('dayStart') || '');
              void send({
                type: 'autoSettings',
                on: d.get('on') === 'on',
                start: Number(d.get('start')),
                startGroup: Number(d.get('startGroup')),
                sizeMin: Number(d.get('sizeMin')),
                sizeMax: Number(d.get('sizeMax')),
                idleMinutes: Number(d.get('idleMinutes')),
                dayStart:
                  d.get('dayAuto') === 'on' && day ? Number(day.slice(0, 2)) * 60 + Number(day.slice(3, 5)) : -1,
              });
            }}
          >
            <label className="checkbox">
              <input type="checkbox" name="on" defaultChecked={a.on} disabled={!f.batch && !a.on} /> Automatische
              Gruppenfreigabe
            </label>
            <label>
              Startwert in Sekunden pro Kind (solange noch nichts gelernt ist)
              <input type="number" name="start" min="3" max="180" required defaultValue={Math.round(a.start / 10)} />
            </label>
            <label>
              Startgruppe: Kinder zum Aufbau der Schlange · 0 = doppelte Gruppengröße
              <input type="number" name="startGroup" min="0" max="48" required defaultValue={f.startSize} />
            </label>
            <label>
              Kleinste normale Gruppe · 0 = Gruppengröße
              <input type="number" name="sizeMin" min="0" max="48" required defaultValue={f.sizeMin} />
            </label>
            <label>
              Größte normale Gruppe · 0 = Gruppengröße
              <input type="number" name="sizeMax" min="0" max="48" required defaultValue={f.sizeMax} />
            </label>
            <label>
              Wieder Startgruppe nach so vielen Minuten ohne Einlass
              <input type="number" name="idleMinutes" min="1" max="120" required defaultValue={f.idleMinutes} />
            </label>
            <label className="checkbox">
              <input type="checkbox" name="dayAuto" defaultChecked={f.dayStart >= 0} /> Neuer Essenstag automatisch um
            </label>
            <input
              type="time"
              name="dayStart"
              aria-label="Uhrzeit für den neuen Essenstag"
              defaultValue={
                f.dayStart >= 0
                  ? `${String(Math.floor(f.dayStart / 60)).padStart(2, '0')}:${String(f.dayStart % 60).padStart(2, '0')}`
                  : '06:00'
              }
            />
            <button disabled={disabled}>Automatik speichern</button>
          </form>
          <p className="hint">
            Die Startgruppe baut an der Ausgabe eine Schlange auf – zu Beginn des Essenstags und nach einer längeren
            Pause. Danach kommt jede Gruppe im Takt „Gruppengröße × Sekunden pro Kind“. Taste im Countdown = Gruppen
            dürfen größer werden, orange Fläche = kleiner (nur zwischen kleinster und größter Gruppe). Der automatische
            Essenstag setzt Belegungen zurück und sperrt die Mensa; nach einem Neustart muss der Bestand trotzdem
            bestätigt werden (am Dial: Taste 3 s halten).
          </p>
          {!f.batch && <p className="hint">Zuerst unten eine Gruppengröße festlegen.</p>}
          <p className="hint">
            Einlernphase: Eine zweite Person misst anfangs Gruppen („Gruppe messen“ → „Alle haben Essen“). Jede
            Gruppenmessung fließt direkt ein. Später lernt das System aus den Eingriffen am Dial und wird ohne
            Beschwerde langsam etwas schneller. Keine Freigabe bei Pause, Entlastung, laufender Gruppenmessung,
            fehlenden Plätzen oder unbestätigtem Bestand.
          </p>
          <div className="action-row">
            {confirmReset ? (
              <>
                <span>Alles Gelernte löschen?</span>
                <button
                  disabled={disabled}
                  onClick={async () => {
                    if (await send({ type: 'autoSettings', on: a.on, start: Math.round(a.start / 10), reset: true }))
                      setConfirmReset(false);
                  }}
                >
                  Ja, zurücksetzen
                </button>
                <button className="outline" onClick={() => setConfirmReset(false)}>
                  Abbrechen
                </button>
              </>
            ) : (
              <button className="quiet" disabled={disabled} onClick={() => setConfirmReset(true)}>
                Gelerntes zurücksetzen
              </button>
            )}
          </div>
        </section>
        <section className="flow-section">
          <h2>Ampel und Gruppengröße</h2>
          <form
            key={`${f.yellow}-${f.batch}`}
            onSubmit={e => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void send({ type: 'flowSettings', yellow: Number(d.get('yellow')), batch: Number(d.get('batch')) });
            }}
          >
            <label>
              Gelb bei höchstens so vielen freien Plätzen
              <input name="yellow" type="number" min="0" max="256" required defaultValue={f.yellow} />
            </label>
            <label>
              Kinder pro Einlassgruppe · 0 = ohne Begrenzung
              <input name="batch" type="number" min="0" max="48" required defaultValue={f.batch} />
            </label>
            <p className="hint">
              Gelb lässt weitere Ausgaben zu. Eine volle Einlassgruppe schaltet auf Rot; Rückgaben bleiben möglich.
              Änderungen der Gruppengröße pausieren den Einlass.
            </p>
            <button disabled={disabled}>Einstellungen speichern</button>
          </form>
          <p className="flow-status">
            {f.batch
              ? `${f.issued} von ${f.batch} Karten in dieser Gruppe ausgegeben.`
              : 'Gruppenbegrenzung ausgeschaltet.'}
          </p>
          <button disabled={disabled} onClick={() => send({ type: 'pause', paused: !s.paused })}>
            {s.paused ? (f.waiting ? 'Nächste Gruppe freigeben' : 'Einlass fortsetzen') : 'Einlass pausieren'}
          </button>
          <button className="outline" disabled={disabled || f.relief} onClick={() => send({ type: 'relief' })}>
            {f.relief ? 'Ausgabe wird entlastet · Einlass gesperrt' : 'Ausgabe entlasten'}
          </button>
          <p className="hint">
            Dieselbe Pausenfunktion steht am Dial per kurzem Tastendruck bereit. Freigabe nur bei ausreichenden Plätzen
            und betriebsbereitem System.
          </p>
        </section>
        <section className="flow-section">
          <h2>Situation an der Ausgabe</h2>
          <p>Die Schlangenlänge wird von euch beobachtet. Legt gemeinsam fest, was „kurz“ und „lang“ bedeutet.</p>
          <label>
            Aktuelle Schlange
            <select
              disabled={disabled || active}
              value={f.queue}
              onChange={e => send({ type: 'queueState', queue: Number(e.target.value) })}
            >
              {queues.map((q, i) => (
                <option key={q} value={i}>
                  {q}
                </option>
              ))}
            </select>
          </label>
          <button
            className="outline"
            disabled={disabled || active}
            onClick={() => {
              const t = new Date();
              void send({
                type: 'measurementContext',
                weekday: t.getDay(),
                minute: t.getHours() * 60 + t.getMinutes(),
                queue: f.queue,
                date: [t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds()],
              });
            }}
          >
            Uhrzeit vom Tablet übernehmen
          </button>
          <p className="hint">
            {f.clockValid
              ? `${days[f.weekday]} · ${Math.floor(f.currentMinute / 60)}:${String(f.currentMinute % 60).padStart(2, '0')} Uhr`
              : s.device
                ? 'Das Dial übernimmt die Uhrzeit aus seiner eingebauten Uhr, sobald sie einmal vom Tablet gestellt wurde.'
                : 'Die PC-Version übernimmt die Uhrzeit automatisch.'}
          </p>
          <p className="hint">
            Die aktuelle Schlangensituation bleibt bis zu eurer nächsten Änderung gesetzt. Sie wird nicht aus
            Kartenscans geschätzt.
          </p>
        </section>
        <section className="flow-section">
          <h2>Vom Einlass bis zum Essen</h2>
          <p>
            Start ist die nächste erfolgreiche Kartenausgabe. Ende ist eure Bestätigung, dass das Essen erhalten wurde.
          </p>
          {!active ? (
            <div className="action-row">
              <button disabled={disabled || !f.clockValid} onClick={() => send({ type: 'measurementArm', kind: 0 })}>
                Einzelkind messen
              </button>
              <button
                className="outline"
                disabled={disabled || !f.clockValid}
                onClick={() => send({ type: 'measurementArm', kind: 1 })}
              >
                Gruppe messen
              </button>
            </div>
          ) : (
            <div className="measurement-live" role="status">
              <strong>
                {f.armed
                  ? 'Warte auf die nächste Kartenausgabe'
                  : `${f.kind ? 'Gruppe' : sampleCard || 'Einzelkind'} · ${duration(f.elapsedSeconds)}`}
              </strong>
              <p>
                {f.kind
                  ? `${f.measureSize} Kinder erfasst. Bestätigen, sobald das letzte Kind sein Essen hat. Vorher den Gruppeneinlass beenden.`
                  : 'Die Karte nur zur Beobachtung zuordnen. Der Rückgabescan beendet keine Zeitmessung.'}
              </p>
              <div className="action-row">
                <button
                  disabled={disabled || f.started < 0 || (f.kind === 1 && !s.paused)}
                  onClick={() => send({ type: 'measurementFinish' })}
                >
                  {f.kind ? 'Alle haben Essen' : 'Essen erhalten'}
                </button>
                <button className="outline" disabled={disabled} onClick={() => send({ type: 'measurementCancel' })}>
                  Messung verwerfen
                </button>
              </div>
            </div>
          )}
          <p className="hint">
            Es läuft jeweils eine Messung. Neustart, Tageswechsel oder Buchungskorrektur verwerfen eine laufende
            Messung. Abgeschlossene Messungen enthalten keine Kartenkennung. Nach 120 Messungen ersetzt die nächste den
            ältesten Wert.
          </p>
        </section>
        <section className="flow-section">
          <h2>Vergleichswerte für diese Gruppe</h2>
          {f.estimate.count >= 3 ? (
            <>
              <p className="estimate-level">
                {f.estimate.level === 'matched'
                  ? 'Passend zu Uhrzeit und Wochentag'
                  : 'Grobe Orientierung · andere Zeiten einbezogen'}
              </p>
              <strong>{`Vergleichbare Gruppen: im Mittel ${duration(f.estimate.seconds)}`}</strong>
              <p>
                {f.estimate.count} Messungen · zwischen {duration(f.estimate.min)} und {duration(f.estimate.max)}.
              </p>
            </>
          ) : (
            <p>
              Erst {f.estimate.count} passende Gruppenmessungen. Für eine zeitliche Orientierung benötigen wir
              mindestens drei.
            </p>
          )}
          <p className="hint">
            Ab drei Messungen mit gleicher Gruppengröße und Schlangensituation gibt es eine grobe Orientierung über alle
            Tage und Uhrzeiten. Liegen mindestens drei zusätzlich zum Wochentag und 15-Minuten-Zeitfenster passende
            Messungen vor, verwenden wir diese. Entscheidend ist die Schlange beim ersten Einlass der Gruppe. Der
            Hinweis ist keine Freigabe.
          </p>
          <p>
            <strong>Öffnung:</strong>{' '}
            {a.on
              ? 'Die Automatik gibt volle Gruppen nach der gelernten Zeit frei (siehe oben).'
              : 'Ohne Automatik endet eine Pause ausschließlich durch eure Bedienung.'}{' '}
            Die Software erkennt keine Warteschlange.
          </p>
        </section>
        <section className="flow-section">
          <h2>Erprobung der Freigabe</h2>
          <p>
            Wir prüfen Vorschläge, bevor eine spätere Automatik infrage kommt. Eine Rückmeldung öffnet den Einlass
            nicht.
          </p>
          <form
            key={f.trialBuffer}
            onSubmit={e => {
              e.preventDefault();
              void send({ type: 'trialSettings', buffer: Number(new FormData(e.currentTarget).get('buffer')) });
            }}
          >
            <label>
              Zeitpuffer in Sekunden
              <input type="number" name="buffer" min="0" max="300" required defaultValue={f.trialBuffer} />
            </label>
            <button disabled={disabled || f.issued > 0}>Puffer speichern</button>
          </form>
          <p className="hint">
            Vor einer neuen Gruppe einstellbar. Vorschlag: längste passende gemessene Gruppenzeit plus Puffer;
            frühestens denselben Puffer nach dem letzten Einlassscan. Der Zeitpunkt wird beim letzten Scan der Gruppe
            festgelegt.
          </p>
          {f.trialDelay > 0 ? (
            <div className="measurement-live">
              <strong>
                {f.trialReviewed
                  ? 'Rückmeldung für diese Gruppe gespeichert'
                  : f.trialDue
                    ? 'Nächste Gruppe wäre jetzt möglich – passt das vor Ort?'
                    : `Prüfvorschlag in ${duration(f.trialRemaining)}`}
              </strong>
              <p>
                {f.trialCount} Vergleichsmessungen ·{' '}
                {f.trialLevel === 2 ? 'passend zu Tag und Uhrzeit' : 'grobe Orientierung'} · Vorschlag{' '}
                {duration(f.trialDelay)} nach dem ersten Einlass.
              </p>
              <div className="action-row">
                <button
                  disabled={disabled || !f.trialDue || s.signal.reason !== 'batch'}
                  onClick={() => send({ type: 'trialFeedback', fits: true })}
                >
                  Passt
                </button>
                <button
                  className="outline"
                  disabled={disabled || !f.trialDue || s.signal.reason !== 'batch'}
                  onClick={() => send({ type: 'trialFeedback', fits: false })}
                >
                  Noch zu voll
                </button>
              </div>
              <p className="hint">
                Bitte möglichst beim vorgeschlagenen Zeitpunkt bewerten; eine spätere Antwort wird mit ihrem
                tatsächlichen Zeitpunkt gespeichert. Nur eine Rückmeldung pro Gruppe. Bei manueller Pause, Entlastung
                oder Störung ist die Bewertung gesperrt. Zum Einlassen weiterhin ausdrücklich die nächste Gruppe
                freigeben.
              </p>
            </div>
          ) : (
            <p>
              Für den nächsten Prüfvorschlag: Gruppenbegrenzung aktivieren und mindestens drei passende Gruppenmessungen
              sammeln.
            </p>
          )}
          <p>
            <strong>{f.reviews.length} Rückmeldungen:</strong> {f.reviews.filter(r => r[6] === 1).length} × passt,{' '}
            {f.reviews.filter(r => r[6] === 0).length} × noch zu voll.
          </p>
          <p className="hint">
            Die letzten 120 Bewertungen bleiben gespeichert. Sie verändern den Vorschlag noch nicht automatisch und sind
            keine gemessenen Essenswartezeiten.
          </p>
          <button
            className="outline"
            disabled={!f.reviews.length}
            onClick={() => {
              const rows = [
                'Kinder;Schlange;Wochentag;Startminute;VorschlagSekunden;BewertetNachSekunden;Passt;Vergleichsmessungen;Genauigkeit',
                ...f.reviews.map(r => r.join(';')),
              ];
              const url = URL.createObjectURL(
                new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = 'Mensa-Erprobung.csv';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Rückmeldungen als CSV sichern
          </button>
        </section>
      </div>
      <section className="flow-section flow-results">
        <div className="section-heading">
          <h2>Gemessene Zeiten</h2>
          <button className="outline" disabled={!f.samples.length} onClick={csv}>
            Messungen als CSV sichern
          </button>
        </div>
        <label>
          Vergleich
          <select value={scope} onChange={e => setScope(e.target.value)}>
            <option value="all">Alle Wochentage</option>
            <option value="day">Nur {days[f.weekday]}</option>
          </select>
        </label>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Messung</th>
                <th>Schlange</th>
                <th>Anzahl</th>
                <th>Durchschnitt</th>
                <th>Spanne</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1].flatMap(kind =>
                queues.map((q, queue) => {
                  const xs = records.filter(x => x[0] === kind && x[1] === queue),
                    times = xs.map(x => x[5]);
                  return (
                    <tr key={`${kind}-${queue}`}>
                      <td>{kind ? 'Gruppe' : 'Einzelkind'}</td>
                      <td>{q}</td>
                      <td>{xs.length}</td>
                      <td>
                        {times.length ? duration(Math.round(times.reduce((a, b) => a + b, 0) / times.length)) : '—'}
                      </td>
                      <td>
                        {times.length ? `${duration(Math.min(...times))} – ${duration(Math.max(...times))}` : '—'}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Diese Übersicht fasst Zeitfenster und Gruppengrößen zusammen. Für die Freigabe zählt die aktuelle Situation;
          der Zeithinweis oben verwendet nur passende Gruppen.
        </p>
        {f.samples.length > 0 && (
          <div className="action-row">
            {confirmDelete ? (
              <>
                <span>Letzte abgeschlossene Messung entfernen?</span>
                <button
                  disabled={disabled}
                  onClick={async () => {
                    if (await send({ type: 'measurementDeleteLast' })) setConfirmDelete(false);
                  }}
                >
                  Ja, letzte Messung löschen
                </button>
                <button className="outline" onClick={() => setConfirmDelete(false)}>
                  Abbrechen
                </button>
              </>
            ) : (
              <button className="quiet" onClick={() => setConfirmDelete(true)}>
                Letzte Messung korrigieren / löschen
              </button>
            )}
          </div>
        )}
      </section>
      <section className="flow-section flow-results">
        <div className="section-heading">
          <h2>Was die Automatik gelernt hat</h2>
          <button className="outline" disabled={!f.autoGlobalN} onClick={learnCsv}>
            Lernwerte als CSV sichern
          </button>
        </div>
        <div className="table-scroll">
          <table className="learn-table">
            <thead>
              <tr>
                <th>Wochentag</th>
                <th>Zeitfenster</th>
                <th>Sekunden pro Kind</th>
                <th>Beobachtungen</th>
                <th>Wird genutzt</th>
                <th>Gruppengröße</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Startgruppe</td>
                <td>Beginn / nach Pause</td>
                <td>—</td>
                <td>—</td>
                <td>{f.startLearned ? 'gelernt' : 'Einstellung'}</td>
                <td>{a.startTarget}</td>
              </tr>
              <tr>
                <td>Alle</td>
                <td>Alle</td>
                <td>{f.autoGlobalN ? secs(f.autoGlobal) : '—'}</td>
                <td>{f.autoGlobalN}</td>
                <td>{f.autoGlobalN ? 'wenn kein passendes Zeitfenster' : 'noch nicht'}</td>
                <td>{f.sizeGlobal || '—'}</td>
              </tr>
              {slots.map(x => (
                <tr key={`${x[0]}-${x[1]}`}>
                  <td>{days[x[0]]}</td>
                  <td>{slotTime(x[1])}</td>
                  <td>{x[3] ? secs(x[2]) : '—'}</td>
                  <td>{x[3]}</td>
                  <td>{x[3] >= 3 ? 'ja' : `ab 3 (noch ${3 - x[3]})`}</td>
                  <td>{x[4] || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Gespeichert werden nur Zahlen je Wochentag und halber Stunde, keine Kartenkennungen. Ein Zeitfenster wird ab
          drei Beobachtungen bevorzugt.
        </p>
        <p className="hint">
          Verweildauer (wie lange ein Kind seine Karte behält):{' '}
          {(f.stayN ?? 0) >= 5
            ? `ca. ${Math.round((f.stayAvg ?? 0) / 60)} Minuten, aus ${f.stayN} Rückgaben gelernt. Daraus zeigt die Ampel bei vollem Haus, wann vermutlich der nächste Platz frei wird.`
            : `noch zu wenig Rückgaben (${f.stayN ?? 0} von 5). Gelernt wird automatisch.`}
        </p>
      </section>
      <section className="flow-section flow-results">
        <div className="section-heading">
          <h2>Tagesbericht</h2>
          <button className="outline" onClick={reportCsv}>
            Tagesberichte als CSV sichern
          </button>
        </div>
        <DayCharts reports={[...f.history, f.today].slice(-30)} />
        <div className="table-scroll">
          <table className="learn-table">
            <thead>
              <tr>
                <th>Essenstag</th>
                <th>Ausgaben</th>
                <th>Rückgaben</th>
                <th>Gruppen</th>
                <th>Automatisch frei</th>
                <th>Früher frei</th>
                <th>Zu voll</th>
                <th>Entlastungen</th>
                <th>Erste – letzte Ausgabe</th>
                <th>Nicht zurück</th>
                <th>Höchste Belegung</th>
                <th>Mensa-Spitze</th>
              </tr>
            </thead>
            <tbody>
              {[f.today, ...[...f.history].reverse()].slice(0, 14).map((d, i) => (
                <tr key={`${d[0]}-${i}`}>
                  <td>
                    {i === 0 ? 'Heute' : `Tag ${d[0]}`}
                    {d[1] >= 0 ? ` · ${days[d[1]]}` : ''}
                  </td>
                  <td>{d[2]}</td>
                  <td>{d[3]}</td>
                  <td>{d[4]}</td>
                  <td>{d[5]}</td>
                  <td>{d[6]}</td>
                  <td>{d[7]}</td>
                  <td>{d[8]}</td>
                  <td>{d[9] >= 0 ? `${clock(d[9])} – ${clock(d[10])}` : '—'}</td>
                  <td>{d[11] >= 0 ? d[11] : '—'}</td>
                  <td>{(d[13] ?? -1) >= 0 ? d[13] : '—'}</td>
                  <td>{(d[14] ?? -1) >= 0 ? d[14] : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Nur Zahlen, keine Karten oder Namen. Die letzten 60 Essenstage bleiben gespeichert; hier stehen die letzten
          14. So seht ihr, ob Eingriffe seltener werden.
        </p>
      </section>
      <ClearData send={send} disabled={disabled} />
    </>
  );
}
// Removes test data before real use; cards, stock and settings always stay.
function ClearData({ send, disabled }: { send: Send; disabled: boolean }) {
  const [sure, setSure] = useState(false);
  return (
    <section className="flow-section clear-data">
      <h2>Testdaten löschen</h2>
      <p>
        Nach dem Ausprobieren, vor dem echten Betrieb: Wähle, was gelöscht werden soll. Karten, Bestand und
        Einstellungen bleiben immer erhalten. Vorher am besten unter „Betreuung“ bzw. „Gerät“ eine Sicherung
        herunterladen.
      </p>
      <form
        onSubmit={async e => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const ok = await send({
            type: 'clearData',
            confirmed: true,
            history: d.get('history') === 'on',
            events: d.get('events') === 'on',
            measurements: d.get('measurements') === 'on',
            learned: d.get('learned') === 'on',
            flags: d.get('flags') === 'on',
          });
          if (ok) {
            e.currentTarget?.reset();
            setSure(false);
          }
        }}
      >
        <label className="checkbox">
          <input type="checkbox" name="history" /> Tagesberichte (Statistik, Essenstag beginnt wieder bei 1)
        </label>
        <label className="checkbox">
          <input type="checkbox" name="events" /> Letzte Vorgänge (Liste der Buchungen und Meldungen)
        </label>
        <label className="checkbox">
          <input type="checkbox" name="measurements" /> Gruppenmessungen und Bewertungen
        </label>
        <label className="checkbox">
          <input type="checkbox" name="learned" /> Gelerntes (Zeiten pro Kind, Gruppengrößen, Verweildauer)
        </label>
        <label className="checkbox">
          <input type="checkbox" name="flags" /> Hinweise zu Karten (fehlte am Tagesende, oft sofort zurück)
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={sure} onChange={e => setSure(e.currentTarget.checked)} /> Ich weiß, dass das
          nicht rückgängig gemacht werden kann.
        </label>
        <button className="danger" disabled={disabled || !sure}>
          Ausgewähltes löschen
        </button>
      </form>
    </section>
  );
}

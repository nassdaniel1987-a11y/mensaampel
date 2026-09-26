import { useState } from 'react';
import { Radio, KeyRound, Wifi, Download, RefreshCw } from 'lucide-react';
import type { State, Send, Info } from './types';
import { Backup } from './Backup';
import { DeviceTest } from './DeviceTest';
export function Login({
  info,
  busy,
  authenticate,
  error,
}: {
  info: Info;
  busy: boolean;
  authenticate: (p: string) => Promise<void>;
  error?: string;
}) {
  return (
    <section className="login-panel">
      <KeyRound size={34} />
      <h1>{info.configured ? 'Betreuung anmelden' : 'Mensaampel einrichten'}</h1>
      <p>
        {info.configured
          ? 'Melde dich mit dem Betreuungskennwort an.'
          : 'Den Einrichtungscode findest du auf dem Display des Dial.'}
      </p>
      <form
        onSubmit={e => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void authenticate(String(data.get('password')));
        }}
      >
        <label>
          {info.configured ? 'Betreuungskennwort' : 'Einrichtungscode'}
          <input name="password" type="password" autoComplete="current-password" required maxLength={64} />
        </label>
        {error && (
          <p role="alert" className="banner error">
            {error}
          </p>
        )}
        <button disabled={busy}>Anmelden</button>
      </form>
      <p className="hint">
        Zugang vergessen? Die Taste am Dial 10 Sekunden halten, loslassen und das Zurücksetzen am Gerät bestätigen. Der
        Kartenbestand bleibt erhalten.
      </p>
    </section>
  );
}
export function DevicePanel({
  state: s,
  send,
  busy,
  connected,
  backup,
  restore,
}: {
  state: State;
  send: Send;
  busy: boolean;
  connected: boolean;
  backup: () => Promise<void>;
  restore: (file: File) => Promise<boolean>;
}) {
  const d = s.device!;
  const [selected, setSelected] = useState('sim:K01'),
    [reader, setReader] = useState(d.reader),
    [localError, setLocalError] = useState('');
  const disabled = busy || !connected;
  const bound = s.cards.filter(c => !c.uid.startsWith('sim:')).length;
  const effectiveSelected = s.cards.some(c => c.uid === selected)
    ? selected
    : s.cards.find(c => c.uid.startsWith('sim:'))?.uid || s.cards[0]?.uid || '';
  return (
    <>
      <div className="intro">
        <div>
          <h1>{d.configured ? 'Gerät einrichten' : 'Willkommen an der Mensaampel'}</h1>
          <p>WLAN, Kartenleser und echte Platzkarten an einem Ort.</p>
        </div>
        <span className="simulation-label">Geräteversion · Vorabtest</span>
      </div>
      {!d.configured && (
        <div className="banner">
          <p>
            Lege zuerst dein eigenes Betreuungskennwort fest. Danach wählst du den Leser aus und ordnest die echten
            Karten zu. Bis dahin bleibt der Einlass gesperrt.
          </p>
        </div>
      )}
      <div className="device-grid">
        <section className="device-section">
          <h2>
            <Wifi /> WLAN und Zugang
          </h2>
          <p>Das Tablet verbindet sich mit dem WLAN des Dial. Internet ist nicht erforderlich.</p>
          <form
            onSubmit={e => {
              e.preventDefault();
              const data = new FormData(e.currentTarget),
                password = String(data.get('adminPassword')),
                repeat = String(data.get('repeat'));
              if (password !== repeat) {
                setLocalError('Die Betreuungskennwörter stimmen nicht überein.');
                return;
              }
              setLocalError('');
              void send({
                type: d.configured ? 'deviceSettings' : 'deviceSetup',
                ssid: String(data.get('ssid')),
                wifiPassword: String(data.get('wifiPassword')),
                adminPassword: password,
              });
            }}
          >
            <label>
              WLAN-Name
              <input name="ssid" defaultValue={d.ssid} required maxLength={32} />
            </label>
            <label>
              Neues WLAN-Kennwort
              <input
                name="wifiPassword"
                type="password"
                minLength={8}
                maxLength={63}
                autoComplete="new-password"
                placeholder="Leer lassen: bisheriges Kennwort behalten"
              />
            </label>
            <label>
              {d.configured ? 'Neues Betreuungskennwort' : 'Eigenes Betreuungskennwort'}
              <input
                name="adminPassword"
                type="password"
                required={!d.configured}
                minLength={10}
                maxLength={64}
                autoComplete="new-password"
              />
            </label>
            <label>
              Betreuungskennwort wiederholen
              <input
                name="repeat"
                type="password"
                required={!d.configured}
                minLength={10}
                maxLength={64}
                autoComplete="new-password"
              />
            </label>
            {localError && (
              <p className="banner error" role="alert">
                {localError}
              </p>
            )}
            <p className="hint">
              Eine WLAN-Änderung startet das Gerät neu. Danach das Tablet mit dem neuen WLAN verbinden. Das
              WLAN-Kennwort lässt sich am Dial anzeigen: Taste 3 Sekunden halten und loslassen.
            </p>
            <button disabled={disabled}>Zugang speichern</button>
          </form>
        </section>
        <section className="device-section">
          <h2>
            <Radio /> Kartenleser
          </h2>
          <p>
            Die Auswahl bleibt nach dem Ausschalten erhalten. Beim Wechsel der Auswahl wird der Einlass bis zur
            Bestandsbestätigung gesperrt. „Automatisch“ nutzt die RFID2 Unit an Port A, sobald sie antwortet, und fällt
            beim Abziehen ohne Störung auf den internen Leser zurück.
          </p>
          <p className="flow-status">
            Aktiv: {d.readerActive === 'external' ? 'externer Leser (Port A)' : 'interner Leser'}
            {d.reader === 'auto' ? ' · automatisch gewählt' : ''}
          </p>
          <label>
            Verwendeter Kartenleser
            <select value={reader} onChange={e => setReader(e.target.value as typeof reader)}>
              <option value="auto">Automatisch (empfohlen): extern, wenn angeschlossen</option>
              <option value="internal">Intern im M5Stack Dial</option>
              <option value="external">Extern: RFID2 an Port A</option>
            </select>
          </label>
          <button disabled={disabled || !d.configured} onClick={() => send({ type: 'reader', reader })}>
            Auswahl speichern und Leser prüfen
          </button>
          <div className={`reader-health ${d.readerHealthy ? '' : 'bad'}`}>
            <strong>{d.readerHealthy ? 'Leser erreichbar' : 'Leser prüfen'}</strong>
            <p>Aktiv: {d.reader === 'external' ? 'RFID2 an Port A' : 'interner Leser'}</p>
            {d.readerError && <p>{d.readerError}</p>}
          </div>
          <p className="hint">
            Bei externem Betrieb bleibt das interne RFID-Feld aus. Nach dem Einschalten oder Umschalten den Leser etwa
            eine Sekunde freihalten. Nur eine Karte gleichzeitig vorhalten.
          </p>
          <h3>Letzte Rückmeldung</h3>
          <p className={d.feedbackOk ? '' : 'error-text'}>{d.feedback}</p>
        </section>
        <section className="device-section">
          <h2>Platzkarten zuordnen</h2>
          <p>
            <strong>
              {bound} von {s.cards.length}
            </strong>{' '}
            Kartennummern sind mit echten Karten verbunden. Nicht zugeordnete Nummern zählen nicht als freie Plätze.
          </p>
          <label>
            Kartennummer
            <select value={effectiveSelected} onChange={e => setSelected(e.target.value)}>
              {s.cards.map(c => (
                <option key={c.uid} value={c.uid}>
                  {c.label} · {c.out ? 'ausgegeben' : c.uid.startsWith('sim:') ? 'noch nicht zugeordnet' : 'zugeordnet'}
                </option>
              ))}
            </select>
          </label>
          {!d.captureTarget ? (
            <button
              disabled={disabled || !d.configured || !d.readerHealthy}
              onClick={() => send({ type: 'captureStart', uid: effectiveSelected })}
            >
              Echte Karte einlernen
            </button>
          ) : (
            <div className="capture-box">
              <strong>Einlernen: {s.cards.find(c => c.uid === d.captureTarget)?.label}</strong>
              <p>Leser erst freihalten, dann Karte vorhalten. Beim Einlernen wird kein Platz gebucht.</p>
              <p>{d.capturedUid ? `Erkannt: ${d.capturedUid}` : 'Warte auf eine Karte …'}</p>
              <div className="action-row">
                <button
                  disabled={disabled || !d.capturedUid}
                  onClick={async () => {
                    if (await send({ type: 'captureBind' })) {
                      const index = s.cards.findIndex(c => c.uid === d.captureTarget);
                      setSelected(s.cards[index + 1]?.uid || s.cards[0].uid);
                    }
                  }}
                >
                  Zuordnung speichern
                </button>
                <button className="outline" disabled={disabled} onClick={() => send({ type: 'captureCancel' })}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
          <p className="hint">
            Nach dem Einlernen bleibt die Einlasspause aktiv. In „Betreuung“ den Bestand bestätigen und den Einlass
            fortsetzen. Eine ausgegebene Karte muss vor einer Neuzuordnung geklärt werden.
          </p>
          <details>
            <summary>Weitere Kartennummer anlegen</summary>
            <form
              onSubmit={e => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void send({ type: 'createSlot', label: String(data.get('label')).trim(), room: data.get('room') });
              }}
            >
              <label>
                Nummer
                <input name="label" required maxLength={20} placeholder="K49" />
              </label>
              <label>
                Raum
                <select name="room">
                  <option value="K">Küche</option>
                  <option value="M">Mensa</option>
                </select>
              </label>
              <button disabled={disabled}>Nummer anlegen</button>
            </form>
          </details>
        </section>
        <section className="device-section">
          <h2>Sicherung und Prüfung</h2>
          <p>Die Sicherung enthält Karten und Belegungen, aber keine WLAN- oder Betreuungskennwörter.</p>
          <div className="action-row">
            <button className="outline" disabled={disabled} onClick={() => void backup()}>
              <Download size={18} /> Bestand sichern
            </button>
            <button className="outline" disabled={disabled} onClick={() => send({ type: 'storageRetry' })}>
              <RefreshCw size={18} /> Speicherung prüfen
            </button>
          </div>
          <Backup backup={backup} restore={restore} disabled={disabled} />
          {d.needsReview && (
            <form
              className="banner error"
              onSubmit={e => {
                e.preventDefault();
                void send({ type: 'reconcile', confirmed: true });
              }}
            >
              <p>
                Der gespeicherte Bestand ist beschädigt. Alle Karten und belegten Plätze manuell abgleichen; Korrekturen
                unter „Betreuung“ vornehmen.
              </p>
              <label className="checkbox">
                <input type="checkbox" required /> Ich habe den vollständigen tatsächlichen Bestand abgeglichen.
              </label>
              <button disabled={disabled}>Abgeglichenen Bestand übernehmen</button>
            </form>
          )}
          <p className="hint">
            Version {d.version} · {d.clients} WLAN-Verbindungen
            <br />
            Freier Speicher: {Math.round(d.freeHeap / 1024)} KB · bisher mindestens {Math.round(d.minimumHeap / 1024)}{' '}
            KB
          </p>
          <p className="hint">
            Vor dem Einsatz mit Kindern: Kartenlesen und WLAN gemeinsam, längere Betriebsdauer sowie Stromunterbrechung
            am echten Gerät prüfen.
          </p>
        </section>
      </div>
      <DeviceTest state={s} send={send} disabled={disabled} />
    </>
  );
}

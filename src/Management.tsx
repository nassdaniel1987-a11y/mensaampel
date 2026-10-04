import { useState } from 'react';
import { soundSets, playSoundSet } from './sounds.mjs';
import {
  Check,
  Undo2,
  CalendarDays,
  Pause,
  Play,
  Settings,
  Unlock,
  Search,
  Plus,
  Minus,
  ClipboardList,
  Download,
  Zap,
  Hand,
  WifiOff,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Utensils,
  DoorOpen,
} from 'lucide-react';
import { Modal } from './Modal';
import { Backup } from './Backup';
import { ForecastCard } from './Insights';
import { Timeline } from './DayCourse';
import type { State, Send, Card, RoomId } from './types';
const name = (r: RoomId) => (r === 'K' ? 'Küche' : 'Mensa');
export function Management({
  state: s,
  send,
  connected,
  busy,
  notice,
  backup,
  restore,
}: {
  state: State;
  send: Send;
  connected: boolean;
  busy: boolean;
  notice: { ok: boolean; text: string } | null;
  backup?: () => Promise<void>;
  restore?: (file: File) => Promise<boolean>;
}) {
  const [modal, setModal] = useState<'day' | 'settings' | 'enroll' | 'recover' | RoomId | Card | null>(null),
    [soundChoice, setSoundChoice] = useState<number | null>(null);
  async function apply(cmd: Parameters<Send>[0]) {
    if (await send(cmd)) setModal(null);
  }
  const blocked = busy || !connected;
  const notices = [
    (s.signal.mensaHint ?? -1) > 0,
    !!s.dayWaiting,
    !!s.lostCards?.length,
    !!s.outCards?.length,
    s.cards.some(c => (c.missed ?? 0) >= 2 || (c.quick ?? 0) >= 3),
  ].filter(Boolean).length;
  return (
    <>
      {!s.ready && (
        <div className="banner">
          <div>
            <strong>Bestand vor dem Start prüfen</strong>
            <p>Die gespeicherten Karten bleiben erhalten. Erst nach deiner Bestätigung wird der Einlass freigegeben.</p>
          </div>
          <button disabled={blocked || !!s.storageError} onClick={() => send({ type: 'confirm' })}>
            <Check size={18} /> Bestand bestätigen
          </button>
        </div>
      )}
      {s.storageError && (
        <div className="banner error">
          <div>
            <strong>Speicherung prüfen</strong>
            <p>{s.storageError}</p>
          </div>
          {s.recoveryRequired && <button onClick={() => setModal('recover')}>Grundbestand wiederherstellen</button>}
        </div>
      )}
      <StatusHero
        state={s}
        send={send}
        connected={connected}
        blocked={blocked}
        onSettings={() => setModal('settings')}
      />
      <Timeline state={s} />
      <div className="room-cards">
        {(['K', 'M'] as RoomId[]).map(r => (
          <RoomCard key={r} room={r} state={s} send={send} blocked={blocked} onEdit={() => setModal(r)} />
        ))}
      </div>
      <ForecastCard state={s} />
      {notices > 0 && (
        <section className="notices" aria-label="Meldungen und Vorschläge">
          <div className="notices-head">
            <h2>Meldungen & Vorschläge</h2>
            <span>
              {notices} {notices === 1 ? 'offene Meldung' : 'offene Meldungen'}
            </span>
          </div>
          <div className="notice-grid">
            {(s.signal.mensaHint ?? -1) > 0 && (
              <article className="notice-card suggest">
                <span className="notice-kind">Vorschlag</span>
                <strong>Küche voll – Mensa öffnen?</strong>
                <p>
                  {s.signal.mensaHint} Plätze
                  {s.signal.mensaBasis
                    ? ` – so viele wurden an den letzten ${s.signal.mensaBasis === 1 ? 'gleichen Wochentag' : `${s.signal.mensaBasis} gleichen Wochentagen`} höchstens gebraucht.`
                    : ' – noch ohne Erfahrungswerte, daher ein Startwert.'}{' '}
                  Am Dial: Ring drehen, Taste.
                </p>
                <button
                  disabled={blocked}
                  onClick={() =>
                    send({
                      type: 'room',
                      room: 'M',
                      capacity: s.rooms.M.capacity,
                      limit: s.signal.mensaHint,
                      open: true,
                    })
                  }
                >
                  <Unlock size={18} /> Mensa mit {s.signal.mensaHint} Plätzen öffnen
                </button>
              </article>
            )}
            {s.dayWaiting && (
              <article className="notice-card">
                <span className="notice-kind">Neuer Essenstag</span>
                <strong>Neuer Essenstag wartet</strong>
                <p>
                  Es sind noch Karten draußen. Nach dem Einsammeln am Dial die Taste 3 Sekunden halten oder hier „Neuer
                  Essenstag“ wählen. Fehlende Karten werden dann gesperrt, bis sie wieder auftauchen.
                </p>
                <button className="outline" disabled={blocked} onClick={() => setModal('day')}>
                  <CalendarDays size={17} /> Neuer Essenstag
                </button>
              </article>
            )}
            {!!s.outCards?.length && (
              <article className={`notice-card ${s.cardsMissing ? 'warn' : ''}`}>
                <span className="notice-kind">{s.cardsMissing ? 'Auffälligkeit' : 'Noch draußen'}</span>
                <strong>
                  {s.cardsMissing
                    ? `${s.outCards.length} ${s.outCards.length === 1 ? 'Karte fehlt' : 'Karten fehlen'} vermutlich`
                    : `Noch nicht zurückgegeben: ${s.outCards.length}`}
                </strong>
                <p>{s.outCards.join(', ')}</p>
                {s.cardsMissing && (
                  <p className="hint">
                    Seit 20 Minuten kein Scan mehr. Karten einsammeln oder im Platzraster korrigieren.
                  </p>
                )}
              </article>
            )}
            {!!s.lostCards?.length && (
              <article className="notice-card warn">
                <span className="notice-kind">Gesperrt</span>
                <strong>Verlorene Karten: {s.lostCards.length}</strong>
                <p>Taucht eine Karte wieder auf, einfach ans Dial halten – oder hier freigeben:</p>
                <div className="action-row lost-cards">
                  {s.lostCards.map(label => {
                    const c = s.cards.find(x => x.label === label);
                    return (
                      c && (
                        <button
                          key={label}
                          className="outline"
                          disabled={blocked}
                          onClick={() => send({ type: 'correct', uid: c.uid, out: false, lost: false })}
                        >
                          {label} gefunden
                        </button>
                      )
                    );
                  })}
                </div>
              </article>
            )}
            <Hints state={s} send={send} blocked={blocked} />
          </div>
        </section>
      )}
      <SeatGrid state={s} onPick={c => setModal(c)} onEnroll={s.device ? undefined : () => setModal('enroll')} />
      <section className="cards-section series-section">
        <h2>Karten am Stück einlernen</h2>
        {s.series?.active ? (
          <div className="measurement-live" role="status">
            <strong>{s.series.label} ans Dial halten</strong>
            <p>
              {s.series.room === 'K' ? 'Küche' : 'Mensa'}: {s.series.done} von {s.series.total} Nummern haben eine
              Karte. Am Dial: Taste = Nummer überspringen, 3 s halten = Ende.
            </p>
            <button className="outline" disabled={blocked} onClick={() => send({ type: 'seriesStop' })}>
              Einlernen beenden
            </button>
          </div>
        ) : (
          <>
            <p>
              Karten nacheinander ans Dial halten – jede bekommt automatisch die nächste freie Nummer. Der Einlass wird
              dabei pausiert, gebucht wird nichts.
            </p>
            <div className="action-row">
              <button disabled={blocked} onClick={() => send({ type: 'seriesStart', room: 'K' })}>
                Küche K01–K{String(s.rooms.K.capacity).padStart(2, '0')} einlernen
              </button>
              <button className="outline" disabled={blocked} onClick={() => send({ type: 'seriesStart', room: 'M' })}>
                Mensa einlernen
              </button>
            </div>
            <p className="hint">
              Nur Nummern ohne echte Karte werden belegt. In der PC-Simulation mit „Unbekannte Karte testen“
              ausprobieren.
            </p>
            {s.cards.some(c => !c.uid.startsWith('sim:')) && (
              <p className="hint">
                Nach dem Einlernen eine <b>Sicherung herunterladen</b> (unten bzw. Gerät → Sicherung). Ohne Sicherung
                müssten nach einem Defekt alle Karten neu eingelernt werden.
              </p>
            )}
          </>
        )}
      </section>
      <section className="day-actions">
        <div>
          <strong>Essenstag {s.day}</strong>
          <span>{s.undo ? 'Die letzte Buchung lässt sich zurücknehmen.' : 'Alles gespeichert.'}</span>
        </div>
        <div className="action-row">
          <button className="outline" disabled={blocked || !s.undo} onClick={() => send({ type: 'undo' })}>
            <Undo2 size={17} /> Letzte Buchung rückgängig
          </button>
          {backup && (
            <button className="outline" disabled={busy} onClick={() => void backup()}>
              <Download size={17} /> Sicherung herunterladen
            </button>
          )}
          <button className="outline" onClick={() => setModal('day')} disabled={blocked}>
            <CalendarDays size={17} /> Neuer Essenstag
          </button>
        </div>
      </section>
      <section className="events">
        <h2>Letzte Vorgänge</h2>
        {!s.events.length ? (
          <div className="empty">
            <ClipboardList />
            <p>Noch keine Buchungen.</p>
            <small>Hier erscheinen Ausgaben, Rückgaben und Änderungen.</small>
          </div>
        ) : (
          <ol>
            {s.events
              .slice(-10)
              .reverse()
              .map((e, i) => (
                <li key={`${e.at}-${i}`}>
                  <time>
                    {s.device
                      ? '+' + new Date(e.at).toISOString().slice(11, 19)
                      : new Date(e.at).toLocaleTimeString('de-DE', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                  </time>
                  <span>{e.message}</span>
                </li>
              ))}
          </ol>
        )}
      </section>
      {modal && (
        <Modal
          title={
            typeof modal === 'object'
              ? `${modal.label} bearbeiten`
              : modal === 'K' || modal === 'M'
                ? `${name(modal)} einstellen`
                : modal === 'settings'
                  ? 'Einstellungen'
                  : modal === 'enroll'
                    ? 'Karte einlernen'
                    : modal === 'recover'
                      ? 'Grundbestand wiederherstellen'
                      : 'Neuer Essenstag'
          }
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={e => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              if (typeof modal === 'object')
                void apply({
                  type: 'correct',
                  uid: modal.uid,
                  out: d.get('out') === 'on',
                  lost: d.get('lost') === 'on',
                });
              else if (modal === 'K' || modal === 'M')
                void apply({
                  type: 'room',
                  room: modal,
                  capacity: Number(d.get('capacity')),
                  limit: Number(d.get('limit')),
                  open: d.get('open') === 'on',
                });
              else if (modal === 'settings')
                void apply({
                  type: 'settings',
                  cooldown: Number(d.get('cooldown')),
                  volume: Number(d.get('volume')),
                  sound: Number(d.get('sound')),
                  remind: Number(d.get('remind')),
                  ...(s.device ? { rest: Number(d.get('rest')) } : {}),
                });
              else if (modal === 'enroll')
                void apply({
                  type: 'enroll',
                  label: String(d.get('label')).trim(),
                  uid: String(d.get('uid')).trim(),
                  room: d.get('room'),
                });
              else void apply({ type: modal === 'recover' ? 'recover' : 'newDay', confirmed: true });
            }}
          >
            {typeof modal === 'object' ? (
              <>
                <p className="hint">
                  Kennung: {modal.uid}
                  <br />
                  Raum: {name(modal.room)}. Änderungen starten die Sperrzeit neu.
                </p>
                <label className="checkbox">
                  <input type="checkbox" name="out" defaultChecked={modal.out} /> Platz ist belegt / Karte ausgegeben
                </label>
                <label className="checkbox">
                  <input type="checkbox" name="lost" defaultChecked={modal.lost} /> Karte als verloren sperren
                </label>
                <p className="hint">
                  Eine verlorene ausgegebene Karte bleibt belegt, bis du den Platz ausdrücklich freigibst.
                </p>
                {s.device && (
                  <div className="action-row">
                    {!modal.uid.startsWith('sim:') ? (
                      <button
                        type="button"
                        className="outline"
                        disabled={blocked || modal.out}
                        onClick={() => {
                          if (confirm(`Karte von ${modal.label} lösen? Die Nummer kann danach neu eingelernt werden.`))
                            void apply({ type: 'unbind', uid: modal.uid });
                        }}
                      >
                        Karte von dieser Nummer lösen
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="outline"
                        disabled={blocked || modal.out}
                        onClick={() => {
                          if (confirm(`Nummer ${modal.label} ganz löschen?`))
                            void apply({ type: 'removeSlot', label: modal.label });
                        }}
                      >
                        Nummer löschen
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : modal === 'K' || modal === 'M' ? (
              <>
                <label>
                  Vorhandene Plätze
                  <input
                    name="capacity"
                    type="number"
                    min="0"
                    max="128"
                    required
                    defaultValue={s.rooms[modal].capacity}
                  />
                </label>
                <label>
                  Davon für das freie Essen vorgesehen
                  <input
                    name="limit"
                    type="number"
                    min={s.rooms[modal].occupied}
                    max="128"
                    required
                    defaultValue={s.rooms[modal].limit}
                  />
                </label>
                <label className="checkbox">
                  <input name="open" type="checkbox" defaultChecked={s.rooms[modal].open} /> Raum für neue Ausgaben
                  öffnen
                </label>
                <p className="hint">
                  Bereits belegte Plätze bleiben erhalten. Zum Stoppen weiterer Ausgaben den Raum schließen. Mehr Plätze
                  benötigen auch entsprechend viele eingelernte Karten.
                </p>
              </>
            ) : modal === 'settings' ? (
              <>
                <label>
                  Sperrzeit pro Karte in Sekunden
                  <input name="cooldown" type="number" min="1" max="600" required defaultValue={s.cooldown} />
                </label>
                <p className="hint">
                  Startwert: 10 Sekunden. Ein erneutes Vorhalten nach Ablauf zählt als Gegenbuchung. Dauerhaftes
                  Liegenlassen zählt niemals erneut.
                </p>
                <label>
                  Lautstärke am Dial (0 = stumm, 10 = laut)
                  <input name="volume" type="range" min="0" max="10" step="1" defaultValue={s.volume ?? 7} />
                </label>
                <label>
                  Klang am Dial
                  <span className="action-row">
                    <select
                      name="sound"
                      defaultValue={s.sound ?? 1}
                      onChange={e => setSoundChoice(Number(e.currentTarget.value))}
                    >
                      {soundSets.map((set, i) => (
                        <option key={set.name} value={i}>
                          {set.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="outline"
                      onClick={() => {
                        const set = soundChoice ?? s.sound ?? 1;
                        if (s.device) void send({ type: 'soundTest', set });
                        else playSoundSet(set, s.volume ?? 7);
                      }}
                    >
                      Anhören
                    </button>
                  </span>
                </label>
                <p className="hint">
                  „Anhören“ spielt Ausgabe, Rückgabe und Abweisung nacheinander {s.device ? 'am Dial' : 'am Tablet'}.
                  Übernommen wird der Klang mit „Speichern“.
                </p>
                <label>
                  Erinnerung, wenn Pause, Entlastung oder volle Gruppe auf jemanden warten
                  <select name="remind" defaultValue={s.remind ?? 3}>
                    <option value="0">aus</option>
                    {[1, 2, 3, 5, 10].map(m => (
                      <option key={m} value={m}>
                        alle {m} Minuten piepen
                      </option>
                    ))}
                  </select>
                </label>
                {s.device && (
                  <label>
                    Ruhemodus: Dial wird dunkel und leise, wenn keine Karte draußen ist und niemand es benutzt
                    <select name="rest" defaultValue={s.rest ?? 20}>
                      <option value="0">aus</option>
                      {[10, 20, 30, 60].map(m => (
                        <option key={m} value={m}>
                          nach {m} Minuten
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {s.device && (
                  <p className="hint">
                    Eine Karte weckt das Dial und wird sofort gebucht. Ring, Taste oder Berühren wecken es nur. Die
                    Ampel draußen läuft unverändert weiter.
                  </p>
                )}
                <div className="staff-cards">
                  <strong>Betreuerkarten: {s.staffCount ?? 0} von 5</strong>
                  <p className="hint">
                    Eine Betreuerkarte am Dial öffnet ein kleines Menü (Bestand ok, Pause/Weiter, Mensa freigeben). Sie
                    bucht keinen Platz. Kein Sicherheitsschlüssel – die Kartenkennung ist kopierbar.
                  </p>
                  {s.staffLearning ? (
                    <p className="flow-status">Jetzt die neue Betreuerkarte ans Dial halten …</p>
                  ) : (
                    <div className="action-row">
                      <button
                        type="button"
                        className="outline"
                        disabled={blocked || (s.staffCount ?? 0) >= 5}
                        onClick={() => void send({ type: 'staffLearn' })}
                      >
                        Neue Betreuerkarte einlernen
                      </button>
                      <button
                        type="button"
                        className="quiet"
                        disabled={blocked || !s.staffCount}
                        onClick={() => void send({ type: 'staffClear' })}
                      >
                        Alle löschen
                      </button>
                    </div>
                  )}
                </div>
                {!s.device && backup && restore && (
                  <Backup
                    backup={backup}
                    restore={async f => {
                      const ok = await restore(f);
                      if (ok) setModal(null);
                      return ok;
                    }}
                    disabled={blocked}
                  />
                )}
              </>
            ) : modal === 'enroll' ? (
              <>
                <label>
                  Kartennummer
                  <input name="label" maxLength={20} required placeholder="z. B. K49" />
                </label>
                <label>
                  Kartenkennung
                  <input name="uid" maxLength={80} required placeholder="z. B. sim:K49" />
                </label>
                <label>
                  Raum
                  <select name="room">
                    <option value="K">Küche</option>
                    <option value="M">Mensa</option>
                  </select>
                </label>
                <p className="hint">
                  Hier vergibst du eine simulierte Kennung. Später wird die echte Kennung vom Leser übernommen.
                  Einlernen erhöht die Raumkapazität nicht.
                </p>
              </>
            ) : modal === 'recover' ? (
              <>
                <p>
                  Die beschädigte Datei wird zur Prüfung aufgehoben. Es wird ein neuer Grundbestand mit 48 Küchen- und
                  64 Mensakarten angelegt.
                </p>
                <label className="checkbox">
                  <input type="checkbox" required /> Ich gleiche den tatsächlichen Bestand anschließend ab.
                </label>
              </>
            ) : (
              <>
                <p>
                  <strong>{s.cards.filter(c => c.out).length} ausgegebene Karten</strong> werden zurückgesetzt. Die
                  Küche wird geöffnet, die Mensa gesperrt. Verlorene Karten bleiben gesperrt.
                </p>
                <label className="checkbox">
                  <input type="checkbox" required /> Alle Kinder sind fertig und der Kartenbestand ist geprüft.
                </label>
              </>
            )}
            {notice && !notice.ok && (
              <p role="alert" className="banner error">
                {notice.text}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="quiet" onClick={() => setModal(null)}>
                Abbrechen
              </button>
              <button disabled={blocked} type="submit">
                {modal === 'day' ? 'Essenstag starten' : 'Speichern'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
// Noticeable cards: often not returned, or often back within a minute (double scan?). Only counters per number.
function Hints({ state: s, send, blocked }: { state: State; send: Send; blocked: boolean }) {
  const list = s.cards
    .filter(c => (c.missed ?? 0) >= 2 || (c.quick ?? 0) >= 3)
    .sort((a, b) => a.label.localeCompare(b.label));
  if (!list.length) return null;
  return (
    <article className="notice-card warn hints-section">
      <span className="notice-kind">Hinweise zu Karten</span>
      <strong>Auffällige Kartennummern</strong>
      <p className="hint">Nach dem Klären (z. B. Gespräch, Karte getauscht) „Erledigt“ tippen.</p>
      <ul className="hint-list">
        {list.map(c => (
          <li key={c.label}>
            <span>
              <strong>{c.label}</strong>
              {(c.missed ?? 0) >= 2 && ` fehlte schon ${c.missed}× am Tagesende`}
              {(c.missed ?? 0) >= 2 && (c.quick ?? 0) >= 3 && ' ·'}
              {(c.quick ?? 0) >= 3 && ` oft sofort zurück (${c.quick}×) – Doppelscan?`}
            </span>
            <button className="outline" disabled={blocked} onClick={() => send({ type: 'cardFlags', label: c.label })}>
              <Check size={16} /> Erledigt
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
/** Status card at the top of "Betrieb" (design 0.21): state in colour, symbol and words, the two main actions. */
function StatusHero({
  state: s,
  send,
  connected,
  blocked,
  onSettings,
}: {
  state: State;
  send: Send;
  connected: boolean;
  blocked: boolean;
  onSettings: () => void;
}) {
  const reason = !connected ? 'offline' : s.signal.reason,
    f = s.flow,
    releaseIn = f?.waiting && f.auto.on && f.auto.releaseIn >= 0 ? f.auto.releaseIn : -1,
    groupWaiting = !!(s.paused && f?.waiting && s.manualPaused === false && !f.relief);
  const [tone, title] =
    reason === 'free'
      ? ['green', 'Grün · Einlass offen']
      : reason === 'low'
        ? ['yellow', 'Gelb · nur noch wenige Plätze']
        : reason === 'full'
          ? ['red', 'Rot · alle Plätze belegt']
          : reason === 'batch'
            ? ['red', releaseIn >= 0 ? `Rot · Gruppe voll, nächste in ${clock(releaseIn)}` : 'Rot · Gruppe voll']
            : reason === 'paused'
              ? ['red', 'Pause · Einlass angehalten']
              : reason === 'relief'
                ? ['red', 'Entlastung · nur Rückgaben']
                : reason === 'confirm'
                  ? ['grey', 'Bestand prüfen']
                  : reason === 'offline'
                    ? ['grey', 'Keine Verbindung']
                    : ['grey', 'Gerät nicht bereit'];
  const free = s.signal.free ?? 0,
    left = s.signal.groupLeft ?? -1,
    sub = [
      `${free} ${free === 1 ? 'Platz' : 'Plätze'} frei`,
      left > 0 ? `noch ${left} in dieser Gruppe` : '',
      f?.auto.on ? 'Automatik an' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  const Icon = tone === 'green' ? Check : tone === 'yellow' ? AlertTriangle : reason === 'offline' ? WifiOff : Hand;
  return (
    <section className={`status-hero ${tone}`} aria-label="Status">
      <div className="status-main">
        <span className="status-icon" aria-hidden="true">
          <Icon />
        </span>
        <div>
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>
      </div>
      <div className="status-actions">
        {groupWaiting ? (
          <button className="big" disabled={blocked} onClick={() => send({ type: 'pause', paused: false })}>
            <Zap /> Gruppe jetzt freigeben
          </button>
        ) : s.paused ? (
          <button className="big" disabled={blocked} onClick={() => send({ type: 'pause', paused: false })}>
            <Play /> Einlass fortsetzen
          </button>
        ) : (
          <button className="big secondary" disabled={blocked} onClick={() => send({ type: 'pause', paused: true })}>
            <Pause /> Pausieren
          </button>
        )}
        <button className="icon-button" aria-label="Einstellungen" onClick={onSettings}>
          <Settings />
        </button>
      </div>
    </section>
  );
}
/** Room card (design 0.21): big occupancy, free seats, bar and quick release steps. */
function RoomCard({
  room: r,
  state: s,
  send,
  blocked,
  onEdit,
}: {
  room: RoomId;
  state: State;
  send: Send;
  blocked: boolean;
  onEdit: () => void;
}) {
  const x = s.rooms[r],
    step = r === 'K' ? 1 : 5,
    share = x.limit ? Math.round((x.occupied / x.limit) * 100) : 0;
  const setLimit = (limit: number) =>
    send({
      type: 'room',
      room: r,
      capacity: x.capacity,
      limit: Math.max(x.occupied, Math.min(x.capacity, limit)),
      open: x.open,
    });
  return (
    <section className={`room-card ${r === 'K' ? 'kitchen' : 'mensa'} ${x.open ? '' : 'closed'}`} aria-label={name(r)}>
      <div className="room-card-head">
        <span className="room-icon" aria-hidden="true">
          {r === 'K' ? <Utensils /> : <DoorOpen />}
        </span>
        <div>
          <h2>{name(r)}</h2>
          <small>{x.capacity} Plätze vorhanden</small>
        </div>
        <button
          className={`state-pill ${x.open ? 'open' : ''}`}
          disabled={blocked}
          onClick={() => send({ type: 'room', room: r, capacity: x.capacity, limit: x.limit, open: !x.open })}
          aria-label={x.open ? `${name(r)} sperren` : `${name(r)} freigeben`}
        >
          <i /> {x.open ? 'Offen' : 'Gesperrt'}
        </button>
      </div>
      <div className="room-count">
        <strong>{x.occupied}</strong>
        <span>/ {x.limit}</span>
        <em className="free-pill">{x.open ? `${x.free} frei` : 'keine Ausgabe'}</em>
      </div>
      <div className="room-bar" role="img" aria-label={`${share} Prozent belegt`}>
        <i style={{ width: `${Math.min(100, share)}%` }} />
      </div>
      <div className="room-bar-legend">
        <span>Belegung {share} %</span>
        <button className="text-button" onClick={onEdit}>
          <Settings size={15} /> Anpassen
        </button>
      </div>
      <div className="room-limit">
        <span>Freigegeben</span>
        <div>
          <button
            className="round"
            aria-label={`${name(r)}: ${step} Plätze weniger`}
            disabled={blocked || x.limit - step < x.occupied}
            onClick={() => setLimit(x.limit - step)}
          >
            {step > 1 ? `− ${step}` : <Minus />}
          </button>
          <b>{x.limit}</b>
          <button
            className="round"
            aria-label={`${name(r)}: ${step} Plätze mehr`}
            disabled={blocked || x.limit >= x.capacity}
            onClick={() => setLimit(x.limit + step)}
          >
            {step > 1 ? `+ ${step}` : <Plus />}
          </button>
        </div>
      </div>
    </section>
  );
}
type SeatFilter = 'all' | 'out' | 'free' | 'special';
const special = (c: Card) => c.lost || (c.missed ?? 0) >= 2 || (c.quick ?? 0) >= 3;
/** All seats as tiles (design 0.21), collapsible, with filters; a tile opens the card. */
function SeatGrid({ state: s, onPick, onEnroll }: { state: State; onPick: (c: Card) => void; onEnroll?: () => void }) {
  const [open, setOpen] = useState(false),
    [filter, setFilter] = useState<SeatFilter>('all'),
    [query, setQuery] = useState('');
  const unassigned = (c: Card) => !!s.device && c.uid.startsWith('sim:');
  const counts = {
    out: s.cards.filter(c => c.out).length,
    free: s.cards.filter(c => !c.out && !c.lost).length,
    special: s.cards.filter(special).length,
  };
  const shown = s.cards.filter(
    c =>
      (filter === 'all' ||
        (filter === 'out' && c.out) ||
        (filter === 'free' && !c.out && !c.lost) ||
        (filter === 'special' && special(c))) &&
      c.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section className="seat-grid">
      <div className="seat-grid-head">
        <button className="seat-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="round-icon">{open ? <ChevronDown /> : <ChevronRight />}</span>
          <span>
            <strong>Alle {s.cards.length} Plätze anzeigen</strong>
            <small>Tippen für Status und Korrektur einer Karte</small>
          </span>
        </button>
        {open && (
          <div className="chips" role="group" aria-label="Filter">
            {(
              [
                ['all', 'Alle'],
                ['out', `Belegt (${counts.out})`],
                ['free', `Frei (${counts.free})`],
                ['special', `Auffällig (${counts.special})`],
              ] as [SeatFilter, string][]
            ).map(([v, t]) => (
              <button key={v} className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      {open && (
        <>
          <div className="table-controls">
            <label className="search">
              <Search size={18} />
              <input
                aria-label="Karte suchen"
                placeholder="Nummer suchen …"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </label>
            {onEnroll && (
              <button className="outline" onClick={onEnroll}>
                <Plus size={17} /> Karte einlernen
              </button>
            )}
          </div>
          {(['K', 'M'] as RoomId[]).map(r => {
            const list = shown.filter(c => c.room === r);
            if (!list.length) return null;
            const all = s.cards.filter(c => c.room === r);
            return (
              <div key={r} className="seat-room">
                <h3>
                  <i className={r === 'K' ? 'kitchen' : 'mensa'} /> {name(r)} ({all[0]?.label}–
                  {all[all.length - 1]?.label}) · {all.filter(c => c.out).length} belegt, {s.rooms[r].free} frei
                  {!s.rooms[r].open && ' · gesperrt'}
                </h3>
                <div className="tiles">
                  {list.map(c => (
                    <button
                      key={c.uid}
                      className={`tile ${c.out ? `out ${r === 'K' ? 'kitchen' : 'mensa'}` : ''} ${special(c) ? 'special' : ''} ${unassigned(c) ? 'unassigned' : ''} ${!s.rooms[r].open && !c.out ? 'closed' : ''}`}
                      title={
                        unassigned(c)
                          ? 'Nicht zugeordnet'
                          : c.lost
                            ? 'Verloren'
                            : c.out
                              ? 'Ausgegeben'
                              : !s.rooms[r].open
                                ? 'Raum gesperrt'
                                : 'Verfügbar'
                      }
                      onClick={() => onPick(c)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {!shown.length && <p className="hint">Keine passende Karte gefunden.</p>}
          <div className="legend">
            <span>
              <i className="tile out kitchen" /> Belegt (Küche)
            </span>
            <span>
              <i className="tile out mensa" /> Belegt (Mensa)
            </span>
            <span>
              <i className="tile" /> Frei
            </span>
            <span>
              <i className="tile special" /> Auffällig / verloren
            </span>
            {s.device && (
              <span>
                <i className="tile unassigned" /> Ohne Karte
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

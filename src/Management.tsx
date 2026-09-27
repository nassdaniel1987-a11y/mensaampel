import { useState } from 'react';
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
  Pencil,
  ClipboardList,
} from 'lucide-react';
import { Signal } from './Signal';
import { Modal } from './Modal';
import { Backup } from './Backup';
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
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState(''),
    [page, setPage] = useState(0);
  const cards = s.cards.filter(
    c => (!filter || c.room === filter) && `${c.label} ${c.uid}`.toLowerCase().includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(cards.length / 8)),
    actualPage = Math.min(page, pages - 1);
  async function apply(cmd: Parameters<Send>[0]) {
    if (await send(cmd)) setModal(null);
  }
  const blocked = busy || !connected;
  return (
    <>
      <div className="intro">
        <div>
          <h1>Alles im Blick</h1>
          <p>Plätze verwalten und den Einlass steuern.</p>
        </div>
        <button className="quiet" onClick={() => setModal('settings')}>
          <Settings size={18} /> Einstellungen
        </button>
      </div>
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
      <div className="dashboard">
        <div className="main-column">
          <div className="rooms">
            {(['K', 'M'] as RoomId[]).map(r => {
              const x = s.rooms[r];
              return (
                <section className="room" key={r} aria-label={name(r)}>
                  <div className="room-title">
                    <h2>{name(r)}</h2>
                    <button className="text-button" onClick={() => setModal(r)} aria-label={`${name(r)} bearbeiten`}>
                      <Settings size={17} /> Anpassen
                    </button>
                  </div>
                  <div className="room-body">
                    <div>
                      {x.open ? (
                        <>
                          <strong className="big-count">{x.free}</strong>
                          <span>Plätze frei</span>
                        </>
                      ) : (
                        <>
                          <strong className="locked-text">Gesperrt</strong>
                          <span>Keine neuen Ausgaben.</span>
                        </>
                      )}
                    </div>
                    <div className="room-meter">
                      <div className="meter-label">
                        <span>
                          {x.occupied} von {x.limit} belegt
                        </span>
                        <span>{x.limit ? Math.round((x.occupied / x.limit) * 100) : 0} %</span>
                      </div>
                      <progress value={x.occupied} max={x.limit || 1} />
                      <small>
                        {x.limit} von {x.capacity} Plätzen vorgesehen
                      </small>
                      {!x.open && (
                        <button
                          className="outline"
                          disabled={blocked}
                          onClick={() => send({ type: 'room', room: r, ...x, open: true })}
                        >
                          <Unlock size={17} />
                          {name(r)} freigeben
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
          <div className="action-row">
            <button className="outline" disabled={blocked || !s.undo} onClick={() => send({ type: 'undo' })}>
              <Undo2 size={17} /> Letzte Buchung rückgängig
            </button>
            <button className="outline" onClick={() => setModal('day')} disabled={blocked}>
              <CalendarDays size={17} /> Neuer Essenstag
            </button>
          </div>
          {s.dayWaiting && (
            <div className="banner" role="status">
              <div>
                <strong>Neuer Essenstag wartet</strong>
                <p>
                  Es sind noch Karten draußen. Nach dem Einsammeln am Dial die Taste 3 Sekunden halten oder hier „Neuer
                  Essenstag“ wählen. Fehlende Karten werden dann gesperrt, bis sie wieder auftauchen.
                </p>
              </div>
            </div>
          )}
          {!!s.lostCards?.length && (
            <div className="banner" role="status">
              <div>
                <strong>Gesperrte (verlorene) Karten: {s.lostCards.length}</strong>
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
              </div>
            </div>
          )}
          {!!s.outCards?.length && (
            <div className={`banner ${s.cardsMissing ? 'error' : ''}`} role="status">
              <div>
                <strong>
                  {s.cardsMissing
                    ? `${s.outCards.length} Karten fehlen vermutlich`
                    : `Noch nicht zurückgegeben: ${s.outCards.length}`}
                </strong>
                <p>{s.outCards.join(', ')}</p>
                {s.cardsMissing && (
                  <p className="hint">
                    Seit 20 Minuten kein Scan mehr. Karten einsammeln oder unter „Bearbeiten“ korrigieren.
                  </p>
                )}
              </div>
            </div>
          )}
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
                  Karten nacheinander ans Dial halten – jede bekommt automatisch die nächste freie Nummer. Der Einlass
                  wird dabei pausiert, gebucht wird nichts.
                </p>
                <div className="action-row">
                  <button disabled={blocked} onClick={() => send({ type: 'seriesStart', room: 'K' })}>
                    Küche K01–K{String(s.rooms.K.capacity).padStart(2, '0')} einlernen
                  </button>
                  <button
                    className="outline"
                    disabled={blocked}
                    onClick={() => send({ type: 'seriesStart', room: 'M' })}
                  >
                    Mensa einlernen
                  </button>
                </div>
                <p className="hint">
                  Nur Nummern ohne echte Karte werden belegt. In der PC-Simulation mit „Unbekannte Karte testen“
                  ausprobieren.
                </p>
                {s.cards.some(c => !c.uid.startsWith('sim:')) && (
                  <p className="hint">
                    Nach dem Einlernen eine <b>Sicherung herunterladen</b> (Einstellungen bzw. Gerät → Sicherung). Ohne
                    Sicherung müssten nach einem Defekt alle Karten neu eingelernt werden.
                  </p>
                )}
              </>
            )}
          </section>
          <section className="cards-section">
            <div className="section-heading">
              <h2>
                Platzkarten <span className="count-label">{s.cards.length}</span>
              </h2>
              {!s.device && (
                <button className="outline" onClick={() => setModal('enroll')}>
                  <Plus size={17} /> Karte einlernen
                </button>
              )}
            </div>
            <div className="table-controls">
              <label className="search">
                <Search size={18} />
                <input
                  aria-label="Karte suchen"
                  placeholder="Karte suchen …"
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <div className="filters">
                {[
                  ['', 'Alle'],
                  ['K', 'Küche'],
                  ['M', 'Mensa'],
                ].map(([v, t]) => (
                  <button
                    key={v}
                    className={filter === v ? 'active' : ''}
                    onClick={() => {
                      setFilter(v);
                      setPage(0);
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Karten-Nr.</th>
                    <th>Bereich</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Aktionen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cards.slice(actualPage * 8, actualPage * 8 + 8).map(c => (
                    <tr key={c.uid}>
                      <td>
                        <strong>{c.label}</strong>
                      </td>
                      <td>{name(c.room)}</td>
                      <td>
                        <span
                          className={`card-state ${c.lost ? 'lost' : c.out ? 'out' : !s.rooms[c.room].open ? 'closed' : 'available'}`}
                        >
                          <i />
                          {s.device && c.uid.startsWith('sim:')
                            ? 'Nicht zugeordnet'
                            : c.lost
                              ? c.out
                                ? 'Verloren · belegt'
                                : 'Verloren'
                              : c.out
                                ? 'Ausgegeben'
                                : !s.rooms[c.room].open
                                  ? 'Raum gesperrt'
                                  : 'Verfügbar'}
                        </span>
                      </td>
                      <td>
                        <button className="row-edit" aria-label={`${c.label} bearbeiten`} onClick={() => setModal(c)}>
                          <Pencil size={14} />
                          <span>Bearbeiten</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!cards.length && (
                    <tr>
                      <td colSpan={4}>Keine passende Karte gefunden.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {cards.length} Karten · Seite {actualPage + 1} von {pages}
              </span>
              <div>
                <button className="quiet" disabled={actualPage === 0} onClick={() => setPage(actualPage - 1)}>
                  Zurück
                </button>
                <button className="quiet" disabled={actualPage === pages - 1} onClick={() => setPage(actualPage + 1)}>
                  Weiter
                </button>
              </div>
            </div>
          </section>
        </div>
        <aside>
          <div className="signal-panel">
            <Signal state={s} connected={connected} />
            <button
              className="pause-button"
              disabled={blocked}
              onClick={() => send({ type: 'pause', paused: !s.paused })}
            >
              {s.paused ? <Play /> : <Pause />}
              {s.paused
                ? s.flow?.waiting && s.manualPaused === false && !s.flow.relief
                  ? 'Nächste Gruppe freigeben'
                  : 'Einlass fortsetzen'
                : 'Einlass pausieren'}
            </button>
            {s.flow?.auto.on && (
              <p className="hint">
                Automatik an
                {s.flow.waiting && s.flow.auto.releaseIn >= 0
                  ? ` · nächste Gruppe in ${Math.floor(s.flow.auto.releaseIn / 60)}:${String(s.flow.auto.releaseIn % 60).padStart(2, '0')} min`
                  : ''}
              </p>
            )}
          </div>
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
        </aside>
      </div>
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
                  remind: Number(d.get('remind')),
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

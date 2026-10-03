import { useState } from 'react';
import { CalendarClock, Lightbulb, Check, ShieldCheck } from 'lucide-react';
import { forecast, coach, simulate, waitText, weekdays, confidence, confidenceLevels } from './insights.mjs';
import type { State, Send, FlowState } from './types';
// Weekday of the running serving day (report), otherwise from the clock.
const todayWeekday = (f: FlowState) => (f.today[1] >= 0 ? f.today[1] : f.clockValid ? f.weekday : -1);

/** "Heute erwartet" on the staff page: forecast from the last four days of the same weekday. */
export function ForecastCard({ state: s }: { state: State }) {
  const f = s.flow;
  if (!f) return null;
  const p = forecast(f.history, todayWeekday(f), s.rooms.M.capacity);
  if (!p) return null;
  return (
    <section className="forecast-card" aria-label="Heute erwartet">
      <CalendarClock size={22} />
      <div>
        <strong>
          Heute erwartet ({weekdays[p.weekday]}, aus {p.days} {p.days === 1 ? 'Tag' : 'Tagen'}):
        </strong>{' '}
        etwa {p.meals} Essen
        {p.peak >= 0 && `, bis zu ${p.peak} Kinder gleichzeitig`}
        {p.start && `, Ausgabe ${p.start}–${p.end} Uhr`}.{' '}
        {p.mensaNeeded ? (
          <>
            Mensa wird wohl gebraucht (Vorschlag {p.mensaSeats} Plätze
            {s.rooms.M.open ? ', ist offen' : ''}).
          </>
        ) : (
          'Mensa wurde zuletzt meist nicht gebraucht.'
        )}
      </div>
    </section>
  );
}

/** Weekly coach and what-if simulator (Einlass & Messungen). Everything here is computed on this tablet. */
export function Coach({ state: s, send, disabled }: { state: State; send: Send; disabled: boolean }) {
  const f = s.flow!;
  const tips = coach(f, s.rooms);
  const p = forecast(f.history, todayWeekday(f), s.rooms.M.capacity);
  const [children, setChildren] = useState(() => p?.meals || 80),
    [minutes, setMinutes] = useState(() => p?.minutes || 30),
    [groupA, setGroupA] = useState(f.batch),
    [groupB, setGroupB] = useState(Math.min(48, f.batch + 2));
  const perChild = Math.max(3, Math.round(f.auto.perChild / 10)),
    stay = (f.stayN ?? 0) >= 5 ? (f.stayAvg ?? 1200) : 1200,
    seats = s.rooms.K.limit + (s.rooms.M.open ? s.rooms.M.limit : 0);
  const base = { children, minutes, perChild, stay, seats };
  const a = simulate({ ...base, batch: groupA }),
    b = simulate({ ...base, batch: groupB });
  const label = (n: number) => (n ? `Gruppen zu ${n}` : 'ohne Gruppen');
  const rows: [string, (r: typeof a) => string][] = [
    ['Wartezeit an der Tür (Mittel / längste)', r => `${waitText(r.doorAvg)} / ${waitText(r.doorMax)}`],
    ['Wartezeit an der Ausgabe (Mittel / längste)', r => `${waitText(r.serveryAvg)} / ${waitText(r.serveryMax)}`],
    ['Gruppen', r => String(r.groups)],
    ['Alle drin nach', r => `${r.minutes} Min.`],
  ];
  return (
    <>
      <section className="flow-section flow-results coach-section">
        <h2>
          <Lightbulb size={20} /> Wochen-Coach
        </h2>
        <p className="hint">
          Vorschläge aus den letzten Tagesberichten. Nichts ändert sich von selbst – erst „Übernehmen“ schickt die
          Einstellung an das Dial.
        </p>
        <ul className="coach-list">
          {tips.map(t => (
            <li key={t.id}>
              <div>
                <strong>{t.title}</strong>
                <p>{t.reason}</p>
              </div>
              {t.action && (
                <button className="outline" disabled={disabled} onClick={() => void send(t.action!)}>
                  <Check size={16} /> Übernehmen
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="flow-section flow-results simulator-section">
        <h2>Was wäre, wenn …? (Schätzung)</h2>
        <p className="hint">
          Ein einfaches Rechenmodell: Die meisten Kinder kommen gleich zu Beginn, die Ausgabe schafft ein Kind alle{' '}
          {perChild} s (gelernt), ein Platz ist nach etwa {Math.round(stay / 60)} Min. wieder frei
          {(f.stayN ?? 0) >= 5 ? ' (gelernt)' : ' (Annahme, noch nicht gelernt)'}, {seats} Plätze. Echte Mittage weichen
          ab – zum Vergleichen zweier Einstellungen reicht es.
        </p>
        <div className="simulator-inputs">
          <label>
            Kinder
            <input type="number" min={1} max={500} value={children} onChange={e => setChildren(+e.target.value || 1)} />
          </label>
          <label>
            kommen über (Min.)
            <input type="number" min={1} max={120} value={minutes} onChange={e => setMinutes(+e.target.value || 1)} />
          </label>
          <label>
            Einstellung A: Gruppe
            <input type="number" min={0} max={48} value={groupA} onChange={e => setGroupA(+e.target.value || 0)} />
          </label>
          <label>
            Einstellung B: Gruppe
            <input type="number" min={0} max={48} value={groupB} onChange={e => setGroupB(+e.target.value || 0)} />
          </label>
        </div>
        <div className="table-scroll">
          <table className="learn-table">
            <thead>
              <tr>
                <th />
                <th>A: {label(groupA)}</th>
                <th>B: {label(groupB)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, value]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{value(a)}</td>
                  <td>{value(b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">0 = ohne Gruppen (nur die Platzzahl begrenzt). Aktuell eingestellt: {label(f.batch)}.</p>
      </section>
    </>
  );
}

const halfHour = (slot: number) => `${Math.floor(slot / 2)}:${slot % 2 ? '30' : '00'}`;
/** "Wie sicher ist das Gelernte?": per weekday and half hour how much the learned values rest on (tablet only). */
export function Confidence({ state: s }: { state: State }) {
  const f = s.flow;
  if (!f) return null;
  const c = confidence(f);
  return (
    <section className="flow-section confidence" aria-label="Wie sicher ist das Gelernte">
      <h2>
        <ShieldCheck /> Wie sicher ist das Gelernte?
      </h2>
      <p className="hint">
        Stufen: noch nicht · unsicher · mittel · sicher. Ein Zeitfenster (Wochentag und halbe Stunde) nutzt die
        Automatik ab 3 Gruppen, sicher ist es ab 7. Die Tagesprognose ist ab 4 Mittagen desselben Wochentags sicher.
      </p>
      {c.halfHours.length > 0 && (
        <div className="table-scroll">
          <table className="confidence-grid">
            <thead>
              <tr>
                <th>Tag</th>
                {c.halfHours.map(h => (
                  <th key={h}>{halfHour(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.rows.map(r => (
                <tr key={r.weekday}>
                  <th>{weekdays[r.weekday].slice(0, 2)}</th>
                  {r.cells.map(x => (
                    <td key={x.slot} className={`level-${x.level}`} title={confidenceLevels[x.level]}>
                      {x.n ? `${x.n}×` : '–'}
                      <small>{confidenceLevels[x.level]}</small>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="confidence-days">
        {c.rows.map(r => (
          <li key={r.weekday}>
            <span className={`level-badge level-${r.level}`}>{confidenceLevels[r.level]}</span> {r.text}
          </li>
        ))}
      </ul>
      <ul className="confidence-days">
        <li>
          <span className={`level-badge level-${c.groups.level}`}>{confidenceLevels[c.groups.level]}</span>{' '}
          Gruppen-Zeiten insgesamt: {c.groups.n} Gruppen gemessen (Rückfall, wenn ein Zeitfenster noch fehlt).
        </li>
        <li>
          <span className={`level-badge level-${c.stay.level}`}>{confidenceLevels[c.stay.level]}</span> Verweildauer:
          aus {c.stay.n} Rückgaben gelernt (für „nächster Platz frei in …“ an der Ampel, ab 5).
        </li>
      </ul>
    </section>
  );
}

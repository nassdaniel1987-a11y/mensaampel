import { useState } from 'react';
import { ArrowRight, Clock3, Flag, Info } from 'lucide-react';
import { clock, dayCurves, decisions, heatmap, heatRanges, timeline } from './day-course.mjs';
import type { State } from './types';

// Course of the day (0.23), after the Claude Design draft "Mensaampel – Dashboard-Seiten": timeline on Betrieb,
// forecast against reality and the automatic's decisions on Einlass & Messungen, heat map on Statistik.
const pct = (m: number, from: number, to: number) => `${(((m - from) / (to - from)) * 100).toFixed(2)}%`;

export function Timeline({ state: s }: { state: State }) {
  const t = timeline(s);
  if (!t || (!t.blocks.length && !t.next)) return null;
  const span = (a: number, b: number) => ({
    left: pct(Math.max(a, t.from), t.from, t.to),
    width: `calc(${(((Math.min(b, t.to) - Math.max(a, t.from)) / (t.to - t.from)) * 100).toFixed(2)}% - 4px)`,
  });
  return (
    <section className="timeline-card" aria-labelledby="timeline-title">
      <div className="section-heading">
        <h2 id="timeline-title">Mittags-Zeitleiste</h2>
        <p className="hint">Fest = schon gewesen · gestrichelt = so erwartet die Automatik den Rest</p>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-area">
          <div className="timeline-track">
            {t.blocks
              .filter(b => b.end > t.from && b.start < t.to)
              .map((b, i) => {
                // Narrow blocks (short groups) show only their number; the full text stays in the tooltip.
                const share = (Math.min(b.end, t.to) - Math.max(b.start, t.from)) / (t.to - t.from);
                const short = b.label === 'Start' ? 'S' : b.label.replace('Gruppe ', '');
                return (
                  <div
                    key={i}
                    className={`timeline-block ${b.state}${share < 0.035 ? ' tiny' : share < 0.11 ? ' narrow' : ''}`}
                    style={span(b.start, b.end)}
                    title={`${b.label}: ${b.sub}`}
                  >
                    <strong>{share < 0.11 ? short : b.label}</strong>
                    {share >= 0.11 && <span>{b.sub}</span>}
                  </div>
                );
              })}
            <div className="timeline-now" style={{ left: pct(t.now, t.from, t.to) }}>
              <span>jetzt {clock(t.now)}</span>
            </div>
          </div>
          <div className="timeline-ticks" aria-hidden="true">
            {t.ticks.map((m, i) => (
              <span
                key={m}
                className={i === 0 ? 'first' : i === t.ticks.length - 1 ? 'last' : ''}
                style={{ left: pct(m, t.from, t.to) }}
              >
                {clock(m)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="timeline-facts">
        {t.next && (
          <div className="timeline-fact">
            <span className="fact-icon">
              <ArrowRight size={22} />
            </span>
            <div>
              <span>Nächste Gruppe</span>
              <strong>{t.next.title}</strong>
              <small>{t.next.sub}</small>
            </div>
          </div>
        )}
        {t.compare && (
          <div className={`timeline-fact ${t.compare.faster ? 'good' : ''}`}>
            <span className="fact-icon">
              <Clock3 size={22} />
            </span>
            <div>
              <span>Im Vergleich</span>
              <strong>{t.compare.title}</strong>
              <small>{t.compare.sub}</small>
            </div>
          </div>
        )}
        {t.finish && (
          <div className="timeline-fact">
            <span className="fact-icon">
              <Flag size={22} />
            </span>
            <div>
              <span>Voraussichtlich fertig</span>
              <strong>{t.finish.title}</strong>
              <small>{t.finish.sub}</small>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function ForecastChart({ state: s }: { state: State }) {
  const c = dayCurves(s);
  if (!c.forecast.length && !c.actual.length) return null;
  const W = 1100,
    H = 340,
    x0 = 56,
    x1 = 1084,
    y0 = 296,
    y1 = 16;
  const X = (m: number) => x0 + ((m - c.from) / (c.to - c.from)) * (x1 - x0);
  // Round axis steps (5, 10, 20, 25, 50 seats) with four of them up to the top.
  const step = [5, 10, 20, 25, 50].find(v => v * 4 >= c.max) ?? 50,
    top = step * Math.max(1, Math.ceil(c.max / step));
  const Y = (v: number) => y0 - (v / top) * (y0 - y1);
  const path = (pts: [number, number][]) =>
    pts.map(([m, v], i) => `${i ? 'L' : 'M'}${X(m).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const band = c.forecast.length
    ? path(c.forecast.map(p => [p.minute, p.high])) +
      ' ' +
      [...c.forecast]
        .reverse()
        .map(p => `L${X(p.minute).toFixed(1)} ${Y(p.low).toFixed(1)}`)
        .join(' ') +
      ' Z'
    : '';
  const grid = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const ticks: number[] = [];
  for (let m = c.from; m <= c.to; m += 30) ticks.push(m);
  const last = c.actual.at(-1);
  const summary = last
    ? `Jetzt ${last.value} Plätze belegt${c.note ? '. ' + c.note.text : ''}`
    : 'Noch keine Ausgabe heute; gezeigt wird die Vorhersage.';
  return (
    <section className="flow-section forecast-chart" aria-labelledby="forecast-title">
      <div className="section-heading">
        <div>
          <h2 id="forecast-title">Heute: Vorhersage und Wirklichkeit</h2>
          <p className="hint">
            Belegte Plätze (Küche + Mensa) im Laufe des Mittags
            {c.days ? ` · Vorhersage aus den letzten ${c.days} gleichen Wochentagen` : ' · noch keine Vorhersage'}
          </p>
        </div>
        <div className="chart-legend" aria-hidden="true">
          <span>
            <svg width="30" height="10">
              <line x1="0" y1="5" x2="30" y2="5" className="line-actual" />
            </svg>
            Wirklich
          </span>
          {c.forecast.length > 0 && (
            <>
              <span>
                <svg width="30" height="10">
                  <line x1="0" y1="5" x2="30" y2="5" className="line-forecast" />
                </svg>
                Vorhersage
              </span>
              <span>
                <i className="band-swatch" />
                üblicher Bereich
              </span>
            </>
          )}
        </div>
      </div>
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
          {grid.map(v => (
            <g key={v}>
              <line x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} className="grid-line" />
              <text x={x0 - 12} y={Y(v) + 5} textAnchor="end" className="axis-text">
                {v}
              </text>
            </g>
          ))}
          {band && <path d={band} className="band" />}
          {c.forecast.length > 1 && (
            <path d={path(c.forecast.map(p => [p.minute, p.mean]))} className="line-forecast" fill="none" />
          )}
          {c.actual.length > 1 && (
            <path d={path(c.actual.map(p => [p.minute, p.value]))} className="line-actual" fill="none" />
          )}
          {last && (
            <>
              <line x1={X(last.minute)} x2={X(last.minute)} y1={y1} y2={y0} className="now-line" />
              <circle cx={X(last.minute)} cy={Y(last.value)} r="7" className="now-dot" />
              <text
                x={X(last.minute) + (X(last.minute) > W - 220 ? -14 : 14)}
                y={Math.max(y1 + 18, Y(last.value) - 14)}
                textAnchor={X(last.minute) > W - 220 ? 'end' : 'start'}
                className="now-text"
              >
                jetzt {last.value} belegt
              </text>
            </>
          )}
          {ticks.map((m, i) => (
            <text
              key={m}
              x={X(m)}
              y={H - 16}
              textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
              className="axis-text"
            >
              {clock(m)}
            </text>
          ))}
        </svg>
      </div>
      {c.note && (
        <p className={`chart-note ${c.note.tone}`}>
          <Info size={22} /> {c.note.text}
        </p>
      )}
      {!c.days && (
        <p className="hint">
          Die Vorhersage erscheint, sobald dieser Wochentag einmal mit der neuen Version (0.23) gelaufen ist.
        </p>
      )}
    </section>
  );
}

const chips = { auto: 'Automatik', hand: 'Von Hand', learn: 'Lernen', relief: 'Entlasten', plan: 'Geplant' };
export function Decisions({ state: s }: { state: State }) {
  const list = decisions(s);
  return (
    <section className="flow-section decisions" aria-labelledby="decisions-title">
      <div className="section-heading">
        <h2 id="decisions-title">Was die Automatik heute entschieden hat</h2>
        <p className="hint">Neueste oben · in einfachen Worten</p>
      </div>
      {list.length ? (
        <ol>
          {list.map((d, i) => (
            <li key={i} className={`decision ${d.kind}`}>
              <strong className="decision-time">{d.time}</strong>
              <div>
                <div className="decision-title">
                  <span className="decision-chip">{chips[d.kind]}</span>
                  <strong>{d.title}</strong>
                </div>
                <p>{d.why}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint">Heute ist noch nichts passiert. Hier steht später jede Freigabe mit ihrem Grund.</p>
      )}
    </section>
  );
}

export function Statistics({ state: s }: { state: State }) {
  const [range, setRange] = useState(20);
  const h = heatmap(s, range);
  return (
    <div className="statistics">
      <section className="flow-section heat-card" aria-labelledby="heat-title">
        <div className="section-heading">
          <div>
            <h2 id="heat-title">Wann ist es am vollsten?</h2>
            <p className="hint">Kinder gleichzeitig in Küche und Mensa – Durchschnitt je Wochentag und halbe Stunde</p>
          </div>
          <div className="segmented" role="group" aria-label="Zeitraum">
            {heatRanges.map(r => (
              <button
                key={r.days}
                type="button"
                className={range === r.days ? 'selected' : ''}
                aria-pressed={range === r.days}
                onClick={() => setRange(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {h.days ? (
          <>
            <div className="table-scroll">
              <table className="heat-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Wochentag</span>
                    </th>
                    {h.slots.map(t => (
                      <th key={t} scope="col">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {h.rows.map(r => (
                    <tr key={r.weekday}>
                      <th scope="row">{r.label}</th>
                      {r.cells.map((c, i) => (
                        <td
                          key={i}
                          title={c.title}
                          className={`heat-${c.level}${h.busiest && c.value === h.busiest.value && r.label === h.busiest.weekday && h.slots[i] === h.busiest.from ? ' peak' : ''}`}
                        >
                          {c.value === null ? '–' : c.value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="heat-legend" aria-hidden="true">
              <span>wenig</span>
              {[0, 1, 2, 3, 4, 5].map(l => (
                <i key={l} className={`heat-${l}`} />
              ))}
              <span>viel</span>
              <span className="heat-legend-note">– = keine Daten · Zahl = Kinder gleichzeitig</span>
            </div>
          </>
        ) : (
          <p className="hint">
            Noch keine Daten. Das Bild füllt sich ab dem ersten Essenstag mit dieser Version (0.23): nach jedem Tag
            kommt eine Zeile dazu.
          </p>
        )}
      </section>
      {h.days > 0 && (
        <section className="stat-facts" aria-label="Auffälligkeiten">
          {h.busiest && (
            <article>
              <span>Am vollsten</span>
              <strong>
                {h.busiest.weekday} {h.busiest.from}–{h.busiest.to}
              </strong>
              <small>im Schnitt {h.busiest.value} Kinder gleichzeitig</small>
            </article>
          )}
          {h.calmest && (
            <article>
              <span>Am ruhigsten</span>
              <strong>
                {h.calmest.weekday} {h.calmest.from}–{h.calmest.to}
              </strong>
              <small>im Schnitt {h.calmest.value} Kinder gleichzeitig</small>
            </article>
          )}
          <article className="soft">
            <span>Grundlage</span>
            <strong>{h.days} Essenstage</strong>
            <small>nur Zahlen, keine Karten oder Namen</small>
          </article>
        </section>
      )}
    </div>
  );
}

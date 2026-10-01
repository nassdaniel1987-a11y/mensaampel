// Evaluations computed in the tablet's browser from the data the Dial already delivers (daily reports, learned
// values). Nothing here is stored on the Dial; every tablet computes the same from the same data.
// Daily report indices (core/flow.hpp Flow::Day): 0 day, 1 weekday, 2 issued, 3 returned, 4 groups, 5 automatic
// releases, 6 earlier releases, 7 too full, 8 reliefs, 9 first issue minute, 10 last issue minute, 11 missing cards,
// 12 tenths per child, 13 most cards out at once, 14 most Mensa seats.
export const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const served = d => d && d[2] > 0;
const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
const clock = m => `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, '0')}`;
// Same rule as Engine::mensaSuggestion: highest use, rounded up to five, at least 10, at most the capacity.
const mensaSeats = (most, capacity) => Math.min(capacity, Math.max(10, Math.ceil(most / 5) * 5));

/**
 * Forecast for a weekday from the last four served days of that weekday.
 * @returns {null | { days: number, weekday: number, meals: number, peak: number, mensaDays: number,
 *   mensaSeats: number, mensaNeeded: boolean, start: string, end: string, minutes: number }}
 */
export function forecast(history, weekday, mensaCapacity = 64) {
  if (!(weekday >= 0)) return null;
  const days = history.filter(d => served(d) && d[1] === weekday).slice(-4);
  if (!days.length) return null;
  const peaks = days.filter(d => (d[13] ?? -1) >= 0).map(d => d[13]),
    mensa = days.filter(d => (d[14] ?? -1) >= 0).map(d => d[14]),
    times = days.filter(d => d[9] >= 0 && d[10] >= d[9]);
  const mensaDays = mensa.filter(v => v > 0).length,
    start = mean(times.map(d => d[9])),
    end = mean(times.map(d => d[10]));
  return {
    days: days.length,
    weekday,
    meals: Math.round(mean(days.map(d => d[2]))),
    peak: peaks.length ? Math.round(mean(peaks)) : -1,
    mensaDays,
    mensaNeeded: mensa.length > 0 && mensaDays * 2 >= mensa.length,
    mensaSeats: mensaSeats(Math.max(0, ...mensa), mensaCapacity),
    start: times.length ? clock(start) : '',
    end: times.length ? clock(end) : '',
    minutes: times.length ? Math.max(5, Math.round(end - start)) : 30,
  };
}

/**
 * Weekly coach: simple rules over the last served days. Each tip has a reason with the numbers behind it and, where
 * it can be applied with one tap, the command for the Dial.
 * @param {{ history: number[][], batch: number, yellow: number, autoOn: boolean, autoStart: number }} flow
 * @param {{ M: { capacity: number, limit: number, open: boolean } }} rooms
 */
export function coach(flow, rooms) {
  const days = flow.history.filter(served).slice(-10),
    tips = [];
  if (days.length < 3)
    return [
      {
        id: 'wait',
        title: 'Noch zu wenig Tage',
        reason: `Der Coach braucht mindestens 3 Essenstage mit Ausgaben (bisher ${days.length}).`,
      },
    ];
  const sum = i => days.reduce((a, d) => a + Math.max(0, d[i]), 0);
  const groups = sum(4),
    reliefs = sum(8),
    auto = sum(5),
    earlier = sum(6);
  // Servery often too full: smaller groups.
  if (flow.batch > 1 && groups >= 5 && reliefs / groups >= 0.25)
    tips.push({
      id: 'smaller',
      title: `Gruppen auf ${flow.batch - 1} verkleinern`,
      reason: `In den letzten ${days.length} Tagen musste bei ${reliefs} von ${groups} Gruppen entlastet werden – die Ausgabe war oft zu voll.`,
      action: { type: 'flowSettings', yellow: flow.yellow, batch: flow.batch - 1 },
    });
  // Calm and often released earlier by hand: groups may be one larger.
  else if (
    flow.batch > 0 &&
    flow.batch < 48 &&
    groups >= 8 &&
    reliefs === 0 &&
    earlier / Math.max(1, auto + earlier) >= 0.3
  )
    tips.push({
      id: 'larger',
      title: `Gruppen auf ${flow.batch + 1} vergrößern`,
      reason: `Keine Entlastung in ${days.length} Tagen, und ${earlier}-mal wurde die nächste Gruppe früher von Hand freigegeben – die Ausgabe schafft mehr.`,
      action: { type: 'flowSettings', yellow: flow.yellow, batch: flow.batch + 1 },
    });
  // Groups in use, but released by hand only.
  if (flow.batch > 0 && !flow.autoOn && groups >= 5)
    tips.push({
      id: 'auto',
      title: 'Automatische Freigabe einschalten',
      reason: `Es wurden ${groups} Gruppen von Hand freigegeben. Die Automatik lernt die Zeit pro Kind und gibt selbst frei; die Taste bleibt jederzeit möglich.`,
      action: { type: 'autoSettings', on: true, start: Math.max(3, Math.min(180, Math.round(flow.autoStart / 10))) },
    });
  // Mensa needed on (almost) every day: open it right away.
  const mensa = days.filter(d => (d[14] ?? -1) >= 0).slice(-5);
  const mensaUsed = mensa.filter(d => d[14] > 0);
  if (mensa.length >= 3 && mensaUsed.length >= mensa.length - 1 && !rooms.M.open) {
    const seats = mensaSeats(Math.max(...mensaUsed.map(d => d[14])), rooms.M.capacity);
    tips.push({
      id: 'mensa',
      title: `Mensa heute gleich mit ${seats} Plätzen öffnen`,
      reason: `An ${mensaUsed.length} von ${mensa.length} Tagen wurde die Mensa gebraucht, höchstens ${Math.max(...mensaUsed.map(d => d[14]))} Plätze. Gilt für heute – beim nächsten Essenstag ist die Mensa wieder gesperrt und der Vorschlag erscheint erneut.`,
      action: { type: 'room', room: 'M', capacity: rooms.M.capacity, limit: seats, open: true },
    });
  }
  // Cards often missing at the end of the day: organisational tip only.
  const missingDays = days.filter(d => d[11] > 0).length;
  if (missingDays >= 3)
    tips.push({
      id: 'missing',
      title: 'Karten am Ende einsammeln',
      reason: `An ${missingDays} von ${days.length} Tagen fehlten Karten am Tagesende. Unter Betreuung → Hinweise steht, welche Nummern häufiger fehlen.`,
    });
  if (!tips.length)
    tips.push({
      id: 'fine',
      title: 'Alles im grünen Bereich',
      reason: `In den letzten ${days.length} Tagen gab es nichts, was sich klar verbessern ließe.`,
    });
  return tips;
}

/**
 * What-if simulator: children arrive at the door, most of them right at the start; groups of `batch` are admitted (0 = no groups, only seats
 * limit), the next group follows `batch × perChild` seconds after the first child of the group (as the automatic
 * release); the servery serves one child every `perChild` seconds; seats are free again after `stay` seconds.
 * A rough estimate, deterministic, in whole seconds.
 * @param {{ children: number, minutes: number, perChild: number, stay: number, seats: number, batch: number }} p
 */
export function simulate({ children, minutes, perChild, stay, seats, batch }) {
  children = Math.max(1, Math.min(500, Math.round(children)));
  perChild = Math.max(1, perChild);
  const spread = Math.max(0, minutes) * 60,
    // Most children come right at the start (after the bell): arrival share grows like the square root of time.
    arrivals = Array.from({ length: children }, (_, i) => Math.round(spread * (i / children) ** 2)),
    leave = [];
  let next = 0,
    inGroup = 0,
    groupStart = -1,
    releaseAt = 0,
    groups = 0,
    serveryFree = 0,
    doorWait = 0,
    doorMax = 0,
    serveryWait = 0,
    serveryMax = 0,
    queueMax = 0,
    t = 0;
  for (; next < children && t < 6 * 3600; t++) {
    while (leave.length && leave[0] <= t) leave.shift();
    let waiting = 0;
    for (let i = next; i < children && arrivals[i] <= t; i++) waiting++;
    queueMax = Math.max(queueMax, waiting);
    while (next < children && arrivals[next] <= t && leave.length < seats && (!batch || t >= releaseAt)) {
      const wait = t - arrivals[next];
      doorWait += wait;
      doorMax = Math.max(doorMax, wait);
      const start = Math.max(t, serveryFree);
      serveryFree = start + perChild;
      serveryWait += start - t;
      serveryMax = Math.max(serveryMax, start - t);
      leave.push(t + stay);
      leave.sort((a, b) => a - b);
      next++;
      if (batch) {
        if (inGroup === 0) {
          groupStart = t;
          groups++;
        }
        if (++inGroup >= batch) {
          releaseAt = groupStart + batch * perChild;
          inGroup = 0;
        }
      }
    }
  }
  const done = next;
  return {
    children,
    admitted: done,
    groups,
    doorAvg: done ? Math.round(doorWait / done) : 0,
    doorMax,
    serveryAvg: done ? Math.round(serveryWait / done) : 0,
    serveryMax,
    queueMax,
    minutes: Math.round(Math.max(t, serveryFree) / 60),
    complete: done === children,
  };
}
/** Seconds as short German text: "45 s", "3 Min.". */
export const waitText = s => (s < 60 ? `${s} s` : `${Math.round(s / 60)} Min.`);

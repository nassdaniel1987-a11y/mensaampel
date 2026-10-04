// Course of the day (0.23), computed in the tablet's browser from the short texts the Dial keeps (core/flow.hpp):
// curve (most cards out per 10 minutes from 10:00), dayEvents (what happened to the groups today) and peaks (most
// cards out per half hour from 10:00 for the last 60 closed days). Used by the timeline (Betrieb), the forecast curve
// and "Was die Automatik entschieden hat" (Einlass & Messungen) and the heat map (Statistik).
import { forecast, weekdays } from './insights.mjs';

export const curveFrom = 600,
  curveStep = 10,
  peakStep = 30;
export const eventKinds = {
  open: 0,
  full: 1,
  auto: 2,
  early: 3,
  hand: 4,
  reliefStart: 5,
  reliefEnd: 6,
  pause: 7,
  outlier: 8,
};
export const clock = m => `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, '0')}`;
const served = d => d && d[2] > 0;
// Weekday of today's report (set with the first clock of the day), else the clock's.
const todayWeekday = f => (f.today[1] >= 0 ? f.today[1] : f.weekday);
const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const duration = s =>
  s < 60 ? `${Math.max(0, Math.round(s))} Sekunden` : plural(Math.round(s / 60), 'Minute', 'Minuten');
const perChildText = tenths => `${Math.floor(tenths / 10)},${tenths % 10} s`;

const numbers = text =>
  text
    ? text
        .split(';')
        .map(l => l.split(',').map(Number))
        .filter(l => l.every(Number.isFinite))
    : [];
/** @param {string | undefined} text */
export const parseCurve = text => (text ? text.split(',').map(Number) : []);
/** @param {string | undefined} text */
export const parseDayEvents = text =>
  numbers(text)
    .filter(l => l.length === 4)
    .map(([minute, kind, a, b]) => ({ minute, kind, a, b }));
/** @param {string | undefined} text */
export const parsePeaks = text =>
  numbers(text)
    .filter(l => l.length === 13)
    .map(([day, ...values]) => ({ day, values }));

/**
 * Today's groups from the events: done (released), now (running or waiting) and planned ones.
 * @param {any} flow FlowState
 * @param {number} nowMinute
 */
export function groups(flow, nowMinute) {
  const list = [];
  let open = null;
  for (const e of parseDayEvents(flow.dayEvents)) {
    if (e.kind === eventKinds.open) {
      if (open && open.end < 0) open.end = e.minute;
      open = { start: e.minute, end: -1, size: e.a, isStart: e.b === 1, full: -1, children: 0, how: '' };
      list.push(open);
    } else if (open && e.kind === eventKinds.full) {
      open.full = e.minute;
      open.children = e.a;
    } else if (open && (e.kind === eventKinds.auto || e.kind === eventKinds.early || e.kind === eventKinds.hand)) {
      open.end = e.minute;
      open.how = e.kind === eventKinds.auto ? 'auto' : 'hand';
      open = null;
    }
  }
  return list.map((g, i) => {
    const label = i === 0 && g.isStart ? 'Start' : `Gruppe ${i + 1}`;
    const running = g.end < 0 && i === list.length - 1;
    return {
      ...g,
      label,
      state: running ? 'now' : 'done',
      end: g.end >= 0 ? g.end : running ? Math.max(nowMinute, g.start + 1) : g.start + 1,
      children: g.children || (running ? flow.issued : g.size),
    };
  });
}

/**
 * Timeline of today's lunch for the Betrieb page.
 * @param {any} state full State (flow, rooms, signal)
 */
export function timeline(state) {
  const f = state.flow,
    now = f.currentMinute ?? 0,
    clockOk = !!f.clockValid;
  if (!clockOk) return null;
  const past = groups(f, now);
  const p = forecast(f.history, todayWeekday(f), state.rooms?.M?.capacity ?? 64);
  const groupMinutes = f.auto ? Math.max(1, (f.auto.normalSize * f.auto.perChild) / 600) : 10;
  const plan = [];
  let nextAt = -1;
  if (f.batch > 0 && f.autoOn && !f.relief) {
    const last = past.at(-1);
    if (f.waiting && f.auto.releaseIn >= 0) nextAt = now + f.auto.releaseIn / 60;
    else if (last && last.state === 'now') nextAt = Math.max(now + 1, last.start + groupMinutes);
    else nextAt = now;
    // Remaining children: forecast meals minus today's issues; without a forecast only the next group.
    const left = p ? Math.max(0, p.meals - f.today[2]) : f.auto.normalSize;
    // While children still come (a group is running or waiting) at least the next group is shown.
    const going = f.issued > 0 || f.waiting;
    const count = Math.min(6, Math.max(going ? 1 : 0, Math.ceil(left / Math.max(1, f.auto.normalSize))));
    let at = nextAt,
      number = past.length + 1;
    for (let i = 0; i < count; i++) {
      plan.push({
        label: number === 1 && f.auto.nextIsStart ? 'Start' : `Gruppe ${number}`,
        state: 'plan',
        start: at,
        end: at + groupMinutes,
        size: i === 0 ? f.auto.nextSize : f.auto.normalSize,
        sub: `~ ${clock(at)}`,
      });
      number++;
      at += groupMinutes;
    }
  }
  const blocks = [
    ...past.map(g => ({
      label: g.label,
      state: g.state,
      start: g.start,
      end: g.end,
      size: g.size,
      sub:
        g.state === 'now'
          ? f.waiting
            ? `${g.children} Kinder · wartet`
            : `seit ${clock(g.start)}`
          : `${g.children || g.size} Kinder`,
    })),
    ...plan,
  ];
  const starts = [now, ...blocks.map(b => b.start)],
    ends = [now + 30, ...blocks.map(b => b.end)];
  let from = Math.floor(Math.min(...starts) / 30) * 30,
    to = Math.ceil(Math.max(...ends) / 30) * 30;
  if (to - from < 120) to = from + 120;
  if (to - from > 240) {
    // Keep the view readable: two hours before now at most.
    from = Math.max(from, Math.floor((now - 120) / 30) * 30);
    to = Math.min(to, from + 240);
  }
  const ticks = [];
  for (let m = from; m <= to; m += 30) ticks.push(m);

  // Next group.
  let next = null;
  const target = f.auto?.nextSize ?? f.batch;
  if (f.batch > 0) {
    if (f.relief) next = { title: 'Ausgabe wird entlastet', sub: 'Einlass wartet, bis ihr die Pause beendet' };
    else if (f.waiting && f.autoOn && f.auto.releaseIn >= 0)
      next = {
        title: f.auto.releaseIn < 60 ? 'gleich' : `in ca. ${Math.round(f.auto.releaseIn / 60)} Min.`,
        sub: `gegen ${clock(now + f.auto.releaseIn / 60)} · automatisch`,
      };
    else if (f.waiting) next = { title: 'von Hand freigeben', sub: 'Taste am Dial, wenn die Ausgabe bereit ist' };
    else if (f.issued > 0)
      next = {
        title: `noch ${plural(Math.max(0, target - f.issued), 'Kind', 'Kinder')}`,
        sub: 'bis diese Gruppe voll ist',
      };
    else next = { title: 'Einlass offen', sub: `nächste Gruppe: ${plural(target, 'Kind', 'Kinder')}` };
  }

  // Minutes per group today against the usual for this weekday (first to last issue / groups of the report).
  let compare = null;
  const done = past.filter(g => g.state === 'done');
  const usualDays = f.history.filter(d => served(d) && d[1] === todayWeekday(f) && d[4] >= 2 && d[9] >= 0).slice(-4);
  if (done.length >= 2 && usualDays.length) {
    const today = mean(done.map(g => g.end - g.start)),
      usual = mean(usualDays.map(d => (d[10] - d[9]) / d[4])),
      diff = Math.round(usual - today);
    compare = {
      title: Math.abs(diff) < 1 ? 'wie sonst' : diff > 0 ? `${diff} Min. schneller` : `${-diff} Min. langsamer`,
      sub: `pro Gruppe als sonst ${weekdays[todayWeekday(f)]}s (Ø ${Math.round(usual)} Min.)`,
      faster: diff >= 1,
    };
  }
  // Expected end: the usual last issue; once that time has passed while children still come, say so instead.
  let finish = null;
  if (p?.end) {
    const [h, m] = p.end.split(':').map(Number),
      usualEnd = h * 60 + m,
      lastPlan = plan.at(-1);
    if (usualEnd >= now)
      finish = {
        title: `ca. ${p.end}`,
        sub: plan.length
          ? `letzte Ausgabe · noch etwa ${plural(plan.length, 'Gruppe', 'Gruppen')}`
          : 'letzte Ausgabe, wie sonst',
      };
    else if (f.issued > 0 || f.waiting)
      finish = {
        title: lastPlan ? `ca. ${clock(lastPlan.end)}` : 'später als sonst',
        sub: `heute länger – sonst letzte Ausgabe gegen ${p.end}`,
      };
    else finish = { title: 'wohl fertig', sub: `sonst letzte Ausgabe gegen ${p.end}` };
  }
  return { from, to, now, ticks, blocks, next, compare, finish };
}

/**
 * Forecast curve for today's weekday (half-hour peaks of the last four same weekdays) and today's actual curve.
 * @param {any} state full State
 */
export function dayCurves(state) {
  const f = state.flow,
    now = f.currentMinute ?? 0,
    outNow = state.outCards?.length ?? 0;
  const byDay = new Map(parsePeaks(state.peaks).map(p => [p.day, p.values]));
  const days = f.history.filter(d => served(d) && d[1] === todayWeekday(f) && byDay.has(d[0])).slice(-4);
  const forecastPoints = [];
  if (days.length)
    for (let i = 0; i < 12; i++) {
      const values = days.map(d => byDay.get(d[0])[i]);
      if (values.every(v => v < 0)) continue;
      const v = values.map(x => Math.max(0, x));
      forecastPoints.push({
        minute: curveFrom + i * peakStep + peakStep / 2,
        mean: mean(v),
        low: Math.min(...v),
        high: Math.max(...v),
      });
    }
  const curve = parseCurve(f.curve);
  const actual = [];
  let last = -1;
  curve.forEach((v, i) => {
    if (v >= 0) last = i;
  });
  if (f.clockValid) {
    const nowSlot = Math.floor((now - curveFrom) / curveStep);
    for (let i = 0; i < curve.length && i <= nowSlot; i++) {
      const v = curve[i] >= 0 ? curve[i] : last >= 0 && i > last ? outNow : -1;
      if (v >= 0) actual.push({ minute: curveFrom + i * curveStep + curveStep / 2, value: v });
    }
    if (actual.length && now >= curveFrom) actual.push({ minute: now, value: outNow });
  }
  // Comparison now: actual against the forecast at this moment (linear between half hours).
  let note = null;
  if (forecastPoints.length && actual.length && f.clockValid) {
    const at = m => {
      const after = forecastPoints.findIndex(p => p.minute >= m);
      if (after <= 0) return forecastPoints[after === 0 ? 0 : forecastPoints.length - 1];
      const a = forecastPoints[after - 1],
        b = forecastPoints[after],
        t = (m - a.minute) / (b.minute - a.minute);
      const mix = k => a[k] + (b[k] - a[k]) * t;
      return { mean: mix('mean'), low: mix('low'), high: mix('high') };
    };
    const e = at(now),
      expected = Math.round(e.mean),
      diff = outNow - expected;
    const inBand = outNow >= Math.floor(e.low) - 2 && outNow <= Math.ceil(e.high) + 2;
    note = {
      tone: inBand ? 'ok' : 'warn',
      text:
        Math.abs(diff) <= 2
          ? `Bis jetzt wie vorhergesagt (${outNow} statt ${expected} Plätze belegt).`
          : `Bis jetzt ${diff > 0 ? 'voller' : 'ruhiger'} als vorhergesagt (${outNow} statt ${expected} Plätze belegt). ${
              inBand
                ? 'Das liegt noch im üblichen Bereich.'
                : `So ${diff > 0 ? 'voll' : 'ruhig'} war es an den letzten ${weekdays[todayWeekday(f)]}en nicht.`
            }`,
    };
  }
  const minutes = [...forecastPoints.map(p => p.minute), ...actual.map(p => p.minute)];
  if (!minutes.length) return { days: days.length, forecast: [], actual: [], note: null, from: 0, to: 0, max: 0 };
  const from = Math.floor((Math.min(...minutes) - 15) / 30) * 30,
    to = Math.ceil((Math.max(...minutes) + 15) / 30) * 30;
  const max = Math.max(10, ...forecastPoints.map(p => p.high), ...actual.map(p => p.value));
  return { days: days.length, forecast: forecastPoints, actual, note, from, to, max };
}

/**
 * Today's decisions in plain words, newest first; on top the next planned step.
 * @param {any} state full State
 */
export function decisions(state) {
  const f = state.flow,
    now = f.currentMinute ?? 0,
    list = [];
  const all = groups(f, now);
  let g = -1;
  for (const e of parseDayEvents(f.dayEvents)) {
    if (e.kind === eventKinds.open) g++;
    const group = all[g];
    const name = group ? (group.label === 'Start' ? 'Die Startgruppe' : group.label) : 'Die Gruppe';
    const item = (kind, title, why) => list.push({ minute: e.minute, time: clock(e.minute), kind, title, why });
    switch (e.kind) {
      case eventKinds.open:
        if (e.b === 1)
          item(
            'auto',
            `Startgruppe beginnt (${plural(e.a, 'Kind', 'Kinder')})`,
            'Nach einer Pause ist die erste Gruppe größer, damit an der Ausgabe gleich eine Schlange steht.',
          );
        break;
      case eventKinds.full:
        if (e.b < 0)
          item(
            'hand',
            `${name} ist voll`,
            `${plural(e.a, 'Kind ist', 'Kinder sind')} drin. Die Automatik ist aus: die nächste Gruppe gebt ihr von Hand frei.`,
          );
        break;
      case eventKinds.auto:
        item(
          'auto',
          'Nächste Gruppe freigegeben',
          `Seit dem ersten Kind von ${name === 'Die Startgruppe' ? 'der Startgruppe' : name} sind ${duration(e.a)} vergangen – so lange braucht die Ausgabe nach dem Gelernten (${perChildText(e.b)} pro Kind) für diese Gruppe.`,
        );
        break;
      case eventKinds.early:
        item(
          'hand',
          'Von Hand früher freigegeben',
          `Die Ausgabe war ${duration(e.a)} früher bereit als geplant. Die Automatik merkt sich das und wird zu dieser Zeit etwas schneller.`,
        );
        break;
      case eventKinds.hand:
        item('hand', 'Nächste Gruppe von Hand freigegeben', 'Mit der Taste am Dial oder am Tablet.');
        break;
      case eventKinds.reliefStart:
        item(
          'relief',
          'Ausgabe entlastet',
          e.a === 1
            ? 'Kurz nach einer automatischen Freigabe – das zählt als „zu früh“. Die Automatik wartet künftig etwas länger und macht die Gruppe etwas kleiner.'
            : 'Einlass angehalten, damit die Ausgabe aufholen kann.',
        );
        break;
      case eventKinds.reliefEnd:
        item(
          'relief',
          'Entlastung beendet',
          e.a >= 0 ? `Nach ${duration(e.a)} geht der Einlass weiter.` : 'Der Einlass geht weiter.',
        );
        break;
      case eventKinds.pause:
        item('hand', 'Einlass pausiert', 'Von Hand angehalten. Rückgaben gehen weiter.');
        break;
      case eventKinds.outlier:
        item(
          'learn',
          'Ausreißer nicht voll übernommen',
          `Diese Gruppe brauchte ${perChildText(e.a)} pro Kind – ungewöhnlich ${e.a > e.b ? 'lange' : 'schnell'}. Gelernt wird nur ${perChildText(e.b)}, damit ein einzelner Ausreißer nichts verstellt.`,
        );
        break;
    }
  }
  list.reverse();
  if (f.batch > 0 && f.autoOn && f.clockValid && !f.relief) {
    if (f.waiting && f.auto.releaseIn >= 0)
      list.unshift({
        minute: now + f.auto.releaseIn / 60,
        time: clock(now + f.auto.releaseIn / 60),
        kind: 'plan',
        title: 'Nächste Gruppe kommt als Nächstes',
        why: `In etwa ${duration(f.auto.releaseIn)}: nach der gelernten Zeit für diese Gruppe (${perChildText(f.auto.perChild)} pro Kind).`,
      });
    else if (f.issued > 0)
      list.unshift({
        minute: now,
        time: clock(now),
        kind: 'plan',
        title: 'Countdown startet, wenn die Gruppe voll ist',
        why: `Noch ${plural(Math.max(0, f.auto.nextSize - f.issued), 'Kind', 'Kinder')} bis zur vollen Gruppe.`,
      });
  }
  return list;
}

export const heatRanges = [
  { days: 20, label: '4 Wochen' },
  { days: 40, label: '8 Wochen' },
  { days: 60, label: 'Alle (60 Tage)' },
];
/**
 * Heat map: average most children at once per weekday and half hour over the last `days` serving days.
 * @param {any} state full State
 * @param {number} lastDays
 */
export function heatmap(state, lastDays = 20) {
  const byDay = new Map(parsePeaks(state.peaks).map(p => [p.day, p.values]));
  const days = state.flow.history.filter(d => served(d) && d[1] >= 0 && byDay.has(d[0])).slice(-lastDays);
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => []));
  for (const d of days) byDay.get(d[0]).forEach((v, i) => v >= 0 && cells[d[1]][i].push(v));
  const used = [...Array(12).keys()].filter(i => cells.some(row => row[i].length));
  const weekdaysUsed = [1, 2, 3, 4, 5, 6, 0].filter(w => (w < 6 && w > 0 ? true : cells[w].some(c => c.length)));
  const value = (w, i) => (cells[w][i].length ? Math.round(mean(cells[w][i])) : null);
  const top = Math.max(1, ...weekdaysUsed.flatMap(w => used.map(i => value(w, i) ?? 0)));
  const slotLabel = i => clock(curveFrom + i * peakStep);
  const rows = weekdaysUsed.map(w => ({
    weekday: w,
    label: weekdays[w],
    cells: used.map(i => {
      const v = value(w, i);
      return {
        value: v,
        level: v === null ? -1 : Math.min(5, Math.floor((v / top) * 6)),
        days: cells[w][i].length,
        title: `${weekdays[w]} ${slotLabel(i)}–${slotLabel(i + 1)}: ${
          v === null
            ? 'keine Daten'
            : `im Schnitt ${v} Kinder gleichzeitig (${plural(cells[w][i].length, 'Tag', 'Tage')})`
        }`,
      };
    }),
  }));
  let busiest = null,
    calmest = null;
  for (const r of rows)
    r.cells.forEach((c, k) => {
      if (c.value === null) return;
      const at = { weekday: r.label, from: slotLabel(used[k]), to: slotLabel(used[k] + 1), value: c.value };
      if (!busiest || c.value > busiest.value) busiest = at;
      if (c.value > 0 && (!calmest || c.value < calmest.value)) calmest = at;
    });
  return { days: days.length, slots: used.map(slotLabel), rows, busiest, calmest };
}

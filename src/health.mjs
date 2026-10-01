// "Gesundheit heute" (device tab): counters since the Dial was switched on, rated with fixed limits.
// level: 0 = ok (green), 1 = watch (yellow), 2 = act (red). Each row has one sentence on what to do.
const rate = (value, yellowFrom, redFrom) => (value >= redFrom ? 2 : value >= yellowFrom ? 1 : 0);
/**
 * @param {{ health?: { crash: boolean, readerFaults: number, saveFailures: number, ampelDrops: number, minBlock: number },
 *   resetReason?: string, webMaxMs?: number }} device
 * @param {{ failures: number } | undefined} diag
 */
export function healthRows(device, diag) {
  const h = device?.health;
  if (!h) return [];
  const kb = Math.round(h.minBlock / 1024);
  const rows = [
    {
      name: 'Start',
      level: h.crash ? 2 : 0,
      value: device.resetReason || '–',
      todo: h.crash
        ? device.resetReason === 'Stromeinbruch'
          ? 'Netzteil und USB-Kabel prüfen (zu schwach oder Wackelkontakt).'
          : 'Der Dial ist zuletzt abgestürzt. Uhrzeit und Text unter „Letzter Start“ notieren und melden.'
        : 'Alles in Ordnung.',
    },
    {
      name: 'Kartenleser',
      level: rate(h.readerFaults, 1, 3),
      value: `${h.readerFaults}× gestört`,
      todo: h.readerFaults ? 'Stecker der RFID-Unit prüfen; Kabel nicht knicken.' : 'Alles in Ordnung.',
    },
    {
      name: 'Speichern',
      level: rate(h.saveFailures, 1, 3),
      value: `${h.saveFailures}× fehlgeschlagen`,
      todo: h.saveFailures
        ? 'Meist erholt es sich selbst. Bei Rot: Sicherung herunterladen und „Speicherung prüfen“ tippen.'
        : 'Alles in Ordnung.',
    },
    {
      name: 'Arbeitsspeicher',
      level: kb >= 45 ? 0 : kb >= 32 ? 1 : 2,
      value: `knappster Block ${kb} KB`,
      todo: kb >= 45 ? 'Alles in Ordnung.' : 'Nach dem Mittag den Dial einmal aus- und einschalten; Wert notieren.',
    },
    {
      name: 'Ampel draußen',
      level: rate(h.ampelDrops, 1, 4),
      value: `${h.ampelDrops}× getrennt`,
      todo: h.ampelDrops
        ? 'Ampel-Tablet: Ladekabel dran, Bildschirm-Ruhezustand aus, nicht zu weit vom Dial.'
        : 'Alles in Ordnung.',
    },
  ];
  if (device.webMaxMs !== undefined)
    rows.push({
      name: 'Antwortzeit',
      level: rate(device.webMaxMs, 1500, 4000),
      value: `längste ${device.webMaxMs} ms`,
      todo: device.webMaxMs >= 1500 ? 'Nur ein Browserfenster mit der Betreuung offen lassen.' : 'Alles in Ordnung.',
    });
  if (diag)
    rows.push({
      name: 'Dieses Tablet',
      level: rate(diag.failures, 3, 10),
      value: `${diag.failures} Aussetzer`,
      todo:
        diag.failures >= 3
          ? 'Nur einen Tab offen lassen und näher ans Dial gehen.'
          : 'Alles in Ordnung (0–2 Aussetzer sind normal).',
    });
  return rows;
}
/** Worst level of all rows (for the headline). */
export const healthLevel = rows => rows.reduce((m, r) => Math.max(m, r.level), 0);

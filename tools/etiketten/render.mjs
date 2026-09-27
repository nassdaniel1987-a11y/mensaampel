// One label as an SVG sized in millimetres. The layout adapts to wide, tall and round labels.
import { ROOMS, label } from './layout.mjs';
import { motif, confetti, PASTEL, motifIndex } from './motive.mjs';

const FONT = `'Arial Rounded MT Bold','Nunito','Segoe UI','Helvetica Neue',Arial,sans-serif`;
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const f = v => +v.toFixed(2);

// Room pill ("Küche" on the room colour) centred at (cx, cy).
function pill(cx, cy, size, room) {
  const r = ROOMS[room],
    w = r.name.length * size * 0.62 + size * 1.4,
    h = size * 1.45;
  return (
    `<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" fill="${r.color}"/>` +
    `<text x="${f(cx)}" y="${f(cy + size * 0.36)}" font-size="${f(size)}" font-weight="700" fill="#fff" text-anchor="middle" font-family="${FONT}">${esc(r.name)}</text>`
  );
}

const number = (cx, cy, size, text) =>
  `<text x="${f(cx)}" y="${f(cy + size * 0.36)}" font-size="${f(size)}" font-weight="900" fill="#1d2b36" text-anchor="middle" font-family="${FONT}" letter-spacing="${f(size * 0.02)}">${esc(text)}</text>`;

const brand = (cx, cy, size) =>
  `<text x="${f(cx)}" y="${f(cy + size * 0.36)}" font-size="${f(size)}" fill="#495057" text-anchor="middle" font-family="${FONT}">Mensaampel</text>`;

const art = (m, x, y, s) =>
  m ? `<svg x="${f(x)}" y="${f(y)}" width="${f(s)}" height="${f(s)}" viewBox="0 0 100 100">${m.svg}</svg>` : '';

export function labelSvg(item, theme, w, h, { radius = 0, round = false } = {}) {
  const m = motif(theme, item.room, item.n),
    text = label(item),
    idx = motifIndex(item.room, item.n),
    bg = theme === 'schlicht' ? '#fff' : PASTEL[idx % PASTEL.length],
    color = ROOMS[item.room].color,
    rr = round ? Math.min(w, h) / 2 : radius,
    inset = Math.min(w, h) * 0.035;
  let body = '';
  if (round) {
    const d = Math.min(w, h),
      cx = w / 2;
    body += art(m, cx - d * 0.23, d * 0.08, d * 0.46);
    body += number(cx, m ? d * 0.66 : d * 0.46, d * (m ? 0.2 : 0.3), text);
    body += pill(cx, m ? d * 0.84 : d * 0.74, d * 0.075, item.room);
  } else if (w / h >= 1.35) {
    const s = m ? h * 0.84 : 0,
      x0 = m ? s + h * 0.1 : 0,
      cx = (x0 + w) / 2,
      avail = w - x0;
    body += art(m, h * 0.08, (h - s) / 2, s);
    body += pill(cx, h * 0.19, Math.min(h * 0.11, avail * 0.095), item.room);
    body += number(cx, h * 0.56, Math.min(h * 0.4, avail * 0.3), text);
    body += brand(cx, h * 0.87, Math.min(h * 0.075, avail * 0.07));
  } else {
    const s = m ? Math.min(w * 0.7, h * 0.5) : 0;
    body += art(m, (w - s) / 2, h * 0.05, s);
    body += number(w / 2, m ? h * 0.05 + s + h * 0.14 : h * 0.45, Math.min(w * 0.28, h * 0.18), text);
    body += pill(w / 2, h * 0.9, Math.min(w * 0.08, h * 0.05), item.room);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">` +
    `<rect width="${f(w)}" height="${f(h)}" rx="${f(rr)}" fill="${bg}"/>` +
    (theme === 'schlicht' ? '' : confetti(idx + 1, w, h, round ? 5 : 8)) +
    `<rect x="${f(inset)}" y="${f(inset)}" width="${f(w - 2 * inset)}" height="${f(h - 2 * inset)}" rx="${f(Math.max(0, rr - inset))}" fill="none" stroke="${color}" stroke-width="${f(Math.min(w, h) * 0.018)}" stroke-dasharray="${theme === 'schlicht' ? 'none' : `${f(Math.min(w, h) * 0.05)} ${f(Math.min(w, h) * 0.03)}`}"/>` +
    body +
    '</svg>'
  );
}

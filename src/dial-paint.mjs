// Pixel rendering of the Dial draw list (240x240 round panel), shared by the simulation, the help tab and the printed
// guide. Exact port of core/dial_raster.hpp (integer arithmetic, RGB565): tests/dial-raster.test.mjs compares both.
import { faces, glyphs, alpha, sine } from './dial-font.mjs';
export const dialSize = 240;
const mix = (bg, fg, a) => {
  if (a >= 16) return fg;
  if (a <= 0) return bg;
  const ch = (shift, mask) => Math.floor((((fg >> shift) & mask) * a + ((bg >> shift) & mask) * (16 - a) + 8) / 16);
  return (ch(11, 31) << 11) | (ch(5, 63) << 5) | ch(0, 31);
};
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Same dithered gradient colour as raster::gradientColor.
const gradientColor = (c1, c2, w, x, y) => {
  const d = bayer[(y & 3) * 4 + (x & 3)];
  const ch = (shift, mask) => {
    const a = Math.floor((((c1 >> shift) & mask) * 255) / mask),
      b = Math.floor((((c2 >> shift) & mask) * 255) / mask),
      v = Math.floor((a * (256 - w) + b * w) / 256),
      q = Math.floor((v * mask * 16 + d * 255) / (255 * 16));
    return q > mask ? mask : q;
  };
  return (ch(11, 31) << 11) | (ch(5, 63) << 5) | ch(0, 31);
};
const coverage = (x, y, inside) => {
  let n = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (inside(8 * x + 2 * i + 1, 8 * y + 2 * j + 1)) n++;
  return n;
};
const inCircle = (sx, sy, cx, cy, r) => (sx - cx) * (sx - cx) + (sy - cy) * (sy - cy) <= r * r;
const cosine = d => sine[((d % 360) + 450) % 360];
const sin = d => sine[((d % 360) + 360) % 360];
const faceOf = size => faces[size < 1 ? 0 : size > faces.length ? faces.length - 1 : size - 1];
const glyphOf = (size, cp) => {
  const [first, count] = faceOf(size);
  for (const code of [cp, 63]) for (let n = first; n < first + count; n++) if (glyphs[n * 7] === code) return n * 7;
  return -1;
};
/** Width in pixels of a text in a Dial font size (same as raster::textWidth). */
export function textWidth(text, size) {
  let w = 0;
  for (const ch of text) {
    const g = glyphOf(size, ch.codePointAt(0));
    if (g >= 0) w += glyphs[g + 1];
  }
  return w;
}
export const capHeight = size => faceOf(size)[2];
/** True when every character of the text exists in the font size (no '?' replacement). */
export const supported = (text, size) =>
  [...text].every(ch => {
    const g = glyphOf(size, ch.codePointAt(0));
    return g >= 0 && glyphs[g] === ch.codePointAt(0);
  });
/** RGB565 frame of a draw list. */
export function paintFrame(items) {
  const size = dialSize,
    px = new Uint16Array(size * size);
  const blend = (x, y, c, a) => {
    if (x < 0 || x >= size || y < 0 || y >= size || a <= 0) return;
    const i = y * size + x;
    px[i] = a >= 16 ? c : mix(px[i], c, a);
  };
  for (const item of items) {
    const kind = item[0];
    if (kind === 'f') px.fill(item[1]);
    else if (kind === 'g') {
      const [, c1, c2, type] = item;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          let w;
          if (type === 1) {
            const dx = 2 * x - 239,
              dy = 2 * y - 239;
            w = Math.min(256, Math.floor(((dx * dx + dy * dy) * 256) / (239 * 239 * 2)));
          } else w = Math.floor((y * 256 + 119) / 239);
          px[y * size + x] = gradientColor(c1, c2, w, x, y);
        }
    } else if (kind === 'l') {
      const [, x0, y0, x1, y1, w, c] = item,
        ax = 8 * x0,
        ay = 8 * y0,
        bx = 8 * x1,
        by = 8 * y1,
        r = 4 * w,
        ex = bx - ax,
        ey = by - ay,
        len = ex * ex + ey * ey;
      const inside = (sx, sy) => {
        const qx = sx - ax,
          qy = sy - ay,
          dot = qx * ex + qy * ey;
        if (len === 0 || dot <= 0) return qx * qx + qy * qy <= r * r;
        if (dot >= len) return (sx - bx) * (sx - bx) + (sy - by) * (sy - by) <= r * r;
        return (qx * qx + qy * qy) * len - dot * dot <= r * r * len;
      };
      const pad = Math.trunc(w / 2) + 2,
        xa = Math.min(x0, x1) - pad,
        xb = Math.max(x0, x1) + pad;
      for (let y = Math.max(Math.min(y0, y1) - pad, 0); y < Math.min(Math.max(y0, y1) + pad, size); y++)
        for (let x = Math.max(xa, 0); x < xb && x < size; x++) blend(x, y, c, coverage(x, y, inside));
    } else if (kind === 'r') {
      let [, x, y, w, h, r, c] = item;
      if (r * 2 > w) r = Math.floor(w / 2);
      if (r * 2 > h) r = Math.floor(h / 2);
      for (let yy = Math.max(y, 0); yy < Math.min(y + h, size); yy++)
        for (let xx = Math.max(x, 0); xx < x + w && xx < size; xx++) {
          const left = xx < x + r,
            right = xx >= x + w - r,
            top = yy < y + r,
            bottom = yy >= y + h - r;
          if (!((left || right) && (top || bottom))) {
            px[yy * size + xx] = c;
            continue;
          }
          const cx = 8 * (left ? x + r : x + w - r),
            cy = 8 * (top ? y + r : y + h - r);
          blend(
            xx,
            yy,
            c,
            coverage(xx, yy, (sx, sy) => inCircle(sx, sy, cx, cy, 8 * r)),
          );
        }
    } else if (kind === 'c') {
      const [, cx, cy, r, c] = item;
      for (let y = Math.max(cy - r - 1, 0); y < Math.min(cy + r + 1, size); y++)
        for (let x = cx - r - 1; x <= cx + r; x++)
          if (x >= 0 && x < size)
            blend(
              x,
              y,
              c,
              coverage(x, y, (sx, sy) => inCircle(sx, sy, 8 * cx, 8 * cy, 8 * r)),
            );
    } else if (kind === 'a') {
      const [, cx, cy, r0, r1, a0, a1, c] = item,
        alpha = item.length > 8 ? item[8] : 16,
        span = a1 - a0;
      if (span <= 0) continue;
      const full = span >= 360,
        d0x = cosine(a0),
        d0y = sin(a0),
        d1x = cosine(a1),
        d1y = sin(a1),
        ox = 8 * cx,
        oy = 8 * cy,
        R0 = 8 * r0,
        R1 = 8 * r1,
        rm = 4 * (r0 + r1),
        cap = 4 * (r1 - r0),
        e0x = ox + Math.floor((rm * d0x) / 16384),
        e0y = oy + Math.floor((rm * d0y) / 16384),
        e1x = ox + Math.floor((rm * d1x) / 16384),
        e1y = oy + Math.floor((rm * d1y) / 16384);
      const inside = (sx, sy) => {
        const qx = sx - ox,
          qy = sy - oy,
          d2 = qx * qx + qy * qy;
        if (!full && (inCircle(sx, sy, e0x, e0y, cap) || inCircle(sx, sy, e1x, e1y, cap))) return true;
        if (d2 < R0 * R0 || d2 > R1 * R1) return false;
        if (full) return true;
        if (span <= 180) return d0x * qy - d0y * qx >= 0 && qx * d1y - qy * d1x >= 0;
        return !(d1x * qy - d1y * qx > 0 && qx * d0y - qy * d0x > 0);
      };
      const lo = r0 - 2 > 0 ? (r0 - 2) * (r0 - 2) : 0,
        hi = (r1 + 2) * (r1 + 2);
      for (let y = Math.max(cy - r1 - 2, 0); y < Math.min(cy + r1 + 2, size); y++)
        for (let x = cx - r1 - 2; x < cx + r1 + 2; x++) {
          if (x < 0 || x >= size) continue;
          const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
          if (d < lo || d > hi) continue;
          blend(x, y, c, Math.trunc((coverage(x, y, inside) * alpha) / 16));
        }
    } else if (kind === 't') {
      const [, x, y, s, c, text] = item;
      let pen = x - Math.trunc(textWidth(text, s) / 2);
      const base = y + Math.trunc(capHeight(s) / 2);
      for (const ch of text) {
        const g = glyphOf(s, ch.codePointAt(0));
        if (g < 0) continue;
        const [, adv, w, h, gx, gy, offset] = glyphs.slice(g, g + 7);
        for (let row = 0; row < h; row++)
          for (let col = 0; col < w; col++) {
            const k = row * w + col,
              v = alpha[offset + (k >> 1)],
              a = k % 2 ? v & 15 : v >> 4;
            blend(pen + gx + col, base + gy + row, c, Math.floor((a * 16 + 7) / 15));
          }
        pen += adv;
      }
    }
  }
  return px;
}
/** Returns RGBA pixels; outside the round panel stays transparent when round is set. */
export function paintDial(items, { round = false } = {}) {
  const frame = paintFrame(items),
    size = dialSize,
    px = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < frame.length; i++) {
    const c = frame[i];
    px[i * 4] = Math.round((((c >> 11) & 31) * 255) / 31);
    px[i * 4 + 1] = Math.round((((c >> 5) & 63) * 255) / 63);
    px[i * 4 + 2] = Math.round(((c & 31) * 255) / 31);
    px[i * 4 + 3] = 255;
  }
  if (round)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = x - 119.5,
          dy = y - 119.5;
        if (dx * dx + dy * dy > 120 * 120) px[(y * size + x) * 4 + 3] = 0;
      }
  return px;
}

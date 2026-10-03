#pragma once
// Reference copy of core/dial_raster.hpp before the 0.17.6 speed-ups (same pixels, slower); used only by the native
// benchmark to prove that the faster code paints exactly the same.
// Edges: 4x4 samples per pixel (coverage 0..16). Text: 4-bit alpha glyphs from core/dial_font.hpp.
#include "../../core/dial_font.hpp"
#include "../../core/vendor/json.hpp"
#include <cstdint>
#include <string>
namespace mensa::raster_ref {
// Rows y0..y0+h-1 of the 240-pixel-wide screen. swap: bytes swapped as in the M5GFX sprite buffer.
struct Target {
  uint16_t *px;
  int w, y0, h;
  bool swap;
  uint16_t get(int x, int y) const {
    uint16_t v = px[(y - y0) * w + x];
    return swap ? uint16_t(v << 8 | v >> 8) : v;
  }
  void set(int x, int y, uint16_t c) { px[(y - y0) * w + x] = swap ? uint16_t(c << 8 | c >> 8) : c; }
};
inline uint16_t mix(uint16_t bg, uint16_t fg, int a) {
  if (a >= 16) return fg;
  if (a <= 0) return bg;
  int r = (((fg >> 11) & 31) * a + ((bg >> 11) & 31) * (16 - a) + 8) / 16,
      g = (((fg >> 5) & 63) * a + ((bg >> 5) & 63) * (16 - a) + 8) / 16,
      b = ((fg & 31) * a + (bg & 31) * (16 - a) + 8) / 16;
  return uint16_t(r << 11 | g << 5 | b);
}
// Ordered 4x4 dither thresholds for smooth gradients in RGB565.
constexpr int bayer[16] = {0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5};
// Colour between c1 (w = 0) and c2 (w = 256), dithered by pixel position.
inline uint16_t gradientColor(uint16_t c1, uint16_t c2, int w, int x, int y) {
  int d = bayer[(y & 3) * 4 + (x & 3)];
  auto ch = [&](int shift, int mask) {
    int a = ((c1 >> shift) & mask) * 255 / mask, b = ((c2 >> shift) & mask) * 255 / mask;
    int v = (a * (256 - w) + b * w) / 256; // 0..255
    int q = (v * mask * 16 + d * 255) / (255 * 16);
    return q > mask ? mask : q;
  };
  return uint16_t(ch(11, 31) << 11 | ch(5, 63) << 5 | ch(0, 31));
}
inline void blend(Target &t, int x, int y, uint16_t c, int a) {
  if (x < 0 || x >= t.w || y < t.y0 || y >= t.y0 + t.h || a <= 0) return;
  t.set(x, y, a >= 16 ? c : mix(t.get(x, y), c, a));
}
inline int rowFrom(const Target &t, int y) {
  return y > t.y0 ? y : t.y0;
}
inline int rowTo(const Target &t, int y) {
  return y < t.y0 + t.h ? y : t.y0 + t.h;
}
inline void fill(Target &t, uint16_t c) {
  for (int y = t.y0; y < t.y0 + t.h; y++)
    for (int x = 0; x < t.w; x++)
      t.set(x, y, c);
}
// Background gradient: kind 0 vertical (c1 top, c2 bottom), kind 1 radial (c1 centre, c2 at the edge).
inline void gradient(Target &t, uint16_t c1, uint16_t c2, int kind) {
  for (int y = t.y0; y < t.y0 + t.h; y++)
    for (int x = 0; x < t.w; x++) {
      int w;
      if (kind == 1) {
        long long dx = 2 * x - 239, dy = 2 * y - 239, d2 = dx * dx + dy * dy;
        w = int(d2 * 256 / (239LL * 239 * 2));
        if (w > 256) w = 256;
      } else
        w = (y * 256 + 119) / 239;
      t.set(x, y, gradientColor(c1, c2, w, x, y));
    }
}
// Sample (i,j) of pixel (x,y) in 1/8 pixel units: 8x+2i+1.
template <typename In> int coverage(int x, int y, In inside) {
  int n = 0;
  for (int j = 0; j < 4; j++)
    for (int i = 0; i < 4; i++)
      n += inside(8 * x + 2 * i + 1, 8 * y + 2 * j + 1) ? 1 : 0;
  return n;
}
inline bool inCircle(long long sx, long long sy, long long cx, long long cy, long long r) {
  return (sx - cx) * (sx - cx) + (sy - cy) * (sy - cy) <= r * r;
}
// Rounded rectangle; corners are quarter circles of radius r (a pill when r = h/2).
inline void rect(Target &t, int x, int y, int w, int h, int r, uint16_t c) {
  if (r * 2 > w) r = w / 2;
  if (r * 2 > h) r = h / 2;
  for (int yy = rowFrom(t, y); yy < rowTo(t, y + h); yy++)
    for (int xx = x < 0 ? 0 : x; xx < x + w && xx < t.w; xx++) {
      bool left = xx < x + r, right = xx >= x + w - r, top = yy < y + r, bottom = yy >= y + h - r;
      if (!((left || right) && (top || bottom))) {
        t.set(xx, yy, c);
        continue;
      }
      long long cx = 8LL * (left ? x + r : x + w - r), cy = 8LL * (top ? y + r : y + h - r);
      blend(t, xx, yy, c,
            coverage(xx, yy, [&](long long sx, long long sy) { return inCircle(sx, sy, cx, cy, 8LL * r); }));
    }
}
// Filled circle around the pixel corner (cx, cy).
inline void circle(Target &t, int cx, int cy, int r, uint16_t c) {
  for (int y = rowFrom(t, cy - r - 1); y < rowTo(t, cy + r + 1); y++)
    for (int x = cx - r - 1; x <= cx + r; x++)
      if (x >= 0 && x < t.w)
        blend(t, x, y, c, coverage(x, y, [&](long long sx, long long sy) {
                return inCircle(sx, sy, 8LL * cx, 8LL * cy, 8LL * r);
              }));
}
inline long long floorDiv(long long a, long long b) {
  return a >= 0 ? a / b : -((-a + b - 1) / b);
}
inline long long cosine(int d) {
  return font::sine[((d % 360) + 450) % 360];
}
inline long long sine(int d) {
  return font::sine[((d % 360) + 360) % 360];
}
// Ring between radii r0 and r1 from angle a0 to a1 (degrees, 0 = right, clockwise); a partial ring has round ends.
inline void arc(Target &t, int cx, int cy, int r0, int r1, int a0, int a1, uint16_t c, int alpha = 16) {
  int span = a1 - a0;
  if (span <= 0) return;
  bool full = span >= 360;
  long long d0x = cosine(a0), d0y = sine(a0), d1x = cosine(a1), d1y = sine(a1);
  long long ox = 8LL * cx, oy = 8LL * cy, R0 = 8LL * r0, R1 = 8LL * r1;
  // Round ends: circles of half the ring width on the middle radius.
  long long rm = 4LL * (r0 + r1), cap = 4LL * (r1 - r0);
  long long e0x = ox + floorDiv(rm * d0x, 16384), e0y = oy + floorDiv(rm * d0y, 16384),
            e1x = ox + floorDiv(rm * d1x, 16384), e1y = oy + floorDiv(rm * d1y, 16384);
  auto inside = [&](long long sx, long long sy) {
    long long px = sx - ox, py = sy - oy, d2 = px * px + py * py;
    if (!full && (inCircle(sx, sy, e0x, e0y, cap) || inCircle(sx, sy, e1x, e1y, cap))) return true;
    if (d2 < R0 * R0 || d2 > R1 * R1) return false;
    if (full) return true;
    long long c0 = d0x * py - d0y * px, c1 = px * d1y - py * d1x;
    if (span <= 180) return c0 >= 0 && c1 >= 0;
    long long k0 = d1x * py - d1y * px, k1 = px * d0y - py * d0x;
    return !(k0 > 0 && k1 > 0);
  };
  long long lo = (r0 - 2) > 0 ? (r0 - 2) * (r0 - 2) : 0, hi = (r1 + 2) * (r1 + 2);
  for (int y = rowFrom(t, cy - r1 - 2); y < rowTo(t, cy + r1 + 2); y++)
    for (int x = cx - r1 - 2; x < cx + r1 + 2; x++) {
      if (x < 0 || x >= t.w) continue;
      long long dx = x - cx, dy = y - cy, d = dx * dx + dy * dy;
      if (d < lo || d > hi) continue;
      blend(t, x, y, c, coverage(x, y, inside) * alpha / 16);
    }
}
// Line from (x0,y0) to (x1,y1), width w pixels, round ends (pixel corner coordinates like circles).
inline void line(Target &t, int x0, int y0, int x1, int y1, int w, uint16_t c) {
  long long ax = 8LL * x0, ay = 8LL * y0, bx = 8LL * x1, by = 8LL * y1, r = 4LL * w;
  long long ex = bx - ax, ey = by - ay, len = ex * ex + ey * ey;
  auto inside = [&](long long sx, long long sy) {
    long long px = sx - ax, py = sy - ay, dot = px * ex + py * ey;
    if (len == 0 || dot <= 0) return px * px + py * py <= r * r;
    if (dot >= len) return (sx - bx) * (sx - bx) + (sy - by) * (sy - by) <= r * r;
    return (px * px + py * py) * len - dot * dot <= r * r * len;
  };
  int pad = w / 2 + 2, xa = (x0 < x1 ? x0 : x1) - pad, xb = (x0 > x1 ? x0 : x1) + pad;
  for (int y = rowFrom(t, (y0 < y1 ? y0 : y1) - pad); y < rowTo(t, (y0 > y1 ? y0 : y1) + pad); y++)
    for (int x = xa < 0 ? 0 : xa; x < xb && x < t.w; x++)
      blend(t, x, y, c, coverage(x, y, inside));
}
// Next code point of UTF-8 text; unsupported sequences count as '?'.
inline uint32_t next(const std::string &s, size_t &i) {
  unsigned char b = s[i++];
  if (b < 0x80) return b;
  int extra = b >= 0xf0 ? 3 : b >= 0xe0 ? 2 : b >= 0xc0 ? 1 : 0;
  uint32_t cp = b & (0x3f >> extra);
  for (int k = 0; k < extra && i < s.size(); k++)
    cp = cp << 6 | (s[i++] & 0x3f);
  return extra ? cp : '?';
}
constexpr int faceCount = sizeof(font::faces) / sizeof(font::faces[0]);
inline int face(int size) {
  return size < 1 ? 0 : size > faceCount ? faceCount - 1 : size - 1;
}
inline const font::Glyph *glyph(int size, uint32_t cp) {
  const auto &f = font::faces[face(size)];
  for (int k = 0; k < 2; k++, cp = '?')
    for (int n = f.first; n < f.first + f.count; n++)
      if (font::glyphs[n].code == cp) return &font::glyphs[n];
  return nullptr;
}
// Width in pixels (sum of advances) of a text in a size.
inline int textWidth(const std::string &s, int size) {
  int w = 0;
  for (size_t i = 0; i < s.size();)
    if (auto g = glyph(size, next(s, i))) w += g->advance;
  return w;
}
inline int capHeight(int size) {
  return font::faces[face(size)].cap;
}
// Text centred on (x, y): horizontally by its width, vertically by the capital height.
inline void text(Target &t, int x, int y, int size, uint16_t c, const std::string &s) {
  int pen = x - textWidth(s, size) / 2, base = y + capHeight(size) / 2;
  for (size_t i = 0; i < s.size();) {
    auto g = glyph(size, next(s, i));
    if (!g) continue;
    for (int row = 0; row < g->h; row++) {
      int yy = base + g->y + row;
      if (yy < t.y0 || yy >= t.y0 + t.h) continue;
      for (int col = 0; col < g->w; col++) {
        int k = row * g->w + col, v = font::alpha[g->offset + k / 2];
        int a = k % 2 ? v & 15 : v >> 4;
        blend(t, pen + g->x + col, yy, c, (a * 16 + 7) / 15);
      }
    }
    pen += g->advance;
  }
}
// Paints a whole draw list (see core/dial.hpp) into the target.
inline void paint(Target &t, const nlohmann::json &list) {
  for (const auto &i : list) {
    const std::string kind = i[0];
    auto n = [&](int k) { return i[k].get<int>(); };
    if (kind == "f")
      fill(t, uint16_t(n(1)));
    else if (kind == "g")
      gradient(t, uint16_t(n(1)), uint16_t(n(2)), n(3));
    else if (kind == "l")
      line(t, n(1), n(2), n(3), n(4), n(5), uint16_t(n(6)));
    else if (kind == "c")
      circle(t, n(1), n(2), n(3), uint16_t(n(4)));
    else if (kind == "r")
      rect(t, n(1), n(2), n(3), n(4), n(5), uint16_t(n(6)));
    else if (kind == "a")
      arc(t, n(1), n(2), n(3), n(4), n(5), n(6), uint16_t(n(7)), i.size() > 8 ? n(8) : 16);
    else if (kind == "t")
      text(t, n(1), n(2), n(3), uint16_t(n(4)), i[5].get<std::string>());
  }
}
} // namespace mensa::raster_ref

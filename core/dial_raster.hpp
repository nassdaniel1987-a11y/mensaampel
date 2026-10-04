#pragma once
// Smooth rendering of the Dial draw list into an RGB565 strip (firmware) or a whole frame (native test). Integer
// arithmetic only, so that src/dial-paint.mjs paints exactly the same pixels (tests/dial-raster.test.mjs).
// Edges: 4x4 samples per pixel (coverage 0..16). Text: 4-bit alpha glyphs from core/dial_font.hpp.
#include "dial_font.hpp"
#include "vendor/json.hpp"
#include <cmath>
#include <cstdint>
#include <algorithm>
#include <string>
namespace mensa::raster {
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
// The colour only depends on the weight (0..256) and the dither threshold: one table per colour pair (static, 8 KB,
// reused for all strips of a frame) instead of the channel arithmetic per pixel. Same pixels as gradientColor().
inline void gradient(Target &t, uint16_t c1, uint16_t c2, int kind) {
  static uint16_t table[257][16];
  static uint32_t key = 0;
  static bool ready = false;
  uint32_t k = uint32_t(c1) << 16 | c2;
  if (!ready || key != k) {
    for (int w = 0; w <= 256; w++)
      for (int p = 0; p < 16; p++) // p = dither position (y & 3) * 4 + (x & 3)
        table[w][p] = gradientColor(c1, c2, w, p & 3, p >> 2);
    key = k;
    ready = true;
  }
  for (int y = t.y0; y < t.y0 + t.h; y++) {
    const int row = (y & 3) * 4;
    const int dy = 2 * y - 239, dy2 = dy * dy, vertical = (y * 256 + 119) / 239;
    for (int x = 0; x < t.w; x++) {
      int w;
      if (kind == 1) {
        // 32-bit is enough (at most 2 * 239^2 * 256 < 2^31) and much faster on the Dial than 64-bit division.
        const int dx = 2 * x - 239;
        w = (dx * dx + dy2) * 256 / (239 * 239 * 2);
        if (w > 256) w = 256;
      } else
        w = vertical;
      t.set(x, y, table[w][row + (x & 3)]);
    }
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
// The 16 samples of pixel (x, y) lie in the box [8x+1, 8x+7] x [8y+1, 8y+7]. Nearest and farthest squared distance of
// that box to a point: when the whole box is inside (or outside) a circle, every sample is, and the 16 single tests
// can be skipped with exactly the same result.
struct Box {
  long long near2, far2;
};
inline Box box(int x, int y, long long cx, long long cy) {
  auto axis = [](long long lo, long long c, long long &nearD, long long &farD) {
    long long hi = lo + 6;
    nearD = c < lo ? lo - c : c > hi ? c - hi : 0;
    long long a = lo - c < 0 ? c - lo : lo - c, b = hi - c < 0 ? c - hi : hi - c;
    farD = a > b ? a : b;
  };
  long long nx, fx, ny, fy;
  axis(8LL * x + 1, cx, nx, fx);
  axis(8LL * y + 1, cy, ny, fy);
  return {nx * nx + ny * ny, fx * fx + fy * fy};
}
// Coverage of a filled circle (centre and radius in 1/8 pixel).
inline int circleCoverage(int x, int y, long long cx, long long cy, long long r) {
  Box b = box(x, y, cx, cy);
  if (b.far2 <= r * r) return 16;
  if (b.near2 > r * r) return 0;
  return coverage(x, y, [&](long long sx, long long sy) { return inCircle(sx, sy, cx, cy, r); });
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
      blend(t, xx, yy, c, circleCoverage(xx, yy, cx, cy, 8LL * r));
    }
}
// Filled circle around the pixel corner (cx, cy).
inline void circle(Target &t, int cx, int cy, int r, uint16_t c) {
  for (int y = rowFrom(t, cy - r - 1); y < rowTo(t, cy + r + 1); y++)
    for (int x = cx - r - 1; x <= cx + r; x++)
      if (x >= 0 && x < t.w) blend(t, x, y, c, circleCoverage(x, y, 8LL * cx, 8LL * cy, 8LL * r));
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
  // Exact shortcuts: the round ends stay within radius R1 + 2 (rounded centres), so a box beyond that is empty; a box
  // fully between the radii is full for a whole ring, and for a part of at most 180 degrees (a convex wedge) when all
  // four corners are inside the wedge (0.17.6).
  long long outer = (R1 + 2) * (R1 + 2), innerFree = R0 > 2 ? (R0 - 2) * (R0 - 2) : -1;
  // 0.22.1: for more than 180 degrees the part is everything outside the open wedge k0 > 0 && k1 > 0 (convex): a box
  // with all four corners at k0 <= 0 (or all at k1 <= 0) lies fully in that half-plane, so every sample is inside. A
  // box away from both round ends is empty when all corners lie outside the part (half-plane or open wedge, both
  // convex).
  auto k0 = [&](long long px, long long py) { return d1x * py - d1y * px; };
  auto k1 = [&](long long px, long long py) { return px * d0y - py * d0x; };
  auto c0 = [&](long long px, long long py) { return d0x * py - d0y * px; };
  auto c1 = [&](long long px, long long py) { return px * d1y - py * d1x; };
  auto clearOfEnds = [&](int x, int y) {
    return box(x, y, e0x, e0y).near2 > cap * cap && box(x, y, e1x, e1y).near2 > cap * cap;
  };
  auto fast = [&](int x, int y) {
    Box b = box(x, y, ox, oy);
    if (b.near2 > outer || b.far2 < innerFree) return 0;
    if (full) {
      if (b.near2 >= R0 * R0 && b.far2 <= R1 * R1) return 16;
      return coverage(x, y, inside);
    }
    long long lx = 8LL * x + 1 - ox, hx = lx + 6, ly = 8LL * y + 1 - oy, hy = ly + 6;
    // f holds at all four corners (f is linear, so then on the whole box).
    auto every = [&](auto f, auto ok) { return ok(f(lx, ly)) && ok(f(hx, ly)) && ok(f(lx, hy)) && ok(f(hx, hy)); };
    auto pos = [](long long v) { return v > 0; };
    auto neg = [](long long v) { return v < 0; };
    auto nonNeg = [](long long v) { return v >= 0; };
    auto nonPos = [](long long v) { return v <= 0; };
    if (b.near2 >= R0 * R0 && b.far2 <= R1 * R1) {
      if (span <= 180 ? every(c0, nonNeg) && every(c1, nonNeg) : every(k0, nonPos) || every(k1, nonPos)) return 16;
    }
    if (span <= 180 ? every(c0, neg) || every(c1, neg) : every(k0, pos) && every(k1, pos))
      if (clearOfEnds(x, y)) return 0;
    return coverage(x, y, inside);
  };
  long long lo = (r0 - 2) > 0 ? (r0 - 2) * (r0 - 2) : 0, hi = (r1 + 2) * (r1 + 2);
  // 0.25.1: a short part only visits the box around it (its end points on both radii, the axis points it passes, the
  // round ends and a margin) instead of the box of the whole ring: the wreath of the 0.24 design has up to eight such
  // parts. Pixels outside that box have no sample inside, so the result is exactly the same.
  int xa = cx - r1 - 2, xb = cx + r1 + 2, ya = cy - r1 - 2, yb = cy + r1 + 2;
  if (!full) {
    double lx = 1e9, hx = -1e9, ly = 1e9, hy = -1e9;
    auto point = [&](int deg, int r) {
      double px = cx + r * double(cosine(deg)) / 16384, py = cy + r * double(sine(deg)) / 16384;
      lx = std::min(lx, px), hx = std::max(hx, px), ly = std::min(ly, py), hy = std::max(hy, py);
    };
    for (int r : {r0, r1}) {
      point(a0, r);
      point(a1, r);
    }
    for (int m = (a0 >= 0 ? (a0 + 89) / 90 : a0 / 90) * 90; m < a1; m += 90)
      if (m > a0) point(m, r1);
    int pad = (r1 - r0) / 2 + 4;
    xa = std::max(xa, int(std::floor(lx)) - pad);
    xb = std::min(xb, int(std::ceil(hx)) + pad);
    ya = std::max(ya, int(std::floor(ly)) - pad);
    yb = std::min(yb, int(std::ceil(hy)) + pad);
  }
  for (int y = rowFrom(t, ya); y < rowTo(t, yb); y++)
    for (int x = xa; x < xb; x++) {
      if (x < 0 || x >= t.w) continue;
      long long dx = x - cx, dy = y - cy, d = dx * dx + dy * dy;
      if (d < lo || d > hi) continue;
      blend(t, x, y, c, fast(x, y) * alpha / 16);
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
} // namespace mensa::raster

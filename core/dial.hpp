#pragma once
#include "vendor/json.hpp"
#include "dial_raster.hpp"
#include <string>
#include <vector>
#include <cmath>
#include <cstdlib>
#include <algorithm>
namespace mensa {
// Main screen of the round 240x240 Dial display as a draw list. Firmware and simulation render the same list.
// Items: ["f",color] fill, ["c",x,y,r,color] filled circle, ["r",x,y,w,h,radius,color] filled round rect,
// ["a",cx,cy,r0,r1,a0,a1,color] ring, ["t",x,y,size,color,text] text centred at x,y (UTF-8, Inter sizes 1-4).
// Painted smoothly by core/dial_raster.hpp (Dial) and src/dial-paint.mjs (browser), pixel for pixel the same.
namespace dial {
// Calm, high-contrast palette (RGB565). The whole screen keeps the signal colour: green, amber, red.
constexpr int black = 0x0000, white = 0xFFFF, green = 0x1407, yellow = 0xFE62, red = 0xD924, orange = 0xFB82,
              grey = 0xA515, dark = 0x18C3, panel = 0x2125, button = 0x39E8, okText = 0x4EF0, warnText = 0xFDE4;
// Darker shade of a colour (share 0..16 of black), same arithmetic as raster::mix.
inline int shade(int c, int share) {
  return raster::mix(uint16_t(c), 0, share);
}
// Blend of two colours (share 0..16 of b), same arithmetic as raster::mix.
inline int mix(int a, int b, int share) {
  return raster::mix(uint16_t(a), uint16_t(b), share);
}
// Text as the font can show it: characters the size does not have become '?'.
inline std::string clean(const std::string &s, int size) {
  std::string out;
  for (size_t i = 0; i < s.size();) {
    size_t from = i;
    uint32_t cp = raster::next(s, i);
    auto g = raster::glyph(size, cp);
    if (g && g->code == cp)
      out.append(s, from, i - from);
    else
      out += '?';
  }
  return out;
}
// Usable text width on a line centred at y inside the round display (edge margin included).
inline int span(int y, int size) {
  int cap = raster::capHeight(size), top = y - cap / 2 - 2, bottom = y + cap / 2 + 4;
  int dy = std::max(std::abs(top - 120), std::abs(bottom - 120));
  if (dy >= 116) return 0;
  int h = 0;
  while ((h + 1) * (h + 1) <= 116 * 116 - dy * dy)
    h++;
  return 2 * h - 8;
}
// Cuts a text to a pixel width, ending with "…".
inline std::string fit(const std::string &text, int size, int width) {
  if (raster::textWidth(text, size) <= width) return text;
  std::string out;
  for (size_t i = 0; i < text.size();) {
    size_t from = i;
    raster::next(text, i);
    std::string longer = out + text.substr(from, i - from);
    if (raster::textWidth(longer + "…", size) > width) break;
    out = longer;
  }
  while (!out.empty() && out.back() == ' ')
    out.pop_back();
  return out + "…";
}
// Word wrap onto lines of the given pixel widths; overlong text ends with "…".
inline std::vector<std::string> wrap(const std::string &text, const std::vector<int> &widths, int size = 1) {
  std::vector<std::string> lines;
  std::string rest = clean(text, size);
  for (size_t n = 0; n < widths.size() && !rest.empty(); n++) {
    if (raster::textWidth(rest, size) <= widths[n]) {
      lines.push_back(rest);
      break;
    }
    if (n + 1 == widths.size()) {
      lines.push_back(fit(rest, size, widths[n]));
      break;
    }
    // Longest prefix up to a space that fits; a single overlong word is cut.
    size_t cut = std::string::npos;
    for (size_t i = rest.find(' '); i != std::string::npos; i = rest.find(' ', i + 1)) {
      if (raster::textWidth(rest.substr(0, i), size) > widths[n]) break;
      cut = i;
    }
    if (cut == std::string::npos) {
      lines.push_back(fit(rest, size, widths[n]));
      break;
    }
    lines.push_back(rest.substr(0, cut));
    rest = rest.substr(cut + 1);
  }
  return lines;
}
inline nlohmann::json text(int x, int y, int size, int color, const std::string &t) {
  return nlohmann::json::array({"t", x, y, size, color, clean(t, size)});
}
inline nlohmann::json fill(int color) {
  return nlohmann::json::array({"f", color});
}
inline nlohmann::json rect(int x, int y, int w, int h, int r, int color) {
  return nlohmann::json::array({"r", x, y, w, h, r, color});
}
// Ring along the edge: faint full track, progress clockwise from the top with round ends (0 = right, clockwise).
// Background: radial gradient from a lighter centre to a deeper edge (design 0.13).
struct Tone {
  int centre, edge, text;
};
// 0.21 (Stitch design "Gauge & Segment rings"): deeper radial gradients, white text everywhere; teal for a returned
// card.
constexpr Tone toneGreen{0x1407, 0x0162, white}, toneRed{0xB8E3, 0x4041, white}, toneAmber{0xB281, 0x40C0, white},
    toneDark{0x1947, 0x0022, white}, toneTeal{0x0BAD, 0x0165, white};
// Accents of the design: menu selection, start check states, light label colours on the gradients.
constexpr int accentBlue = 0x231D, checkGreen = 0x15D0, checkAmber = 0xF4E1, checkCyan = 0x675F, slate = 0x9517;
inline nlohmann::json gradient(const Tone &t) {
  return nlohmann::json::array({"g", t.centre, t.edge, 1});
}
inline nlohmann::json line(int x0, int y0, int x1, int y1, int w, int color) {
  return nlohmann::json::array({"l", x0, y0, x1, y1, w, color});
}
inline nlohmann::json circle(int x, int y, int r, int color) {
  return nlohmann::json::array({"c", x, y, r, color});
}
// Symbols drawn from lines (s = half size in pixels).
inline void iconCheck(nlohmann::json &l, int cx, int cy, int s, int w, int c) {
  l.push_back(line(cx - s, cy, cx - s / 3, cy + 2 * s / 3, w, c));
  l.push_back(line(cx - s / 3, cy + 2 * s / 3, cx + s, cy - 2 * s / 3, w, c));
}
inline void iconCross(nlohmann::json &l, int cx, int cy, int s, int w, int c) {
  l.push_back(line(cx - s, cy - s, cx + s, cy + s, w, c));
  l.push_back(line(cx + s, cy - s, cx - s, cy + s, w, c));
}
inline void iconPause(nlohmann::json &l, int cx, int cy, int s, int c) {
  int bar = s * 7 / 10;
  l.push_back(rect(cx - s, cy - s, bar, 2 * s, 3, c));
  l.push_back(rect(cx + s - bar, cy - s, bar, 2 * s, 3, c));
}
inline void iconAlert(nlohmann::json &l, int cx, int cy, int s, int c) {
  l.push_back(line(cx, cy - s, cx, cy + s / 3, std::max(3, s / 2), c));
  l.push_back(circle(cx, cy + s, std::max(2, s / 4), c));
}
inline nlohmann::json band(int r0, int r1, int a0, int a1, int color) {
  return nlohmann::json::array({"a", 120, 120, r0, r1, a0, a1, color});
}
// Gauge along the edge with a gap at the top for the key hint (angles: 270 = top, clockwise). share 0..1 fills from the
// left end of the gap clockwise; both ends of the filled part are rounded.
constexpr int gaugeFrom = 312, gaugeSweep = 276, gaugeInner = 105, gaugeOuter = 114;
inline void gauge(nlohmann::json &list, double share, int color, int track) {
  list.push_back(band(gaugeInner, gaugeOuter, gaugeFrom, gaugeFrom + gaugeSweep, track));
  if (share <= 0) return;
  int end = gaugeFrom + std::max(1, int(std::lround(gaugeSweep * std::min(share, 1.0))));
  list.push_back(band(gaugeInner, gaugeOuter, gaugeFrom, end, color));
  for (int a : {gaugeFrom, end}) {
    double rad = a * 3.14159265358979 / 180, r = (gaugeInner + gaugeOuter) / 2.0;
    list.push_back(circle(int(std::lround(120 + r * std::cos(rad))), int(std::lround(120 + r * std::sin(rad))),
                          (gaugeOuter - gaugeInner) / 2, color));
  }
}
// Ring in `pieces` equal parts with gaps of `gap` degrees (segment rings of the design).
inline void segments(nlohmann::json &list, int r0, int r1, int pieces, int gap, int color, int start = 270) {
  for (int i = 0; i < pieces; i++) {
    int a0 = start + i * 360 / pieces + gap / 2;
    list.push_back(band(r0, r1, a0, start + (i + 1) * 360 / pieces - gap / 2, color));
  }
}
inline void ring(nlohmann::json &list, double share, int color, int track) {
  if (share <= 0) return;
  list.push_back(nlohmann::json::array({"a", 120, 120, 110, 118, 0, 360, track}));
  int end = 270 + int(std::lround(360 * std::min(share, 1.0)));
  list.push_back(nlohmann::json::array({"a", 120, 120, 110, 118, 270, std::max(end, 271), color}));
}
} // namespace dial
// Device-specific additions supplied by firmware or simulation host.
// screen: "" main screen, "check" start check after power-on, "credentials" WLAN data, "reset" access reset question,
// "broken" invalid configuration, "test" device test with lines.
struct DialExtras {
  bool blocked = false;
  std::string hint, feedback;
  bool feedbackOk = true;
  // What the feedback is about: 0 other, 1 card issued, 2 card returned (own screens in the 0.21 design).
  int feedbackKind = 0;
  std::string screen, ssid, wifi, setupCode;
  // Start check (screen "check"): name and state per line (0 ok, 1 waiting, 2 fault).
  std::vector<std::pair<std::string, int>> checks;
  // Address the tablets open (own WLAN; in router mode the Dial's address in the router network).
  std::string url = "http://192.168.4.1";
  bool configured = true;
  std::vector<std::string> lines;
  // How long the button has been held so far (ms); the Dial shows a progress ring towards 3 s (and 10 s).
  int holdMs = 0;
  // Firmware update in progress (screen "update"): percent transferred.
  int progress = 0;
};
} // namespace mensa

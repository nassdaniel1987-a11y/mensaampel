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
inline void ring(nlohmann::json &list, double share, int color, int track) {
  if (share <= 0) return;
  list.push_back(nlohmann::json::array({"a", 120, 120, 110, 118, 0, 360, track}));
  int end = 270 + int(std::lround(360 * std::min(share, 1.0)));
  list.push_back(nlohmann::json::array({"a", 120, 120, 110, 118, 270, std::max(end, 271), color}));
}
} // namespace dial
// Device-specific additions supplied by firmware or simulation host.
// screen: "" main screen, "credentials" WLAN data, "reset" access reset question, "broken" invalid configuration,
// "test" device test with lines.
struct DialExtras {
  bool blocked = false;
  std::string hint, feedback;
  bool feedbackOk = true;
  std::string screen, ssid, wifi, setupCode;
  bool configured = true;
  std::vector<std::string> lines;
  // How long the button has been held so far (ms); the Dial shows a progress ring towards 3 s (and 10 s).
  int holdMs = 0;
  // Firmware update in progress (screen "update"): percent transferred.
  int progress = 0;
};
} // namespace mensa

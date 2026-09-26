#pragma once
#include "vendor/json.hpp"
#include <string>
#include <vector>
#include <cmath>
#include <cstdlib>
#include <algorithm>
namespace mensa {
// Main screen of the round 240x240 Dial display as a draw list. Firmware and simulation render the same list.
// Items: ["c",x,y,r,color] filled circle, ["r",x,y,w,h,radius,color] filled round rect, ["t",x,y,size,color,text] text
// (middle_center, GLCD font 6x8).
namespace dial {
constexpr int black = 0x0000, white = 0xFFFF, red = 0xF800, green = 0x07E0, yellow = 0xFFE0, orange = 0xFDA0,
              grey = 0x7BEF;
// The GLCD font only has ASCII glyphs that look right; German texts are transliterated.
inline std::string ascii(const std::string &s) {
  std::string out;
  for (size_t i = 0; i < s.size(); i++) {
    unsigned char c = s[i];
    if (c < 0x80) {
      out += char(c);
      continue;
    }
    if (c == 0xC3 && i + 1 < s.size()) {
      unsigned char d = s[++i];
      switch (d) {
      case 0xA4:
        out += "ae";
        break;
      case 0xB6:
        out += "oe";
        break;
      case 0xBC:
        out += "ue";
        break;
      case 0x84:
        out += "Ae";
        break;
      case 0x96:
        out += "Oe";
        break;
      case 0x9C:
        out += "Ue";
        break;
      case 0x9F:
        out += "ss";
        break;
      default:
        out += '?';
      }
      continue;
    }
    if (c == 0xE2 && i + 2 < s.size()) {
      unsigned char d = s[i + 1], e = s[i + 2];
      i += 2;
      if (d == 0x80 && (e == 0x93 || e == 0x94))
        out += '-';
      else if (d == 0x80 && (e == 0x9E || e == 0x9C || e == 0x9D))
        out += '"';
      else if (d == 0x80 && e == 0xA6)
        out += "...";
      else
        out += '?';
      continue;
    }
    while (i + 1 < s.size() && (static_cast<unsigned char>(s[i + 1]) & 0xC0) == 0x80)
      i++;
    out += '?';
  }
  return out;
}
// Characters that fit completely inside the round display on a text line centred at y.
inline int chars(int y, int size = 1) {
  int h = 8 * size, top = y - h / 2, bottom = top + h - 1;
  int dy = std::max(std::abs(top - 120), std::abs(bottom - 119));
  if (dy >= 120) return 0;
  int half = int(std::floor(std::sqrt(120.0 * 120.0 - double(dy) * dy)));
  return (2 * half) / (6 * size);
}
// Word wrap onto the given lines; overlong text ends with "..".
inline std::vector<std::string> wrap(const std::string &text, const std::vector<int> &ys) {
  std::vector<std::string> lines;
  std::string rest = ascii(text);
  for (size_t n = 0; n < ys.size() && !rest.empty(); n++) {
    size_t width = size_t(chars(ys[n]));
    if (rest.size() <= width) {
      lines.push_back(rest);
      rest.clear();
      break;
    }
    bool last = n + 1 == ys.size();
    size_t limit = last ? width - 2 : width;
    size_t cut = rest.rfind(' ', limit);
    if (cut == std::string::npos || cut == 0) cut = limit;
    std::string line = rest.substr(0, cut);
    while (!line.empty() && line.back() == ' ')
      line.pop_back();
    if (last) {
      lines.push_back(line + "..");
      rest.clear();
    } else {
      lines.push_back(line);
      rest = rest.substr(cut);
      while (!rest.empty() && rest.front() == ' ')
        rest.erase(rest.begin());
    }
  }
  return lines;
}
inline nlohmann::json text(int x, int y, int size, int color, const std::string &t) {
  return nlohmann::json::array({"t", x, y, size, color, ascii(t)});
}
inline nlohmann::json fill(int color) {
  return nlohmann::json::array({"f", color});
}
inline nlohmann::json rect(int x, int y, int w, int h, int r, int color) {
  return nlohmann::json::array({"r", x, y, w, h, r, color});
}
// Countdown ring clockwise from the top; angles as in M5GFX fillArc (0 = right, clockwise), split so that each arc
// stays within 0..360.
inline void ring(nlohmann::json &list, double share, int color) {
  if (share <= 0) return;
  int end = 270 + int(std::lround(360 * std::min(share, 1.0)));
  list.push_back(nlohmann::json::array({"a", 120, 120, 110, 119, 270, std::min(end, 360), color}));
  if (end > 360) list.push_back(nlohmann::json::array({"a", 120, 120, 110, 119, 0, end - 360, color}));
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
};
} // namespace mensa

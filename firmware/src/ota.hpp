#pragma once
// Firmware update over the Dial's WLAN: recognising a Mensaampel firmware while it streams in, and the decision to
// fall back to the previous firmware when a new one never runs healthily. No Arduino dependencies (native tests:
// tests/native/ota.cpp).
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string>
namespace mensa::ota {
// Every Mensaampel firmware contains this mark followed by its version and a zero byte (see main.cpp). The tablet
// (src/firmware-file.mjs) checks the same before uploading.
// The pattern is kept with '#' instead of the final ':' so that the scanner's own copy in flash never counts as the
// mark; expected() puts the ':' back.
constexpr const char *markBase = "MENSAAMPEL-FIRMWARE-1#";
constexpr size_t markLength = 22;
inline char expected(size_t i) {
  return i + 1 == markLength ? ':' : markBase[i];
}
// Finds the mark in data arriving in blocks of any size (also across block boundaries) and reads the version.
class MarkScan {
  size_t matched = 0;
  bool inVersion = false;
  static size_t fallback(size_t matched, char c) {
    // Knuth-Morris-Pratt with the borders of the mark computed on the fly (the mark is short).
    while (matched > 0) {
      size_t border = 0;
      for (size_t k = matched - 1; k > 0 && !border; k--) {
        bool same = true;
        for (size_t j = 0; j < k && same; j++)
          same = expected(j) == expected(matched - k + j);
        if (same) border = k;
      }
      matched = border;
      if (expected(matched) == c) return matched + 1;
    }
    return expected(0) == c ? 1 : 0;
  }

public:
  bool found = false;
  std::string version;
  void feed(const uint8_t *data, size_t n) {
    for (size_t i = 0; i < n; i++) {
      char c = char(data[i]);
      if (inVersion) {
        if (c == 0 || version.size() >= 40)
          inVersion = false;
        else
          version += c;
        continue;
      }
      if (found) return;
      if (expected(matched) == c)
        matched++;
      else
        matched = fallback(matched, c);
      if (matched == markLength) {
        found = true;
        inVersion = true;
      }
    }
  }
};
// Boot of a freshly installed firmware: tries counts starts without reaching "healthy" (60 s running, web server
// up). After three such starts the Dial switches back to the previous firmware.
enum class BootAction { None, Count, Rollback };
inline BootAction onBoot(bool pending, int tries) {
  if (!pending) return BootAction::None;
  return tries + 1 > 3 ? BootAction::Rollback : BootAction::Count;
}
} // namespace mensa::ota

#pragma once
// Sound sets for the Dial's buzzer (1-bit, so the waveform cannot be shaped): short melodies with frequencies where
// a small piezo sounds clean (about 2-4 kHz), instead of one long tone or a low buzz. The tablet plays the same
// tables with WebAudio (src/sounds.mjs; tests/sounds.test.mjs compares both).
#include <cstdint>
namespace mensa::sound {
enum Event { Issue, Return, Error, Info, Remind, Menu, EventCount };
struct Note {
  uint16_t freq, ms, gap; // freq 0 = silence
};
constexpr int setCount = 4;
constexpr const char *setNames[setCount] = {"Klassisch", "Ping", "Gong", "Marimba"};
// One row per set, one melody per event (Issue, Return, Error, Info, Remind, Menu), at most 4 notes.
constexpr Note table[setCount][EventCount][4] = {
    // Klassisch: the tones up to 0.12
    {{{1800, 90, 0}},
     {{1800, 90, 0}},
     {{400, 220, 0}},
     {{1800, 90, 0}},
     {{1400, 120, 40}, {1400, 120, 0}},
     {{1800, 90, 0}}},
    // Ping: bright double tone near the buzzer resonance
    {{{2637, 55, 15}, {3520, 90, 0}},
     {{3520, 55, 15}, {2637, 90, 0}},
     {{1568, 110, 60}, {1568, 110, 0}},
     {{3136, 60, 0}},
     {{2637, 70, 50}, {3136, 70, 50}, {2637, 70, 0}},
     {{3520, 40, 20}, {3520, 40, 0}}},
    // Gong: rising/falling third, a little longer
    {{{2093, 90, 10}, {2637, 170, 0}},
     {{2637, 90, 10}, {2093, 170, 0}},
     {{1760, 140, 30}, {1319, 220, 0}},
     {{2349, 110, 0}},
     {{2093, 110, 30}, {2637, 110, 30}, {3136, 160, 0}},
     {{2637, 80, 0}}},
    // Marimba: short plucked notes, a little chord
    {{{2349, 35, 25}, {2960, 35, 25}, {3520, 70, 0}},
     {{3520, 35, 25}, {2960, 35, 25}, {2349, 70, 0}},
     {{1976, 45, 45}, {1760, 45, 45}, {1480, 90, 0}},
     {{2960, 45, 0}},
     {{2349, 40, 30}, {3520, 40, 120}, {2349, 40, 30}, {3520, 40, 0}},
     {{3136, 35, 0}}},
};
inline int length(int set, int event) {
  int n = 0;
  while (n < 4 && table[set][event][n].ms)
    n++;
  return n;
}
} // namespace mensa::sound

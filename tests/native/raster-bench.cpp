// Speed of the Dial rendering (core/dial_raster.hpp) against the reference copy before the 0.17.6 speed-ups: same
// pixels required. Reads draw lists (JSON array) on stdin, paints each in five 48-row strips like the Dial, many times.
// Prints: identical(0/1) referenceMicros fastMicros per frame.
#include "../../core/dial_raster.hpp"
#include "raster_ref.hpp"
#include <chrono>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <iterator>
int main() {
  std::string input((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
  auto lists = nlohmann::json::parse(input);
  static uint16_t a[240 * 48], b[240 * 48];
  bool same = true;
  for (auto &list : lists)
    for (int y = 0; y < 240; y += 48) {
      mensa::raster::Target t{a, 240, y, 48, true};
      mensa::raster_ref::Target r{b, 240, y, 48, true};
      mensa::raster::paint(t, list);
      mensa::raster_ref::paint(r, list);
      if (memcmp(a, b, sizeof a)) same = false;
    }
  const int rounds = 30;
  auto time = [&](auto paint) {
    auto t0 = std::chrono::steady_clock::now();
    for (int k = 0; k < rounds; k++)
      for (auto &list : lists)
        for (int y = 0; y < 240; y += 48)
          paint(list, y);
    return std::chrono::duration<double, std::micro>(std::chrono::steady_clock::now() - t0).count() /
           (rounds * lists.size());
  };
  double ref = time([&](const nlohmann::json &list, int y) {
    mensa::raster_ref::Target r{b, 240, y, 48, true};
    mensa::raster_ref::paint(r, list);
  });
  double fast = time([&](const nlohmann::json &list, int y) {
    mensa::raster::Target t{a, 240, y, 48, true};
    mensa::raster::paint(t, list);
  });
  printf("%d %.0f %.0f\n", same ? 1 : 0, ref, fast);
}

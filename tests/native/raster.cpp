// Paints draw lists (JSON array of lists on stdin) with core/dial_raster.hpp, in five 48-row strips like the Dial,
// and prints one FNV-1a hash of the RGB565 frame per list.
#include "../../core/dial_raster.hpp"
#include <cstdio>
#include <iostream>
#include <iterator>
int main() {
  std::string input((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
  auto lists = nlohmann::json::parse(input);
  static uint16_t frame[240 * 240], strip[240 * 48];
  for (auto &list : lists) {
    for (int y = 0; y < 240; y += 48) {
      mensa::raster::Target t{strip, 240, y, 48, true};
      mensa::raster::paint(t, list);
      for (int i = 0; i < 240 * 48; i++)
        frame[y * 240 + i] = uint16_t(strip[i] << 8 | strip[i] >> 8);
    }
    uint32_t h = 2166136261u;
    for (auto v : frame) {
      h = (h ^ (v & 255)) * 16777619u;
      h = (h ^ (v >> 8)) * 16777619u;
    }
    printf("%08x\n", h);
  }
}

// Mark search over arbitrary block sizes and the fall-back decision (firmware/src/ota.hpp).
#include "../../firmware/src/ota.hpp"
#include <cstdio>
#include <vector>
using namespace mensa::ota;
static int failures = 0;
static void check(bool ok, const char *what) {
  if (!ok) {
    failures++;
    printf("FEHLER %s\n", what);
  }
}
static MarkScan scan(const std::string &data, size_t block) {
  MarkScan s;
  for (size_t i = 0; i < data.size(); i += block)
    s.feed((const uint8_t *)data.data() + i, std::min(block, data.size() - i));
  return s;
}
int main() {
  std::string image = std::string("\xe9", 1) + std::string(300, 'x') + "MENSAAMPEL-FIRMWARE-1#" + std::string(50, 'y') +
                      "MENSAMENSAAMPEL-FIRMWARE-1:1.2.3-preview" + std::string(1, '\0') + std::string(200, 'z');
  for (size_t block = 1; block <= 64; block++) {
    auto s = scan(image, block);
    check(s.found && s.version == "1.2.3-preview", "Marke über Blockgrenzen");
  }
  check(!scan(std::string(1000, 'x') + "MENSAAMPEL-FIRMWARE-1#0.1", 7).found, "Suchmuster zählt nicht als Marke");
  check(onBoot(false, 5) == BootAction::None, "ohne Update nichts tun");
  check(onBoot(true, 0) == BootAction::Count && onBoot(true, 2) == BootAction::Count, "erste drei Starts zählen");
  check(onBoot(true, 3) == BootAction::Rollback, "nach drei Fehlstarts zurück");
  printf("ok %d\n", failures);
  return failures ? 1 : 0;
}

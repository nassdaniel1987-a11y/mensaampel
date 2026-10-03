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
  check(chunk(0, 100, 0, 1000, 100) == ChunkAction::Write, "erstes Stück schreiben");
  check(chunk(100, 100, 100, 1000, 100) == ChunkAction::Write, "nächstes Stück schreiben");
  check(chunk(0, 100, 200, 1000, 100) == ChunkAction::Skip, "wiederholtes Stück nur bestätigen");
  check(chunk(100, 100, 200, 1000, 100) == ChunkAction::Skip, "letztes Stück wiederholt");
  check(chunk(300, 100, 200, 1000, 100) == ChunkAction::Reject, "Lücke abgelehnt");
  check(chunk(150, 100, 200, 1000, 100) == ChunkAction::Reject, "überlappend abgelehnt");
  check(chunk(900, 101, 900, 1000, 200) == ChunkAction::Reject, "über das Ende");
  check(chunk(0, 101, 0, 1000, 100) == ChunkAction::Reject, "zu groß");
  check(chunk(0, 0, 0, 1000, 100) == ChunkAction::Reject, "leer");
  check(chunk(950, 50, 950, 1000, 100) == ChunkAction::Write, "kurzes letztes Stück");
  printf("ok %d\n", failures);
  return failures ? 1 : 0;
}

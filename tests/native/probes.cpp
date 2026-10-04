// Connectivity-check answers (firmware/src/probes.hpp): prints one line per path for the test.
#include "../../firmware/src/probes.hpp"
#include <cstdio>
int main() {
  const char *paths[] = {"/generate_204",
                         "/gen_204",
                         "/hotspot-detect.html",
                         "/library/test/success.html",
                         "/connecttest.txt",
                         "/ncsi.txt",
                         "/success.txt",
                         "/canonical.html",
                         "/",
                         "/ampel",
                         "/api/state"};
  for (auto p : paths) {
    auto a = mensa::probe::answer(p);
    printf("%s|%d|%s|%s\n", p, a.code, a.type, a.body);
  }
}

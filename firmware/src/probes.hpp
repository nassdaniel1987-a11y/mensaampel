#pragma once
// Answers to the "do I have internet?" checks of tablets and phones. The Dial WLAN has no internet on purpose; without
// an answer tablets treat it as a bad network, scan and reconnect now and then (seen at the device: the tablet left the
// WLAN for 10-15 s about every minute). With these answers (and a DNS that points every name to the Dial) they stay.
// Pure function, tested natively (tests/native-probes.test.mjs).
#include <cstring>
namespace mensa::probe {
struct Answer {
  int code; // 0 = not a connectivity check
  const char *type, *body;
};
inline Answer answer(const char *path) {
  auto is = [&](const char *p) { return std::strcmp(path, p) == 0; };
  if (is("/generate_204") || is("/gen_204")) return {204, "text/plain", ""};
  if (is("/hotspot-detect.html") || is("/library/test/success.html"))
    return {200, "text/html", "<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>"};
  if (is("/connecttest.txt")) return {200, "text/plain", "Microsoft Connect Test"};
  if (is("/ncsi.txt")) return {200, "text/plain", "Microsoft NCSI"};
  if (is("/success.txt")) return {200, "text/plain", "success\n"};
  if (is("/canonical.html"))
    return {200, "text/html",
            "<meta http-equiv=\"refresh\" content=\"0;url=https://support.mozilla.org/kb/captive-portal\"/>"};
  return {0, "", ""};
}
} // namespace mensa::probe

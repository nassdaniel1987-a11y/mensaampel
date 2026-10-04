#pragma once
// WLAN of a router (0.18.0): the Dial joins a small router without internet instead of opening its own WLAN. Checks of
// the router settings, the allowed host names and the rescue decision. Pure, tested natively
// (tests/native-netconfig.test.mjs).
#include <cstdint>
#include <string>
namespace mensa::net {
// Own WLAN of the Dial (always the address of the rescue WLAN too).
constexpr const char *apIp = "192.168.4.1";
// Router not reached for this long: the Dial opens its own WLAN in addition, so it stays reachable for a fix.
constexpr uint64_t rescueAfterMs = 30000;
inline bool parseIp(const std::string &text, uint32_t &out) {
  uint32_t value = 0;
  int parts = 0;
  size_t i = 0;
  while (parts < 4) {
    if (i >= text.size() || text[i] < '0' || text[i] > '9') return false;
    uint32_t part = 0;
    size_t digits = 0;
    while (i < text.size() && text[i] >= '0' && text[i] <= '9') {
      part = part * 10 + uint32_t(text[i++] - '0');
      if (++digits > 3 || part > 255) return false;
    }
    value = value << 8 | part;
    if (++parts < 4) {
      if (i >= text.size() || text[i] != '.') return false;
      i++;
    }
  }
  if (i != text.size()) return false;
  out = value;
  return true;
}
inline std::string ipText(uint32_t ip) {
  return std::to_string(ip >> 24) + "." + std::to_string(ip >> 16 & 255) + "." + std::to_string(ip >> 8 & 255) + "." +
         std::to_string(ip & 255);
}
// Network mask: ones from the left, between /8 and /30.
inline bool validMask(uint32_t mask) {
  uint32_t inverted = ~mask;
  return (inverted & (inverted + 1)) == 0 && mask >= 0xFF000000u && mask <= 0xFFFFFFFCu;
}
struct Router {
  std::string ssid, password, ip, gateway, mask;
};
// Empty text: settings fine. Otherwise one sentence for the tablet.
inline std::string check(const Router &r) {
  if (r.ssid.empty() || r.ssid.size() > 32) return "Router-WLAN-Name: 1 bis 32 Zeichen.";
  if (r.password.size() < 8 || r.password.size() > 63) return "Router-WLAN-Kennwort: 8 bis 63 Zeichen.";
  uint32_t ip, gateway, mask;
  if (!parseIp(r.ip, ip)) return "Adresse des Dials ungültig (Beispiel 192.168.8.20).";
  if (!parseIp(r.gateway, gateway)) return "Adresse des Routers ungültig (Beispiel 192.168.8.1).";
  if (!parseIp(r.mask, mask) || !validMask(mask)) return "Netzmaske ungültig (meist 255.255.255.0).";
  if ((ip & mask) != (gateway & mask)) return "Dial und Router müssen im selben Netz sein (z. B. 192.168.8.x).";
  if (ip == gateway) return "Das Dial braucht eine andere Adresse als der Router.";
  if ((ip & ~mask) == 0 || (ip & ~mask) == ~mask) return "Diese Adresse ist im Netz nicht nutzbar.";
  uint32_t ap;
  parseIp(apIp, ap);
  if ((ip & 0xFFFFFF00u) == (ap & 0xFFFFFF00u)) return "192.168.4.x ist für das eigene WLAN des Dials reserviert.";
  return "";
}
// Host names under which the tablet pages may call the API: own WLAN (also rescue) and, in router mode, the Dial's
// address in the router network. Everything else is refused (protects against foreign pages).
inline bool hostAllowed(const std::string &host, const std::string &routerIp) {
  auto is = [&](const std::string &name) { return !name.empty() && (host == name || host == name + ":80"); };
  return is(apIp) || is(routerIp);
}
// Open the rescue WLAN? Only in router mode, when the router has been unreachable for 30 s (after the start or later).
inline bool rescueNeeded(bool routerMode, bool connected, uint64_t downSinceMs, uint64_t nowMs) {
  return routerMode && !connected && nowMs - downSinceMs >= rescueAfterMs;
}
} // namespace mensa::net

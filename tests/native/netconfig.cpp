// Router WLAN (firmware/src/netconfig.hpp): prints one result per line for the test.
#include "../../firmware/src/netconfig.hpp"
#include <cstdio>
int main() {
  using namespace mensa::net;
  auto yes = [](bool b) { return b ? "1" : "0"; };
  uint32_t v = 0;
  bool okIp = parseIp("192.168.8.20", v);
  printf("ip %s%s\n", yes(okIp), ipText(v).c_str());
  printf("badip %s%s%s%s%s%s\n", yes(parseIp("192.168.8", v)), yes(parseIp("192.168.8.256", v)),
         yes(parseIp("192.168.8.20.", v)), yes(parseIp(" 192.168.8.20", v)), yes(parseIp("1922.1.1.1", v)),
         yes(parseIp("", v)));
  printf("mask %s%s%s%s\n", yes(validMask(0xFFFFFF00u)), yes(validMask(0xFFFF0000u)), yes(validMask(0xFFFF00FFu)),
         yes(validMask(0)));
  Router good{"Mensaampel", "geheim1234", "192.168.8.20", "192.168.8.1", "255.255.255.0"};
  printf("good [%s]\n", check(good).c_str());
  auto with = [&](auto change) {
    Router r = good;
    change(r);
    return check(r).empty() ? "0" : "1";
  };
  printf("refused %s%s%s%s%s%s%s%s%s\n", with([](Router &r) { r.ssid = ""; }),
         with([](Router &r) { r.password = "kurz"; }), with([](Router &r) { r.ip = "192.168.9.20"; }),
         with([](Router &r) { r.ip = "192.168.8.1"; }), with([](Router &r) { r.ip = "192.168.8.255"; }),
         with([](Router &r) { r.mask = "255.0.255.0"; }), with([](Router &r) { r.gateway = "x"; }), with([](Router &r) {
           r.ip = "192.168.4.20";
           r.gateway = "192.168.4.2";
         }),
         with([](Router &r) { r.ssid = std::string(33, 'a'); }));
  printf("fritz [%s]\n", check({"Mensa", "geheim1234", "192.168.178.20", "192.168.178.1", "255.255.255.0"}).c_str());
  printf("host %s%s%s%s%s%s\n", yes(hostAllowed("192.168.4.1", "")), yes(hostAllowed("192.168.4.1:80", "")),
         yes(hostAllowed("192.168.8.20", "192.168.8.20")), yes(hostAllowed("192.168.8.20:80", "192.168.8.20")),
         yes(hostAllowed("192.168.8.20", "")), yes(hostAllowed("evil.example", "192.168.8.20")));
  printf("rescue %s%s%s%s\n", yes(rescueNeeded(true, false, 1000, 20000)), yes(rescueNeeded(true, false, 1000, 31000)),
         yes(rescueNeeded(true, true, 1000, 99000)), yes(rescueNeeded(false, false, 0, 99000)));
}

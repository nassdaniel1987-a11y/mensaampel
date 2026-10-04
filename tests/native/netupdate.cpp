// Online update (firmware/src/netupdate.hpp): prints one result per line for the test.
#include "../../firmware/src/netupdate.hpp"
#include <cstdio>
int main() {
  using namespace mensa::netupd;
  auto yes = [](bool b) { return b ? "1" : "0"; };
  auto v = parse("v0.25.0-preview");
  printf("parse %d.%d.%d%s\n", v.major, v.minor, v.patch, yes(v.valid()));
  printf("bad %s%s%s%s\n", yes(parse("").valid()), yes(parse("0.25").valid()), yes(parse("x1.2.3").valid()),
         yes(parse("1..3").valid()));
  printf("compare %d%d%d%d\n", compare(parse("0.25.0"), parse("0.24.9")) > 0,
         compare(parse("0.24.1-preview"), parse("v0.24.1-preview")) == 0, compare(parse("0.9.0"), parse("0.10.0")) < 0,
         compare(parse("1.0.0"), parse("0.99.99")) > 0);
  printf("tag [%s]\n",
         tagFromLocation("https://github.com/nassdaniel1987-a11y/mensaampel/releases/tag/v0.25.0-preview").c_str());
  printf("badtag [%s][%s][%s]\n", tagFromLocation("https://github.com/x/y/releases").c_str(),
         tagFromLocation("https://github.com/x/y/releases/tag/v1.0.0/../../evil").c_str(),
         tagFromLocation("https://github.com/x/y/releases/tag/latest").c_str());
  printf("url %s\n", downloadUrl("v0.25.0-preview").c_str());
  printf("strength %s|%s|%s\n", strength(-50), strength(-75), strength(-90));
}

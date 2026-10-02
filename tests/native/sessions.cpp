// Signed-in tablets (firmware/src/sessions.hpp): prints one result per line for the test.
#include "../../firmware/src/sessions.hpp"
#include <cstdio>
int main() {
  mensa::Sessions s;
  auto yes = [](bool b) { return b ? "1" : "0"; };
  uint64_t t = 1000;
  s.add("A", t);
  s.add("B", t + 10);
  printf("both %s%s\n", yes(s.check("A", t + 20)), yes(s.check("B", t + 20)));
  s.add("C", t + 30);
  s.add("D", t + 40);
  s.check("A", t + 50); // A active again; B is now unused the longest
  s.add("E", t + 60);
  printf("fifth %s%s%s%s%s\n", yes(s.check("A", t + 70)), yes(s.check("B", t + 70)), yes(s.check("C", t + 70)),
         yes(s.check("D", t + 70)), yes(s.check("E", t + 70)));
  s.remove("C");
  printf("logout %s%s\n", yes(s.check("C", t + 80)), yes(s.check("D", t + 80)));
  printf("wrong %s%s%s\n", yes(s.check("", t + 80)), yes(s.check("X", t + 80)), yes(s.check("AA", t + 80)));
  printf("expired %s\n", yes(s.check("A", t + 70 + mensa::Sessions::lifetime)));
  s.add("F", t + 100);
  s.keepOnly("F");
  printf("keep %s%s\n", yes(s.check("F", t + 110)), yes(s.check("D", t + 110)));
}

// Peak heap use of the Dial's hot paths with a realistic full stock (the Dial has no PSRAM). Prints JSON for the test.
#include "../../core/engine.hpp"
#include <cstdio>
#include <cstdlib>
#include <new>
static size_t cur = 0, peak = 0;
void *operator new(size_t n) {
  cur += n;
  if (cur > peak) peak = cur;
  size_t *p = (size_t *)malloc(n + sizeof(size_t));
  if (!p) throw std::bad_alloc();
  *p = n;
  return p + 1;
}
void operator delete(void *p) noexcept {
  if (!p) return;
  size_t *q = (size_t *)p - 1;
  cur -= *q;
  free(q);
}
void operator delete(void *p, size_t) noexcept {
  operator delete(p);
}
using mensa::Json;
static std::string uid(int i) {
  char b[32];
  snprintf(b, sizeof b, "04:%02X:%02X:%02X:%02X:%02X:%02X", i & 255, (i * 7) & 255, (i * 13) & 255, (i * 31) & 255,
           (i * 57) & 255, (i * 91) & 255);
  return b;
}
// Same text building as firmware/src/storage.hpp (snapshotText, reserved with the last saved size) and main.cpp.
static size_t lastSize = 16000;
static std::string saveText(const mensa::Engine &e) {
  std::string t;
  t.reserve(lastSize + 2048);
  {
    auto j = e.snapshot(false);
    j["undo"] = nullptr;
    j["held"] = "";
    t += j.dump();
  }
  t.pop_back();
  t += ",\"cards\":";
  t += e.cardsText(0, false);
  t += ",\"peaks\":\"";
  t += e.flowState().peaksText();
  t += "\"}";
  lastSize = t.size();
  return t;
}
static std::string stateText(const mensa::Engine &e, long long now, bool cards) {
  std::string b = e.status(now, false).dump();
  b.pop_back();
  b += ",\"cardsRev\":7";
  if (cards) b += ",\"cards\":" + e.cardsText(now) + ",\"peaks\":\"" + e.flowState().peaksText() + "\"";
  return b + "}";
}
int main() {
  mensa::Engine e;
  e.prepareHardware();
  long long now = 1000000;
  e.command({{"type", "confirm"}}, now);
  for (int i = 0; i < 112; i++) {
    auto label = std::string(i < 48 ? "sim:K" : "sim:M") + (((i < 48 ? i : i - 48) + 1) < 10 ? "0" : "") +
                 std::to_string((i < 48 ? i : i - 48) + 1);
    e.command({{"type", "bind"}, {"uid", label}, {"newUid", uid(i)}}, now);
  }
  e.command({{"type", "room"}, {"room", "M"}, {"capacity", 64}, {"limit", 64}, {"open", true}}, now);
  // Fill the event log and the daily report.
  for (int d = 0; d < 65; d++) {
    for (int i = 0; i < 40; i++) {
      now += 4000;
      e.command({{"type", "scan"}, {"uid", uid(i)}}, now);
      e.command({{"type", "remove"}}, now);
    }
    for (int i = 0; i < 40; i++) {
      now += 4000;
      e.command({{"type", "scan"}, {"uid", uid(i)}}, now);
      e.command({{"type", "remove"}}, now);
    }
    e.command({{"type", "newDay"}, {"confirmed", true}}, now);
  }
  for (int i = 0; i < 30; i++) {
    now += 4000;
    e.command({{"type", "scan"}, {"uid", uid(i)}}, now);
    e.command({{"type", "remove"}}, now);
  }
  // Worst case for the hints and learned stays (0.16): every card with counters, every half hour learned.
  {
    auto j = e.snapshot();
    for (auto &c : j["cards"]) {
      c["missed"] = 999;
      c["quick"] = 999;
    }
    j["flow"]["stay"] = Json::array();
    for (int i = 0; i < 7 * 8; i++) {
      j["flow"]["stay"].push_back(1500);
      j["flow"]["stay"].push_back(9999);
    }
    j["flow"]["stayAvg"] = 1500;
    j["flow"]["stayN"] = 9999;
    // Full learning diary (0.20): 40 lines with large values.
    std::string diary;
    for (int i = 0; i < 40; i++)
      diary += (i ? ";" : "") + std::to_string(100000 + i) + ",3," + std::to_string(i % 8) + ",335,999999,999999,9999";
    j["flow"]["diary"] = diary;
    // Full course of the day (0.23): every 10-minute slot, 40 group events, peaks for 60 days.
    std::string curve, events, peaks;
    for (int i = 0; i < 36; i++)
      curve += (i ? "," : "") + std::to_string(100 + i % 10);
    for (int i = 0; i < 40; i++)
      events += (i ? ";" : "") + std::to_string(700 + i) + "," + std::to_string(i % 9) + ",999999,999999";
    for (int d = 0; d < 60; d++) {
      peaks += (d ? ";" : "") + std::to_string(100000 + d);
      for (int i = 0; i < 12; i++)
        peaks += "," + std::to_string(100 + i);
    }
    j["flow"]["curve"] = curve;
    j["flow"]["dayEvents"] = events;
    j["peaks"] = peaks;
    e.restore(j, true);
  }
  saveText(e); // the Dial knows the size of its last save
  auto measure = [&](auto fn) {
    size_t base = cur;
    peak = cur;
    fn();
    return peak - base;
  };
  size_t save = measure([&] { std::string t = saveText(e); });
  size_t stateFull = measure([&] { std::string t = stateText(e, now, true); });
  size_t stateLean = measure([&] { std::string t = stateText(e, now, false); });
  // A booking as in firmware transact(): rollback copy + command (with its own copy) + save text.
  size_t booking = measure([&] {
    auto previous = e;
    now += 4000;
    e.command({{"type", "scan"}, {"uid", uid(100)}}, now);
    e.command({{"type", "remove"}}, now);
    std::string t = saveText(e);
  });
  size_t lookup = measure([&] {
    volatile int s = e.cardState(uid(5));
    (void)s;
  });
  // Correctness: the lean texts equal the full JSON.
  auto ref = e.snapshot();
  ref["undo"] = nullptr;
  ref["held"] = "";
  bool saveSame = Json::parse(saveText(e)) == ref;
  auto full = e.status(now);
  auto lean = Json::parse(stateText(e, now, true));
  lean.erase("cardsRev");
  bool stateSame = lean == full;
  printf("{\"save\":%zu,\"stateFull\":%zu,\"stateLean\":%zu,\"booking\":%zu,\"lookup\":%zu,\"saveBytes\":%zu,"
         "\"stateBytes\":%zu,\"leanBytes\":%zu,\"saveSame\":%s,\"stateSame\":%s,\"events\":%d,\"days\":%d}\n",
         save, stateFull, stateLean, booking, lookup, saveText(e).size(), stateText(e, now, true).size(),
         stateText(e, now, false).size(), saveSame ? "true" : "false", stateSame ? "true" : "false",
         int(full["events"].size()), int(full["flow"]["history"].size()));
}

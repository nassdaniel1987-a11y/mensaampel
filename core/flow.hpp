#pragma once
#include "vendor/json.hpp"
#include <vector>
#include <array>
#include <string>
#include <algorithm>
#include <stdexcept>
namespace mensa {
// Bounded anonymous observations; no card identifier survives a completed measurement.
struct Flow {
  using J = nlohmann::json;
  struct Sample {
    int kind, queue, weekday, minute, size, seconds;
  };
  int yellow = 5, batch = 0, issued = 0, queue = 0, weekday = 0, minute = 0, kind = 0, measureSize = 0,
      measureMinute = 0, measureWeekday = 0, measureQueue = 0;
  bool relief = false;
  long long reliefAt = -1;
  int groupQueue = 0;
  bool waiting = false, clockValid = false, armed = false;
  long long clockAt = 0, started = -1, groupAt = -1;
  std::string measuringUid;
  std::vector<Sample> samples;
  int trialBuffer = 30, trialDelay = 0, trialCount = 0, trialLevel = 0;
  bool trialReviewed = false;
  long long lastAdmission = -1;
  std::vector<std::array<int, 9>> reviews;
  // Automatic group release. Learned values are tenths of a second per admitted child, globally and per weekday/half
  // hour.
  static constexpr int autoMin = 30, autoMax = 1800, autoSlotLimit = 7 * 48;
  bool autoOn = false, autoReleased = false, autoComplaint = false;
  int autoStart = 200, autoGlobal = 0, autoGlobalN = 0, autoFaster = 0, autoSlower = 0;
  long long releaseAt = -1;
  std::vector<std::array<int, 5>>
      autoSlots; // weekday, half hour, tenths per child, observations, learned group size (0 = none)
  // Group sizes: a larger start group builds the queue at the servery; later groups may grow or shrink within
  // [sizeMin,sizeMax].
  int startSize = 0, sizeMin = 0, sizeMax = 0, idleMinutes = 5, dayStart = -1, startLearned = 0, sizeGlobal = 0,
      groupTarget = 0, dayWeekday = -1;
  bool groupIsStart = false, lastGroupStart = false;
  long long lastEntry = -1, lastScan = -1, releaseFrom = -1;
  // Calendar from the clock source: days since 1970 and seconds since midnight at clockAt (-1: unknown). The release
  // time is also kept as wall-clock seconds so that a countdown survives a reboot.
  int date = -1, dayDate = -1;
  long long secondAt = -1, releaseWall = -1, releaseSpan = 0;
  // Daily report: day, weekday, issued, returned, groups, automatic releases, earlier, too full, reliefs, first/last
  // issue minute, missing cards, learned tenths per child, most cards out at once, most Mensa seats in use (-1: not
  // recorded, reports before 0.16).
  using Day = std::array<int, 15>;
  static Day newDay(int day, int weekday) { return {day, weekday, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1, -1, 0, 0}; }
  Day today = newDay(1, -1);
  std::vector<Day> history;
  // Learned time a child keeps its card (seconds), per weekday and half hour from 11:00 to 14:59 (earlier/later
  // issues count to the first/last half hour) and over all. Only a hint for the waiting time; the release logic does
  // not use it. stayUndo keeps the values before the last learned return so that "undo" can take it back.
  static constexpr int staySlots = 8, stayShort = 180, stayLong = 5400;
  std::array<std::array<std::array<int, 2>, staySlots>, 7> stay{};
  int stayAvg = 0, stayN = 0;
  std::array<int, 6> stayUndo{-1, 0, 0, 0, 0, 0}; // weekday, slot, average, count, global average, global count
  // Learned release times and group sizes back to the start values.
  void forgetLearned() {
    stay = {};
    stayAvg = 0;
    stayN = 0;
    stayUndo[0] = -1;
    autoGlobal = 0;
    autoGlobalN = 0;
    autoSlots.clear();
    autoFaster = 0;
    autoSlower = 0;
    startLearned = 0;
    sizeGlobal = 0;
  }
  void clearTrial() {
    trialDelay = 0;
    trialCount = 0;
    trialLevel = 0;
    trialReviewed = false;
    lastAdmission = -1;
  }

  static void check(bool yes, const char *text) {
    if (!yes) throw std::runtime_error(text);
  }
  static int integer(const J &j, const char *key, int low, int high) {
    check(j.contains(key) && j[key].is_number_integer(), "Ganze Zahl erforderlich.");
    auto value = j[key].get<long long>();
    check(value >= low && value <= high, "Mess- oder Einlasseinstellung außerhalb des Bereichs.");
    return int(value);
  }
  int currentMinute(long long now) const {
    return secondAt >= 0 ? int((secondAt + std::max(0LL, now - clockAt) / 1000) / 60)
                         : minute + int(std::max(0LL, now - clockAt) / 60000);
  }
  int currentDate(long long now) const { return clockReady(now) ? date : -1; }
  // Wall-clock seconds (days since 1970 x 86400 + seconds of the day), -1 without a calendar date.
  long long wall(long long now) const {
    return clockReady(now) && date >= 0 && secondAt >= 0 ? date * 86400LL + secondAt + (now - clockAt) / 1000 : -1;
  }
  static int civilDays(int y, int m, int d) {
    y -= m <= 2;
    int era = (y >= 0 ? y : y - 399) / 400, yoe = y - era * 400, doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1,
        doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return era * 146097 + doe - 719468;
  }
  // Optional "date": [year, month, day, hour, minute, second] as sent by tablet, PC and RTC.
  void setCalendar(const J &c, long long now) {
    date = -1;
    secondAt = -1;
    if (!c.contains("date") || !c["date"].is_array() || c["date"].size() != 6) return;
    for (auto &v : c["date"])
      if (!v.is_number_integer()) return;
    int y = c["date"][0], mo = c["date"][1], d = c["date"][2], h = c["date"][3], mi = c["date"][4], se = c["date"][5];
    if (y < 2020 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59 ||
        se < 0 || se > 59 || h * 60 + mi != minute)
      return;
    date = civilDays(y, mo, d);
    secondAt = h * 3600LL + mi * 60 + se;
    // A countdown that was running before a reboot continues with its remaining time.
    if (waiting && autoOn && releaseAt < 0 && releaseWall >= 0) {
      long long left = releaseWall - wall(now);
      if (left > -3600 && left <= releaseSpan / 1000 + 5) {
        releaseAt = now + std::max(0LL, left) * 1000;
        releaseFrom = releaseAt - releaseSpan;
      }
    }
  }
  bool clockReady(long long now) const { return clockValid && now >= clockAt && currentMinute(now) < 1440; }
  void cancel() {
    armed = false;
    started = -1;
    measuringUid.clear();
    measureSize = 0;
  }
  void restart() {
    clearTrial();
    reliefAt = -1;
    clockValid = false;
    cancel();
    groupAt = -1;
    releaseAt = -1;
    autoReleased = false;
    autoComplaint = false;
    lastEntry = -1;
    lastScan = -1;
  }
  void next() {
    clearTrial();
    issued = 0;
    waiting = false;
    groupAt = -1;
    releaseAt = -1;
    releaseFrom = -1;
    releaseWall = -1;
    releaseSpan = 0;
    groupTarget = 0;
    groupIsStart = false;
  }
  int lowSize() const { return std::clamp(sizeMin ? sizeMin : batch, 1, 48); }
  int highSize() const { return std::max(lowSize(), std::clamp(sizeMax ? sizeMax : batch, 1, 48)); }
  int startTarget() const { return std::clamp(startLearned ? startLearned : startSize ? startSize : 2 * batch, 1, 48); }
  int normalSize(long long at) const {
    int s = slotOf(at), v = 0;
    if (s >= 0)
      for (auto &x : autoSlots)
        if (x[0] == weekday && x[1] == s && x[4] > 0) v = x[4];
    if (!v) v = sizeGlobal ? sizeGlobal : batch;
    return std::clamp(v, lowSize(), highSize());
  }
  bool startDue(long long now) const { return autoOn && (lastEntry < 0 || now - lastEntry >= 60000LL * idleMinutes); }
  // Size of the running group, or of the next one before its first child.
  int target(long long now) const {
    if (!batch) return 0;
    if (issued > 0) return groupTarget;
    return !autoOn ? batch : startDue(now) ? startTarget() : normalSize(now);
  }
  void resize(long long at, int delta, bool start) {
    if (start) {
      startLearned = std::clamp(startTarget() + delta, 1, 48);
      return;
    }
    int v = std::clamp(normalSize(at) + delta, lowSize(), highSize()), s = slotOf(at);
    sizeGlobal = v;
    if (s < 0) return;
    for (auto &x : autoSlots)
      if (x[0] == weekday && x[1] == s) {
        x[4] = v;
        return;
      }
    if (int(autoSlots.size()) < autoSlotLimit) autoSlots.push_back({weekday, s, perChild(at), 0, v});
  }
  void closeDay(int missing, int nextDay, int nextWeekday) {
    today[11] = missing;
    today[12] = perChild(-1);
    if (history.size() == 60) history.erase(history.begin());
    history.push_back(today);
    today = newDay(nextDay, nextWeekday);
  }
  // Half hour (0..7 from 11:00) of a moment on the monotonic clock, -1 without a valid clock.
  int staySlot(long long at) const {
    return at >= 0 && clockReady(at) ? std::clamp((currentMinute(at) % 1440 - 660) / 30, 0, staySlots - 1) : -1;
  }
  static int average(int old, int n, int obs) {
    return n < 10 ? int((1LL * old * n + obs) / (n + 1)) : int(std::lround(old * 0.9 + obs * 0.1));
  }
  // A card came back after `seconds`; very short (double scan) or very long (forgotten) stays are not learned.
  void learnStay(long long issuedAt, int seconds) {
    stayUndo[0] = -1;
    if (seconds < stayShort || seconds > stayLong) return;
    int s = staySlot(issuedAt), wd = weekday;
    stayUndo = {s >= 0 ? wd : -1, std::max(s, 0), 0, 0, stayAvg, stayN};
    if (s >= 0) {
      auto &x = stay[wd][s];
      stayUndo[2] = x[0];
      stayUndo[3] = x[1];
      x[0] = average(x[0], x[1], seconds);
      x[1] = std::min(x[1] + 1, 9999);
    }
    stayAvg = average(stayAvg, stayN, seconds);
    stayN = std::min(stayN + 1, 9999);
    if (s < 0) stayUndo[0] = -2; // only the global value changed
  }
  // Expected stay for a card issued at `issuedAt`: matching half hour with at least five returns, otherwise all; -1
  // with fewer than five returns overall.
  int expectedStay(long long issuedAt) const {
    if (stayN < 5) return -1;
    int s = staySlot(issuedAt);
    if (s >= 0 && stay[weekday][s][1] >= 5) return stay[weekday][s][0];
    return stayAvg;
  }
  int slotOf(long long at) const { return at >= 0 && clockReady(at) ? currentMinute(at) / 30 : -1; }
  // Learned seconds per child: matching half hour with at least three observations, otherwise all observations,
  // otherwise the start value.
  int perChild(long long at, int *level = nullptr) const {
    int s = slotOf(at);
    if (s >= 0)
      for (auto &x : autoSlots)
        if (x[0] == weekday && x[1] == s && x[3] >= 3) {
          if (level) *level = 2;
          return x[2];
        }
    if (autoGlobalN > 0) {
      if (level) *level = 1;
      return autoGlobal;
    }
    if (level) *level = 0;
    return autoStart;
  }
  static int blend(int old, int n, int obs) { return n ? int(std::lround(old * 0.7 + obs * 0.3)) : obs; }
  // A measurement may replace the start value; a single button press (prior>0) only moves the current value.
  void learn(int wd, int s, int obs, int prior = 0) {
    obs = std::clamp(obs, autoMin, autoMax);
    autoGlobal = autoGlobalN || !prior ? blend(autoGlobal, autoGlobalN, obs) : blend(prior, 1, obs);
    autoGlobalN = std::min(autoGlobalN + 1, 9999);
    if (s < 0 || s > 47 || wd < 0 || wd > 6) return;
    for (auto &x : autoSlots)
      if (x[0] == wd && x[1] == s) {
        x[2] = blend(x[2], x[3], obs);
        x[3] = std::min(x[3] + 1, 9999);
        return;
      }
    if (int(autoSlots.size()) < autoSlotLimit) autoSlots.push_back({wd, s, obs, 1, 0});
  }
  void scale(long long at, double factor) {
    int level = 0, base = perChild(at, &level), s = slotOf(at);
    auto adjust = [&](int v) { return std::clamp(int(std::lround(v * factor)), autoMin, autoMax); };
    if (level == 2)
      for (auto &x : autoSlots)
        if (x[0] == weekday && x[1] == s) x[2] = adjust(x[2]);
    autoGlobal = adjust(autoGlobalN ? autoGlobal : base);
    if (!autoGlobalN) autoGlobalN = 1;
  }
  // Pace: the next group follows after (its size x seconds per child) from the first child of this group, so the start
  // group's queue persists.
  void schedule(long long now) {
    long long at = groupAt >= 0 ? groupAt : now, due = 100LL * normalSize(at) * perChild(at);
    releaseAt = std::max(groupAt >= 0 ? groupAt + due : now + due, now + 10000);
    releaseFrom = now;
    releaseSpan = releaseAt - now;
    releaseWall = wall(now) >= 0 ? wall(now) + (releaseAt - now) / 1000 : -1;
  }
  // Share of the countdown still to go (1 = just started), for the ring on the Dial.
  double releaseShare(long long now) const {
    if (!waiting || releaseAt < 0 || releaseFrom < 0 || releaseAt <= releaseFrom) return 0;
    return std::clamp(double(releaseAt - now) / double(releaseAt - releaseFrom), 0.0, 1.0);
  }
  long long releaseIn(long long now) const {
    return waiting && releaseAt >= 0 ? std::max(0LL, (releaseAt - now + 999) / 1000) : -1;
  }
  // No complaint since the previous automatic release: try a little faster.
  void autoRelease() {
    if (autoReleased && !autoComplaint) scale(groupAt, 0.97);
    lastGroupStart = groupIsStart;
    next();
    autoReleased = true;
    autoComplaint = false;
    today[5]++;
  }
  // Button pressed during the countdown: the servery was ready earlier.
  void manualRelease(long long now) {
    if (autoOn && waiting && !relief && releaseAt > now && groupAt >= 0 && issued > 0) {
      learn(weekday, slotOf(groupAt), int((now - groupAt) / 100 / normalSize(groupAt)), perChild(groupAt));
      resize(groupAt, 1, groupIsStart);
      autoFaster++;
      today[6]++;
    }
    autoReleased = false;
    autoComplaint = false;
  }
  // Relief after an automatic release: that release came too early.
  void complaint(long long now) {
    today[8]++;
    if (autoOn && autoReleased && !autoComplaint) {
      long long at = groupAt >= 0 ? groupAt : now;
      scale(at, 1.2);
      resize(at, -1, lastGroupStart);
      autoComplaint = true;
      autoSlower++;
      today[7]++;
    }
  }
  void importSamples() {
    for (auto &s : samples)
      if (s.kind == 1 && s.size > 0) learn(s.weekday, s.minute / 30, s.seconds * 10 / s.size);
  }
  void admission(const std::string &uid, long long now) {
    int m = clockReady(now) ? currentMinute(now) : -1;
    today[2]++;
    if (m >= 0) {
      if (today[9] < 0) today[9] = m;
      today[10] = m;
    }
    lastScan = now;
    if (batch) {
      if (issued == 0) {
        groupTarget = target(now);
        groupIsStart = autoOn && startDue(now);
        groupAt = now;
        groupQueue = queue;
      }
      issued++;
      lastAdmission = now;
      lastEntry = now;
      if (issued >= groupTarget) {
        waiting = true;
        today[4]++;
        if (autoOn) schedule(now);
        auto e = status(now).at("estimate");
        if (clockReady(now) && e.at("count").get<int>() >= 3) {
          trialCount = e["count"];
          trialLevel = e["level"] == "matched" ? 2 : 1;
          trialDelay = std::max(e.at("max").get<int>() + trialBuffer, int((now - groupAt + 999) / 1000) + trialBuffer);
        }
      }
    }
    if (armed) {
      armed = false;
      started = now;
      measuringUid = kind == 0 ? uid : "";
      measureSize = 1;
      measureMinute = currentMinute(now);
      measureWeekday = weekday;
      measureQueue = queue;
    } else if (started >= 0 && kind == 1) {
      if (measureSize >= 256)
        cancel();
      else
        measureSize++;
    }
  }
  void returned(const std::string &uid, long long now) {
    today[3]++;
    lastScan = now;
    if (started >= 0 && kind == 0 && measuringUid == uid) cancel();
  }
  // Undo of the last booking: counters and the running group go back with it (the group is open again).
  void undoAdmission() {
    if (today[2] > 0) today[2]--;
    if (batch && issued > 0) {
      if (waiting) {
        waiting = false;
        releaseAt = releaseFrom = releaseWall = -1;
        releaseSpan = 0;
        if (today[4] > 0) today[4]--;
      }
      if (--issued == 0) {
        groupAt = -1;
        groupTarget = 0;
        groupIsStart = false;
      }
    }
  }
  void undoReturn() {
    if (today[3] > 0) today[3]--;
    if (stayUndo[0] != -1) {
      if (stayUndo[0] >= 0) stay[stayUndo[0]][stayUndo[1]] = {stayUndo[2], stayUndo[3]};
      stayAvg = stayUndo[4];
      stayN = stayUndo[5];
      stayUndo[0] = -1;
    }
  }
  // withStay = false leaves out the learned stay table (only stored and backed up; the tablet does not need it, and the
  // status is built often on the Dial).
  J snapshot(bool withStay = true) const {
    J list = J::array();
    for (auto &s : samples)
      list.push_back({s.kind, s.queue, s.weekday, s.minute, s.size, s.seconds});
    J feedback = J::array();
    for (auto &r : reviews)
      feedback.push_back(r);
    J slots = J::array();
    for (auto &x : autoSlots)
      slots.push_back(x);
    J days = J::array();
    for (auto &d : history)
      days.push_back(d);
    // Learned stays as one flat list (average, count per weekday and half hour): much smaller as a JSON tree than
    // nested lists, and empty while nothing was learned.
    J stays = J::array();
    if (withStay && stayN)
      for (auto &w : stay)
        for (auto &x : w) {
          stays.push_back(x[0]);
          stays.push_back(x[1]);
        }
    J v = {{"stay", stays},
           {"stayAvg", stayAvg},
           {"stayN", stayN},
           {"startSize", startSize},
           {"sizeMin", sizeMin},
           {"sizeMax", sizeMax},
           {"idleMinutes", idleMinutes},
           {"dayStart", dayStart},
           {"startLearned", startLearned},
           {"sizeGlobal", sizeGlobal},
           {"groupTarget", groupTarget},
           {"dayWeekday", dayWeekday},
           {"groupIsStart", groupIsStart},
           {"lastGroupStart", lastGroupStart},
           {"lastEntry", lastEntry},
           {"lastScan", lastScan},
           {"releaseFrom", releaseFrom},
           {"date", date},
           {"dayDate", dayDate},
           {"secondAt", secondAt},
           {"releaseWall", releaseWall},
           {"releaseSpan", releaseSpan},
           {"today", today},
           {"history", days},
           {"autoOn", autoOn},
           {"autoStart", autoStart},
           {"autoGlobal", autoGlobal},
           {"autoGlobalN", autoGlobalN},
           {"autoSlots", slots},
           {"releaseAt", releaseAt},
           {"autoReleased", autoReleased},
           {"autoComplaint", autoComplaint},
           {"autoFaster", autoFaster},
           {"autoSlower", autoSlower},
           {"trialBuffer", trialBuffer},
           {"trialDelay", trialDelay},
           {"trialCount", trialCount},
           {"trialLevel", trialLevel},
           {"trialReviewed", trialReviewed},
           {"lastAdmission", lastAdmission},
           {"reviews", feedback},
           {"relief", relief},
           {"reliefAt", reliefAt},
           {"groupQueue", groupQueue},
           {"yellow", yellow},
           {"batch", batch},
           {"issued", issued},
           {"waiting", waiting},
           {"queue", queue},
           {"weekday", weekday},
           {"minute", minute},
           {"clockValid", clockValid},
           {"clockAt", clockAt},
           {"armed", armed},
           {"kind", kind},
           {"started", started},
           {"groupAt", groupAt},
           {"measuringUid", measuringUid},
           {"measureSize", measureSize},
           {"measureMinute", measureMinute},
           {"measureWeekday", measureWeekday},
           {"measureQueue", measureQueue},
           {"samples", list}};
    if (!withStay) v.erase("stay");
    return v;
  }
  void restore(const J &v) {
    Flow n;
    if (v.contains("trialBuffer")) {
      n.trialBuffer = integer(v, "trialBuffer", 0, 300);
      n.trialDelay = integer(v, "trialDelay", 0, 90000);
      n.trialCount = integer(v, "trialCount", 0, 120);
      n.trialLevel = integer(v, "trialLevel", 0, 2);
      check(v.at("trialReviewed").is_boolean(), "Ungültige Rückmeldung.");
      n.trialReviewed = v["trialReviewed"];
      check(v.at("lastAdmission").is_number_integer(), "Ungültige Scanzeit.");
      n.lastAdmission = v["lastAdmission"].get<long long>();
      check(n.lastAdmission >= -1 && n.lastAdmission <= 9007199254740991LL, "Ungültige Scanzeit.");
      check(v.at("reviews").is_array() && v["reviews"].size() <= 120, "Zu viele Rückmeldungen.");
      for (auto &r : v["reviews"]) {
        check(r.is_array() && r.size() == 9, "Ungültige Rückmeldung.");
        std::array<int, 9> item;
        int highs[] = {48, 2, 6, 1439, 90000, 604800, 1, 120, 2};
        for (int i = 0; i < 9; i++) {
          check(r[i].is_number_integer(), "Ungültige Rückmeldung.");
          auto value = r[i].get<long long>();
          check(value >= 0 && value <= highs[i], "Ungültige Rückmeldung.");
          item[i] = int(value);
        }
        check(item[0] > 0 && item[7] >= 3 && item[8] > 0, "Ungültiger Vergleich.");
        n.reviews.push_back(item);
      }
    }

    if (v.contains("relief")) {
      check(v.at("relief").is_boolean(), "Ungültige Entlastungspause.");
      n.relief = v["relief"];
      check(v.at("reliefAt").is_number_integer(), "Ungültige Pausenzeit.");
      n.reliefAt = v["reliefAt"].get<long long>();
      check(n.reliefAt >= -1 && n.reliefAt <= 9007199254740991LL, "Ungültige Pausenzeit.");
    }
    n.groupQueue = v.contains("groupQueue") ? integer(v, "groupQueue", 0, 2) : integer(v, "queue", 0, 2);
    n.yellow = integer(v, "yellow", 0, 256);
    n.batch = integer(v, "batch", 0, 48);
    n.issued = integer(v, "issued", 0, 48);
    n.queue = integer(v, "queue", 0, 2);
    n.weekday = integer(v, "weekday", 0, 6);
    n.minute = integer(v, "minute", 0, 1439);
    n.kind = integer(v, "kind", 0, 1);
    n.measureSize = integer(v, "measureSize", 0, 256);
    n.measureMinute = integer(v, "measureMinute", 0, 1439);
    n.measureWeekday = integer(v, "measureWeekday", 0, 6);
    n.measureQueue = integer(v, "measureQueue", 0, 2);
    for (auto key : {"waiting", "clockValid", "armed"})
      check(v.at(key).is_boolean(), "Ungültiger Messzustand.");
    n.waiting = v["waiting"];
    n.clockValid = v["clockValid"];
    n.armed = v["armed"];
    for (auto key : {"clockAt", "started", "groupAt"})
      check(v.at(key).is_number_integer() && v[key].get<long long>() >= -1 &&
                v[key].get<long long>() <= 9007199254740991LL,
            "Ungültige Messzeit.");
    n.clockAt = v["clockAt"];
    n.started = v["started"];
    n.groupAt = v["groupAt"];
    check(n.clockAt >= 0, "Ungültige Uhrzeit.");
    n.measuringUid = v.at("measuringUid").get<std::string>();
    check(n.measuringUid.size() <= 80, "Ungültige Messkarte.");
    check(!(n.armed && n.started >= 0), "Ungültige aktive Messung.");
    check(n.started >= 0 ? n.measureSize >= 1 : n.measureSize == 0, "Ungültige Messgröße.");
    check(n.started < 0 || n.kind == 1 || !n.measuringUid.empty(), "Messkarte fehlt.");
    n.groupTarget = v.contains("groupTarget") ? integer(v, "groupTarget", 0, 48) : n.issued ? n.batch : 0;
    check(n.issued == 0 || n.groupTarget > 0, "Ungültige Gruppengröße.");
    check(n.waiting == (n.batch > 0 && n.issued > 0 && n.issued == n.groupTarget), "Ungültige Gruppensperre.");
    check(n.batch ? n.issued <= n.groupTarget || n.issued == 0 : n.issued == 0, "Ungültiger Gruppenzähler.");
    check(v.at("samples").is_array() && v["samples"].size() <= 120, "Zu viele Messungen.");
    for (auto &a : v["samples"]) {
      check(a.is_array() && a.size() == 6, "Ungültige Messung.");
      for (auto &x : a)
        check(x.is_number_integer(), "Ungültiger Messwert.");
      J r = {{"kind", a[0]}, {"queue", a[1]}, {"weekday", a[2]}, {"minute", a[3]}, {"size", a[4]}, {"seconds", a[5]}};
      n.samples.push_back({integer(r, "kind", 0, 1), integer(r, "queue", 0, 2), integer(r, "weekday", 0, 6),
                           integer(r, "minute", 0, 1439), integer(r, "size", 1, 256), integer(r, "seconds", 1, 3600)});
    }
    if (v.contains("autoOn")) {
      for (auto key : {"autoOn", "autoReleased", "autoComplaint"})
        check(v.at(key).is_boolean(), "Ungültige Automatik.");
      n.autoOn = v["autoOn"];
      n.autoReleased = v["autoReleased"];
      n.autoComplaint = v["autoComplaint"];
      n.autoStart = integer(v, "autoStart", autoMin, autoMax);
      n.autoGlobalN = integer(v, "autoGlobalN", 0, 9999);
      n.autoGlobal = n.autoGlobalN ? integer(v, "autoGlobal", autoMin, autoMax) : integer(v, "autoGlobal", 0, 0);
      n.autoFaster = integer(v, "autoFaster", 0, 1000000);
      n.autoSlower = integer(v, "autoSlower", 0, 1000000);
      check(v.at("releaseAt").is_number_integer(), "Ungültige Freigabezeit.");
      n.releaseAt = v["releaseAt"].get<long long>();
      check(n.releaseAt >= -1 && n.releaseAt <= 9007199254740991LL, "Ungültige Freigabezeit.");
      check(!n.autoOn || n.batch > 0, "Automatik ohne Gruppengröße.");
      check(v.at("autoSlots").is_array() && v["autoSlots"].size() <= size_t(autoSlotLimit), "Zu viele Lernwerte.");
      for (auto &x : v["autoSlots"]) {
        check(x.is_array() && (x.size() == 4 || x.size() == 5), "Ungültiger Lernwert.");
        std::array<int, 5> item{0, 0, 0, 0, 0};
        int lows[] = {0, 0, autoMin, 0, 0}, highs[] = {6, 47, autoMax, 9999, 48};
        for (size_t i = 0; i < x.size(); i++) {
          check(x[i].is_number_integer(), "Ungültiger Lernwert.");
          auto value = x[i].get<long long>();
          check(value >= lows[i] && value <= highs[i], "Ungültiger Lernwert.");
          item[i] = int(value);
        }
        for (auto &y : n.autoSlots)
          check(y[0] != item[0] || y[1] != item[1], "Doppelter Lernwert.");
        n.autoSlots.push_back(item);
      }
    } else
      n.importSamples();
    if (v.contains("startSize")) {
      n.startSize = integer(v, "startSize", 0, 48);
      n.sizeMin = integer(v, "sizeMin", 0, 48);
      n.sizeMax = integer(v, "sizeMax", 0, 48);
      n.idleMinutes = integer(v, "idleMinutes", 1, 120);
      n.dayStart = integer(v, "dayStart", -1, 1439);
      n.startLearned = integer(v, "startLearned", 0, 48);
      n.sizeGlobal = integer(v, "sizeGlobal", 0, 48);
      n.dayWeekday = integer(v, "dayWeekday", -1, 6);
      for (auto key : {"groupIsStart", "lastGroupStart"})
        check(v.at(key).is_boolean(), "Ungültige Gruppe.");
      n.groupIsStart = v["groupIsStart"];
      n.lastGroupStart = v["lastGroupStart"];
      for (auto key : {"lastEntry", "lastScan"})
        check(v.at(key).is_number_integer() && v[key].get<long long>() >= -1 &&
                  v[key].get<long long>() <= 9007199254740991LL,
              "Ungültige Scanzeit.");
      n.lastEntry = v["lastEntry"];
      n.lastScan = v["lastScan"];
      if (v.contains("releaseFrom")) {
        check(v["releaseFrom"].is_number_integer() && v["releaseFrom"].get<long long>() >= -1,
              "Ungültige Freigabezeit.");
        n.releaseFrom = v["releaseFrom"];
      }
      if (v.contains("date")) {
        n.date = integer(v, "date", -1, 50000);
        n.dayDate = integer(v, "dayDate", -1, 50000);
        for (auto key : {"secondAt", "releaseWall", "releaseSpan"})
          check(v.at(key).is_number_integer() && v[key].get<long long>() >= -1 &&
                    v[key].get<long long>() <= 9007199254740991LL,
                "Ungültige Uhrzeit.");
        n.secondAt = v["secondAt"];
        n.releaseWall = v["releaseWall"];
        n.releaseSpan = v["releaseSpan"];
        check(n.secondAt < 86400 && n.releaseSpan >= 0, "Ungültige Uhrzeit.");
      }
      auto day = [&](const J &d) {
        check(d.is_array() && (d.size() == 12 || d.size() == 13 || d.size() == 15), "Ungültiger Tagesbericht.");
        Day r;
        r[12] = r[13] = r[14] = -1;
        for (size_t i = 0; i < d.size(); i++) {
          check(d[i].is_number_integer(), "Ungültiger Tagesbericht.");
          auto x = d[i].get<long long>();
          check(x >= -1 && x <= 1000000, "Ungültiger Tagesbericht.");
          r[i] = int(x);
        }
        return r;
      };
      n.today = day(v.at("today"));
      check(v.at("history").is_array() && v["history"].size() <= 60, "Zu viele Tagesberichte.");
      for (auto &d : v["history"])
        n.history.push_back(day(d));
    }
    if (v.contains("stay")) {
      n.stayN = integer(v, "stayN", 0, 9999);
      n.stayAvg = n.stayN ? integer(v, "stayAvg", stayShort, stayLong) : integer(v, "stayAvg", 0, 0);
      auto &list = v.at("stay");
      check(list.is_array() && (list.empty() || list.size() == 7 * staySlots * 2), "Ungültige Verweildauern.");
      for (size_t i = 0; i < list.size(); i += 2) {
        J r = {{"a", list[i]}, {"n", list[i + 1]}};
        int count = integer(r, "n", 0, 9999);
        n.stay[i / 2 / staySlots][i / 2 % staySlots] = {
            count ? integer(r, "a", stayShort, stayLong) : integer(r, "a", 0, 0), count};
      }
    }
    *this = std::move(n);
  }
  J status(long long now) const {
    auto v = snapshot(false);
    v["clockValid"] = clockReady(now);
    v["currentMinute"] = currentMinute(now) % 1440;
    v["elapsedSeconds"] = started < 0 ? 0 : std::max(0LL, (now - started) / 1000);
    v["measuringUid"] = measuringUid;
    std::vector<const Sample *> broad, exact;
    if (groupAt >= 0 && issued > 0)
      for (auto &s : samples)
        if (s.kind == 1 && s.queue == groupQueue && s.size == issued) {
          broad.push_back(&s);
          if (clockReady(now) && s.weekday == weekday && s.minute / 15 == currentMinute(groupAt) / 15)
            exact.push_back(&s);
        }
    bool precise = exact.size() >= 3;
    auto &chosen = precise ? exact : broad;
    int n = chosen.size(), total = 0, lo = 3601, hi = 0;
    for (auto s : chosen) {
      total += s->seconds;
      lo = std::min(lo, s->seconds);
      hi = std::max(hi, s->seconds);
    }
    v["trialDue"] = waiting && trialDelay > 0 && !trialReviewed && groupAt >= 0 && now - groupAt >= 1000LL * trialDelay;
    v["trialRemaining"] =
        trialDelay > 0 && groupAt >= 0 ? std::max(0LL, (groupAt + 1000LL * trialDelay - now + 999) / 1000) : 0;
    int level = 0, value = perChild(groupAt >= 0 ? groupAt : now, &level);
    v["auto"] = {{"on", autoOn},
                 {"start", autoStart},
                 {"perChild", value},
                 {"level", level == 2   ? "slot"
                           : level == 1 ? "global"
                                        : "start"},
                 {"observations", autoGlobalN},
                 {"releaseIn", releaseIn(now)},
                 {"faster", autoFaster},
                 {"slower", autoSlower},
                 {"nextSize", target(now)},
                 {"nextIsStart", issued > 0 ? groupIsStart : batch > 0 && startDue(now)},
                 {"startTarget", startTarget()},
                 {"normalSize", normalSize(now)},
                 {"sizeLow", lowSize()},
                 {"sizeHigh", highSize()}};
    v["estimate"] = {{"level", n < 3     ? "insufficient"
                               : precise ? "matched"
                                         : "general"},
                     {"count", n},
                     {"seconds", n ? total / n : 0},
                     {"min", n ? lo : 0},
                     {"max", hi},
                     {"checkDue", waiting && n >= 3 && now - groupAt >= 1000LL * (total / n)}};
    return v;
  }
  bool command(const J &c, long long now, bool paused, std::string &message) {
    auto type = c.at("type").get<std::string>();
    if (type == "trialSettings") {
      check(issued == 0, "Puffer vor der nächsten Gruppe einstellen.");
      trialBuffer = integer(c, "buffer", 0, 300);
      message = "Puffer für die Erprobung gespeichert.";
    } else if (type == "trialFeedback") {
      check(c.at("fits").is_boolean(), "Rückmeldung fehlt.");
      check(!relief && status(now).at("trialDue").get<bool>(), "Noch kein offener Erprobungsvorschlag.");
      check(now - groupAt <= 604800000LL, "Vorschlag abgelaufen.");
      if (reviews.size() == 120) reviews.erase(reviews.begin());
      reviews.push_back({issued, groupQueue, weekday, currentMinute(groupAt) % 1440, trialDelay,
                         int((now - groupAt) / 1000), c.at("fits").get<bool>() ? 1 : 0, trialCount, trialLevel});
      trialReviewed = true;
      message = "Rückmeldung gespeichert. Einlass bleibt geschlossen.";
    } else if (type == "flowSettings") {
      yellow = integer(c, "yellow", 0, 256);
      int value = integer(c, "batch", 0, 48);
      check(value == batch || ((paused || issued == 0) && started < 0 && !armed),
            "Gruppengröße nur in einer Pause ohne laufende Messung ändern.");
      if (value != batch) {
        batch = value;
        next();
      }
      message = "Gelbgrenze und Einlassgruppen gespeichert.";
      if (!batch && autoOn) {
        autoOn = false;
        message += " Automatik ausgeschaltet, da ohne Gruppen.";
      }
    } else if (type == "autoSettings") {
      check(c.at("on").is_boolean(), "Automatik ein oder aus angeben.");
      bool on = c["on"];
      int start = integer(c, "start", 3, 180);
      check(!on || batch > 0, "Für die Automatik zuerst eine Gruppengröße festlegen.");
      int ss = c.contains("startGroup") ? integer(c, "startGroup", 0, 48) : startSize,
          lo = c.contains("sizeMin") ? integer(c, "sizeMin", 0, 48) : sizeMin,
          hi = c.contains("sizeMax") ? integer(c, "sizeMax", 0, 48) : sizeMax,
          idle = c.contains("idleMinutes") ? integer(c, "idleMinutes", 1, 120) : idleMinutes,
          ds = c.contains("dayStart") ? integer(c, "dayStart", -1, 1439) : dayStart;
      check(!lo || !hi || lo <= hi, "Kleinste Gruppe darf nicht größer als die größte sein.");
      check(issued == 0 || waiting, "Automatik-Einstellungen zwischen zwei Gruppen ändern.");
      if (ds != dayStart && ds >= 0 && clockReady(now)) {
        dayWeekday = weekday;
        dayDate = date;
      }
      startSize = ss;
      sizeMin = lo;
      sizeMax = hi;
      idleMinutes = idle;
      dayStart = ds;
      if (c.value("reset", false)) forgetLearned();
      autoOn = on;
      autoStart = start * 10;
      releaseAt = -1;
      autoReleased = false;
      autoComplaint = false;
      message = c.value("reset", false) ? "Gelerntes zurückgesetzt. " : "";
      message += on ? "Automatik eingeschaltet. Volle Gruppen werden nach der gelernten Zeit freigegeben."
                    : "Automatik ausgeschaltet. Gruppen werden von Hand freigegeben.";
    } else if (type == "measurementContext") {
      check(started < 0 && !armed, "Laufende Messung zuerst beenden oder abbrechen.");
      weekday = integer(c, "weekday", 0, 6);
      minute = integer(c, "minute", 0, 1439);
      clockAt = now;
      clockValid = true;
      setCalendar(c, now);
      if (today[1] < 0) today[1] = weekday; // first clock of the day: the report gets its weekday
      groupAt = -1;
      clearTrial();
      queue = integer(c, "queue", 0, 2);
      message = "Uhrzeit und Schlangensituation übernommen.";
    }
    // Clock only (e.g. daylight saving time); running group, measurement and countdown stay untouched.
    else if (type == "clockSync") {
      weekday = integer(c, "weekday", 0, 6);
      minute = integer(c, "minute", 0, 1439);
      clockAt = now;
      clockValid = true;
      setCalendar(c, now);
      if (today[1] < 0) today[1] = weekday;
      message = "Uhrzeit abgeglichen.";
    } else if (type == "queueState") {
      check(started < 0 && !armed, "Schlangensituation der laufenden Messung bleibt unverändert.");
      queue = integer(c, "queue", 0, 2);
      message = "Schlangensituation aktualisiert.";
    } else if (type == "measurementArm") {
      check(clockReady(now), "Zuerst Uhrzeit vom Tablet übernehmen.");
      check(!armed && started < 0, "Es läuft bereits eine Messung.");
      kind = integer(c, "kind", 0, 1);
      check(kind == 0 || issued == 0 || waiting, "Gruppenmessung vor einer neuen Gruppe starten.");
      armed = true;
      message = "Messung vorgemerkt. Start bei der nächsten erfolgreichen Kartenausgabe.";
    } else if (type == "measurementCancel") {
      cancel();
      message = "Messung verworfen.";
    } else if (type == "measurementFinish") {
      check(started >= 0, "Noch keine Kartenausgabe für diese Messung.");
      check(kind == 0 || paused || waiting,
            "Gruppeneinlass zuerst pausieren; dann das letzte versorgte Kind bestätigen.");
      auto seconds = (now - started) / 1000;
      check(seconds >= 1 && seconds <= 3600,
            "Messung muss zwischen einer Sekunde und 60 Minuten dauern; sonst bitte verwerfen.");
      if (samples.size() == 120) samples.erase(samples.begin());
      samples.push_back({kind, measureQueue, measureWeekday, measureMinute, measureSize, int(seconds)});
      if (kind == 1) learn(measureWeekday, measureMinute / 30, int(seconds) * 10 / measureSize);
      cancel();
      message = "Messung gespeichert. Der Einlass bleibt unverändert.";
    } else if (type == "measurementDeleteLast") {
      check(!samples.empty(), "Keine Messung vorhanden.");
      samples.pop_back();
      message = "Letzte Messung gelöscht.";
    } else
      return false;
    return true;
  }
};
} // namespace mensa

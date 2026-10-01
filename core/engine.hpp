#pragma once
#include "vendor/json.hpp"
#include "flow.hpp"
#include "dial.hpp"
#include <string>
#include <set>
#include <vector>
#include <array>
#include <algorithm>
#include <stdexcept>
namespace mensa {
using Json = nlohmann::json;
// Compact copyable state. JSON is allocated only at the boundaries.
class Engine {
  struct Card {
    std::string uid, label;
    int room = 0;
    bool out = false, lost = false;
    long long last = -1;
  };
  struct Room {
    int capacity = 0, limit = 0;
    bool open = false;
  };
  struct Event {
    long long at;
    std::string message;
  };
  Flow flow;
  std::vector<Card> cards;
  std::vector<Event> events;
  std::array<Room, 2> rooms;
  bool ready = false, paused = false, hasUndo = false;
  int cooldown = 3, day = 1, volume = 7;
  std::string held;
  Card undo;
  // Transient Dial state (not stored): Mensa seats being set with the rotary ring.
  int mensaEdit = -1;
  long long mensaEditUntil = 0;
  // Transient: enrolling cards one after another (room, current number), staff menu on the Dial, next scan becomes a
  // staff card.
  int seriesRoom = -1;
  std::string seriesLabel;
  int menuSel = -1;
  long long menuUntil = 0;
  bool staffLearning = false;
  // Calendar day on which the stock was confirmed; after a reboot on the same day it stays confirmed (resumeDate until
  // the clock is known again). Transient: ring detents before the Mensa setting opens, and when something last needed
  // a person (pause, relief, full group without automatic release) for reminders every `remind` minutes (0 = off).
  int readyDate = -1, resumeDate = -1, remind = 3, turnAcc = 0;
  long long turnAt = -1, mensaTurnAt = -1, attentionAt = -1;
  // Transient: card just rejected by its cooldown, for the live countdown on the Dial.
  std::string lockLabel;
  long long lockUntil = -1;
  // Staff cards (UIDs) open the supervision menu on the Dial instead of booking; stored.
  std::vector<std::string> staff;
  static void require(bool b, const std::string &m) {
    if (!b) throw std::runtime_error(m);
  }
  static int number(const Json &j, const char *k, int lo, int hi) {
    require(j.contains(k) && j[k].is_number_integer(), std::string(k) + ": ganze Zahl erforderlich.");
    auto n = j[k].get<long long>();
    require(n >= lo && n <= hi, std::string(k) + ": Wert außerhalb des erlaubten Bereichs.");
    return int(n);
  }
  static int roomId(const std::string &r) {
    require(r == "K" || r == "M", "Unbekannter Raum.");
    return r == "K" ? 0 : 1;
  }
  static const char *roomName(int r) { return r == 0 ? "K" : "M"; }
  static Json asJson(const Card &c) {
    return {{"uid", c.uid}, {"label", c.label}, {"room", roomName(c.room)},
            {"out", c.out}, {"lost", c.lost},   {"last", c.last}};
  }
  static Card fromJson(const Json &j) {
    Card c;
    c.uid = j.at("uid").get<std::string>();
    c.label = j.at("label").get<std::string>();
    c.room = roomId(j.at("room"));
    require(!c.uid.empty() && c.uid.size() <= 80 && !c.label.empty() && c.label.size() <= 20,
            "Ungültige Kartenkennung.");
    require(j.at("out").is_boolean() && j.at("lost").is_boolean() && j.at("last").is_number_integer(),
            "Ungültiger Kartenstatus.");
    c.out = j["out"];
    c.lost = j["lost"];
    c.last = j["last"];
    require(c.last >= -1, "Ungültige Kartenzeit.");
    return c;
  }
  Card &card(const std::string &uid) {
    for (auto &c : cards)
      if (c.uid == uid) return c;
    throw std::runtime_error("Unbekannte Karte. Bitte zuerst einlernen.");
  }
  void log(const std::string &m, long long now) {
    if (events.size() >= 80) events.erase(events.begin());
    events.push_back({now, m});
  }

public:
  Engine() { reset(); }
  void reset() {
    flow = Flow{};
    cards.clear();
    events.clear();
    rooms = {Room{48, 48, true}, Room{64, 64, false}};
    ready = false;
    paused = false;
    hasUndo = false;
    cooldown = 3;
    day = 1;
    held.clear();
    for (int r = 0; r < 2; r++)
      for (int i = 1; i <= rooms[r].capacity; i++) {
        auto label = std::string(roomName(r)) + (i < 10 ? "0" : "") + std::to_string(i);
        cards.push_back({"sim:" + label, label, r, false, false, -1});
      }
  }
  void prepareHardware() {
    for (auto &c : cards)
      if (c.uid.rfind("sim:", 0) == 0) c.lost = true;
    ready = false;
    hasUndo = false;
    held.clear();
  }
  void markReady(long long now) {
    ready = true;
    readyDate = flow.currentDate(now);
  }
  // After a reboot the monotonic clock starts again: scan times restart, the 30-minute protection counts from now when
  // cards are out, and a stock confirmed today is taken over once the clock shows the same date.
  void rebootClock(long long now) {
    resumeDate = ready ? readyDate : -1;
    flow.restart();
    if (outCards() > 0) flow.lastScan = now;
    for (auto &c : cards)
      if (c.last >= 0) c.last = now;
    ready = false;
    attentionAt = -1;
    hasUndo = false;
    held.clear();
  }
  // After a restore: the stock must be confirmed by a person, also when the backup was confirmed today.
  void requireConfirmation() {
    ready = false;
    resumeDate = -1;
  }
  int occupied(int r) const {
    int n = 0;
    for (const auto &c : cards)
      if (c.room == r && c.out) n++;
    return n;
  }
  int available(int r) const {
    if (!rooms[r].open) return 0;
    int n = 0;
    for (const auto &c : cards)
      if (c.room == r && !c.out && !c.lost) n++;
    return std::max(0, std::min(n, rooms[r].limit - occupied(r)));
  }
  bool isReady() const { return ready; }
  bool isPaused() const { return paused || flow.waiting || flow.relief; }
  bool isYellow() const {
    return ready && !isPaused() && available(0) + available(1) > 0 && available(0) + available(1) <= flow.yellow;
  }
  bool isGreen() const { return ready && !isPaused() && !isYellow() && (available(0) + available(1) > 0); }
  const std::string &heldUid() const { return held; }
  bool isRelieving() const { return flow.relief; }
  int groupRemaining(long long now) const {
    return flow.batch ? std::min(std::max(0, flow.target(now) - flow.issued), available(0) + available(1)) : -1;
  }
  bool editingMensa(long long now) const { return mensaEdit >= 0 && now < mensaEditUntil; }
  bool menuOpen(long long now) const { return menuSel >= 0 && now < menuUntil; }
  bool seriesActive() const { return seriesRoom >= 0; }
  bool isStaff(const std::string &uid) const { return std::find(staff.begin(), staff.end(), uid) != staff.end(); }
  // Holding the button is used by the core in these situations; otherwise the device shows the WLAN data.
  bool wantsHold(long long now) const { return !ready || seriesActive() || menuOpen(now) || dayWaiting(now); }
  // Next number of the room without a real card (placeholder uid "sim:"), after the given label; empty when done.
  std::string nextUnbound(int room, const std::string &after) const {
    std::string best;
    for (const auto &c : cards)
      if (c.room == room && c.uid.rfind("sim:", 0) == 0 && c.label > after && (best.empty() || c.label < best))
        best = c.label;
    return best;
  }
  std::pair<int, int> seriesProgress() const {
    int done = 0, total = 0;
    for (const auto &c : cards)
      if (c.room == seriesRoom) {
        total++;
        if (c.uid.rfind("sim:", 0) != 0) done++;
      }
    return {done, total};
  }
  std::vector<std::pair<std::string, std::string>> menuItems() const {
    std::vector<std::pair<std::string, std::string>> m;
    if (!ready)
      m.push_back({"confirm", "Bestand ok"});
    else if (flow.relief || paused)
      m.push_back({"resume", "Weiter"});
    else if (flow.waiting)
      m.push_back({"resume", "Nächste Gruppe"});
    else
      m.push_back({"pause", "Pause"});
    m.push_back({"mensa", "Mensa freigeben"});
    m.push_back({"close", "Abbrechen"});
    return m;
  }
  // Card lookup without building JSON (Dial memory): 0 = unknown, 1 = present and not out, 2 = out.
  int cardState(const std::string &uid) const {
    for (const auto &c : cards)
      if (c.uid == uid) return c.out ? 2 : 1;
    return 0;
  }
  // True once real cards (not "sim:" placeholders) or staff cards exist: then stored data must never be discarded.
  bool hasRealCards() const {
    if (!staff.empty()) return true;
    for (const auto &c : cards)
      if (c.uid.rfind("sim:", 0) != 0) return true;
    return false;
  }
  int outCards() const {
    int n = 0;
    for (const auto &c : cards)
      if (c.out) n++;
    return n;
  }
  // Cards still out 20 minutes after the last scan are probably missing.
  bool cardsMissing(long long now) const {
    return flow.lastScan >= 0 && now - flow.lastScan >= 1200000 && outCards() > 0;
  }
  // Same serving day: by calendar date when known, otherwise (older clock sources) by weekday.
  bool sameDay() const {
    return flow.date >= 0 && flow.dayDate >= 0 ? flow.date == flow.dayDate : flow.weekday == flow.dayWeekday;
  }
  // A wrong clock must not reset the stock during lunch: only after 30 minutes without any scan.
  bool dayBase(long long now) const {
    return flow.dayStart >= 0 && flow.clockReady(now) && !sameDay() && flow.currentMinute(now) >= flow.dayStart &&
           (flow.lastScan < 0 || now - flow.lastScan >= 1800000);
  }
  bool dayDue(long long now) const { return dayBase(now) && outCards() == 0; }
  // Cards still out: the new day waits for a person (hold 3 s) instead of freeing their seats automatically.
  bool dayWaiting(long long now) const { return dayBase(now) && outCards() > 0; }
  // Something needs a person: manual pause, relief, or a full group without automatic release.
  bool needsAttention() const {
    return ready && !seriesActive() && (paused || flow.relief || (flow.waiting && !autoPending()));
  }
  // Number of reminders due so far (the Dial beeps whenever it grows).
  int reminders(long long now) const {
    return remind > 0 && attentionAt >= 0 ? int((now - attentionAt) / (remind * 60000LL)) : 0;
  }
  bool turnHint(long long now) const {
    return turnAcc != 0 && turnAt >= 0 && now - turnAt < 1500 && !editingMensa(now);
  }
  int volumeLevel() const { return volume; }
  const Flow &flowState() const { return flow; }
  // Automatic release is only due while the group waits and nothing else holds the entrance closed.
  bool autoPending() const {
    return flow.autoOn && flow.waiting && ready && !paused && !flow.relief && !(flow.started >= 0 && flow.kind == 1);
  }
  bool autoDue(long long now) const { return autoPending() && (flow.releaseAt < 0 || now >= flow.releaseAt); }
  // Dial screen plus, while the button is held, a progress ring (3 s: confirm/WLAN, 10 s: access reset).
  Json dialScreen(long long now, const DialExtras &x) const {
    using namespace dial;
    auto list = dialBase(now, x);
    if (x.holdMs >= 400 && x.screen != "reset") {
      bool longHold = x.holdMs >= 3000;
      list.push_back(rect(30, 175, 180, 36, 18, panel));
      if (x.holdMs >= 3000) {
        list.push_back(text(120, 186, 1, white, "Loslassen:"));
        list.push_back(text(120, 201, 1, white, x.holdMs >= 10000 ? "Zugang zurücksetzen" : "3 s erreicht"));
      } else
        list.push_back(text(120, 193, 1, white, "Halten …"));
      ring(list, longHold ? std::min(1.0, (x.holdMs - 3000) / 7000.0) : x.holdMs / 3000.0, longHold ? orange : white,
           panel);
    }
    return list;
  }
  // Dial main screen: whole background in the signal colour, large text readable from a distance. Layout from the
  // top: what the button does, status, main line, free seats, touch button (pill), info pill.
  Json dialBase(long long now, const DialExtras &x) const {
    using namespace dial;
    Json list = Json::array();
    // Info pill: one or two lines (pixel widths fit the round edge).
    const std::vector<int> infoWidths = {164, 152};
    auto info = [&](const std::vector<std::string> &lines, int color, int pill) {
      if (lines.empty()) return;
      list.push_back(rect(30, 175, 180, 36, 18, pill));
      for (size_t i = 0; i < lines.size() && i < 2; i++)
        list.push_back(text(120, lines.size() == 1 ? 193 : i ? 201 : 186, 1, color, fit(lines[i], 1, infoWidths[i])));
    };
    auto key = [&](int color, const std::string &t) { list.push_back(text(120, 28, 1, color, fit(t, 1, 130))); };
    auto pillButton = [&](int color, int textColor, const std::string &t) {
      list.push_back(rect(30, 131, 180, 38, 19, color));
      list.push_back(text(120, 150, 2, textColor, t));
    };
    if (x.screen == "test") {
      list.push_back(fill(dark));
      list.push_back(text(120, 40, 2, yellow, "GERÄTETEST"));
      for (size_t i = 0; i < x.lines.size() && i < 8; i++) {
        int y = 66 + int(i) * 16;
        list.push_back(text(120, y, 1, white, fit(x.lines[i], 1, span(y, 1))));
      }
      list.push_back(text(120, 202, 1, yellow, "Scans buchen nicht"));
      return list;
    }
    if (x.screen == "reset") {
      list.push_back(fill(red));
      list.push_back(text(120, 72, 2, white, "ZUGANG"));
      list.push_back(text(120, 98, 2, white, "ZURÜCKSETZEN?"));
      list.push_back(text(120, 134, 1, white, "Nochmal 3 s halten: JA"));
      list.push_back(text(120, 154, 1, white, "Kurz drücken: abbrechen"));
      list.push_back(text(120, 182, 1, white, "Bestand bleibt erhalten"));
      return list;
    }
    if (x.screen == "broken") {
      list.push_back(fill(red));
      list.push_back(text(120, 84, 2, white, "KONFIGURATION"));
      list.push_back(text(120, 110, 2, white, "DEFEKT"));
      list.push_back(text(120, 148, 1, white, "Taste 10 s halten"));
      return list;
    }
    if (x.screen == "credentials") {
      list.push_back(fill(dark));
      list.push_back(text(120, 44, 2, white, "WLAN"));
      list.push_back(text(120, 72, 1, white, fit(x.ssid, 1, span(72, 1))));
      auto pw = wrap("Kennwort: " + x.wifi, {span(94, 1), span(110, 1)});
      for (size_t i = 0; i < pw.size(); i++)
        list.push_back(text(120, i ? 110 : 94, 1, white, pw[i]));
      list.push_back(text(120, 134, 1, yellow, "http://192.168.4.1"));
      if (!x.configured) {
        list.push_back(text(120, 160, 1, white, "Einrichtungscode:"));
        list.push_back(text(120, 184, 2, yellow, x.setupCode));
      } else
        list.push_back(text(120, 164, 1, white, "Kennwort im Browser"));
      if (!x.hint.empty()) list.push_back(text(120, 208, 1, warnText, fit(x.hint, 1, span(208, 1))));
      return list;
    }
    bool g = !x.blocked && isGreen(), y = !x.blocked && isYellow(),
         measuringGroup = flow.started >= 0 && flow.kind == 1;
    if (menuOpen(now)) {
      auto items = menuItems();
      int n = items.size(), sel = menuSel % n;
      list.push_back(fill(dark));
      key(grey, "Taste: ausführen");
      list.push_back(text(120, 54, 2, white, "BETREUUNG"));
      list.push_back(text(120, 79, 1, grey, items[(sel + n - 1) % n].second));
      list.push_back(text(120, 99, 2, yellow, items[sel].second));
      list.push_back(text(120, 118, 1, grey, items[(sel + 1) % n].second));
      pillButton(button, white, "TASTE = OK");
      info({"Ring drehen: Auswahl", "Karte: schließen"}, white, panel);
      return list;
    }
    if (seriesActive() && !editingMensa(now)) {
      auto p = seriesProgress();
      list.push_back(fill(dark));
      key(grey, "Taste: weiter");
      list.push_back(text(120, 52, 2, white, "EINLERNEN"));
      list.push_back(text(120, 85, 4, yellow, seriesLabel));
      list.push_back(text(120, 115, 1, white,
                          std::string(seriesRoom ? "Mensa " : "Küche ") + std::to_string(p.first) + " von " +
                              std::to_string(p.second)));
      pillButton(button, white, "VORHALTEN");
      if (!x.feedback.empty())
        info(wrap(x.feedback, infoWidths), x.feedbackOk ? okText : warnText, panel);
      else
        info({"Taste: überspringen", "3 s halten: Ende"}, white, panel);
      return list;
    }
    if (editingMensa(now)) {
      list.push_back(fill(dark));
      key(grey, "Taste: OK");
      list.push_back(text(120, 52, 2, white, "MENSA"));
      list.push_back(text(120, 85, 4, yellow, std::to_string(mensaEdit)));
      list.push_back(text(120, 115, 1, white,
                          "belegt " + std::to_string(occupied(1)) + " von " + std::to_string(rooms[1].capacity)));
      pillButton(button, white, mensaEdit ? "FREIGEBEN" : "SPERREN");
      info({"Ring drehen: Anzahl", "Sonst Abbruch"}, white, panel);
      return list;
    }
    int bg = g ? green : y ? yellow : red, fg = y ? dark : white, pill = shade(bg, 11);
    long long left = flow.releaseIn(now);
    int next = flow.target(now);
    list.push_back(fill(bg));
    bool countdown =
        flow.waiting && flow.autoOn && left >= 0 && !flow.relief && !paused && ready && !measuringGroup && !x.blocked;
    if (countdown) ring(list, flow.releaseShare(now), fg, shade(bg, 4));
    key(fg, !ready || dayWaiting(now) ? "Taste 3 s halten"
            : flow.relief || paused   ? "Taste: weiter"
            : flow.waiting            ? "Taste: freigeben"
                                      : "Taste: Pause");
    list.push_back(text(120, 58, 3, fg, g ? "PLATZ FREI" : y ? "FAST VOLL" : "EINLASS ZU"));
    std::string main;
    if (x.blocked)
      main = "Störung";
    else if (!ready)
      main = "Bestand prüfen";
    else if (flow.relief)
      main = "Entlastung";
    else if (paused)
      main = "Pause";
    else if (flow.waiting)
      main = measuringGroup ? "Messung läuft"
             : countdown    ? "Weiter in " + std::to_string(left / 60) + ":" + (left % 60 < 10 ? "0" : "") +
                               std::to_string(left % 60)
                         : "Gruppe voll";
    else if (flow.batch && flow.issued == 0 && flow.autoOn)
      main = (flow.startDue(now) ? "Startgruppe " : "Gruppe ") + std::to_string(next);
    else if (flow.batch) {
      int r = groupRemaining(now);
      main = "Noch " + std::to_string(r) + (r == 1 ? " Kind" : " Kinder");
    } else if (available(0) + available(1) == 0)
      main = "Kein Platz";
    list.push_back(text(120, 89, 2, fg, main));
    list.push_back(text(120, 113, 2, fg, "K " + std::to_string(available(0)) + " · M " + std::to_string(available(1))));
    if (flow.relief)
      pillButton(button, white, "ENTLASTUNG");
    else
      pillButton(dark, orange, "ENTLASTEN");
    if (lockUntil > now && !lockLabel.empty())
      info({lockLabel + " gesperrt", "noch " + std::to_string((lockUntil - now + 999) / 1000) + " s"}, warnText, pill);
    else if (!x.feedback.empty())
      info(wrap(x.feedback, infoWidths), x.feedbackOk ? okText : warnText, pill);
    else {
      bool remindNow = reminders(now) > 0 && needsAttention();
      std::string hint = !x.hint.empty()                  ? x.hint
                         : dayWaiting(now)                ? "Neuer Tag? Taste 3 s halten"
                         : !ready                         ? "Bestand ok?"
                         : turnHint(now)                  ? "Mensa: weiter drehen"
                         : measuringGroup && flow.waiting ? "Tablet: Alle haben Essen"
                         : cardsMissing(now)
                             ? std::to_string(outCards()) + (outCards() == 1 ? " Karte fehlt" : " Karten fehlen")
                         : remindNow ? flow.relief ? "Noch Entlastung? Taste"
                                       : paused    ? "Noch Pause? Taste: weiter"
                                                   : "Gruppe wartet: Taste"
                                     : "";
      info(wrap(hint, infoWidths), white, pill);
    }
    return list;
  }
  // withCards = false leaves out the card list (the Dial sends it as text via cardsText to save memory).
  Json snapshot(bool withCards = true) const {
    Json v = {{"schema", 1},
              {"ready", ready},
              {"paused", paused},
              {"cooldown", cooldown},
              {"volume", volume},
              {"remind", remind},
              {"readyDate", readyDate},
              {"held", held},
              {"day", day},
              {"undo", nullptr},
              {"rooms", Json::object()},
              {"cards", Json::array()},
              {"events", Json::array()}};
    for (int r = 0; r < 2; r++)
      v["rooms"][roomName(r)] = {{"capacity", rooms[r].capacity}, {"limit", rooms[r].limit}, {"open", rooms[r].open}};
    if (withCards)
      for (const auto &c : cards)
        v["cards"].push_back(asJson(c));
    else
      v.erase("cards");
    for (const auto &e : events)
      v["events"].push_back({{"at", e.at}, {"message", e.message}});
    v["flow"] = flow.snapshot();
    v["staff"] = staff;
    if (hasUndo) v["undo"] = {{"uid", undo.uid}, {"before", asJson(undo)}};
    return v;
  }
  void restore(const Json &v, bool preserveUndo = false) {
    require(v.is_object() && v.at("schema") == 1, "Unbekanntes Speicherformat.");
    Engine next;
    require(v.at("ready").is_boolean() && v.at("paused").is_boolean(), "Ungültiger Betriebszustand.");
    next.ready = v["ready"];
    next.paused = v["paused"];
    next.cooldown = number(v, "cooldown", 1, 600);
    next.volume = v.contains("volume") ? number(v, "volume", 0, 10) : 7;
    next.remind = v.contains("remind") ? number(v, "remind", 0, 30) : 3;
    next.readyDate = v.contains("readyDate") ? number(v, "readyDate", -1, 50000) : -1;
    next.day = number(v, "day", 1, 1000000);
    next.held = v.at("held").get<std::string>();
    require(next.held.size() <= 80, "Ungültiger Leserzustand.");
    require(v.at("events").is_array() && v["events"].size() <= 80, "Ungültiges Protokoll.");
    next.events.clear();
    for (auto &e : v["events"]) {
      require(e.at("at").is_number_integer() && e.at("message").is_string() &&
                  e["message"].get<std::string>().size() < 500,
              "Ungültiger Protokolleintrag.");
      next.events.push_back({e["at"], e["message"]});
    }
    for (int r = 0; r < 2; r++) {
      auto &x = v.at("rooms").at(roomName(r));
      int cap = number(x, "capacity", 0, 128), lim = number(x, "limit", 0, cap);
      require(x.at("open").is_boolean(), "Ungültige Freigabe.");
      next.rooms[r] = {cap, lim, x["open"]};
    }
    require(v.at("cards").is_array() && v["cards"].size() <= 256, "Ungültiger Kartenbestand.");
    next.cards.clear();
    std::set<std::string> ids, labels;
    for (const auto &j : v["cards"]) {
      auto c = fromJson(j);
      require(ids.insert(c.uid).second && labels.insert(c.label).second, "Doppelte Kartenkennung.");
      next.cards.push_back(c);
    }
    for (int r = 0; r < 2; r++)
      require(next.occupied(r) <= next.rooms[r].limit, "Belegung über der Kapazität.");
    if (v.contains("flow")) next.flow.restore(v["flow"]);
    if (v.contains("staff")) {
      require(v["staff"].is_array() && v["staff"].size() <= 5, "Ungültige Betreuerkarten.");
      for (auto &u : v["staff"]) {
        require(u.is_string() && !u.get<std::string>().empty() && u.get<std::string>().size() <= 80,
                "Ungültige Betreuerkarte.");
        next.staff.push_back(u);
      }
    }
    if (!v.contains("flow") || !v["flow"].contains("today")) next.flow.today[0] = next.day;
    if (preserveUndo && v.contains("undo") && !v["undo"].is_null()) {
      next.undo = fromJson(v["undo"].at("before"));
      next.card(next.undo.uid);
      next.hasUndo = true;
    }
    *this = std::move(next);
  }
  Json signal(long long now = -1) const {
    const char *reason = !ready                             ? "confirm"
                         : flow.relief                      ? "relief"
                         : paused                           ? "paused"
                         : flow.waiting                     ? "batch"
                         : available(0) + available(1) == 0 ? "full"
                         : isYellow()                       ? "low"
                                                            : "free";
    return {{"green", isGreen()},
            {"reason", reason},
            {"free", available(0) + available(1)},
            {"releaseIn", now >= 0 && autoPending() ? flow.releaseIn(now) : -1}};
  }
  // Card list as JSON text without building a JSON tree (about 1 KB of RAM instead of ~80 KB on the Dial); same
  // fields as in status(): with remainingMs.
  std::string cardsText(long long now, bool withRemaining = true) const {
    std::string out = "[";
    out.reserve(cards.size() * 96 + 2);
    for (size_t i = 0; i < cards.size(); i++) {
      const auto &c = cards[i];
      if (i) out += ',';
      out += "{\"uid\":" + Json(c.uid).dump() + ",\"label\":" + Json(c.label).dump() + ",\"room\":\"" +
             roomName(c.room) + "\",\"out\":" + (c.out ? "true" : "false") +
             ",\"lost\":" + (c.lost ? "true" : "false") + ",\"last\":" + std::to_string(c.last);
      if (withRemaining)
        out += ",\"remainingMs\":" + std::to_string(c.last < 0 ? 0 : std::max(0LL, cooldown * 1000LL - (now - c.last)));
      out += '}';
    }
    return out + "]";
  }
  Json status(long long now, bool withCards = true) const {
    auto v = snapshot(withCards);
    for (int r = 0; r < 2; r++) {
      v["rooms"][roomName(r)]["occupied"] = occupied(r);
      v["rooms"][roomName(r)]["free"] = available(r);
    }
    if (withCards)
      for (auto &c : v["cards"]) {
        long long last = c["last"];
        c["remainingMs"] = last < 0 ? 0 : std::max(0LL, cooldown * 1000LL - (now - last));
      }
    v["signal"] = signal(now);
    v["paused"] = isPaused();
    v["manualPaused"] = paused;
    v["flow"] = flow.status(now);
    v["flow"]["today"][11] = outCards();
    v["flow"]["today"][12] = flow.perChild(-1);
    Json missing = Json::array();
    for (const auto &c : cards)
      if (c.out) missing.push_back(c.label);
    v["outCards"] = missing;
    v["cardsMissing"] = cardsMissing(now);
    v["mensaEdit"] = editingMensa(now) ? mensaEdit : -1;
    auto p = seriesProgress();
    v["series"] = {{"active", seriesActive()},
                   {"room", seriesActive() ? roomName(seriesRoom) : ""},
                   {"label", seriesLabel},
                   {"done", p.first},
                   {"total", p.second}};
    v["staffCount"] = int(staff.size());
    v["staffLearning"] = staffLearning;
    v["menuOpen"] = menuOpen(now);
    v["dayWaiting"] = dayWaiting(now);
    v["reminders"] = reminders(now);
    Json lost = Json::array();
    for (const auto &c : cards)
      if (c.lost && c.uid.rfind("sim:", 0) != 0) lost.push_back(c.label);
    v["lostCards"] = lost;
    v["now"] = now;
    return v;
  }
  // New serving day: occupancy reset, Mensa closed again, daily report closed. Automatic start keeps an unconfirmed
  // stock unconfirmed.
  // Cards not returned are locked as lost: their seats stay unavailable until the card is scanned again.
  // An automatic start after a day without any issue (weekend, holidays) does not count as a serving day.
  std::string startDay(long long now, bool automatic) {
    std::string missing;
    for (const auto &c : cards)
      if (c.out) missing += (missing.empty() ? "" : ", ") + c.label;
    if (!missing.empty()) log("Nicht zurückgegeben, als verloren gesperrt: " + missing, now);
    bool empty = automatic && missing.empty() && flow.today[2] == 0;
    if (empty)
      flow.today[1] = flow.clockReady(now) ? flow.weekday : -1;
    else {
      flow.closeDay(outCards(), day + 1, flow.clockReady(now) ? flow.weekday : -1);
      day++;
    }
    if (flow.relief) log("Entlastung durch neuen Essenstag beendet.", now);
    flow.relief = false;
    flow.reliefAt = -1;
    flow.cancel();
    flow.next();
    flow.autoReleased = false;
    flow.autoComplaint = false;
    flow.autoFaster = 0;
    flow.autoSlower = 0;
    flow.lastEntry = -1;
    flow.lastScan = -1;
    flow.dayWeekday = flow.clockReady(now) ? flow.weekday : -1;
    flow.dayDate = flow.currentDate(now);
    if (!automatic) flow.clockValid = false;
    for (auto &c : cards) {
      if (c.out) c.lost = true;
      c.out = false;
      c.last = -1;
    }
    rooms[0].open = true;
    rooms[1].open = false;
    for (auto &r : rooms)
      r.limit = r.capacity;
    if (!automatic) markReady(now);
    paused = false;
    held.clear();
    hasUndo = false;
    mensaEdit = -1;
    std::string lost = missing.empty() ? "" : " Nicht zurückgegebene Karten sind gesperrt, bis sie wieder auftauchen.";
    return (automatic ? "Neuer Essenstag automatisch gestartet." : "Neuer Essenstag nach Bestandsprüfung gestartet.") +
           lost;
  }
  // saved: a copy the caller already made (the Dial keeps only one copy of the engine per action); on an error the
  // engine is restored from it instead of from its own copy.
  Json command(const Json &cmd, long long now, const Engine *saved = nullptr) {
    auto r = run(cmd, now, saved);
    bool need = needsAttention();
    if (need && attentionAt < 0) attentionAt = now;
    if (!need) attentionAt = -1;
    return r;
  }

private:
  Json run(const Json &cmd, long long now, const Engine *saved) {
    // Frequent no-op actions (card lifted, idle tick) need no backup copy (less heap churn on the Dial).
    const std::string type = cmd.is_object() && cmd.contains("type") && cmd["type"].is_string() ? cmd["type"] : "";
    if (type == "remove") {
      held.clear();
      return {{"ok", true}, {"message", "Karte entfernt."}};
    }
    if (type == "tick" && now >= 0 && !dayDue(now) && !autoDue(now))
      return {{"ok", true}, {"changed", false}, {"message", ""}};
    std::vector<Engine> own;
    if (!saved) own.push_back(*this);
    const Engine &before = saved ? *saved : own[0];
    try {
      require(now >= 0, "Ungültige Zeit.");
      auto action = cmd.at("type").get<std::string>();
      std::string message;
      bool booking = false;
      if (action == "remove") {
        held.clear();
        return {{"ok", true}, {"message", "Karte entfernt."}};
      }
      if (action == "scan") {
        auto uid = cmd.at("uid").get<std::string>();
        require(!uid.empty() && uid.size() <= 80, "Kartenkennung ungültig.");
        require(held != uid, "Karte liegt noch auf. Erst entfernen.");
        require(held.empty(), "Bitte zuerst die aufliegende Karte entfernen.");
        held = uid;
        lockUntil = -1;
        if (staffLearning) {
          staffLearning = false;
          bool known = isStaff(uid);
          for (const auto &c : cards)
            known = known || c.uid == uid;
          if (known) return {{"ok", false}, {"message", "Diese Karte ist schon vergeben."}};
          require(staff.size() < 5, "Höchstens fünf Betreuerkarten.");
          staff.push_back(uid);
          hasUndo = false;
          log("Betreuerkarte eingelernt.", now);
          return {{"ok", true}, {"message", "Betreuerkarte gespeichert."}, {"changed", true}};
        }
        if (isStaff(uid)) {
          if (menuOpen(now)) {
            menuSel = -1;
            return {{"ok", true}, {"changed", false}, {"message", "Menü geschlossen."}};
          }
          mensaEdit = -1;
          menuSel = 0;
          menuUntil = now + 20000;
          return {{"ok", true}, {"changed", false}, {"message", "Betreuermenü: Ring drehen, Taste."}};
        }
        if (seriesActive()) {
          for (const auto &c : cards)
            if (c.uid == uid) return {{"ok", false}, {"message", "Karte ist schon " + c.label + "."}};
          for (auto &c : cards)
            if (c.label == seriesLabel) {
              c.uid = uid;
              c.lost = false;
              c.last = -1; // freshly enrolled cards are usable at once; the reader latch prevents a double booking
            }
          hasUndo = false;
          message = seriesLabel + " gespeichert.";
          seriesLabel = nextUnbound(seriesRoom, seriesLabel);
          if (seriesLabel.empty()) {
            seriesRoom = -1;
            message += " Alle Nummern dieses Raums haben Karten. Taste: Einlass weiter.";
          }
          log(message, now);
          return {{"ok", true}, {"message", message}, {"changed", true}};
        }
        try {
          auto &c = card(uid);
          if (c.lost && !c.out) {
            c.lost = false;
            c.last = now;
            hasUndo = false;
            message = c.label + " ist wieder da und frei.";
            log(message, now);
            return {{"ok", true}, {"message", message}, {"changed", true}};
          }
          require(ready, "Bestand zuerst bestätigen.");
          require(!c.lost, "Karte ist als verloren gesperrt.");
          if (c.last >= 0 && now - c.last < cooldown * 1000LL) {
            lockLabel = c.label;
            lockUntil = c.last + cooldown * 1000LL;
            long long left = (lockUntil - now + 999) / 1000;
            return {{"ok", false}, {"message", c.label + ": Sperrzeit, noch " + std::to_string(left) + " s."}};
          }
          if (!c.out) {
            require(!isPaused(), "Einlass pausiert. Nur Rückgaben möglich.");
            require(rooms[c.room].open, "Raum gesperrt. Nur Rückgaben möglich.");
            require(available(c.room) > 0, "Keine freien Plätze in diesem Raum.");
          }
          undo = c;
          hasUndo = true;
          c.out = !c.out;
          c.last = now;
          if (c.out) {
            if (flow.armed && !flow.clockReady(now)) flow.cancel();
            flow.admission(uid, now);
          } else
            flow.returned(uid, now);
          message = c.label + (c.out ? " ausgegeben. Ein Platz reserviert." : " zurückgenommen. Ein Platz frei.");
          booking = true;
        } catch (const std::exception &e) {
          // Nothing of a rejected scan may stay booked; only the card on the reader is remembered.
          std::string reason = e.what();
          *this = before;
          held = uid;
          lockUntil = -1;
          return {{"ok", false}, {"message", reason}};
        }
      } else if (action == "trialFeedback" && (!ready || paused || flow.relief)) {
        throw std::runtime_error("Rückmeldung nur bei betriebsbereiter Gruppenpause möglich.");
      } else if (flow.command(cmd, now, isPaused(), message)) {
        if (action == "flowSettings" && before.flow.batch != flow.batch) paused = true;
        if ((action == "clockSync" || action == "measurementContext") && resumeDate >= 0) {
          if (!ready && flow.currentDate(now) == resumeDate) {
            markReady(now);
            message += " Nach dem Neustart bleibt der heute bestätigte Bestand gültig.";
          }
          resumeDate = -1;
        }
      } else if (action == "confirm") {
        markReady(now);
        message = "Bestand geprüft und bestätigt.";
      } else if (action == "tick") {
        if (dayDue(now))
          message = startDay(now, true);
        else if (!autoDue(now))
          return {{"ok", true}, {"changed", false}, {"message", ""}};
        else if (flow.releaseAt < 0) {
          flow.schedule(now);
          return {{"ok", true}, {"changed", true}, {"message", ""}};
        } else {
          flow.autoRelease();
          message = "Nächste Gruppe automatisch freigegeben.";
        }
      } else if (action == "dialTurn" && menuOpen(now)) {
        int steps = number(cmd, "steps", -100, 100), n = menuItems().size();
        menuSel = ((menuSel + steps) % n + n) % n;
        menuUntil = now + 20000;
        return {{"ok", true}, {"changed", false}, {"message", ""}};
      } else if (action == "dialPress" && menuOpen(now)) {
        auto item = menuItems()[menuSel % menuItems().size()].first;
        menuSel = -1;
        if (item == "confirm") {
          markReady(now);
          message = "Bestand am Dial bestätigt.";
        } else if (item == "pause")
          return command({{"type", "pause"}, {"paused", true}}, now);
        else if (item == "resume")
          return command({{"type", "pause"}, {"paused", false}}, now);
        else if (item == "mensa") {
          mensaEdit = rooms[1].open ? rooms[1].limit : std::max(occupied(1), 0);
          mensaEditUntil = now + 15000;
          return {{"ok", true}, {"changed", false}, {"message", "Ring drehen, Taste."}};
        } else
          return {{"ok", true}, {"changed", false}, {"message", "Menü geschlossen."}};
      } else if (action == "dialHold" && menuOpen(now)) {
        menuSel = -1;
        return {{"ok", true}, {"changed", false}, {"message", "Menü geschlossen."}};
      } else if (action == "dialPress" && seriesActive() && !editingMensa(now)) {
        auto skipped = seriesLabel;
        seriesLabel = nextUnbound(seriesRoom, seriesLabel);
        if (seriesLabel.empty()) seriesRoom = -1;
        return {{"ok", true},
                {"changed", false},
                {"message", skipped + " übersprungen." + (seriesRoom < 0 ? " Einlernen fertig." : "")}};
      } else if (action == "dialHold" && seriesActive()) {
        seriesRoom = -1;
        seriesLabel.clear();
        return {{"ok", true}, {"changed", false}, {"message", "Einlernen beendet. Taste: Einlass weiter."}};
      } else if (action == "seriesStart") {
        int r = roomId(cmd.at("room"));
        auto first = nextUnbound(r, "");
        require(!first.empty(), "Alle Nummern dieses Raums haben schon Karten.");
        menuSel = -1;
        mensaEdit = -1;
        seriesRoom = r;
        seriesLabel = first;
        paused = true;
        return {{"ok", true},
                {"changed", true},
                {"message", "Einlernen gestartet: " + first + " am Dial vorhalten. Einlass pausiert."}};
      } else if (action == "seriesStop") {
        seriesRoom = -1;
        seriesLabel.clear();
        return {{"ok", true}, {"changed", false}, {"message", "Einlernen beendet. Einlass bei Bedarf fortsetzen."}};
      } else if (action == "staffLearn") {
        require(staff.size() < 5, "Höchstens fünf Betreuerkarten.");
        staffLearning = true;
        return {{"ok", true}, {"changed", false}, {"message", "Jetzt die neue Betreuerkarte ans Dial halten."}};
      } else if (action == "staffClear") {
        staff.clear();
        staffLearning = false;
        menuSel = -1;
        message = "Alle Betreuerkarten gelöscht.";
      } else if (action == "dialTurn") {
        int steps = number(cmd, "steps", -100, 100);
        // A single bumped detent does not open the Mensa setting: at least two within 1.5 s.
        if (!editingMensa(now)) {
          if (turnAt < 0 || now - turnAt > 1500) turnAcc = 0;
          turnAcc += steps;
          turnAt = now;
          if (std::abs(turnAcc) < 2) return {{"ok", true}, {"changed", false}, {"message", ""}};
          steps = turnAcc;
          turnAcc = 0;
        }
        int base = editingMensa(now) ? mensaEdit : rooms[1].open ? rooms[1].limit : 0;
        mensaEdit = std::clamp(base + steps, occupied(1), rooms[1].capacity);
        mensaEditUntil = now + 15000;
        mensaTurnAt = now;
        return {{"ok", true}, {"changed", false}, {"message", ""}};
      } else if (action == "dialPress") {
        // A press while still turning is ignored so that the value is not saved by accident.
        if (editingMensa(now) && mensaTurnAt >= 0 && now - mensaTurnAt < 500)
          return {{"ok", true}, {"changed", false}, {"message", ""}};
        if (editingMensa(now)) {
          int value = mensaEdit;
          mensaEdit = -1;
          require(value >= occupied(1) && value <= rooms[1].capacity, "Ungültige Mensa-Freigabe.");
          rooms[1].limit = value;
          rooms[1].open = value > 0;
          hasUndo = false;
          message =
              value ? "Mensa am Dial freigegeben: " + std::to_string(value) + " Plätze." : "Mensa am Dial gesperrt.";
        } else {
          require(ready, "Bestand ok? Taste 3 Sekunden halten.");
          return command({{"type", "pause"}, {"paused", !isPaused()}}, now);
        }
      } else if (action == "dialHold" && dayWaiting(now)) {
        message = startDay(now, false);
      } else if (action == "dialHold") {
        if (ready)
          return {{"ok", false},
                  {"handled", false},
                  {"changed", false},
                  {"message", "Bestand ist bestätigt. Am Gerät zeigt langes Halten die WLAN-Daten."}};
        markReady(now);
        message = "Bestand am Dial bestätigt.";
      } else if (action == "relief" && (editingMensa(now) || menuOpen(now) || seriesActive())) {
        // The touch field reads "OK", "VORHALTEN" or "FREIGEBEN" on these screens: it acts like the button.
        return command({{"type", "dialPress"}}, now);
      } else if (action == "relief") {
        require(!flow.relief, "Ausgabe wird bereits entlastet.");
        flow.complaint(now);
        flow.relief = true;
        flow.reliefAt = now;
        message = "Ausgabe entlasten gestartet. Rückgaben bleiben möglich.";
      } else if (action == "pause") {
        require(cmd.at("paused").is_boolean(), "Ungültige Pause.");
        bool requested = cmd["paused"];
        if (!requested && isPaused()) {
          require(!(flow.started >= 0 && flow.kind == 1), "Gruppenmessung zuerst beenden oder verwerfen.");
          if (flow.relief) {
            log(flow.reliefAt >= 0
                    ? "Ausgabe entlasten beendet: " + std::to_string((now - flow.reliefAt) / 1000) + " Sekunden."
                    : "Ausgabe entlasten beendet; Dauer nach Neustart unbekannt.",
                now);
            flow.relief = false;
            flow.reliefAt = -1;
          }
          flow.manualRelease(now);
          flow.next();
        }
        paused = requested;
        message = paused ? "Einlass pausiert. Rückgaben bleiben möglich." : "Einlasspause beendet.";
      } else if (action == "room") {
        int r = roomId(cmd.at("room"));
        int cap = number(cmd, "capacity", 0, 128), lim = number(cmd, "limit", 0, cap);
        require(lim >= occupied(r),
                "Freigabe darf nicht unter der aktuellen Belegung liegen. Zum Stoppen den Raum sperren.");
        require(cmd.at("open").is_boolean(), "Ungültige Freigabe.");
        rooms[r] = {cap, lim, cmd["open"]};
        hasUndo = false;
        message = std::string(r == 0 ? "Küche" : "Mensa") + " aktualisiert.";
      } else if (action == "settings") {
        cooldown = number(cmd, "cooldown", 1, 600);
        if (cmd.contains("volume")) volume = number(cmd, "volume", 0, 10);
        if (cmd.contains("remind")) remind = number(cmd, "remind", 0, 30);
        hasUndo = false;
        message = "Sperrzeit und Lautstärke gespeichert.";
      } else if (action == "enroll") {
        auto uid = cmd.at("uid").get<std::string>(), label = cmd.at("label").get<std::string>();
        int r = roomId(cmd.at("room"));
        require(!uid.empty() && uid.size() <= 80 && !label.empty() && label.size() <= 20 && cards.size() < 256,
                "Kartenkennung fehlt, ist zu lang oder Kartenbestand voll.");
        require(!isStaff(uid), "Das ist eine Betreuerkarte.");
        for (const auto &c : cards)
          require(c.uid != uid && c.label != label, "Kennung oder Kartennummer bereits vorhanden.");
        // lost: a new number without a card yet stays locked until a real card is bound.
        cards.push_back({uid, label, r, false, cmd.value("lost", false), -1});
        hasUndo = false;
        message = label + " eingelernt. Raumkapazität bleibt unverändert.";
      } else if (action == "bind") {
        auto old = cmd.at("uid").get<std::string>(), uid = cmd.at("newUid").get<std::string>();
        auto &c = card(old);
        require(!isStaff(uid), "Das ist eine Betreuerkarte.");
        require(!c.out, "Ausgegebene Karte zuerst manuell klären.");
        require(!uid.empty() && uid.size() <= 80 && uid.rfind("sim:", 0) != 0, "Echte Kartenkennung erforderlich.");
        for (const auto &x : cards)
          require(x.uid != uid || x.uid == old, "Karte ist bereits einer anderen Nummer zugeordnet.");
        c.uid = uid;
        c.lost = false;
        c.last = -1;
        hasUndo = false;
        message = c.label + " mit echter Karte verknüpft.";
      } else if (action == "unbind") {
        // The number stays; its card is released and the number can be enrolled again.
        auto &c = card(cmd.at("uid").get<std::string>());
        require(c.uid.rfind("sim:", 0) != 0, "Diese Nummer hat noch keine Karte.");
        require(!c.out, "Karte ist ausgegeben. Zuerst zurückbuchen oder korrigieren.");
        if (flow.measuringUid == c.uid) flow.cancel();
        if (held == c.uid) held.clear();
        c.uid = "sim:" + c.label;
        c.lost = true;
        c.last = -1;
        hasUndo = false;
        message = c.label + ": Karte gelöst. Die Nummer kann neu eingelernt werden.";
      } else if (action == "removeSlot") {
        auto label = cmd.at("label").get<std::string>();
        auto it = std::find_if(cards.begin(), cards.end(), [&](const Card &c) { return c.label == label; });
        require(it != cards.end(), "Nummer nicht gefunden.");
        require(it->uid.rfind("sim:", 0) == 0, "Zuerst die Karte von der Nummer lösen.");
        require(!it->out, "Nummer ist belegt.");
        cards.erase(it);
        if (seriesActive() && seriesLabel == label) {
          seriesLabel = nextUnbound(seriesRoom, label);
          if (seriesLabel.empty()) seriesRoom = -1;
        }
        hasUndo = false;
        message = "Nummer " + label + " gelöscht.";
      } else if (action == "correct") {
        auto &c = card(cmd.at("uid"));
        require(cmd.at("out").is_boolean() && cmd.at("lost").is_boolean(), "Ungültige Korrektur.");
        bool out = cmd["out"];
        require(!out || c.out || occupied(c.room) < rooms[c.room].limit,
                "Korrektur würde die Raumkapazität überschreiten.");
        flow.cancel();
        flow.clearTrial();
        c.out = out;
        c.lost = cmd["lost"];
        c.last = now;
        hasUndo = false;
        message = c.label + " manuell korrigiert.";
      } else if (action == "undo") {
        require(hasUndo, "Keine Buchung zum Rückgängigmachen vorhanden.");
        auto &c = card(undo.uid);
        require(!undo.out || c.out || occupied(c.room) < rooms[c.room].limit,
                "Rückgängig würde die Raumkapazität überschreiten.");
        flow.cancel();
        flow.clearTrial();
        if (c.out && !undo.out)
          flow.undoAdmission();
        else if (!c.out && undo.out)
          flow.undoReturn();
        c = undo;
        c.last = now;
        hasUndo = false;
        message = "Letzte Buchung rückgängig gemacht.";
      } else if (action == "restart") {
        flow.restart();
        if (outCards() > 0) flow.lastScan = now;
        resumeDate = -1;
        ready = false;
        held.clear();
        hasUndo = false;
        message = "Gerät neu gestartet. Bestand bitte prüfen.";
      } else if (action == "newDay") {
        require(cmd.value("confirmed", false), "Neuen Essenstag ausdrücklich bestätigen.");
        require(day < 1000000, "Maximale Essenstage erreicht.");
        message = startDay(now, false);
      } else
        throw std::runtime_error("Unbekannte Aktion.");
      log(message, now);
      return {{"ok", true}, {"message", message}, {"booking", booking}, {"changed", true}};
    } catch (const std::exception &e) {
      *this = std::move(before);
      return {{"ok", false}, {"message", e.what()}};
    }
  }

public:
};
} // namespace mensa

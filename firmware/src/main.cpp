#include <Arduino.h>
#include <M5Dial.h>
#include <WiFi.h>
#include <WebServer.h>
#include <esp_timer.h>
#include <esp_system.h>
#include "../../core/engine.hpp"
#include "storage.hpp"
#include "config.hpp"
#include "card_reader.hpp"
#include "web_assets.hpp"
#include "version.hpp"

using mensa::Json;
mensa::Engine engine;
BookStorage storage;
DeviceConfig config;
CardReader reader;
WebServer web(80);
bool configValid = false, needsReview = false;
std::string session, loginNonce, captureTarget, capturedUid, feedback = "Bereit zur Einrichtung.";
uint64_t sessionUntil = 0, loginAfter = 0, captureUntil = 0, restartAt = 0, showCredentialsUntil = 0,
         resetConfirmUntil = 0, clockCheckAt = 0, ampelSeenAt = 0;
unsigned loginFailures = 0;
bool ampelWarned = false;
// Since when the stock is confirmed (for the Ampel warning) and how many reminders have beeped.
uint64_t readySince = 0;
int remindersBeeped = 0;
long encoderBase = 0;
// Device test: scans, ring and button are only shown, nothing is booked.
bool testMode = false;
std::string testUid, testButton = "-";
int testReads = 0;
long testTurn = 0;
uint64_t testAt = 0;
bool feedbackOk = true;
uint64_t feedbackAt = 0, drawAt = 0;
uint64_t nowMs() {
  return uint64_t(esp_timer_get_time() / 1000);
}
void note(const std::string &text, bool ok) {
  feedback = text;
  feedbackOk = ok;
  feedbackAt = nowMs();
  M5.Speaker.tone(ok ? 1800 : 400, ok ? 90 : 220);
}
bool blocked() {
  return !configValid || !config.configured || !storage.error.empty() || needsReview || !reader.healthy ||
         !captureTarget.empty();
}
// Sends JSON text without an extra String copy: the Dial has no PSRAM, and the full state is the largest allocation.
void replyBody(int code, const std::string &body) {
  web.sendHeader("Cache-Control", "no-store");
  web.sendHeader("X-Content-Type-Options", "nosniff");
  web.setContentLength(body.size());
  web.send(code, "application/json; charset=utf-8", "");
  web.sendContent(body.c_str(), body.size());
}
void reply(int code, const Json &value) {
  replyBody(code, value.dump());
}
bool localOrigin() {
  String host = web.hostHeader();
  if (host != "192.168.4.1" && host != "192.168.4.1:80") return false;
  String origin = web.header("Origin");
  return origin.isEmpty() || origin == String("http://") + host;
}
bool authorized() {
  return localOrigin() && !session.empty() && nowMs() < sessionUntil &&
         constantEqual(web.header("X-Mensa-Token").c_str(), session);
}
bool rtcTime(m5::rtc_datetime_t &t);
void setRtc(const Json &d);
Json transact(const Json &command);
Json rtcDate(const m5::rtc_datetime_t &t);
Json publicSignal() {
  ampelSeenAt = nowMs();
  const auto now = nowMs();
  bool clockOk = engine.flowState().clockReady(now);
  // The Ampel page sends its local time while the Dial has none (RTC not set, e.g. after a power loss): accepted
  // only then and only when plausible.
  m5::rtc_datetime_t t;
  if (!clockOk && web.hasArg("clock") && !rtcTime(t) && configValid && config.configured && !needsReview) {
    try {
      auto d = Json::parse(web.arg("clock").c_str());
      setRtc(d);
      if (rtcTime(t)) {
        transact({{"type", "clockSync"},
                  {"weekday", t.date.weekDay},
                  {"minute", t.time.hours * 60 + t.time.minutes},
                  {"date", rtcDate(t)}});
        clockOk = engine.flowState().clockReady(now);
      }
    } catch (...) {}
  }
  auto signal = engine.signal(now);
  if (blocked()) signal = {{"green", false}, {"reason", "device"}, {"free", 0}};
  return {{"signal", signal},
          {"storageError", blocked() ? "System nicht bereit." : ""},
          {"now", now},
          {"clockValid", clockOk}};
}
// Why the Dial last started (shown under Gerät; after a crash also briefly on the Dial).
std::string resetReason = "-";
bool resetWasError = false;
Json state(bool withCards = true) {
  auto s = engine.status(nowMs(), withCards);
  s["storageError"] = storage.error;
  s["recoveryRequired"] = false;
  s["sim"] = {{"offset", 0}, {"offline", false}, {"forceWriteFailure", false}};
  s["device"] = {{"version", MENSA_VERSION},
                 {"configured", config.configured},
                 {"reader", config.reader},
                 {"readerActive", reader.mode},
                 {"testMode", testMode},
                 {"readerHealthy", reader.healthy},
                 {"readerError", reader.error},
                 {"ssid", config.ssid},
                 {"channel", config.channel},
                 {"captureTarget", captureTarget},
                 {"capturedUid", capturedUid},
                 {"captureUntil", captureUntil},
                 {"feedback", feedback},
                 {"feedbackOk", feedbackOk},
                 {"needsReview", needsReview},
                 {"freeHeap", ESP.getFreeHeap()},
                 {"minimumHeap", ESP.getMinFreeHeap()},
                 {"maxAllocHeap", ESP.getMaxAllocHeap()},
                 {"resetReason", resetReason},
                 {"clients", WiFi.softAPgetStationNum()},
                 {"uptime", nowMs()}};
  if (blocked()) s["signal"] = {{"green", false}, {"reason", "device"}, {"free", 0}};
  return s;
}
// The state as text; the JSON tree is freed before the answer is sent.
std::string stateBody() {
  std::string body = state(false).dump();
  body.pop_back();
  return body + ",\"cards\":" + engine.cardsText(nowMs()) + "}";
}
// Answer object plus the current state, joined as text so that both trees never exist at the same time.
void replyWithState(const Json &r) {
  std::string body = r.dump();
  body.pop_back();
  body += ",\"state\":";
  body += stateBody();
  body += "}";
  replyBody(200, body);
}
// Built-in RTC: plausible once it was set from the tablet; supplies weekday and time for the learned half-hour values.
bool rtcTime(m5::rtc_datetime_t &t) {
  return M5.Rtc.isEnabled() && M5.Rtc.getDateTime(&t) && t.date.year >= 2025 && t.date.year < 2100 &&
         t.time.hours >= 0 && t.time.hours < 24 && t.time.minutes >= 0 && t.time.minutes < 60 && t.date.weekDay >= 0 &&
         t.date.weekDay < 7;
}
void setRtc(const Json &d) {
  if (!M5.Rtc.isEnabled() || !d.is_array() || d.size() != 6) return;
  for (auto &v : d)
    if (!v.is_number_integer()) return;
  int y = d[0], mo = d[1], day = d[2], h = d[3], mi = d[4], se = d[5];
  if (y < 2025 || y > 2099 || mo < 1 || mo > 12 || day < 1 || day > 31 || h < 0 || h > 23 || mi < 0 || mi > 59 ||
      se < 0 || se > 59)
    return;
  tm t{};
  t.tm_year = y - 1900;
  t.tm_mon = mo - 1;
  t.tm_mday = day;
  t.tm_hour = h;
  t.tm_min = mi;
  t.tm_sec = se;
  mktime(&t);
  M5.Rtc.setDateTime(&t);
}
// Signal display outside: more than 10 s without a poll is shown inside on the Dial, and also when no Ampel has
// polled at all within a minute of confirming the stock (e.g. the tablet did not reconnect after a reboot).
bool ampelLost() {
  if (ampelSeenAt) return nowMs() - ampelSeenAt > 10000;
  return readySince && nowMs() - readySince > 60000;
}
// Calendar array for the core from the RTC: [year, month, day, hour, minute, second].
Json rtcDate(const m5::rtc_datetime_t &t) {
  return Json::array({t.date.year, t.date.month, t.date.date, t.time.hours, t.time.minutes, t.time.seconds});
}
Json result(bool ok, const std::string &message) {
  return {{"ok", ok}, {"message", message}};
}
Json transact(const Json &command) {
  auto previous = engine;
  auto r = engine.command(command, nowMs());
  if (!r.value("ok", false) || !r.value("changed", true)) return r;
  if (!storage.save(engine)) {
    engine = std::move(previous);
    return result(false, storage.error);
  }
  return r;
}
void clearCapture() {
  captureTarget.clear();
  capturedUid.clear();
  captureUntil = 0;
  reader.latch.reset();
  engine.command({{"type", "remove"}}, nowMs());
}
Json command(const Json &j) {
  const auto type = j.at("type").get<std::string>();
  if (needsReview && type != "correct" && type != "reconcile" && type != "deviceSetup" && type != "deviceSettings" &&
      type != "captureCancel")
    return result(false, "Bestand zuerst manuell abgleichen. Keine automatische Überschreibung.");
  if (type == "deviceSetup" || type == "deviceSettings") {
    auto next = config;
    std::string password = j.value("adminPassword", std::string()), wifi = j.value("wifiPassword", std::string()),
                ssid = j.value("ssid", config.ssid);
    if (ssid.empty() || ssid.size() > 32) return result(false, "WLAN-Name: 1 bis 32 Zeichen.");
    if ((!wifi.empty() && (wifi.size() < 8 || wifi.size() > 63)) ||
        (!password.empty() && (password.size() < 10 || password.size() > 64)))
      return result(false, "WLAN-Kennwort: 8 bis 63 Zeichen; Betreuungskennwort: 10 bis 64 Zeichen.");
    if (!config.configured && password.empty()) return result(false, "Bitte ein eigenes Betreuungskennwort festlegen.");
    int channel = j.contains("channel") && j["channel"].is_number_integer() ? j["channel"].get<int>() : config.channel;
    if (channel != 1 && channel != 6 && channel != 11) return result(false, "WLAN-Kanal: 1, 6 oder 11.");
    next.channel = channel;
    next.ssid = ssid;
    if (!wifi.empty()) next.wifiPassword = wifi;
    if (!password.empty()) {
      next.salt = randomKey();
      next.adminHash = passwordHash(password, next.salt);
    }
    next.configured = true;
    next.setupCode.clear();
    if (!next.save()) return result(false, "Geräteeinstellungen konnten nicht gespeichert werden.");
    bool wifiChanged =
        next.ssid != config.ssid || next.wifiPassword != config.wifiPassword || next.channel != config.channel;
    config = next;
    if (wifiChanged) {
      engine.command({{"type", "restart"}}, nowMs());
      restartAt = nowMs() + 2500;
      return result(true, "Gespeichert. Gerät startet neu. Tablet anschließend mit dem neuen WLAN verbinden.");
    }
    return result(true, "Gerät eingerichtet. Jetzt Leser prüfen und echte Karten zuordnen.");
  }
  if (type == "reader") {
    std::string selected = j.at("reader");
    if (selected != "internal" && selected != "external" && selected != "auto")
      return result(false, "Ungültige Leserauswahl.");
    auto r = transact({{"type", "restart"}});
    if (!r["ok"].get<bool>()) return r;
    clearCapture();
    clockCheckAt = 0;
    auto next = config;
    next.reader = selected;
    if (!next.save()) return result(false, "Leserauswahl konnte nicht gespeichert werden.");
    config = next;
    bool ok = reader.begin(selected);
    return result(ok, ok ? "Leser umgestellt und erreichbar. Karte entfernen und Bestand erneut bestätigen."
                         : reader.error);
  }
  if (type == "captureStart") {
    if (blocked() &&
        (!captureTarget.empty() || needsReview || !storage.error.empty() || !config.configured || !reader.healthy))
      return result(false, "Gerät zuerst betriebsbereit machen.");
    const auto target = j.at("uid").get<std::string>();
    auto snapshot = engine.snapshot();
    bool found = false;
    for (auto &c : snapshot["cards"])
      if (c["uid"] == target && !c["out"].get<bool>()) found = true;
    if (!found) return result(false, "Karte fehlt oder ist noch ausgegeben.");
    auto r = transact({{"type", "pause"}, {"paused", true}});
    if (!r["ok"].get<bool>()) return r;
    clearCapture();
    captureTarget = target;
    captureUntil = nowMs() + 60000;
    return result(
        true, "Einlernen aktiv. Leser zuerst freimachen, dann genau eine Karte vorhalten. Einlass bleibt pausiert.");
  }
  if (type == "deviceTest") {
    testMode = j.value("on", false);
    testUid.clear();
    testReads = 0;
    testTurn = 0;
    testButton = "-";
    return result(true, testMode ? "Gerätetest gestartet. Scans buchen nicht." : "Gerätetest beendet.");
  }
  if (type == "captureCancel") {
    clearCapture();
    return result(true, "Einlernen beendet. Einlass bei Bedarf fortsetzen.");
  }
  if (type == "captureBind") {
    if (captureTarget.empty() || capturedUid.empty() || nowMs() >= captureUntil)
      return result(false, "Zuerst eine Karte im Einlernmodus vorhalten.");
    auto r = transact({{"type", "bind"}, {"uid", captureTarget}, {"newUid", capturedUid}});
    if (r["ok"].get<bool>()) clearCapture();
    return r;
  }
  if (type == "storageRetry") {
    if (needsReview) return result(false, "Beschädigten Bestand erst manuell abgleichen.");
    return storage.save(engine) ? result(true, "Speicherung erfolgreich geprüft.") : result(false, storage.error);
  }
  if (type == "reconcile") {
    if (!j.value("confirmed", false)) return result(false, "Bestandsabgleich ausdrücklich bestätigen.");
    engine.command({{"type", "restart"}}, nowMs());
    if (!storage.reconcile(engine)) return result(false, storage.error);
    needsReview = false;
    return result(true, "Abgeglichener Bestand gespeichert. Jetzt Bestand bestätigen.");
  }
  if (type == "deviceRestart") {
    auto r = transact({{"type", "restart"}});
    if (r["ok"].get<bool>()) restartAt = nowMs() + 1000;
    return r;
  }
  if (type == "createSlot") {
    const auto label = j.at("label").get<std::string>();
    auto previous = engine;
    auto r = engine.command({{"type", "enroll"}, {"uid", "sim:" + label}, {"label", label}, {"room", j.at("room")}},
                            nowMs());
    if (!r.value("ok", false)) return r;
    engine.command({{"type", "correct"}, {"uid", "sim:" + label}, {"out", false}, {"lost", true}}, nowMs());
    if (!storage.save(engine)) {
      engine = previous;
      return result(false, storage.error);
    }
    return result(true, "Kartennummer angelegt. Nun eine echte Karte zuordnen.");
  }
  if (needsReview) {
    if (type == "correct") {
      auto r = engine.command(j, nowMs());
      if (r.value("ok", false))
        r["message"] = "Korrektur vorgemerkt. Nach vollständiger Prüfung den Bestand ausdrücklich übernehmen.";
      return r;
    }
    return result(false, "Bestand zuerst manuell abgleichen.");
  }
  if (type == "trialFeedback" && blocked()) return result(false, "Gerät zuerst betriebsbereit machen.");
  if (type == "confirm" && blocked()) return result(false, "Einrichtung, Leser und Speicherung zuerst prüfen.");
  if (type == "correct" && j.at("uid").get<std::string>().rfind("sim:", 0) == 0)
    return result(false, "Dieser Nummer zuerst eine echte Karte zuordnen.");
  if ((type == "measurementContext" || type == "clockSync") && j.contains("date")) setRtc(j["date"]);
  if (type == "seriesStart" || type == "seriesStop" || type == "staffLearn" || type == "staffClear" ||
      type == "clockSync" || type == "autoSettings" || type == "trialSettings" || type == "trialFeedback" ||
      type == "relief" || type == "confirm" || type == "pause" || type == "correct" || type == "room" ||
      type == "settings" || type == "undo" || type == "newDay" || type == "flowSettings" ||
      type == "measurementContext" || type == "queueState" || type == "measurementArm" || type == "measurementFinish" ||
      type == "measurementCancel" || type == "measurementDeleteLast")
    return transact(j);
  return result(false, "Diese Aktion ist am Gerät nicht verfügbar.");
}
void configureWeb() {
  const char *headers[] = {"Origin", "X-Mensa-Token"};
  web.collectHeaders(headers, 2);
  web.on("/api/info", HTTP_GET, [] {
    if (!localOrigin()) return reply(403, result(false, "Fremder Zugriff."));
    reply(200,
          {{"mode", "device"}, {"configured", config.configured}, {"nonce", loginNonce}, {"version", MENSA_VERSION}});
  });
  web.on("/api/signal", HTTP_GET, [] { reply(200, publicSignal()); });
  web.on("/api/login", HTTP_POST, [] {
    if (!localOrigin()) return reply(403, result(false, "Fremder Zugriff."));
    if (nowMs() < loginAfter) return reply(429, result(false, "Zu viele Versuche. Bitte 30 Sekunden warten."));
    try {
      if (web.arg("plain").length() > 512) throw std::runtime_error("Anfrage zu groß.");
      auto j = Json::parse(web.arg("plain").c_str());
      auto password = j.at("password").get<std::string>();
      if (j.value("nonce", std::string()) != loginNonce || password.size() > 64 || !configValid ||
          !config.authenticate(password)) {
        if (++loginFailures >= 5) {
          loginAfter = nowMs() + 30000;
          loginFailures = 0;
        }
        return reply(401, result(false, "Kennwort oder Einrichtungscode stimmt nicht."));
      }
      session = randomKey(40);
      sessionUntil = nowMs() + 8 * 60 * 60 * 1000ULL;
      loginFailures = 0;
      reply(200, {{"ok", true}, {"token", session}});
    } catch (...) { reply(400, result(false, "Ungültige Anmeldung.")); }
  });
  web.on("/api/state", HTTP_GET, [] {
    if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
    try {
      uint32_t before = ESP.getFreeHeap();
      std::string body = stateBody();
      Serial.printf("state: %u bytes, heap %u -> %u, max block %u\n", unsigned(body.size()), unsigned(before),
                    unsigned(ESP.getFreeHeap()), unsigned(ESP.getMaxAllocHeap()));
      replyBody(200, body);
    } catch (...) { reply(503, result(false, "Status konnte nicht erstellt werden.")); }
  });
  // Restore a downloaded backup; larger than the 2 KB command limit. Stock must be confirmed again afterwards.
  web.on("/api/restore", HTTP_POST, [] {
    if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
    try {
      if (web.arg("plain").length() > 65536) throw std::runtime_error("Sicherung zu groß.");
      auto j = Json::parse(web.arg("plain").c_str());
      if (!j.value("confirmed", false)) return reply(200, result(false, "Einspielen ausdrücklich bestätigen."));
      auto &b = j.at("backup");
      if (b.value("format", std::string()) != "mensa-device-backup-1" &&
          b.value("format", std::string()) != "mensa-pc-backup-1")
        return reply(200, result(false, "Keine gültige Mensaampel-Sicherung."));
      auto previous = engine;
      try {
        engine.restore(b.at("state"));
      } catch (const std::exception &e) {
        engine = std::move(previous);
        return reply(200, result(false, std::string("Sicherung ungültig: ") + e.what()));
      }
      engine.rebootClock(nowMs());
      if (!storage.save(engine)) {
        engine = std::move(previous);
        return reply(200, result(false, storage.error));
      }
      auto r = result(true, "Sicherung eingespielt. Bestand prüfen und bestätigen.");
      note(r["message"], true);
      replyWithState(r);
    } catch (const std::exception &e) { reply(400, result(false, e.what())); }
  });
  web.on("/api/logout", HTTP_POST, [] {
    if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
    session.clear();
    reply(200, result(true, "Abgemeldet."));
  });
  web.on("/api/command", HTTP_POST, [] {
    if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
    try {
      if (web.arg("plain").length() > 2048) throw std::runtime_error("Anfrage zu groß.");
      auto j = Json::parse(web.arg("plain").c_str());
      auto r = command(j);
      M5.Speaker.setVolume(engine.volumeLevel() * 25);
      if (j.value("type", std::string()) != "clockSync") note(r.value("message", std::string()), r.value("ok", false));
      replyWithState(r);
    } catch (const std::exception &e) { reply(400, result(false, e.what())); }
  });
  web.on("/api/backup", HTTP_GET, [] {
    if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
    web.sendHeader("Content-Disposition", "attachment; filename=mensa-bestand.json");
    std::string body =
        std::string("{\"format\":\"mensa-device-backup-1\",\"reader\":") + Json(config.reader).dump() + ",\"state\":";
    {
      std::string snap = engine.snapshot(false).dump();
      snap.pop_back();
      body += snap + ",\"cards\":" + engine.cardsText(nowMs(), false) + "}}";
    }
    replyBody(200, body);
  });
  web.onNotFound([] {
    if (web.method() != HTTP_GET) return reply(405, result(false, "Methode nicht erlaubt."));
    String path = web.uri();
    if (path == "/" || path == "/ampel" || path == "/geraet") path = "/index.html";
    for (auto &a : webAssets)
      if (path == a.path) {
        web.sendHeader("Content-Encoding", "gzip");
        web.sendHeader("Cache-Control", "no-cache");
        web.sendHeader("Content-Security-Policy",
                       "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
                       "connect-src 'self'; frame-ancestors 'none'");
        web.send_P(200, a.mime, (const char *)a.bytes, a.length);
        return;
      }
    reply(404, result(false, "Nicht gefunden."));
  });
  web.begin();
}
// Draws the core's draw list. Redraws only on change. Flicker-free in five horizontal strips of 240x48 pixels
// (23 KB buffer instead of 115 KB for a full frame: the Dial has no PSRAM, WLAN and the web server need the memory).
constexpr int stripH = 48;
M5Canvas frame(&M5.Display);
bool frameReady = false;
std::string lastScreen;
// dy: vertical offset of the strip (all y coordinates are shifted by it; the sprite clips the rest).
template <typename G> void paint(G &d, const Json &list, int dy = 0) {
  d.setTextDatum(middle_center);
  for (auto &i : list) {
    const std::string kind = i[0];
    if (kind == "f")
      d.fillScreen(uint16_t(i[1].get<int>()));
    else if (kind == "c")
      d.fillCircle(i[1].get<int>(), i[2].get<int>() - dy, i[3].get<int>(), uint16_t(i[4].get<int>()));
    else if (kind == "r")
      d.fillRoundRect(i[1].get<int>(), i[2].get<int>() - dy, i[3].get<int>(), i[4].get<int>(), i[5].get<int>(),
                      uint16_t(i[6].get<int>()));
    else if (kind == "a")
      d.fillArc(i[1].get<int>(), i[2].get<int>() - dy, i[3].get<int>(), i[4].get<int>(), float(i[5].get<int>()),
                float(i[6].get<int>()), uint16_t(i[7].get<int>()));
    else {
      d.setTextSize(i[3].get<int>());
      d.setTextColor(uint16_t(i[4].get<int>()));
      d.drawString(i[5].get<std::string>().c_str(), i[1].get<int>(), i[2].get<int>() - dy);
    }
  }
}
void draw() {
  uint64_t now = nowMs();
  if (now - drawAt < 250) return;
  drawAt = now;
  mensa::DialExtras x;
  if (resetConfirmUntil > now)
    x.screen = "reset";
  else if (!configValid)
    x.screen = "broken";
  else if (!config.configured || now < showCredentialsUntil) {
    x.screen = "credentials";
    x.ssid = config.ssid;
    x.wifi = config.wifiPassword;
    x.setupCode = config.setupCode;
    x.configured = config.configured;
  } else if (testMode) {
    x.screen = "test";
    m5::rtc_datetime_t t;
    char clock[24] = "nicht gestellt";
    if (rtcTime(t)) snprintf(clock, sizeof(clock), "%02d:%02d:%02d", t.time.hours, t.time.minutes, t.time.seconds);
    x.lines = {std::string("Leser: ") + (reader.mode == "external" ? "extern" : "intern") +
                   (reader.healthy ? " ok" : " FEHLER"),
               "Karte: " + (testUid.empty() ? std::string("-") : testUid),
               "Lesungen: " + std::to_string(testReads) +
                   (testAt ? "  vor " + std::to_string((now - testAt) / 1000) + " s" : ""),
               "Ring: " + std::to_string(testTurn) + "  Taste: " + testButton,
               "Tablets: " + std::to_string(WiFi.softAPgetStationNum()) +
                   "  Ampel: " + (ampelSeenAt && !ampelLost() ? "ok" : "-"),
               "Speicher frei: " + std::to_string(ESP.getFreeHeap() / 1024) + " KB",
               "Uhr: " + std::string(clock),
               std::string("Version ") + MENSA_VERSION};
  } else {
    x.blocked = blocked();
    m5::rtc_datetime_t t;
    bool noClock = !engine.flowState().clockReady(now) && !rtcTime(t);
    x.hint = !reader.healthy          ? "Leser pruefen!"
             : !storage.error.empty() ? "Speicher pruefen!"
             : !captureTarget.empty() ? "Karte einlernen am Tablet"
             : ampelLost()            ? (ampelSeenAt ? "Ampel draussen getrennt!" : "Ampel nicht verbunden!")
             : noClock                ? "Uhr nicht gestellt"
                                      : "";
    if (feedbackAt && now - feedbackAt < 3500) {
      x.feedback = feedback;
      x.feedbackOk = feedbackOk;
    }
  }
  if (M5.BtnA.isPressed() && configValid)
    x.holdMs = int(std::min<uint32_t>(M5.BtnA.getUpdateMsec() - M5.BtnA.lastChange(), 20000));
  auto list = engine.dialScreen(now, x);
  auto dump = list.dump();
  if (dump == lastScreen) return;
  lastScreen = dump;
  static bool frameTried = false;
  if (!frameTried) {
    frameTried = true;
    frame.setColorDepth(16);
    frameReady = frame.createSprite(240, stripH) != nullptr;
    Serial.printf("strip buffer %s, heap %u, max block %u\n", frameReady ? "ok" : "off", unsigned(ESP.getFreeHeap()),
                  unsigned(ESP.getMaxAllocHeap()));
  }
  if (frameReady)
    for (int y = 0; y < 240; y += stripH) {
      paint(frame, list, y);
      frame.pushSprite(0, y);
    }
  else
    paint(M5.Display, list);
}
void setup() {
  Serial.begin(115200);
  switch (esp_reset_reason()) {
  case ESP_RST_POWERON:
    resetReason = "Einschalten";
    break;
  case ESP_RST_SW:
    resetReason = "Neustart durch Software";
    break;
  case ESP_RST_PANIC:
    resetReason = "Absturz";
    resetWasError = true;
    break;
  case ESP_RST_INT_WDT:
  case ESP_RST_TASK_WDT:
  case ESP_RST_WDT:
    resetReason = "Watchdog (haengt)";
    resetWasError = true;
    break;
  case ESP_RST_BROWNOUT:
    resetReason = "Stromeinbruch";
    resetWasError = true;
    break;
  default:
    resetReason = "Reset/USB";
  }
  auto cfg = M5.config();
  cfg.fallback_board = m5::board_t::board_M5Dial;
  M5Dial.begin(cfg, true, false);
  encoderBase = M5Dial.Encoder.read();
  pinMode(46, OUTPUT);
  digitalWrite(46, HIGH);
  M5.Display.setRotation(0);
  configValid = config.load();
  needsReview = !storage.load(engine);
  engine.rebootClock(nowMs());
  M5.Speaker.setVolume(engine.volumeLevel() * 25);
  loginNonce = randomKey();
  if (configValid) {
    reader.begin(config.reader);
    WiFi.mode(WIFI_AP);
    WiFi.setSleep(false);
    WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
    if (!WiFi.softAP(config.ssid.c_str(), config.wifiPassword.c_str(), config.channel, false, 4)) {
      configValid = false;
      feedback = "WLAN konnte nicht gestartet werden.";
    } else
      configureWeb();
  }
  if (resetWasError) note("Neustart nach Fehler: " + resetReason, false);
  draw();
}
void loop() {
  const auto now = nowMs();
  M5Dial.update();
  if (configValid) web.handleClient();
  if (restartAt && now >= restartAt) ESP.restart();
  if (captureUntil && now >= captureUntil) {
    clearCapture();
    note("Einlernen abgelaufen. Einlass bleibt pausiert.", false);
  }
  auto touch = M5.Touch.getDetail();
  if (testMode && touch.wasPressed()) testButton = "Touch " + std::to_string(touch.x) + "," + std::to_string(touch.y);
  // Touch field: "ENTLASTEN" on the main screen; in menu, enrolment and Mensa setting the core treats it as the button.
  bool touchOk = engine.menuOpen(now) || engine.seriesActive() || engine.editingMensa(now);
  if (touch.wasPressed() && touch.x >= 30 && touch.x <= 210 && touch.y >= 142 && touch.y <= 177 && configValid &&
      config.configured && !needsReview && now >= showCredentialsUntil && now >= resetConfirmUntil &&
      (touchOk || !engine.isRelieving()) && !testMode) {
    auto r = transact({{"type", "relief"}});
    if (!r.value("message", std::string()).empty()) note(r.value("message", std::string()), r.value("ok", false));
  }
  if (M5.BtnA.wasReleaseFor(10000) && resetConfirmUntil <= now) {
    resetConfirmUntil = now + 15000;
  } else if (resetConfirmUntil > now && M5.BtnA.wasReleaseFor(3000)) {
    // Second long hold on the reset screen: reset the access (stock stays).
    auto next = config;
    if (!configValid)
      next.fresh();
    else {
      next.configured = false;
      next.setupCode = randomKey(10);
      next.salt = randomKey();
      next.adminHash = passwordHash(next.setupCode, next.salt);
    }
    if (next.save()) {
      engine.command({{"type", "restart"}}, now);
      restartAt = now + 500;
    }
    resetConfirmUntil = 0;
  } else if (resetConfirmUntil > now && M5.BtnA.wasClicked()) {
    resetConfirmUntil = 0;
    note("Zuruecksetzen abgebrochen.", true);
  } else if (now < showCredentialsUntil && M5.BtnA.wasClicked()) {
    // A short press only closes the WLAN screen; it must not pause or release the entrance.
    showCredentialsUntil = 0;
  } else if (testMode && M5.BtnA.wasReleaseFor(3000))
    testButton = "3 s";
  else if (testMode && M5.BtnA.wasClicked())
    testButton = "kurz";
  else if (M5.BtnA.wasReleaseFor(3000)) {
    // Holding 3 s confirms an unconfirmed stock; otherwise it shows the WLAN credentials as before.
    bool handled = false;
    if (configValid && config.configured && !needsReview && engine.wantsHold(now)) {
      if (blocked() && !engine.isReady())
        note("Leser und Speicher zuerst pruefen.", false);
      else {
        auto r = transact({{"type", "dialHold"}});
        handled = r.value("handled", true);
        if (handled) note(r.value("message", std::string()), r.value("ok", false));
      }
      handled = true;
    }
    if (!handled) showCredentialsUntil = now + 30000;
  } else if (M5.BtnA.wasClicked()) {
    if (configValid && config.configured && !needsReview) {
      auto r = transact({{"type", "dialPress"}});
      if (!r.value("message", std::string()).empty() || !r.value("ok", false))
        note(r.value("message", std::string()), r.value("ok", false));
    }
  }
  // Automatic group release: only transact (and write flash) when a release or its scheduling is due.
  // Rotary ring: Mensa seats (one step per detent; 4 counts per detent to be verified on the device).
  {
    long position = M5Dial.Encoder.read();
    long steps = (position - encoderBase) / 4;
    if (steps) {
      encoderBase += steps * 4;
      if (testMode)
        testTurn += steps;
      else if (configValid && config.configured && !needsReview && now >= showCredentialsUntil)
        engine.command({{"type", "dialTurn"}, {"steps", int(steps)}}, now);
    }
  }
  {
    if (engine.isReady() && !readySince) readySince = now;
    if (!engine.isReady()) readySince = 0;
    bool lost = ampelLost();
    if (lost && !ampelWarned) note(ampelSeenAt ? "Ampel draussen getrennt!" : "Ampel nicht verbunden!", false);
    ampelWarned = lost;
    // Reminder while a pause, relief or full group waits for a person: short double beep each interval.
    int due = engine.reminders(now);
    if (due > remindersBeeped) {
      M5.Speaker.tone(1400, 120);
      delay(160);
      M5.Speaker.tone(1400, 120);
    }
    remindersBeeped = due;
  }
  if (configValid && config.configured && !needsReview && storage.error.empty() && !blocked() &&
      (engine.autoDue(now) || engine.dayDue(now))) {
    auto r = transact({{"type", "tick"}});
    if (r.value("ok", false) && !r.value("message", std::string()).empty()) note(r["message"], true);
  }
  if (configValid && config.configured && !needsReview && now >= clockCheckAt) {
    clockCheckAt = now + 5000;
    const auto &f = engine.flowState();
    m5::rtc_datetime_t t;
    // Also while a group is running (e.g. the last, partly filled group of yesterday): then only the clock is set, so
    // the running group is not disturbed; otherwise the day start would never become due again.
    if (!f.clockReady(now) && rtcTime(t)) {
      bool idle = !f.armed && f.started < 0 && f.issued == 0;
      Json c = {{"type", idle ? "measurementContext" : "clockSync"},
                {"weekday", t.date.weekDay},
                {"minute", t.time.hours * 60 + t.time.minutes},
                {"date", rtcDate(t)}};
      if (idle) c["queue"] = f.queue;
      auto r = transact(c);
      if (r.value("message", std::string()).find("Neustart") != std::string::npos) note(r["message"], true);
    }
  }
  if (configValid) {
    mensa::Edge edge;
    bool sampled = reader.poll(now, edge);
    if (!reader.change.empty()) {
      engine.command({{"type", "remove"}}, now);
      note(reader.change, true);
      reader.change.clear();
    }
    if (sampled && edge.kind && testMode) {
      if (edge.kind > 0) {
        if (edge.uid == testUid)
          testReads++;
        else {
          testUid = edge.uid;
          testReads = 1;
        }
        testAt = now;
        note("Karte gelesen", true);
      }
    } else if (sampled && edge.kind) {
      if (edge.kind < 0)
        engine.command({{"type", "remove"}}, now);
      else if (!captureTarget.empty()) {
        capturedUid = edge.uid;
        note("Karte erkannt. Zuordnung am Tablet speichern.", true);
      } else if (!config.configured || needsReview || !storage.error.empty()) {
        note("Einrichtung oder Speicher zuerst pruefen.", false);
      } else {
        auto r = transact({{"type", "scan"}, {"uid", edge.uid}});
        note(r.value("message", std::string()), r.value("ok", false));
      }
    }
  }
  draw();
  delay(2);
}

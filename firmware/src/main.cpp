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
// Loop task stack: 20 KB instead of the default 8 KB (engine copies for rollback, storage, JSON). The web server runs
// in its own task with the same stack size.
SET_LOOP_TASK_STACK_SIZE(20 * 1024);
// The web server runs in its own task so that drawing, card reading and saving never keep the tablet waiting.
// Everything touching the engine, configuration or shared fields runs under this recursive lock.
SemaphoreHandle_t stateLock = nullptr;
struct Guard {
  Guard() { xSemaphoreTakeRecursive(stateLock, portMAX_DELAY); }
  ~Guard() { xSemaphoreGiveRecursive(stateLock); }
  Guard(const Guard &) = delete;
  Guard &operator=(const Guard &) = delete;
};
// Last command ids with their answers (idempotent retries).
std::array<std::pair<std::string, std::string>, 6> recentCommands;
size_t recentNext = 0;
// Card list revision: the tablet gets the 112 cards only when something changed (?cards=<rev>).
uint32_t dataRev = 1; // starts at a random value on every boot: an old cached list never matches
TaskHandle_t loopTask = nullptr, webTaskHandle = nullptr;
bool webStarted = false;
// Diagnostics for the tablet: requests served and the longest handler time.
uint32_t webRequests = 0, webMaxMs = 0;
// "Black box": what the Dial was doing last; survives a crash reset (RTC memory, not initialised on reboot).
RTC_NOINIT_ATTR char crumb[40];
RTC_NOINIT_ATTR uint32_t crumbMagic;
std::string lastCrumb;
void mark(const char *what, const std::string &detail = "") {
  snprintf(crumb, sizeof(crumb), "%s%s%s", what, detail.empty() ? "" : " ", detail.c_str());
  crumbMagic = 0x4d454e53;
}
mensa::Engine engine;
BookStorage storage;
DeviceConfig config;
CardReader reader;
// The Arduino WebServer serves one connection at a time and waits up to 5 s for a request on an accepted but still
// empty connection. Safari opens such connections in advance, which stalled the tablet's polling ("Verbindung
// unterbrochen"). Here an empty connection is dropped as soon as another client is waiting, and after 1.5 s anyway.
class MensaWebServer : public WebServer {
public:
  using WebServer::WebServer;
  void handleClient() override {
    if (_currentStatus == HC_WAIT_READ && _currentClient && !_currentClient.available()) {
      unsigned long waited = millis() - _statusChange;
      if ((waited > 30 && _server.hasClient()) || waited > 1500) {
        _currentClient.stop();
        _currentClient = WiFiClient();
        _currentStatus = HC_NONE;
      }
    }
    WebServer::handleClient();
  }
};
MensaWebServer web(80);
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
// Answer of the current web request. Handlers build it under the state lock; it is sent after the lock is released,
// so a tablet that leaves the WLAN mid-answer cannot hold up scans, the display or the Ampel (web task only).
struct PendingReply {
  int code = 0;
  std::string body, disposition;
} pending;
void sendPending() {
  if (!pending.code) return;
  web.sendHeader("Cache-Control", "no-store");
  web.sendHeader("X-Content-Type-Options", "nosniff");
  if (!pending.disposition.empty()) web.sendHeader("Content-Disposition", pending.disposition.c_str());
  web.setContentLength(pending.body.size());
  web.send(pending.code, "application/json; charset=utf-8", "");
  web.sendContent(pending.body.c_str(), pending.body.size());
  pending = PendingReply{};
}
// Web handlers run in the web task: take the state lock and record the handler time for the diagnostics. Nothing a
// handler throws (e.g. memory briefly short) may crash the device.
template <typename F> std::function<void()> guarded(F f) {
  return [f] {
    {
      Guard g;
      uint64_t t0 = nowMs();
      webRequests++;
      try {
        f();
      } catch (...) {
        pending = PendingReply{};
        pending.code = 503;
        pending.body = "{\"ok\":false,\"message\":\"Speicher knapp - bitte gleich nochmal.\"}";
      }
      webMaxMs = std::max<uint32_t>(webMaxMs, uint32_t(nowMs() - t0));
    }
    sendPending();
  };
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
// The Ampel outside is red while the device is not ready or the device test runs (scans do not book then).
bool signalBlocked() {
  return blocked() || testMode;
}
// Queues JSON text (sent by guarded() without the lock) without an extra String copy: the Dial has no PSRAM, and the
// full state is the largest allocation.
void replyBody(int code, std::string body) {
  pending.code = code;
  pending.body = std::move(body);
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
  if (signalBlocked()) signal = {{"green", false}, {"reason", "device"}, {"free", 0}};
  return {{"signal", signal},
          {"storageError", signalBlocked() ? "System nicht bereit." : ""},
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
                 {"lastCrumb", lastCrumb},
                 {"stackFree", uxTaskGetStackHighWaterMark(nullptr)},
                 {"loopStackFree", loopTask ? uxTaskGetStackHighWaterMark(loopTask) : 0},
                 {"webRequests", webRequests},
                 {"webMaxMs", webMaxMs},
                 {"clients", WiFi.softAPgetStationNum()},
                 {"uptime", nowMs()}};
  // Also at the top level like PC service and demo: the tablet's device test switch reads it there.
  s["testMode"] = testMode;
  if (signalBlocked()) s["signal"] = {{"green", false}, {"reason", "device"}, {"free", 0}};
  return s;
}
// The state as text; the JSON tree is freed before the answer is sent.
// sinceRev: the tablet's card revision; unchanged cards are left out (it keeps its copy).
std::string stateBody(uint32_t sinceRev = 0) {
  std::string body = state(false).dump();
  body.pop_back();
  body += ",\"cardsRev\":" + std::to_string(dataRev);
  if (sinceRev != dataRev) body += ",\"cards\":" + engine.cardsText(nowMs());
  return body + "}";
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
  mark("Befehl", command.value("type", std::string()));
  // One backup copy per action: the engine restores itself from it on an error, transact on a failed save.
  auto previous = engine;
  auto r = engine.command(command, nowMs(), &previous);
  if (!r.value("ok", false) || !r.value("changed", true)) return r;
  mark("Speichern");
  if (!storage.save(engine)) {
    engine = std::move(previous);
    return result(false, storage.error);
  }
  mark("bereit");
  dataRev++;
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
    if (engine.cardState(target) != 1) return result(false, "Karte fehlt oder ist noch ausgegeben.");
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
    dataRev++;
    return result(true, "Abgeglichener Bestand gespeichert. Jetzt Bestand bestätigen.");
  }
  if (type == "deviceRestart") {
    auto r = transact({{"type", "restart"}});
    if (r["ok"].get<bool>()) restartAt = nowMs() + 1000;
    return r;
  }
  if (type == "memoryTest") {
    if (needsReview || !storage.error.empty() || !storage.mounted)
      return result(false, "Zuerst Speicher und Bestand in Ordnung bringen.");
    uint32_t minFree = ESP.getFreeHeap(), minBlock = ESP.getMaxAllocHeap(), slowest = 0, statusMax = 0;
    for (int i = 0; i < 20; i++) {
      uint64_t t0 = nowMs();
      { std::string body = stateBody(); }
      statusMax = std::max<uint32_t>(statusMax, uint32_t(nowMs() - t0));
      t0 = nowMs();
      if (!storage.save(engine))
        return result(false, "Dauertest: Speichern " + std::to_string(i + 1) + " fehlgeschlagen: " + storage.error);
      slowest = std::max<uint32_t>(slowest, uint32_t(nowMs() - t0));
      minFree = std::min<uint32_t>(minFree, ESP.getFreeHeap());
      minBlock = std::min<uint32_t>(minBlock, ESP.getMaxAllocHeap());
      // Let scans, the display and the Ampel run between the rounds.
      xSemaphoreGiveRecursive(stateLock);
      vTaskDelay(pdMS_TO_TICKS(30));
      xSemaphoreTakeRecursive(stateLock, portMAX_DELAY);
    }
    return result(true, "Dauertest ok: 20x gespeichert, langsamstes Speichern " + std::to_string(slowest) +
                            " ms, Status max " + std::to_string(statusMax) + " ms, freier Speicher mind. " +
                            std::to_string(minFree / 1024) + " KB, größter Block mind. " +
                            std::to_string(minBlock / 1024) + " KB.");
  }
  if (type == "createSlot") {
    const auto label = j.at("label").get<std::string>();
    auto r = transact(
        {{"type", "enroll"}, {"uid", "sim:" + label}, {"label", label}, {"room", j.at("room")}, {"lost", true}});
    if (!r.value("ok", false)) return r;
    return result(true, "Kartennummer angelegt. Nun eine echte Karte zuordnen.");
  }
  if (needsReview) {
    if (type == "correct") {
      auto r = engine.command(j, nowMs());
      if (r.value("ok", false)) dataRev++;
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
  if (type == "unbind" || type == "removeSlot" || type == "seriesStart" || type == "seriesStop" ||
      type == "staffLearn" || type == "staffClear" || type == "clockSync" || type == "autoSettings" ||
      type == "trialSettings" || type == "trialFeedback" || type == "relief" || type == "confirm" || type == "pause" ||
      type == "correct" || type == "room" || type == "settings" || type == "undo" || type == "newDay" ||
      type == "flowSettings" || type == "measurementContext" || type == "queueState" || type == "measurementArm" ||
      type == "measurementFinish" || type == "measurementCancel" || type == "measurementDeleteLast")
    return transact(j);
  return result(false, "Diese Aktion ist am Gerät nicht verfügbar.");
}
void configureWeb() {
  const char *headers[] = {"Origin", "X-Mensa-Token"};
  web.collectHeaders(headers, 2);
  web.on("/api/info", HTTP_GET, guarded([] {
           if (!localOrigin()) return reply(403, result(false, "Fremder Zugriff."));
           reply(200, {{"mode", "device"},
                       {"configured", config.configured},
                       {"nonce", loginNonce},
                       {"version", MENSA_VERSION}});
         }));
  web.on("/api/signal", HTTP_GET, guarded([] { reply(200, publicSignal()); }));
  web.on("/api/login", HTTP_POST, guarded([] {
           if (!localOrigin()) return reply(403, result(false, "Fremder Zugriff."));
           if (nowMs() < loginAfter) return reply(429, result(false, "Zu viele Versuche. Bitte 30 Sekunden warten."));
           try {
             mark("Anmeldung");
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
         }));
  web.on("/api/state", HTTP_GET, guarded([] {
           if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
           try {
             mark("Status");
             uint32_t since = web.hasArg("cards") ? uint32_t(strtoul(web.arg("cards").c_str(), nullptr, 10)) : 0;
             std::string body = stateBody(since);
             replyBody(200, body);
           } catch (...) { reply(503, result(false, "Status konnte nicht erstellt werden.")); }
         }));
  // Restore a downloaded backup; larger than the 2 KB command limit. Stock must be confirmed again afterwards.
  web.on("/api/restore", HTTP_POST, guarded([] {
           if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
           try {
             // Memory check before the body is parsed: the JSON tree of a full backup is the largest allocation.
             if (ESP.getMaxAllocHeap() < 60000)
               return reply(200, result(false,
                                        "Zu wenig freier Speicher. Dial kurz vom Strom nehmen und die Sicherung direkt "
                                        "danach einspielen."));
             Json j;
             {
               const String body = web.arg("plain");
               if (body.length() > 65536) throw std::runtime_error("Sicherung zu groß.");
               j = Json::parse(body.c_str());
             }
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
             engine.requireConfirmation(); // a restored stock is never confirmed automatically
             if (!storage.save(engine)) {
               engine = std::move(previous);
               return reply(200, result(false, storage.error));
             }
             dataRev++;
             auto r = result(true, "Sicherung eingespielt. Bestand prüfen und bestätigen.");
             note(r["message"], true);
             replyWithState(r);
           } catch (const std::exception &e) { reply(400, result(false, e.what())); }
         }));
  web.on("/api/logout", HTTP_POST, guarded([] {
           if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
           session.clear();
           reply(200, result(true, "Abgemeldet."));
         }));
  web.on("/api/command", HTTP_POST, guarded([] {
           if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
           try {
             if (web.arg("plain").length() > 2048) throw std::runtime_error("Anfrage zu groß.");
             auto j = Json::parse(web.arg("plain").c_str());
             // A repeated request (the tablet retries after a timeout with the same id) is answered from memory and
             // never executed twice, e.g. "Neuer Essenstag".
             const std::string rid = j.value("rid", std::string());
             for (auto &d : recentCommands)
               if (!rid.empty() && d.first == rid) return replyWithState(Json::parse(d.second));
             auto r = command(j);
             if (!rid.empty() && rid.size() <= 40) {
               recentCommands[recentNext] = {rid, r.dump()};
               recentNext = (recentNext + 1) % recentCommands.size();
             }
             M5.Speaker.setVolume(engine.volumeLevel() * 25);
             if (j.value("type", std::string()) != "clockSync")
               note(r.value("message", std::string()), r.value("ok", false));
             replyWithState(r);
           } catch (const std::exception &e) { reply(400, result(false, e.what())); }
         }));
  web.on("/api/backup", HTTP_GET, guarded([] {
           if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
           pending.disposition = "attachment; filename=mensa-bestand.json";
           std::string body = std::string("{\"format\":\"mensa-device-backup-1\",\"reader\":") +
                              Json(config.reader).dump() + ",\"state\":";
           {
             std::string snap = engine.snapshot(false).dump();
             snap.pop_back();
             body += snap + ",\"cards\":" + engine.cardsText(nowMs(), false) + "}}";
           }
           replyBody(200, body);
         }));
  web.onNotFound([] {
    if (web.method() != HTTP_GET) {
      reply(405, result(false, "Methode nicht erlaubt."));
      return sendPending();
    }
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
    sendPending();
  });
  web.begin();
}
// Draws the core's draw list, smooth (core/dial_raster.hpp, same pixels as the browser). Redraws only on change.
// Flicker-free in five horizontal strips of 240x48 pixels in a static buffer (23 KB, not from the heap: the Dial has
// no PSRAM, WLAN and the web server need the memory).
constexpr int stripH = 48;
uint16_t strip[240 * stripH];
std::string lastScreen;
// Builds the Dial picture under the state lock; returns false when nothing changed.
bool buildScreen(Json &list) {
  Guard g;
  uint64_t now = nowMs();
  mensa::DialExtras x;
  // After a crash: for one minute show where it happened (black box), so it can be reported without a PC.
  std::string crashHint =
      resetWasError && now < 60000 ? "Fehler: " + (lastCrumb.empty() ? resetReason : lastCrumb) : "";
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
    x.hint = crashHint;
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
    if (!crashHint.empty())
      x.hint = crashHint;
    else
      x.hint = !webStarted && config.configured ? "Webserver aus - Dial neu starten"
               : !reader.healthy                ? "Leser prüfen!"
               : !storage.error.empty()         ? "Speicher prüfen!"
               : !captureTarget.empty()         ? "Karte einlernen am Tablet"
               : ampelLost()                    ? (ampelSeenAt ? "Ampel draußen getrennt!" : "Ampel nicht verbunden!")
               : noClock                        ? "Uhr nicht gestellt"
                                                : "";
    if (feedbackAt && now - feedbackAt < 3500) {
      x.feedback = feedback;
      x.feedbackOk = feedbackOk;
    }
  }
  if (M5.BtnA.isPressed() && configValid)
    x.holdMs = int(std::min<uint32_t>(M5.BtnA.getUpdateMsec() - M5.BtnA.lastChange(), 20000));
  list = engine.dialScreen(now, x);
  auto dump = list.dump();
  if (dump == lastScreen) return false;
  lastScreen = dump;
  return true;
}
// Painting (SPI) runs without the lock, so the web task can answer meanwhile.
void draw() {
  uint64_t now = nowMs();
  if (now - drawAt < 250) return;
  drawAt = now;
  Json list;
  if (!buildScreen(list)) return;
  M5.Display.startWrite();
  for (int y = 0; y < 240; y += stripH) {
    mensa::raster::Target t{strip, 240, y, stripH, true};
    mensa::raster::paint(t, list);
    M5.Display.pushImage(0, y, 240, stripH, (const lgfx::swap565_t *)strip);
  }
  M5.Display.endWrite();
}
void webTask(void *) {
  for (;;) {
    web.handleClient();
    vTaskDelay(1);
  }
}
void setup() {
  stateLock = xSemaphoreCreateRecursiveMutex();
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
    resetReason = "Watchdog (hängt)";
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
    } else {
      configureWeb();
      webStarted = true;
    }
  }
  if (crumbMagic == 0x4d454e53) lastCrumb = std::string(crumb, strnlen(crumb, sizeof(crumb)));
  if (resetWasError) {
    if (Serial) Serial.printf("Neustart nach Fehler (%s) bei: %s\n", resetReason.c_str(), lastCrumb.c_str());
    note("Neustart nach Fehler: " + resetReason, false);
  }
  mark("Start");
  dataRev = esp_random() | 1;
  loopTask = xTaskGetCurrentTaskHandle();
  // The web task starts last, when all shared state is set up.
  if (webStarted &&
      xTaskCreatePinnedToCore(webTask, "web", 20 * 1024, nullptr, 1, &webTaskHandle, ARDUINO_RUNNING_CORE) != pdPASS) {
    webStarted = false;
    note("Webserver nicht gestartet. Dial neu starten.", false);
  }
  draw();
}
uint64_t healAt = 0, secondBeepAt = 0;
void step(uint64_t now);
void loop() {
  const auto now = nowMs();
  {
    // Touch, RTC and card reader share one I2C bus with the web task: only under the lock. A planned restart waits
    // for the lock too, so it never cuts a save in half.
    Guard g;
    M5Dial.update();
    if (restartAt && now >= restartAt) ESP.restart();
    try {
      step(now);
    } catch (...) { note("Speicher knapp - bitte gleich nochmal.", false); }
  }
  try {
    draw();
  } catch (...) { lastScreen.clear(); }
  delay(2);
}
// Everything that reads or changes shared state, once per loop, under the state lock.
void step(uint64_t now) {
  if (secondBeepAt && now >= secondBeepAt) {
    secondBeepAt = 0;
    M5.Speaker.tone(1400, 120);
  }
  if (captureUntil && now >= captureUntil) {
    clearCapture();
    note("Einlernen abgelaufen. Einlass bleibt pausiert.", false);
  }
  auto touch = M5.Touch.getDetail();
  if (testMode && touch.wasPressed()) testButton = "Touch " + std::to_string(touch.x) + "," + std::to_string(touch.y);
  // Touch field: "ENTLASTEN" on the main screen; in menu, enrolment and Mensa setting the core treats it as the button.
  bool touchOk = engine.menuOpen(now) || engine.seriesActive() || engine.editingMensa(now);
  if (touch.wasPressed() && touch.x >= 30 && touch.x <= 210 && touch.y >= 131 && touch.y <= 169 && configValid &&
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
    note("Zurücksetzen abgebrochen.", true);
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
        note("Leser und Speicher zuerst prüfen.", false);
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
    if (lost && !ampelWarned) note(ampelSeenAt ? "Ampel draußen getrennt!" : "Ampel nicht verbunden!", false);
    ampelWarned = lost;
    // Reminder while a pause, relief or full group waits for a person: short double beep each interval.
    int due = engine.reminders(now);
    if (due > remindersBeeped) {
      M5.Speaker.tone(1400, 120);
      secondBeepAt = now + 160;
    }
    remindersBeeped = due;
  }
  if (configValid && config.configured && !needsReview && storage.error.empty() && !blocked() && !testMode &&
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
        note("Einrichtung oder Speicher zuerst prüfen.", false);
      } else {
        auto r = transact({{"type", "scan"}, {"uid", edge.uid}});
        note(r.value("message", std::string()), r.value("ok", false));
      }
    }
  }
  // Self-healing: a failed save rolled the engine back to the stored state; retry every 5 s so that one transient
  // failure (e.g. memory briefly short) does not block the entrance until someone taps "Speicherung prüfen".
  if (!storage.error.empty() && storage.mounted && !needsReview && now >= healAt) {
    healAt = now + 5000;
    if (storage.save(engine)) note("Speicher wieder in Ordnung.", true);
  }
}

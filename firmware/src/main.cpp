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
#include "ota.hpp"
#include "probes.hpp"
#include "sessions.hpp"
#include <DNSServer.h>
#include <esp_wifi.h>
#include <Update.h>
#include <Preferences.h>
#include <esp_ota_ops.h>
#include <lwip/sockets.h>
#include <atomic>

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
mensa::Sessions sessions;
std::string loginNonce, captureTarget, capturedUid, feedback = "Bereit zur Einrichtung.";
uint64_t loginAfter = 0, captureUntil = 0, restartAt = 0, showCredentialsUntil = 0, resetConfirmUntil = 0,
         clockCheckAt = 0, ampelSeenAt = 0;
unsigned loginFailures = 0;
bool ampelWarned = false;
// Health since power-on (one lunch), only in RAM: reader faults, Ampel disconnects, smallest largest free block.
struct Health {
  uint32_t ampelDrops = 0, minBlock = UINT32_MAX;
  uint64_t sampledAt = 0;
} health;
// Memory endurance test: runs in the loop one round at a time (a long web handler would block the Ampel, as the web
// server answers one request after the other).
struct MemoryTest {
  int left = 0;
  bool ok = false;
  uint32_t minFree = 0, minBlock = 0, slowest = 0, statusMax = 0;
  uint64_t nextAt = 0;
  std::string message;
} memoryTest;
// Since when the stock is confirmed (for the Ampel warning) and how many reminders have beeped.
uint64_t readySince = 0;
// Start check (0.19.0): shown for 4 s after power-on (10 s with a fault); a button or a card ends it.
uint64_t checkUntil = 0;
bool checkExtended = false;
// Rest mode (0.19.0): screen dark and quiet after engine.rest minutes without use (Engine::resting). A card wakes the
// Dial and is booked; ring, button and touch only wake it (nothing is triggered by accident).
uint64_t lastInput = 0;
bool restingNow = false, ignoreButton = false;
uint8_t brightness = 0;
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
// Sending with a hard limit: the library's WiFiClient::write waits up to 10 x 1 s per call when a tablet left the WLAN
// mid-answer, and the web server answers nobody else meanwhile (the Ampel turns red). Here an answer is given up when
// nothing moves for 1.5 s. Web task only; counters for the health report.
std::atomic<uint32_t> sendMaxMs{0}, sendAborts{0}, wlanDrops{0}, probeAnswers{0};
// Smooth motion: while something moves the picture is rebuilt every 40 ms (about 25 per second), otherwise every 250
// ms; it is only painted when it changed. drawMs/drawMaxMs: time to paint one picture (health report).
bool drawFast = false;
std::atomic<uint32_t> drawMs{0}, drawMaxMs{0}; // written by the loop outside the lock, read by the web task
// Smoothness: longest wait for the state lock before a frame and longest gap between two frames while something moves
// (health report; a tablet request holding the lock shows up here).
std::atomic<uint32_t> lockWaitMaxMs{0}, frameGapMaxMs{0};
// Names of all hosts point to the Dial, so tablets can run their internet check against it (probes.hpp).
DNSServer dns;
// Router mode (netconfig.hpp, 0.18.0). routerHost: the Dial's address in the router network, fixed from the start (a
// change restarts the Dial). routerUp is written by the WiFi event task. rescue: own WLAN opened in addition because
// the router was unreachable for 30 s. dnsWanted: address the DNS answers with (web task restarts the DNS on change).
std::string routerHost;
std::atomic<bool> routerUp{false}, rescue{false};
std::atomic<uint32_t> dnsWanted{0};
uint64_t routerSeenAt = 0, routerRetryAt = 0;
IPAddress toIp(uint32_t v) {
  return IPAddress(v >> 24, v >> 16 & 255, v >> 8 & 255, v & 255);
}
uint32_t ipValue(const std::string &text) {
  uint32_t v = 0;
  mensa::net::parseIp(text, v);
  return v;
}
// Last WLAN joins/leaves (seconds since start, joined?, end of the MAC); written by the WiFi event task.
struct WlanEvent {
  uint32_t at;
  bool joined;
  uint8_t mac[3];
};
WlanEvent wlanLog[12];
uint32_t wlanLogCount = 0;
portMUX_TYPE wlanLock = portMUX_INITIALIZER_UNLOCKED;
void wlanEvent(bool joined, const uint8_t *mac) {
  portENTER_CRITICAL(&wlanLock);
  auto &e = wlanLog[wlanLogCount++ % 12];
  e.at = uint32_t(nowMs() / 1000);
  e.joined = joined;
  memcpy(e.mac, mac + 3, 3);
  portEXIT_CRITICAL(&wlanLock);
  if (!joined) wlanDrops++;
}
std::string macTail(const uint8_t *m) {
  char b[9];
  snprintf(b, sizeof b, "%02X:%02X:%02X", m[0], m[1], m[2]);
  return b;
}
Json wlanEvents() {
  WlanEvent copy[12];
  uint32_t n;
  portENTER_CRITICAL(&wlanLock);
  memcpy(copy, wlanLog, sizeof copy);
  n = wlanLogCount;
  portEXIT_CRITICAL(&wlanLock);
  Json list = Json::array();
  for (uint32_t i = n > 12 ? n - 12 : 0; i < n; i++) {
    auto &e = copy[i % 12];
    list.push_back({{"at", e.at}, {"joined", e.joined}, {"mac", macTail(e.mac)}});
  }
  return list;
}
// Connected tablets with their signal strength (dBm); the weakest value since power-on is kept in rssiMin.
int rssiMin = 0;
Json stations() {
  Json list = Json::array();
  // Router mode: the Dial's own connection to the router (tablets there are not visible to the Dial).
  if (routerUp) list.push_back({{"mac", "Router"}, {"rssi", WiFi.RSSI()}});
  wifi_sta_list_t sta{};
  if (esp_wifi_ap_get_sta_list(&sta) != ESP_OK) return list;
  for (int i = 0; i < sta.num; i++)
    list.push_back({{"mac", macTail(sta.sta[i].mac + 3)}, {"rssi", sta.sta[i].rssi}});
  return list;
}
bool writeBounded(int fd, const char *data, size_t length) {
  uint64_t progressAt = nowMs();
  while (length > 0) {
    fd_set set;
    FD_ZERO(&set);
    FD_SET(fd, &set);
    timeval tv{0, 100000};
    int ready = select(fd + 1, nullptr, &set, nullptr, &tv);
    if (ready < 0) return false;
    if (ready > 0) {
      int sent = send(fd, data, std::min<size_t>(length, 4096), MSG_DONTWAIT);
      if (sent > 0) {
        data += sent;
        length -= size_t(sent);
        progressAt = nowMs();
        continue;
      }
      if (sent < 0 && errno != EAGAIN && errno != EWOULDBLOCK) return false;
    }
    if (nowMs() - progressAt > 1500) return false;
  }
  return true;
}
const char *statusText(int code) {
  switch (code) {
  case 200:
    return "OK";
  case 400:
    return "Bad Request";
  case 401:
    return "Unauthorized";
  case 403:
    return "Forbidden";
  case 404:
    return "Not Found";
  case 405:
    return "Method Not Allowed";
  case 429:
    return "Too Many Requests";
  default:
    return "Service Unavailable";
  }
}
// Writes one complete HTTP answer (headers + body) to the current client and closes the connection afterwards.
void sendBounded(int code, const char *type, const char *body, size_t length, const std::string &extraHeaders) {
  uint64_t t0 = nowMs();
  WiFiClient client = web.client();
  int fd = client.fd();
  std::string head = "HTTP/1.1 " + std::to_string(code) + " " + statusText(code) + "\r\nContent-Type: " + type +
                     "\r\nContent-Length: " + std::to_string(length) + "\r\n" + extraHeaders +
                     "Connection: close\r\n\r\n";
  bool ok = fd >= 0 && writeBounded(fd, head.data(), head.size()) && writeBounded(fd, body, length);
  if (!ok) {
    sendAborts++;
    client.stop();
  }
  uint32_t took = uint32_t(nowMs() - t0);
  if (took > sendMaxMs) sendMaxMs = took;
}
void sendPending() {
  if (!pending.code) return;
  std::string headers = "Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n";
  if (!pending.disposition.empty()) headers += "Content-Disposition: " + pending.disposition + "\r\n";
  sendBounded(pending.code, "application/json; charset=utf-8", pending.body.data(), pending.body.size(), headers);
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
// Sound: melodies from core/sounds.hpp, played note by note from the loop (never blocks; note() may run in the web
// task and only queues the melody under the state lock).
std::vector<mensa::sound::Note> tune;
size_t tuneAt = 0;
uint64_t tuneNext = 0;
void play(int event, int set = -1) {
  if (set < 0) set = engine.soundSet();
  tune.clear();
  for (int n = 0; n < mensa::sound::length(set, event); n++)
    tune.push_back(mensa::sound::table[set][event][n]);
  tuneAt = 0;
  tuneNext = 0;
}
void playTick(uint64_t now) {
  if (tuneAt >= tune.size() || now < tuneNext) return;
  const auto &n = tune[tuneAt++];
  if (n.freq) M5.Speaker.tone(n.freq, n.ms);
  tuneNext = now + n.ms + n.gap;
}
void note(const std::string &text, bool ok, int event = -1) {
  feedback = text;
  feedbackOk = ok;
  feedbackAt = nowMs();
  play(event >= 0 ? event : ok ? mensa::sound::Info : mensa::sound::Error);
}
// Mark and version inside the firmware image: the update check (tablet and Dial) recognises a Mensaampel firmware.
extern "C" __attribute__((used)) const char firmwareMark[] = "MENSAAMPEL-FIRMWARE-1:" MENSA_VERSION;
// Firmware update over the WLAN. The upload runs in the web task without the state lock (it touches no shared
// state); the loop only reads the progress.
struct OtaUpload {
  volatile bool active = false;
  bool ok = false;
  std::string error, version;
  volatile size_t written = 0, total = 0;
  volatile uint64_t lastAt = 0;
  mensa::ota::MarkScan scan;
  // Upload in pieces (0.19.1, /api/update/begin|chunk|finish): one piece is collected here completely before it is
  // written, so a piece broken off by a WLAN drop can simply be sent again.
  // A multiple of the web server's read block (1436 bytes): it reads whole blocks and would otherwise wait 5 s for the
  // rest of the last block of every piece.
  static constexpr size_t chunkMax = 11 * HTTP_RAW_BUFLEN;
  std::vector<uint8_t> buf;
  size_t chunkOffset = 0, chunkLength = 0;
  bool chunkTooLong = false, chunkComplete = false;
} ota;
bool blocked() {
  if (ota.active) return true;
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
  if (!mensa::net::hostAllowed(host.c_str(), routerHost)) return false;
  String origin = web.header("Origin");
  return origin.isEmpty() || origin == String("http://") + host;
}
bool authorized() {
  return localOrigin() && sessions.check(web.header("X-Mensa-Token").c_str(), nowMs());
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
          {"clockValid", clockOk},
          {"version", MENSA_VERSION}};
}
// Why the Dial last started (shown under Gerät; after a crash also briefly on the Dial).
std::string resetReason = "-";
bool resetWasError = false;
Json state(bool withCards = true) {
  auto s = engine.status(nowMs(), withCards);
  s["storageError"] = storage.error;
  s["recoveryRequired"] = false;
  s["sim"] = {{"offset", 0}, {"offline", false}, {"forceWriteFailure", false}};
  s["device"] = {
      {"version", MENSA_VERSION},
      {"configured", config.configured},
      {"reader", config.reader},
      {"readerActive", reader.mode},
      {"testMode", testMode},
      {"readerHealthy", reader.healthy},
      {"readerError", reader.error},
      {"ssid", config.ssid},
      {"channel", config.channel},
      {"wifiMode", config.wifiMode},
      {"routerSsid", config.router.ssid},
      {"routerIp", config.router.ip},
      {"routerGateway", config.router.gateway},
      {"routerMask", config.router.mask},
      {"routerConnected", routerUp.load()},
      {"rescue", rescue.load()},
      {"resting", restingNow},
      {"rest", engine.restMinutes()},
      {"captureTarget", captureTarget},
      {"capturedUid", capturedUid},
      {"captureUntil", captureUntil},
      {"feedback", feedback},
      {"feedbackOk", feedbackOk},
      {"feedbackAgo", feedbackAt ? int((nowMs() - feedbackAt) / 1000) : -1},
      {"ampelAgo", ampelSeenAt ? int((nowMs() - ampelSeenAt) / 1000) : -1},
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
      {"memoryTest", {{"running", memoryTest.left > 0}, {"ok", memoryTest.ok}, {"message", memoryTest.message}}},
      {"health",
       {{"crash", resetWasError},
        {"readerFaults", reader.ioFaults},
        {"saveFailures", storage.failures},
        {"ampelDrops", health.ampelDrops},
        {"unclearReads", reader.unclearReads},
        {"wlanDrops", wlanDrops.load()},
        {"sendAborts", sendAborts.load()},
        {"sendMaxMs", sendMaxMs.load()},
        {"probeAnswers", probeAnswers.load()},
        {"drawMs", drawMs.load()},
        {"drawMaxMs", drawMaxMs.load()},
        {"frameGapMaxMs", frameGapMaxMs.load()},
        {"lockWaitMaxMs", lockWaitMaxMs.load()},
        {"rssiMin", rssiMin},
        {"router", config.routerMode()},
        {"stations", stations()},
        {"minBlock", health.minBlock == UINT32_MAX ? ESP.getMaxAllocHeap() : health.minBlock}}},
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
Json memoryTestStart() {
  if (needsReview || !storage.error.empty() || !storage.mounted)
    return result(false, "Zuerst Speicher und Bestand in Ordnung bringen.");
  if (memoryTest.left > 0) return result(false, "Dauertest läuft bereits.");
  memoryTest = MemoryTest{};
  memoryTest.left = 20;
  memoryTest.minFree = ESP.getFreeHeap();
  memoryTest.minBlock = ESP.getMaxAllocHeap();
  memoryTest.message = "Dauertest läuft (20 Runden, etwa 10 Sekunden) …";
  return result(true, memoryTest.message);
}
// One round per call (from the loop, under the lock): status text and one save, at most every 300 ms.
void memoryTestStep(uint64_t now) {
  if (memoryTest.left <= 0 || now < memoryTest.nextAt) return;
  memoryTest.nextAt = now + 300;
  int round = 21 - memoryTest.left;
  uint64_t t0 = nowMs();
  { std::string body = stateBody(); }
  memoryTest.statusMax = std::max<uint32_t>(memoryTest.statusMax, uint32_t(nowMs() - t0));
  t0 = nowMs();
  if (!storage.save(engine)) {
    memoryTest.left = 0;
    memoryTest.ok = false;
    memoryTest.message = "Dauertest: Speichern " + std::to_string(round) + " fehlgeschlagen: " + storage.error;
    note(memoryTest.message, false);
    return;
  }
  memoryTest.slowest = std::max<uint32_t>(memoryTest.slowest, uint32_t(nowMs() - t0));
  memoryTest.minFree = std::min<uint32_t>(memoryTest.minFree, ESP.getFreeHeap());
  memoryTest.minBlock = std::min<uint32_t>(memoryTest.minBlock, ESP.getMaxAllocHeap());
  if (--memoryTest.left > 0) return;
  memoryTest.ok = true;
  memoryTest.message = "Dauertest ok: 20x gespeichert, langsamstes Speichern " + std::to_string(memoryTest.slowest) +
                       " ms, Status max " + std::to_string(memoryTest.statusMax) + " ms, freier Speicher mind. " +
                       std::to_string(memoryTest.minFree / 1024) + " KB, größter Block mind. " +
                       std::to_string(memoryTest.minBlock / 1024) + " KB.";
  note(memoryTest.message, true);
}
// Backup text (download on the tablet; checked over USB).
std::string backupText() {
  std::string body =
      std::string("{\"format\":\"mensa-device-backup-1\",\"reader\":") + Json(config.reader).dump() + ",\"state\":";
  std::string snap = engine.snapshot(false).dump();
  snap.pop_back();
  body += snap + ",\"cards\":" + engine.cardsText(nowMs(), false) + "}}";
  return body;
}
// Check interface on the USB cable (scripts/device-check.py): lines "@mensa <command>", answer "@mensa-reply {json}".
// Read-only plus the memory test; no bookings, no settings (USB access means physical access anyway).
std::string serialLine;
// The answer starts on a fresh line (library log lines may lack their line end) and names its command, so the PC
// script never mixes up answers.
std::string serialCmd;
void serialAnswer(Json j) {
  j["cmd"] = serialCmd;
  std::string out = "\n@mensa-reply " + j.dump() + "\n";
  Serial.write((const uint8_t *)out.data(), out.size());
}
Json healthJson() {
  auto sig = engine.signal(nowMs());
  return {{"ok", true},
          {"uptime", nowMs()},
          {"version", MENSA_VERSION},
          {"health",
           {{"crash", resetWasError},
            {"readerFaults", reader.ioFaults},
            {"saveFailures", storage.failures},
            {"ampelDrops", health.ampelDrops},
            {"unclearReads", reader.unclearReads},
            {"wlanDrops", wlanDrops.load()},
            {"sendAborts", sendAborts.load()},
            {"sendMaxMs", sendMaxMs.load()},
            {"probeAnswers", probeAnswers.load()},
            {"drawMs", drawMs.load()},
            {"drawMaxMs", drawMaxMs.load()},
            {"frameGapMaxMs", frameGapMaxMs.load()},
            {"lockWaitMaxMs", lockWaitMaxMs.load()},
            {"rssiMin", rssiMin},
            {"router", config.routerMode()},
            {"stations", stations()},
            {"minBlock", health.minBlock == UINT32_MAX ? ESP.getMaxAllocHeap() : health.minBlock}}},
          {"freeHeap", ESP.getFreeHeap()},
          {"minimumHeap", ESP.getMinFreeHeap()},
          {"maxAllocHeap", ESP.getMaxAllocHeap()},
          {"webMaxMs", webMaxMs},
          {"webRequests", webRequests},
          {"ampelAgo", ampelSeenAt ? int((nowMs() - ampelSeenAt) / 1000) : -1},
          {"clients", WiFi.softAPgetStationNum()},
          {"wifiMode", config.wifiMode},
          {"routerConnected", routerUp.load()},
          {"rescue", rescue.load()},
          {"resting", restingNow},
          {"readerHealthy", reader.healthy},
          {"storageError", storage.error},
          {"needsReview", needsReview},
          {"ready", engine.isReady()},
          {"reason", signalBlocked() ? "device" : sig.value("reason", std::string())},
          {"memoryTest", {{"running", memoryTest.left > 0}, {"ok", memoryTest.ok}, {"message", memoryTest.message}}},
          {"wlanEvents", wlanEvents()}};
}
void serialCommand(const std::string &cmd) {
  serialCmd = cmd;
  try {
    if (cmd == "info")
      serialAnswer({{"ok", true},
                    {"version", MENSA_VERSION},
                    {"configured", config.configured},
                    {"reader", config.reader},
                    {"uptime", nowMs()},
                    {"resetReason", resetReason},
                    {"lastCrumb", lastCrumb}});
    else if (cmd == "health")
      serialAnswer(healthJson());
    else if (cmd == "memorytest")
      serialAnswer(memoryTestStart());
    else if (cmd == "bench") {
      uint32_t slowest = 0, minBlock = ESP.getMaxAllocHeap();
      for (int i = 0; i < 10; i++) {
        uint64_t t0 = nowMs();
        { std::string body = stateBody(); }
        slowest = std::max<uint32_t>(slowest, uint32_t(nowMs() - t0));
        minBlock = std::min<uint32_t>(minBlock, ESP.getMaxAllocHeap());
      }
      serialAnswer({{"ok", true}, {"statusMaxMs", slowest}, {"minBlock", minBlock}});
    } else if (cmd == "backupcheck") {
      // Parsing a full backup is the largest allocation (like /api/restore): only with enough memory.
      if (ESP.getMaxAllocHeap() < 60000)
        return serialAnswer(result(false, "Zu wenig freier Speicher für die Sicherungsprüfung."));
      std::string text = backupText();
      size_t size = text.size();
      int cards = 0;
      bool valid = false;
      {
        auto j = Json::parse(text, nullptr, false);
        text.clear();
        text.shrink_to_fit();
        valid = !j.is_discarded() && j.value("format", std::string()) == "mensa-device-backup-1" &&
                j.contains("state") && j["state"].contains("cards") && j["state"]["cards"].is_array();
        if (valid) cards = int(j["state"]["cards"].size());
      }
      serialAnswer({{"ok", valid}, {"bytes", size}, {"cards", cards}, {"minBlock", ESP.getMaxAllocHeap()}});
    } else
      serialAnswer(result(false, "Unbekannt. Befehle: info, health, memorytest, bench, backupcheck"));
  } catch (...) { serialAnswer(result(false, "Speicher knapp - bitte gleich nochmal.")); }
}
void serialPoll() {
  int n = 0;
  while (Serial.available() > 0 && n++ < 128) {
    char c = char(Serial.read());
    if (c == '\r') continue;
    if (c != '\n') {
      if (serialLine.size() < 256) serialLine += c;
      continue;
    }
    std::string line;
    line.swap(serialLine);
    if (line.rfind("@mensa ", 0) == 0) serialCommand(line.substr(7));
  }
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
    next.wifiMode = j.value("wifiMode", config.wifiMode);
    if (next.wifiMode != "ap" && next.wifiMode != "router") return result(false, "WLAN-Art: eigenes WLAN oder Router.");
    auto routerText = [&](const char *key, std::string &into) {
      if (j.contains(key) && j[key].is_string()) into = j[key].get<std::string>();
    };
    routerText("routerSsid", next.router.ssid);
    routerText("routerIp", next.router.ip);
    routerText("routerGateway", next.router.gateway);
    routerText("routerMask", next.router.mask);
    // Empty router password: keep the saved one (like the own WLAN password).
    if (!j.value("routerPassword", std::string()).empty()) next.router.password = j["routerPassword"];
    if (next.routerMode()) {
      auto problem = mensa::net::check(next.router);
      if (!problem.empty()) return result(false, problem);
    }
    if (!wifi.empty()) next.wifiPassword = wifi;
    if (!password.empty()) {
      next.salt = randomKey();
      next.adminHash = passwordHash(password, next.salt);
    }
    next.configured = true;
    next.setupCode.clear();
    if (!next.save()) return result(false, "Geräteeinstellungen konnten nicht gespeichert werden.");
    bool wifiChanged =
        next.ssid != config.ssid || next.wifiPassword != config.wifiPassword || next.channel != config.channel ||
        next.wifiMode != config.wifiMode ||
        (next.routerMode() && (next.router.ssid != config.router.ssid ||
                               next.router.password != config.router.password || next.router.ip != config.router.ip ||
                               next.router.gateway != config.router.gateway || next.router.mask != config.router.mask));
    config = next;
    // New password: other tablets must sign in again; this one stays.
    if (!password.empty()) sessions.keepOnly(web.header("X-Mensa-Token").c_str());
    if (wifiChanged) {
      engine.command({{"type", "restart"}}, nowMs());
      restartAt = nowMs() + 2500;
      if (next.routerMode())
        return result(true, "Gespeichert. Dial startet neu und verbindet sich mit dem Router. Tablet mit dem "
                            "Router-WLAN verbinden und http://" +
                                next.router.ip + " öffnen.");
      return result(true, "Gespeichert. Gerät startet neu. Tablet mit dem WLAN des Dials verbinden und "
                          "http://192.168.4.1 öffnen.");
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
  if (type == "soundTest") {
    // Plays issue, return and rejection of one set with short pauses (to choose a set by ear).
    int set = j.value("set", engine.soundSet());
    if (set < 0 || set >= mensa::sound::setCount) return result(false, "Unbekannter Klang.");
    tune.clear();
    for (int e : {mensa::sound::Issue, mensa::sound::Return, mensa::sound::Error}) {
      for (int n = 0; n < mensa::sound::length(set, e); n++)
        tune.push_back(mensa::sound::table[set][e][n]);
      tune.push_back({0, 1, 500});
    }
    tuneAt = 0;
    tuneNext = 0;
    return result(true, std::string("Klang „") + mensa::sound::setNames[set] + "“: Ausgabe, Rückgabe, abgewiesen.");
  }
  if (type == "memoryTest") return memoryTestStart();
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
  if (type == "unbind" || type == "removeSlot" || type == "clearData" || type == "seriesStart" ||
      type == "seriesStop" || type == "staffLearn" || type == "staffClear" || type == "clockSync" ||
      type == "autoSettings" || type == "trialSettings" || type == "trialFeedback" || type == "relief" ||
      type == "confirm" || type == "pause" || type == "correct" || type == "room" || type == "settings" ||
      type == "undo" || type == "newDay" || type == "flowSettings" || type == "measurementContext" ||
      type == "queueState" || type == "measurementArm" || type == "measurementFinish" || type == "measurementCancel" ||
      type == "measurementDeleteLast")
    return transact(j);
  return result(false, "Diese Aktion ist am Gerät nicht verfügbar.");
}
// Receives the firmware in blocks. Checked: signed in, ESP image (first byte 0xE9), Mensaampel mark, image checksum
// (Update.end). Anything wrong: the update is aborted and the running firmware stays active.
void receiveUpdate() {
  HTTPUpload &u = web.upload();
  auto fail = [](const std::string &why) {
    if (Update.isRunning()) Update.abort();
    ota.ok = false;
    if (ota.error.empty()) ota.error = why;
  };
  if (u.status == UPLOAD_FILE_START) {
    ota.ok = false;
    ota.error.clear();
    ota.version.clear();
    ota.written = 0;
    ota.scan = mensa::ota::MarkScan();
    {
      Guard g;
      if (!authorized()) return fail("Bitte anmelden.");
      if (needsReview || !configValid) return fail("Zuerst Bestand und Einrichtung in Ordnung bringen.");
      ota.total = strtoul(web.header("X-Firmware-Size").c_str(), nullptr, 10);
      ota.active = true;
      ota.lastAt = nowMs();
      mark("Update");
    }
    if (!Update.begin(UPDATE_SIZE_UNKNOWN, U_FLASH)) return fail("Update konnte nicht starten.");
  } else if (u.status == UPLOAD_FILE_WRITE) {
    if (!ota.error.empty() || !Update.isRunning()) return;
    if (ota.written == 0 && (u.currentSize == 0 || u.buf[0] != 0xE9)) return fail("Keine Dial-Firmware (Dateianfang).");
    ota.scan.feed(u.buf, u.currentSize);
    if (Update.write(u.buf, u.currentSize) != u.currentSize) return fail("Schreiben fehlgeschlagen.");
    ota.written += u.currentSize;
    ota.lastAt = nowMs();
  } else if (u.status == UPLOAD_FILE_END) {
    if (!ota.error.empty() || !Update.isRunning()) return;
    if (!ota.scan.found) return fail("Keine Mensaampel-Firmware.");
    // Remember the running firmware for the automatic fall-back before the new one becomes active.
    const esp_partition_t *running = esp_ota_get_running_partition();
    if (!Update.end(true)) return fail(std::string("Prüfung fehlgeschlagen: ") + Update.errorString());
    Preferences p;
    if (p.begin("ota", false)) {
      p.putString("prev", running ? running->label : "");
      p.putBool("pending", true);
      p.putInt("tries", 0);
      p.end();
    }
    ota.version = ota.scan.version;
    ota.ok = true;
  } else if (u.status == UPLOAD_FILE_ABORTED)
    fail("Übertragung abgebrochen.");
}
// Upload in pieces (0.19.1). begin: size and checks; chunk (header X-Update-Offset): raw body of one piece; finish:
// check and restart.
void otaStop(const std::string &why) {
  if (Update.isRunning()) Update.abort();
  ota.active = false;
  ota.ok = false;
  ota.error = why;
  std::vector<uint8_t>().swap(ota.buf);
}
void otaBegin() {
  if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
  if (needsReview || !configValid)
    return reply(200, result(false, "Zuerst Bestand und Einrichtung in Ordnung bringen."));
  size_t size = 0;
  try {
    size = Json::parse(web.arg("plain").c_str()).at("size").get<size_t>();
  } catch (...) { return reply(400, result(false, "Ungültige Anfrage.")); }
  const esp_partition_t *next = esp_ota_get_next_update_partition(nullptr);
  if (size < 1024 || !next || size > next->size) return reply(200, result(false, "Datei passt nicht in den Speicher."));
  if (Update.isRunning()) Update.abort();
  ota = OtaUpload{};
  try {
    ota.buf.resize(OtaUpload::chunkMax);
  } catch (...) { return reply(200, result(false, "Zu wenig freier Speicher. Dial neu starten und nochmal.")); }
  if (!Update.begin(size, U_FLASH)) {
    std::vector<uint8_t>().swap(ota.buf);
    return reply(200, result(false, "Update konnte nicht starten."));
  }
  ota.total = size;
  ota.active = true;
  ota.lastAt = nowMs();
  mark("Update");
  reply(200, {{"ok", true}, {"chunk", OtaUpload::chunkMax}, {"written", 0}});
}
// Raw body of one piece (web task, outside the lock like the old upload; only this task writes ota during upload).
void otaChunkData() {
  HTTPRaw &r = web.raw();
  if (r.status == RAW_START) {
    // As a header: the web server does not read URL arguments for raw bodies.
    ota.chunkOffset = strtoul(web.header("X-Update-Offset").c_str(), nullptr, 10);
    ota.chunkLength = 0;
    ota.chunkTooLong = false;
    ota.chunkComplete = false;
  } else if (r.status == RAW_WRITE) {
    if (!ota.active || ota.buf.empty()) return;
    if (ota.chunkLength + r.currentSize > ota.buf.size()) {
      ota.chunkTooLong = true;
      return;
    }
    memcpy(ota.buf.data() + ota.chunkLength, r.buf, r.currentSize);
    ota.chunkLength += r.currentSize;
    ota.lastAt = nowMs();
  } else if (r.status == RAW_END)
    ota.chunkComplete = true;
}
void otaChunk() {
  if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
  if (!ota.active || ota.buf.empty() || !Update.isRunning())
    return reply(200,
                 {{"ok", false}, {"restart", true}, {"message", ota.error.empty() ? "Kein Update aktiv." : ota.error}});
  // A piece that did not arrive completely is simply sent again by the tablet.
  if (!ota.chunkComplete || ota.chunkTooLong)
    return reply(200, {{"ok", false}, {"written", size_t(ota.written)}, {"message", "Stück unvollständig."}});
  auto action = mensa::ota::chunk(ota.chunkOffset, ota.chunkLength, ota.written, ota.total, ota.buf.size());
  if (action == mensa::ota::ChunkAction::Write) {
    if (ota.written == 0 && ota.buf[0] != 0xE9) {
      otaStop("Keine Dial-Firmware (Dateianfang).");
      return reply(200, {{"ok", false}, {"restart", true}, {"message", ota.error}});
    }
    ota.scan.feed(ota.buf.data(), ota.chunkLength);
    if (Update.write(ota.buf.data(), ota.chunkLength) != ota.chunkLength) {
      otaStop("Schreiben fehlgeschlagen.");
      return reply(200, {{"ok", false}, {"restart", true}, {"message", ota.error}});
    }
    ota.written += ota.chunkLength;
  }
  ota.lastAt = nowMs();
  ota.chunkComplete = false;
  // Reject: the tablet continues from "written".
  reply(200, {{"ok", action != mensa::ota::ChunkAction::Reject}, {"written", size_t(ota.written)}});
}
void otaFinish() {
  if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
  if (!ota.active || !Update.isRunning())
    return reply(200, result(false, ota.error.empty() ? "Kein Update aktiv." : ota.error));
  if (ota.written != ota.total) return reply(200, result(false, "Update unvollständig."));
  if (!ota.scan.found) {
    otaStop("Keine Mensaampel-Firmware.");
    return reply(200, result(false, ota.error));
  }
  const esp_partition_t *running = esp_ota_get_running_partition();
  if (!Update.end(true)) {
    otaStop(std::string("Prüfung fehlgeschlagen: ") + Update.errorString());
    return reply(200, result(false, ota.error));
  }
  std::vector<uint8_t>().swap(ota.buf);
  Preferences p;
  if (p.begin("ota", false)) {
    p.putString("prev", running ? running->label : "");
    p.putBool("pending", true);
    p.putInt("tries", 0);
    p.end();
  }
  ota.version = ota.scan.version;
  ota.ok = true;
  restartAt = nowMs() + 1500;
  note("Update fertig. Neustart ...", true);
  reply(200, {{"ok", true}, {"message", "Update übertragen. Das Dial startet neu."}, {"version", ota.version}});
}
// A freshly installed firmware that never runs healthily (three starts) switches back to the previous one.
bool otaPending = false;
std::string otaNote;
void otaBootCheck() {
  Preferences p;
  if (!p.begin("ota", false)) return;
  bool pending = p.getBool("pending", false);
  int tries = p.getInt("tries", 0);
  auto action = mensa::ota::onBoot(pending, tries);
  if (action == mensa::ota::BootAction::Rollback) {
    String prev = p.getString("prev", "");
    p.putBool("pending", false);
    p.putBool("rolledBack", true);
    p.end();
    const esp_partition_t *target =
        esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_ANY, prev.c_str());
    if (target && esp_ota_set_boot_partition(target) == ESP_OK) ESP.restart();
    return;
  }
  if (action == mensa::ota::BootAction::Count) {
    p.putInt("tries", tries + 1);
    otaPending = true;
  }
  if (p.getBool("rolledBack", false)) {
    p.putBool("rolledBack", false);
    otaNote = "Update zurückgenommen: neue Version lief nicht.";
  }
  p.end();
}
// Healthy for 60 s with the web server up: the new firmware stays.
void otaHealthy(uint64_t now) {
  if (!otaPending || now < 60000 || !webStarted) return;
  otaPending = false;
  Preferences p;
  if (p.begin("ota", false)) {
    p.putBool("pending", false);
    p.end();
  }
}
void configureWeb() {
  const char *headers[] = {"Origin", "X-Mensa-Token", "X-Firmware-Size", "X-Update-Offset"};
  web.collectHeaders(headers, 4);
  web.on("/api/update", HTTP_POST, guarded([] {
           if (!authorized()) return reply(401, result(false, "Bitte anmelden."));
           if (!ota.ok) {
             ota.active = false;
             return reply(200, result(false, ota.error.empty() ? "Update abgebrochen." : ota.error));
           }
           restartAt = nowMs() + 1500;
           note("Update fertig. Neustart ...", true);
           reply(200,
                 {{"ok", true}, {"message", "Update übertragen. Das Dial startet neu."}, {"version", ota.version}});
         }),
         [] { receiveUpdate(); });
  web.on("/api/update/begin", HTTP_POST, guarded([] { otaBegin(); }));
  web.on("/api/update/chunk", HTTP_POST, guarded([] { otaChunk(); }), [] { otaChunkData(); });
  web.on("/api/update/finish", HTTP_POST, guarded([] { otaFinish(); }));
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
             std::string token = randomKey(40);
             sessions.add(token, nowMs());
             loginFailures = 0;
             reply(200, {{"ok", true}, {"token", token}});
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
           sessions.remove(web.header("X-Mensa-Token").c_str());
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
           std::string body = backupText();
           replyBody(200, body);
         }));
  web.onNotFound([] {
    if (web.method() != HTTP_GET) {
      reply(405, result(false, "Methode nicht erlaubt."));
      return sendPending();
    }
    String path = web.uri();
    // Internet check of a tablet (any host name points to the Dial): answer like a network with internet.
    auto probe = mensa::probe::answer(path.c_str());
    if (probe.code) {
      probeAnswers++;
      sendBounded(probe.code, probe.type, probe.body, strlen(probe.body), "Cache-Control: no-store\r\n");
      return;
    }
    if (path == "/" || path == "/ampel" || path == "/geraet") path = "/index.html";
    for (auto &a : webAssets)
      if (path == a.path) {
        // Assets lie in flash, which the ESP32 reads directly: sent in place, without a copy in RAM.
        sendBounded(200, a.mime, (const char *)a.bytes, a.length,
                    "Content-Encoding: gzip\r\nCache-Control: no-cache\r\nContent-Security-Policy: default-src 'self'; "
                    "script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; "
                    "frame-ancestors 'none'\r\n");
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
// 0.19.1: two strip buffers of 24 rows (same memory as one of 48): the next strip is painted while the previous one
// goes to the display by DMA, and strips that did not change (hash) are not sent again.
constexpr int stripH = 24, stripCount = 240 / stripH;
uint16_t strip[2][240 * stripH];
uint32_t stripHash[stripCount];
bool stripHashValid = false;
uint64_t lastFrameAt = 0;
bool lastFrameFast = false;
uint32_t stripHashOf(const uint16_t *px) {
  uint32_t h = 2166136261u;
  const uint32_t *w = (const uint32_t *)px;
  for (int i = 0; i < 240 * stripH / 2; i++)
    h = (h ^ w[i]) * 16777619u;
  return h;
}
std::string lastScreen;
// Builds the Dial picture under the state lock; returns false when nothing changed.
bool buildScreen(Json &list) {
  uint64_t asked = nowMs();
  Guard g;
  uint64_t now = nowMs();
  if (drawFast && now - asked > lockWaitMaxMs) lockWaitMaxMs = uint32_t(now - asked);
  mensa::DialExtras x;
  // After a crash: for one minute show where it happened (black box), so it can be reported without a PC.
  std::string crashHint =
      resetWasError && now < 60000 ? "Fehler: " + (lastCrumb.empty() ? resetReason : lastCrumb) : "";
  if (ota.active) {
    x.screen = "update";
    x.progress = ota.total ? int(std::min<size_t>(100, ota.written * 100 / ota.total)) : 0;
  } else if (resetConfirmUntil > now)
    x.screen = "reset";
  else if (!configValid)
    x.screen = "broken";
  else if (!config.configured || now < showCredentialsUntil) {
    x.screen = "credentials";
    // Router mode: the router WLAN and the Dial's address there; while the rescue WLAN is needed, its data.
    bool viaRouter = config.routerMode() && (routerUp || !rescue);
    x.ssid = viaRouter ? config.router.ssid : config.ssid;
    x.wifi = viaRouter ? config.router.password : config.wifiPassword;
    x.url = std::string("http://") + (viaRouter ? config.router.ip : mensa::net::apIp);
    x.setupCode = config.setupCode;
    x.configured = config.configured;
    x.hint = crashHint;
  } else if (now < checkUntil && !testMode) {
    x.screen = "check";
    m5::rtc_datetime_t t;
    int clock = engine.flowState().clockReady(now) || rtcTime(t) ? 0 : 1;
    int store = storage.error.empty() && !needsReview ? 0 : 2;
    int net = config.routerMode() ? (routerUp ? 0 : rescue ? 2 : 1) : webStarted ? 0 : 2;
    x.checks = {{"Leser", reader.healthy ? 0 : 2},
                {"Uhr", clock},
                {"Speicher", store},
                {config.routerMode() ? "Router" : "WLAN", net}};
    x.hint = !reader.healthy ? "Leser prüfen"
             : store         ? (needsReview ? "Bestand abgleichen" : "Speicher prüfen")
             : net == 2      ? (config.routerMode() ? "Router fehlt: Notfall-WLAN" : "WLAN aus: neu starten")
             : net == 1      ? "Suche Router ..."
             : clock         ? "Uhr: Tablet verbinden"
                             : "";
    if (!checkExtended && (!reader.healthy || store || net == 2)) {
      checkExtended = true;
      checkUntil = std::max<uint64_t>(checkUntil, now + 6000);
    }
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
               (config.routerMode() ? std::string("Router: ") + (routerUp ? "ok" : "fehlt")
                                    : "Tablets: " + std::to_string(WiFi.softAPgetStationNum())) +
                   "  Ampel: " + (ampelSeenAt && !ampelLost() ? "ok" : "-"),
               "Speicher frei: " + std::to_string(ESP.getFreeHeap() / 1024) + " KB  Ruhe: " +
                   (engine.restMinutes() ? std::to_string(engine.restMinutes()) + " min" : std::string("aus")),
               "Uhr: " + std::string(clock),
               std::string("Version ") + MENSA_VERSION};
  } else {
    x.blocked = blocked();
    m5::rtc_datetime_t t;
    bool noClock = !engine.flowState().clockReady(now) && !rtcTime(t);
    if (!crashHint.empty())
      x.hint = crashHint;
    else
      x.hint = !webStarted && config.configured ? "Webserver aus: neu starten"
               : config.routerMode() && !routerUp
                   ? (rescue ? "Router fehlt: eigenes WLAN an" : "Verbinde mit Router ...")
               : !reader.healthy        ? "Leser prüfen!"
               : !storage.error.empty() ? "Speicher prüfen!"
               : !captureTarget.empty() ? "Einlernen am Tablet"
               : ampelLost()            ? (ampelSeenAt ? "Ampel draußen getrennt!" : "Ampel nicht verbunden!")
               : noClock                ? "Uhr nicht gestellt"
                                        : "";
    if (feedbackAt && now - feedbackAt < 3500) {
      x.feedback = feedback;
      x.feedbackOk = feedbackOk;
    }
  }
  if (M5.BtnA.isPressed() && configValid)
    x.holdMs = int(std::min<uint32_t>(M5.BtnA.getUpdateMsec() - M5.BtnA.lastChange(), 20000));
  list = engine.dialScreen(now, x);
  // During an update only the progress changes: no fast frames, the upload gets the processor.
  drawFast = !ota.active && (engine.animating(now, x) || (feedbackAt && now - feedbackAt < 600));
  auto dump = list.dump();
  if (dump == lastScreen) return false;
  lastScreen = dump;
  return true;
}
// Painting (SPI) runs without the lock, so the web task can answer meanwhile.
void draw() {
  uint64_t now = nowMs();
  // About 30 frames per second while something moves, if painting is quick enough; otherwise 25.
  if (restingNow || now - drawAt < (drawFast ? (drawMs < 24 ? 33 : 40) : 250)) return;
  drawAt = now;
  Json list;
  if (!buildScreen(list)) return;
  uint64_t t0 = nowMs();
  if (drawFast && lastFrameFast && t0 - lastFrameAt > frameGapMaxMs) frameGapMaxMs = uint32_t(t0 - lastFrameAt);
  M5.Display.startWrite();
  int inFlight = -1; // buffer whose DMA transfer may still run
  for (int k = 0; k < stripCount; k++) {
    int b = k & 1;
    if (inFlight == b) {
      M5.Display.waitDMA();
      inFlight = -1;
    }
    mensa::raster::Target t{strip[b], 240, k * stripH, stripH, true};
    mensa::raster::paint(t, list);
    uint32_t h = stripHashOf(strip[b]);
    if (stripHashValid && h == stripHash[k]) continue;
    stripHash[k] = h;
    M5.Display.pushImageDMA(0, k * stripH, 240, stripH, (const lgfx::swap565_t *)strip[b]);
    inFlight = b;
  }
  M5.Display.waitDMA();
  M5.Display.endWrite();
  stripHashValid = true;
  lastFrameAt = nowMs();
  lastFrameFast = drawFast;
  drawMs = uint32_t(lastFrameAt - t0);
  if (drawMs > drawMaxMs) drawMaxMs = drawMs.load();
}
void webTask(void *) {
  uint32_t dnsIp = 0;
  for (;;) {
    // Start or move the DNS answers (only here: the DNS belongs to this task).
    if (dnsWanted != dnsIp) {
      dnsIp = dnsWanted;
      dns.stop();
      dns.setTTL(60);
      dns.start(53, "*", toIp(dnsIp));
    }
    dns.processNextRequest();
    web.handleClient();
    vTaskDelay(1);
  }
}
void setup() {
  stateLock = xSemaphoreCreateRecursiveMutex();
  Serial.begin(115200);
  otaBootCheck();
  if (Serial) Serial.println(firmwareMark); // also keeps the mark in the image
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
    WiFi.setSleep(false);
    // Tablets joining/leaving the Dial WLAN (health report). Runs in the event task: only the small locked log.
    WiFi.onEvent(
        [](arduino_event_id_t, arduino_event_info_t info) { wlanEvent(false, info.wifi_ap_stadisconnected.mac); },
        ARDUINO_EVENT_WIFI_AP_STADISCONNECTED);
    WiFi.onEvent([](arduino_event_id_t, arduino_event_info_t info) { wlanEvent(true, info.wifi_ap_staconnected.mac); },
                 ARDUINO_EVENT_WIFI_AP_STACONNECTED);
    bool started;
    if (config.routerMode()) {
      // Router mode: join with the fixed address; the DNS answers every name with it (the router names the Dial as
      // its DNS server), so the tablets' internet check is answered (probes.hpp).
      routerHost = config.router.ip;
      WiFi.onEvent(
          [](arduino_event_id_t, arduino_event_info_t info) {
            routerUp = true;
            wlanEvent(true, info.wifi_sta_connected.bssid);
          },
          ARDUINO_EVENT_WIFI_STA_CONNECTED);
      WiFi.onEvent(
          [](arduino_event_id_t, arduino_event_info_t info) {
            if (routerUp.exchange(false)) wlanEvent(false, info.wifi_sta_disconnected.bssid);
          },
          ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
      WiFi.mode(WIFI_STA);
      WiFi.setSleep(false);
      WiFi.setAutoReconnect(true);
      uint32_t ip = ipValue(config.router.ip), gateway = ipValue(config.router.gateway);
      started = WiFi.config(toIp(ip), toIp(gateway), toIp(ipValue(config.router.mask)), toIp(gateway));
      if (started) WiFi.begin(config.router.ssid.c_str(), config.router.password.c_str());
      routerSeenAt = routerRetryAt = nowMs();
      dnsWanted = ip;
    } else {
      WiFi.mode(WIFI_AP);
      WiFi.setSleep(false);
      WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
      started = WiFi.softAP(config.ssid.c_str(), config.wifiPassword.c_str(), config.channel, false, 4);
      dnsWanted = ipValue(mensa::net::apIp);
    }
    if (!started) {
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
  lastInput = nowMs();
  if (configValid && config.configured) checkUntil = nowMs() + 4000;
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
uint64_t healAt = 0;
void step(uint64_t now);
// Follow-ups of a Dial action: show the WLAN data (staff menu) and apply a changed volume.
void dialResult(const Json &r, uint64_t now) {
  if (r.value("action", std::string()) == "wifi") showCredentialsUntil = now + 30000;
  M5.Speaker.setVolume(engine.volumeLevel() * 25);
}
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
// Rest mode and start check: every input counts as use; the first input after rest only wakes the Dial (the card
// edge is handled later in step and books normally). Returns nothing; touchWoke tells the relief touch to skip.
bool touchWoke = false;
void restStep(uint64_t now, bool touched) {
  long position = M5Dial.Encoder.read();
  bool turned = (position - encoderBase) / 4 != 0, pressed = M5.BtnA.wasPressed();
  touchWoke = false;
  if (pressed) checkUntil = 0;
  if (touched || turned || pressed) {
    lastInput = now;
    if (restingNow) {
      if (turned) encoderBase = position;
      if (pressed) ignoreButton = true;
      touchWoke = touched;
    }
  }
  bool rest = configValid && config.configured && !needsReview && storage.error.empty() && captureTarget.empty() &&
              !testMode && !ota.active && now >= showCredentialsUntil && now >= resetConfirmUntil &&
              now >= checkUntil && engine.resting(now, lastInput);
  if (rest == restingNow) return;
  restingNow = rest;
  if (rest) {
    brightness = M5.Display.getBrightness();
    M5.Display.setBrightness(0);
  } else {
    M5.Display.setBrightness(brightness ? brightness : 127);
    lastScreen.clear();
  }
}
// Router mode: try again every minute while the router is missing (the library gives up after a wrong password); after
// 30 s without router open the own WLAN in addition (rescue: the Dial stays reachable to fix the settings). The rescue
// WLAN stays on until the next restart.
void routerStep(uint64_t now) {
  if (!webStarted || !config.routerMode()) return;
  if (routerUp) {
    routerSeenAt = now;
    if (rescue) dnsWanted = ipValue(config.router.ip);
    return;
  }
  if (now - routerRetryAt >= 60000) {
    routerRetryAt = now;
    WiFi.reconnect();
  }
  if (!rescue && mensa::net::rescueNeeded(true, false, routerSeenAt, now)) {
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
    if (WiFi.softAP(config.ssid.c_str(), config.wifiPassword.c_str(), config.channel, false, 4)) {
      rescue = true;
      note("Router nicht gefunden. Eigenes WLAN ist an.", false);
    }
  }
  // Tablets in the rescue WLAN need the DNS answer 192.168.4.1.
  if (rescue) dnsWanted = ipValue(mensa::net::apIp);
}
// Everything that reads or changes shared state, once per loop, under the state lock.
void step(uint64_t now) {
  otaHealthy(now);
  serialPoll();
  memoryTestStep(now);
  if (now >= health.sampledAt) {
    health.sampledAt = now + 1000;
    health.minBlock = std::min<uint32_t>(health.minBlock, ESP.getMaxAllocHeap());
    wifi_sta_list_t sta{};
    if (esp_wifi_ap_get_sta_list(&sta) == ESP_OK)
      for (int i = 0; i < sta.num; i++)
        if (sta.sta[i].rssi < 0 && (rssiMin == 0 || sta.sta[i].rssi < rssiMin)) rssiMin = sta.sta[i].rssi;
    if (routerUp) {
      int rssi = WiFi.RSSI();
      if (rssi < 0 && (rssiMin == 0 || rssi < rssiMin)) rssiMin = rssi;
    }
  }
  routerStep(now);
  // An upload that stopped (tablet gone for 2 minutes) must not keep the entrance blocked; short WLAN drops are
  // bridged by repeating the piece.
  if (ota.active && !ota.ok && now - ota.lastAt > 120000) {
    otaStop("Update abgebrochen.");
    note("Update abgebrochen. Altes Programm bleibt.", false);
  }
  if (!otaNote.empty() && now > 3000) {
    note(otaNote, false);
    otaNote.clear();
  }
  playTick(now);
  if (captureUntil && now >= captureUntil) {
    clearCapture();
    note("Einlernen abgelaufen. Einlass bleibt pausiert.", false);
  }
  auto touch = M5.Touch.getDetail();
  restStep(now, touch.wasPressed());
  if (testMode && touch.wasPressed()) testButton = "Touch " + std::to_string(touch.x) + "," + std::to_string(touch.y);
  // Touch field: "ENTLASTEN" on the main screen; in menu, enrolment and Mensa setting the core treats it as the button.
  bool touchOk = engine.menuOpen(now) || engine.seriesActive() || engine.editingMensa(now);
  if (touch.wasPressed() && !touchWoke && touch.x >= 44 && touch.x <= 196 && touch.y >= 182 && touch.y <= 222 &&
      configValid && config.configured && !needsReview && now >= showCredentialsUntil && now >= resetConfirmUntil &&
      (touchOk || !engine.isRelieving()) && !testMode) {
    auto r = transact({{"type", "relief"}});
    if (!r.value("message", std::string()).empty()) note(r.value("message", std::string()), r.value("ok", false));
    dialResult(r, now);
  }
  if (ignoreButton) {
    // The press that woke the Dial from rest mode does nothing else.
    if (!M5.BtnA.isPressed()) ignoreButton = false;
  } else if (M5.BtnA.wasReleaseFor(10000) && resetConfirmUntil <= now) {
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
      dialResult(r, now);
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
      else if (configValid && config.configured && !needsReview && now >= showCredentialsUntil) {
        auto r = engine.command({{"type", "dialTurn"}, {"steps", int(steps)}}, now);
        if (r.contains("previewVolume")) {
          // Volume being set at the Dial: play a sample at the new level.
          M5.Speaker.setVolume(r["previewVolume"].get<int>() * 25);
          play(mensa::sound::Info);
        } else if (!r.value("message", std::string()).empty())
          note(r.value("message", std::string()), r.value("ok", false));
      }
    }
  }
  {
    if (engine.isReady() && !readySince) readySince = now;
    if (!engine.isReady()) readySince = 0;
    bool lost = ampelLost();
    if (lost && !ampelWarned) note(ampelSeenAt ? "Ampel draußen getrennt!" : "Ampel nicht verbunden!", false);
    if (lost && !ampelWarned && ampelSeenAt) health.ampelDrops++;
    if (!lost && ampelWarned && ampelSeenAt) note("Ampel wieder verbunden.", true);
    ampelWarned = lost;
    // Reminder while a pause, relief or full group waits for a person: short double beep each interval.
    int due = engine.reminders(now);
    if (due > remindersBeeped && !restingNow) { play(mensa::sound::Remind); }
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
      lastInput = now;
      checkUntil = 0;
      if (edge.kind < 0)
        engine.command({{"type", "remove"}}, now);
      else if (!captureTarget.empty()) {
        capturedUid = edge.uid;
        note("Karte erkannt. Zuordnung am Tablet speichern.", true);
      } else if (!config.configured || needsReview || !storage.error.empty()) {
        note("Einrichtung oder Speicher zuerst prüfen.", false);
      } else {
        auto r = transact({{"type", "scan"}, {"uid", edge.uid}});
        bool ok = r.value("ok", false);
        int event = !ok                               ? mensa::sound::Error
                    : !r.value("booking", false)      ? mensa::sound::Info
                    : engine.cardState(edge.uid) == 2 ? mensa::sound::Issue
                                                      : mensa::sound::Return;
        note(r.value("message", std::string()), ok, event);
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

#include "engine.hpp"
#include "reader_latch.hpp"
static mensa::Engine engine;
static mensa::ReaderLatch latch;
static std::string output;
extern "C" const char *mensa_call(const char *input) {
  try {
    auto q = mensa::Json::parse(input);
    std::string op = q.at("op");
    mensa::Json result;
    if (op == "reset") {
      engine.reset();
      latch.reset();
      result = {{"ok", true}};
    } else if (op == "hardware") {
      engine.prepareHardware();
      result = {{"ok", true}};
    } else if (op == "rebootClock") {
      engine.rebootClock(q.at("now"));
      result = {{"ok", true}};
    } else if (op == "requireConfirmation") {
      engine.requireConfirmation();
      result = {{"ok", true}};
    } else if (op == "sample") {
      auto e = latch.sample(static_cast<mensa::Sample>(q.at("sample").get<int>()), q.value("uid", std::string()),
                            q.at("now"));
      result = {{"kind", e.kind}, {"uid", e.uid}};
    } else if (op == "restore") {
      engine.restore(q.at("state"), q.value("preserveUndo", false));
      result = {{"ok", true}};
    } else if (op == "snapshot")
      result = engine.snapshot();
    else if (op == "status")
      result = engine.status(q.at("now").get<long long>());
    else if (op == "dial") {
      mensa::DialExtras x;
      x.blocked = q.value("blocked", false);
      x.hint = q.value("hint", std::string());
      x.feedback = q.value("feedback", std::string());
      x.feedbackOk = q.value("feedbackOk", true);
      x.screen = q.value("screen", std::string());
      x.ssid = q.value("ssid", std::string());
      x.wifi = q.value("wifi", std::string());
      x.setupCode = q.value("setupCode", std::string());
      x.configured = q.value("configured", true);
      x.holdMs = q.value("holdMs", 0);
      x.progress = q.value("progress", 0);
      if (q.contains("lines"))
        for (auto &l : q["lines"])
          x.lines.push_back(l.get<std::string>());
      result = engine.dialScreen(q.at("now").get<long long>(), x);
    } else if (op == "command") {
      // backup: like the Dial (one copy made by the caller, restored on an error).
      if (q.value("backup", false)) {
        auto saved = engine;
        result = engine.command(q.at("command"), q.at("now").get<long long>(), &saved);
      } else
        result = engine.command(q.at("command"), q.at("now").get<long long>());
    } else
      throw std::runtime_error("Unbekannte Schnittstellenoperation.");
    output = result.dump();
  } catch (const std::exception &e) { output = mensa::Json({{"ok", false}, {"message", e.what()}}).dump(); }
  return output.c_str();
}

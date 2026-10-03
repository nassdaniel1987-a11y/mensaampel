#pragma once
#include <LittleFS.h>
#include "../../core/engine.hpp"
#include <vector>
// Two alternating records. A torn/corrupt slot never silently rolls the count
// back: load reports a fault and requires explicit reconciliation.
// Format 2 stores the snapshot as JSON text built without a full JSON tree (the Dial has no PSRAM); writing is
// verified by reading the file back and comparing it byte for byte. Format 1 (CBOR) is still read.
void mark(const char *what, const std::string &detail);
class BookStorage {
  uint32_t generation = 0;
  size_t lastSize = 16000; // size of the last saved text (a full stock is about 19 KB)
  static uint32_t crc(const uint8_t *p, size_t n, uint32_t c = 0xffffffff) {
    for (size_t i = 0; i < n; i++) {
      c ^= p[i];
      for (int k = 0; k < 8; k++)
        c = (c >> 1) ^ (0xedb88320u & -(c & 1));
    }
    return c;
  }
  struct Header {
    uint32_t magic, version, generation, length, checksum;
  };
  static std::string heapTag() { return std::to_string(ESP.getFreeHeap() / 1024) + "K"; }
  bool read(const char *path, mensa::Engine &into, uint32_t &gen) {
    auto f = LittleFS.open(path, "r");
    if (!f) return false;
    Header h{};
    if (f.read((uint8_t *)&h, sizeof(h)) != sizeof(h) || h.magic != 0x4d454e53 || (h.version != 1 && h.version != 2) ||
        h.length > 60000 || f.size() != sizeof(h) + h.length)
      return false;
    std::vector<uint8_t> bytes(h.length);
    if (f.read(bytes.data(), bytes.size()) != bytes.size() || ~crc(bytes.data(), bytes.size()) != h.checksum)
      return false;
    f.close();
    try {
      auto j = h.version == 1 ? mensa::Json::from_cbor(bytes) : mensa::Json::parse(bytes.begin(), bytes.end());
      std::vector<uint8_t>().swap(bytes);
      into.restore(j);
      gen = h.generation;
      return true;
    } catch (...) { return false; }
  }
  // Snapshot as JSON text: the same data as engine.snapshot(), undo and held card cleared.
  static std::string snapshotText(const mensa::Engine &engine, size_t reserve = 0) {
    std::string text;
    text.reserve(reserve);
    {
      auto j = engine.snapshot(false);
      j["undo"] = nullptr;
      j["held"] = "";
      text += j.dump();
    }
    text.pop_back();
    text += ",\"cards\":";
    text += engine.cardsText(0, false);
    text += "}";
    return text;
  }
  // Reads the file back and compares it with what should have been written, in small chunks.
  static bool sameFile(const char *path, const Header &h, const std::string &text) {
    auto f = LittleFS.open(path, "r");
    if (!f || f.size() != sizeof(h) + text.size()) return false;
    Header back{};
    if (f.read((uint8_t *)&back, sizeof(back)) != sizeof(back) || memcmp(&back, &h, sizeof(h)) != 0) return false;
    uint8_t chunk[256];
    size_t at = 0;
    while (at < text.size()) {
      size_t n = std::min(sizeof(chunk), text.size() - at);
      if (f.read(chunk, n) != n || memcmp(chunk, text.data() + at, n) != 0) return false;
      at += n;
    }
    return true;
  }
  static bool exists(const char *p) { return LittleFS.exists(p); }
  static void drop(const char *p) {
    if (LittleFS.exists(p)) LittleFS.remove(p);
  }
  // Moves a file; when the target exists and the file system refuses to replace it, the target is removed first.
  static bool move(const char *from, const char *to) {
    if (LittleFS.rename(from, to)) return true;
    drop(to);
    return LittleFS.rename(from, to);
  }
  // Fresh device without real cards: the store starts over (nothing can be lost).
  bool fresh(mensa::Engine &engine) {
    for (const char *p : {"/book0.bin", "/book1.bin", "/book.tmp", "/review0.bin", "/review1.bin", "/reviewold0.bin",
                          "/reviewold1.bin", "/reconcile.flag"})
      drop(p);
    generation = 0;
    engine.reset();
    engine.prepareHardware();
    return save(engine);
  }
  // Newest readable of two files (generation decides); false when neither can be read.
  bool newest(const char *p0, const char *p1, mensa::Engine &engine, bool &ok0, bool &ok1) {
    mensa::Engine candidate;
    uint32_t g0 = 0, g1 = 0;
    ok0 = exists(p0) && read(p0, engine, g0);
    ok1 = exists(p1) && read(p1, candidate, g1);
    if (ok1 && (!ok0 || g1 > g0)) engine = std::move(candidate);
    generation = std::max({generation, g0, g1});
    return ok0 || ok1;
  }

public:
  bool mounted = false;
  std::string error;
  // Rules (see tests/native/storage.cpp, power cut at every step):
  // - The newest valid slot is always the last state reported as saved; a leftover book.tmp is an unconfirmed
  //   action and is discarded.
  // - A damaged slot file, or slots missing while review copies exist, needs a person: never a silent fresh start.
  bool load(mensa::Engine &engine) {
    // The data partition is named "littlefs" (partitions.csv); LittleFS.begin() would look for "spiffs" by default.
    mounted = LittleFS.begin(false, "/littlefs", 10, "littlefs");
    if (!mounted) {
      error = "Gerätespeicher nicht lesbar. Keine automatische Formatierung.";
      return false;
    }
    // Interrupted manual reconciliation (marker written first, removed last): a person checks again.
    if (exists("/reconcile.flag")) {
      bool any = false;
      for (const char *p : {"/review0.bin", "/review1.bin", "/book0.bin", "/book1.bin"}) {
        mensa::Engine candidate;
        uint32_t g = 0;
        if (exists(p) && read(p, candidate, g) && (!any || g >= generation)) {
          engine = std::move(candidate);
          generation = std::max(generation, g);
          any = true;
        }
      }
      if (any && !engine.hasRealCards()) return fresh(engine);
      if (!any) engine.reset();
      error = "Abgleich wurde unterbrochen. Angezeigten Bestand manuell abgleichen und ausdrücklich übernehmen.";
      return false;
    }
    bool a = exists("/book0.bin"), b = exists("/book1.bin"), va = false, vb = false;
    if (a || b) {
      bool any = newest("/book0.bin", "/book1.bin", engine, va, vb);
      if (any && (a == va) && (b == vb)) {
        drop("/book.tmp");
        return true;
      }
      // A damaged slot may have been the newer one: always a person decides (no silent fallback to older data).
      error = "Bestandsdatei beschädigt. Angezeigten Bestand manuell abgleichen und ausdrücklich übernehmen.";
      if (!any) engine.reset();
      return false;
    }
    // No slot: an interrupted manual reconciliation (review copies) or an interrupted very first save.
    bool reviews = exists("/review0.bin") || exists("/review1.bin"), r0 = false, r1 = false;
    if (reviews && !newest("/review0.bin", "/review1.bin", engine, r0, r1)) {
      engine.reset();
      error = "Bestandsdateien unlesbar. Technische Prüfung erforderlich; Bestand manuell abgleichen.";
      return false;
    }
    if (reviews && engine.hasRealCards()) {
      error = "Abgleich wurde unterbrochen. Angezeigten Bestand manuell abgleichen und ausdrücklich übernehmen.";
      return false;
    }
    uint32_t g = 0;
    if (exists("/book.tmp") && read("/book.tmp", engine, g) && engine.hasRealCards()) {
      generation = std::max(generation, g);
      error = "Unterbrochene Speicherung. Bestand manuell abgleichen.";
      return false;
    }
    return fresh(engine);
  }
  // Failed saves since power-on (health report on the tablet).
  uint32_t failures = 0;
  bool save(const mensa::Engine &engine) {
    bool ok = write(engine);
    if (!ok && failures < 100000) failures++;
    return ok;
  }
  bool write(const mensa::Engine &engine) {
    if (!mounted) {
      error = "Gerätespeicher nicht verfügbar.";
      return false;
    }
    // Memory guard: the text needs one contiguous block of about the last size; refused cleanly instead of failing
    // midway.
    size_t need = lastSize + lastSize / 4 + 8192;
    if (ESP.getMaxAllocHeap() < need) {
      error = "Speicher knapp - bitte gleich nochmal.";
      return false;
    }
    bool opened = false;
    try {
      mark("Speichern Text", heapTag());
      std::string text = snapshotText(engine, lastSize + 2048);
      lastSize = text.size();
      Header h{0x4d454e53, 2, generation + 1, uint32_t(text.size()), ~crc((const uint8_t *)text.data(), text.size())};
      const char *target = (h.generation % 2) ? "/book1.bin" : "/book0.bin";
      mark("Speichern schreiben", heapTag());
      auto f = LittleFS.open("/book.tmp", "w");
      if (!f) {
        error = "Speichern nicht möglich.";
        return false;
      }
      opened = true;
      bool ok = f.write((uint8_t *)&h, sizeof(h)) == sizeof(h) &&
                f.write((const uint8_t *)text.data(), text.size()) == text.size();
      f.flush();
      f.close();
      if (!ok) {
        error = "Speichern unvollständig.";
        drop("/book.tmp");
        return false;
      }
      // Validate the written file byte for byte before it replaces the older slot.
      mark("Speichern pruefen", heapTag());
      if (!sameFile("/book.tmp", h, text)) {
        error = "Speicherprüfung fehlgeschlagen.";
        drop("/book.tmp");
        return false;
      }
      mark("Speichern umbenennen", heapTag());
      if (!move("/book.tmp", target)) {
        error = "Speicherabschluss fehlgeschlagen.";
        drop("/book.tmp");
        return false;
      }
      generation = h.generation;
      error.clear();
      return true;
    } catch (const std::bad_alloc &) { error = "Speicher knapp - bitte gleich nochmal."; } catch (...) {
      error = "Speicherfehler. Buchung nicht bestätigt.";
    }
    if (opened) drop("/book.tmp");
    return false;
  }
  // Explicitly accepts the reconciled stock. The previous files stay as evidence (review*, the review before that as
  // reviewold*); an interruption at any point leads back to the manual reconciliation, never to an empty stock.
  bool reconcile(const mensa::Engine &engine) {
    if (!mounted) return false;
    {
      auto flag = LittleFS.open("/reconcile.flag", "w");
      if (!flag) {
        error = "Prüfsicherung fehlgeschlagen.";
        return false;
      }
      flag.write((const uint8_t *)"1", 1);
      flag.close();
    }
    for (int i = 0; i < 2; i++) {
      String path = "/book" + String(i) + ".bin", review = "/review" + String(i) + ".bin",
             old = "/reviewold" + String(i) + ".bin";
      if (!LittleFS.exists(path)) continue;
      if (LittleFS.exists(review) && !move(review.c_str(), old.c_str())) {
        error = "Prüfsicherung fehlgeschlagen.";
        return false;
      }
      if (!move(path.c_str(), review.c_str())) {
        error = "Prüfsicherung fehlgeschlagen.";
        return false;
      }
    }
    drop("/book.tmp");
    if (!save(engine)) return false;
    drop("/reconcile.flag");
    if (exists("/reconcile.flag")) {
      error = "Abgleich nicht abgeschlossen. Bitte wiederholen.";
      return false;
    }
    return true;
  }
};

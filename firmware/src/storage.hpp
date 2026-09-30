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
  static std::string snapshotText(const mensa::Engine &engine) {
    std::string text;
    {
      auto j = engine.snapshot(false);
      j["undo"] = nullptr;
      j["held"] = "";
      text = j.dump();
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
  static void removeLeftovers() {
    for (const char *p : {"/book.tmp", "/review0.bin", "/review1.bin"})
      if (LittleFS.exists(p)) LittleFS.remove(p);
  }

public:
  bool mounted = false;
  std::string error;
  bool load(mensa::Engine &engine) {
    // The data partition is named "littlefs" (partitions.csv); LittleFS.begin() would look for "spiffs" by default.
    mounted = LittleFS.begin(false, "/littlefs", 10, "littlefs");
    if (!mounted) {
      error = "Gerätespeicher nicht lesbar. Keine automatische Formatierung.";
      return false;
    }
    bool a = LittleFS.exists("/book0.bin"), b = LittleFS.exists("/book1.bin"), pending = LittleFS.exists("/book.tmp");
    if (!a && !b) {
      engine.reset();
      engine.prepareHardware();
      if (pending) {
        uint32_t recovered = 0;
        bool readable = read("/book.tmp", engine, recovered);
        // Without any real card nothing can be lost: remove the remains of the interrupted first save.
        if (!readable || !engine.hasRealCards()) {
          engine.reset();
          engine.prepareHardware();
          removeLeftovers();
          return save(engine);
        }
        generation = recovered;
        error = "Unterbrochene Speicherung. Bestand manuell abgleichen.";
        return false;
      }
      return save(engine);
    }
    mensa::Engine candidate;
    uint32_t ga = 0, gb = 0;
    bool va = a && read("/book0.bin", engine, ga), vb = b && read("/book1.bin", candidate, gb);
    if (vb && (!va || gb > ga)) engine = std::move(candidate);
    generation = std::max(ga, gb);
    if (pending || (a && !va) || (b && !vb) || (!va && !vb)) {
      if ((va || vb) && !engine.hasRealCards()) {
        // Only placeholders so far (fresh device): tidy up instead of asking for a manual reconciliation.
        removeLeftovers();
        if (a && !va) LittleFS.remove("/book0.bin");
        if (b && !vb) LittleFS.remove("/book1.bin");
        return save(engine);
      }
      error = "Bestandsdatei beschädigt oder Speicherung unterbrochen. Angezeigten Bestand manuell abgleichen und "
              "ausdrücklich übernehmen.";
      return false;
    }
    return true;
  }
  bool save(const mensa::Engine &engine) {
    if (!mounted) {
      error = "Gerätespeicher nicht verfügbar.";
      return false;
    }
    try {
      mark("Speichern Text", heapTag());
      std::string text = snapshotText(engine);
      Header h{0x4d454e53, 2, generation + 1, uint32_t(text.size()), ~crc((const uint8_t *)text.data(), text.size())};
      const char *target = (h.generation % 2) ? "/book1.bin" : "/book0.bin";
      mark("Speichern schreiben", heapTag());
      auto f = LittleFS.open("/book.tmp", "w");
      if (!f) {
        error = "Speichern nicht möglich.";
        return false;
      }
      bool ok = f.write((uint8_t *)&h, sizeof(h)) == sizeof(h) &&
                f.write((const uint8_t *)text.data(), text.size()) == text.size();
      f.flush();
      f.close();
      if (!ok) {
        error = "Speichern unvollständig.";
        return false;
      }
      // Validate the written file byte for byte before it replaces the inactive slot.
      mark("Speichern pruefen", heapTag());
      if (!sameFile("/book.tmp", h, text)) {
        error = "Speicherprüfung fehlgeschlagen.";
        return false;
      }
      mark("Speichern umbenennen", heapTag());
      if (LittleFS.exists(target)) LittleFS.remove(target);
      if (!LittleFS.rename("/book.tmp", target)) {
        error = "Speicherabschluss fehlgeschlagen.";
        return false;
      }
      generation = h.generation;
      error.clear();
      return true;
    } catch (...) {
      error = "Speicherfehler. Buchung nicht bestätigt.";
      return false;
    }
  }
  bool reconcile(const mensa::Engine &engine) {
    if (!mounted) return false;
    // Keep evidence before explicitly accepting a reconciled registry.
    for (int i = 0; i < 2; i++) {
      String path = "/book" + String(i) + ".bin";
      if (LittleFS.exists(path)) {
        String backup = "/review" + String(i) + ".bin";
        if (LittleFS.exists(backup)) {
          if (engine.hasRealCards()) {
            error = "Alte Prüfsicherung vorhanden. Technische Speicherprüfung erforderlich.";
            return false;
          }
          LittleFS.remove(backup);
        }
        if (!LittleFS.rename(path, backup)) {
          error = "Prüfsicherung fehlgeschlagen.";
          return false;
        }
      }
    }
    return save(engine);
  }
};

// Native stand-in for the Arduino LittleFS API used by firmware/src/storage.hpp, with power-cut simulation:
// after `budget` writing steps the "flash" freezes (every further write, rename or remove fails).
#pragma once
#include <cstdint>
#include <cstring>
#include <map>
#include <string>
#include <vector>
struct String {
  std::string s;
  String(const char *v = "") : s(v) {}
  String(const std::string &v) : s(v) {}
  explicit String(int v) : s(std::to_string(v)) {}
  const char *c_str() const { return s.c_str(); }
  size_t length() const { return s.size(); }
  operator const char *() const { return s.c_str(); }
};
inline String operator+(const String &a, const String &b) {
  return String(a.s + b.s);
}
inline String operator+(const char *a, const String &b) {
  return String(std::string(a) + b.s);
}
inline String operator+(const String &a, const char *b) {
  return String(a.s + b);
}
struct FakeFlash {
  std::map<std::string, std::vector<uint8_t>> files;
  long budget = -1, steps = 0;
  bool dead = false, renameReplaces = true, shortWrite = false;
  bool step() {
    if (dead) return false;
    if (budget >= 0 && steps >= budget) {
      dead = true;
      return false;
    }
    steps++;
    return true;
  }
};
inline FakeFlash flash;
class File {
  std::string path;
  bool writing = false, valid = false;
  std::vector<uint8_t> data, pending;
  size_t pos = 0;

public:
  File() = default;
  File(const std::string &p, bool w) : path(p), writing(w), valid(true) {
    if (!w) data = flash.files[p];
  }
  explicit operator bool() const { return valid; }
  size_t size() const { return writing ? pending.size() : data.size(); }
  size_t read(uint8_t *out, size_t n) {
    n = std::min(n, data.size() - pos);
    memcpy(out, data.data() + pos, n);
    pos += n;
    return n;
  }
  size_t write(const uint8_t *in, size_t n) {
    if (!flash.step()) return 0;
    if (flash.shortWrite && n > 100) n -= 1;
    pending.insert(pending.end(), in, in + n);
    return n;
  }
  void flush() {
    if (writing && valid && flash.step()) flash.files[path] = pending;
  }
  void close() {
    flush();
    valid = false;
  }
};
struct FakeLittleFS {
  bool begin(bool, const char *, int, const char *) { return true; }
  bool exists(const char *p) { return flash.files.count(p) > 0; }
  bool remove(const char *p) {
    if (!flash.step()) return false;
    return flash.files.erase(p) > 0;
  }
  bool rename(const char *a, const char *b) {
    if (!flash.files.count(a) || (flash.files.count(b) && !flash.renameReplaces) || !flash.step()) return false;
    flash.files[b] = flash.files[a];
    flash.files.erase(a);
    return true;
  }
  File open(const char *p, const char *mode) {
    bool w = mode[0] == 'w';
    if (w) {
      if (!flash.step()) return File();
      flash.files[p].clear(); // littlefs creates/truncates the entry on open
    } else if (!exists(p))
      return File();
    return File(p, w);
  }
};
inline FakeLittleFS LittleFS;
struct FakeEsp {
  uint32_t maxAlloc = 200000;
  uint32_t getMaxAllocHeap() const { return maxAlloc; }
  uint32_t getFreeHeap() const { return maxAlloc; }
};
inline FakeEsp ESP;

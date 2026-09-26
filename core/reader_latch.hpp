#pragma once
#include <string>
#include <cstdint>
namespace mensa {
enum class Sample { Present, Absent, Fault, Suspended };
struct Edge {
  int kind = 0;
  std::string uid;
};
class ReaderLatch {
  std::string held;
  uint64_t absentSince = 0;
  unsigned misses = 0;
  bool waitingClear = true;

public:
  void reset() {
    held.clear();
    misses = 0;
    absentSince = 0;
    waitingClear = true;
  }
  bool idle() const { return held.empty(); }
  Edge sample(Sample type, const std::string &uid, uint64_t now) {
    if (type == Sample::Fault || type == Sample::Suspended) {
      misses = 0;
      return {};
    }
    if (type == Sample::Present) {
      misses = 0;
      if (waitingClear || !held.empty()) return {};
      held = uid;
      return {1, uid};
    }
    if (misses++ == 0) absentSince = now;
    if (misses < 3 || now - absentSince < 600) return {};
    waitingClear = false;
    if (held.empty()) return {};
    auto previous = held;
    held.clear();
    return {-1, previous};
  }
};
} // namespace mensa

#pragma once
// Signed-in tablets: up to four at the same time (before 0.17.4 a second sign-in threw the first tablet out). A fifth
// sign-in replaces the one unused for the longest time, never an active one. Pure, tested natively
// (tests/native-sessions.test.mjs).
#include <array>
#include <cstdint>
#include <string>
namespace mensa {
inline bool sameSecret(const std::string &a, const std::string &b) {
  if (a.size() != b.size()) return false;
  unsigned char x = 0;
  for (size_t i = 0; i < a.size(); i++)
    x |= a[i] ^ b[i];
  return x == 0;
}
struct Sessions {
  static constexpr uint64_t lifetime = 8ULL * 60 * 60 * 1000;
  struct Slot {
    std::string token;
    uint64_t until = 0, usedAt = 0;
  };
  std::array<Slot, 4> slots;
  bool valid(const Slot &s, uint64_t now) const { return !s.token.empty() && now < s.until; }
  void add(const std::string &token, uint64_t now) {
    Slot *pick = &slots[0];
    for (auto &s : slots) {
      if (!valid(s, now)) {
        pick = &s;
        break;
      }
      if (s.usedAt < pick->usedAt) pick = &s;
    }
    *pick = {token, now + lifetime, now};
  }
  // Compares with every slot (no early exit on the token content).
  bool check(const std::string &token, uint64_t now) {
    if (token.empty()) return false;
    bool found = false;
    for (auto &s : slots)
      if (valid(s, now) && sameSecret(token, s.token)) {
        s.usedAt = now;
        found = true;
      }
    return found;
  }
  void remove(const std::string &token) {
    for (auto &s : slots)
      if (!token.empty() && sameSecret(token, s.token)) s = Slot{};
  }
  // After a password change only the tablet that changed it stays signed in.
  void keepOnly(const std::string &token) {
    for (auto &s : slots)
      if (token.empty() || !sameSecret(token, s.token)) s = Slot{};
  }
};
} // namespace mensa

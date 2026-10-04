#pragma once
#include "engine.hpp"
namespace mensa {
struct Clock {
  virtual long long nowMs() = 0;
  virtual ~Clock() = default;
};
struct ReaderEvent {
  bool present;
  std::string uid;
};
struct Reader {
  virtual bool next(ReaderEvent &event) = 0;
  virtual ~Reader() = default;
};
struct Storage {
  virtual bool load(Json &state) = 0;
  virtual bool save(const Json &state) = 0;
  virtual ~Storage() = default;
};
// Hardware adapter must emit removal edges, debounce transient RF misses, and
// commit snapshots before acknowledging to user. Never emit delayed retries.
} // namespace mensa

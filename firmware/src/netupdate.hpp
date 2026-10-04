#pragma once
// Online update (0.25): the Dial joins a WLAN with internet (e.g. a phone hotspot) for a moment, asks GitHub for the
// latest release and downloads the update file itself. Pure parts without Arduino dependencies (native tests:
// tests/native/netupdate.cpp).
#include <cstdio>
#include <string>
namespace mensa::netupd {
// Fixed source: only this public repository, only over HTTPS (certificates checked against firmware/src/ca_bundle.h).
constexpr const char *latestUrl = "https://github.com/nassdaniel1987-a11y/mensaampel/releases/latest";
constexpr const char *downloadBase = "https://github.com/nassdaniel1987-a11y/mensaampel/releases/download/";
constexpr const char *assetName = "Mensaampel-Dial-Update.bin";

struct Version {
  int major = -1, minor = -1, patch = -1;
  bool valid() const { return major >= 0; }
};
// "0.25.0-preview" or "v0.25.0-preview" -> 0, 25, 0 (a suffix is ignored).
inline Version parse(const std::string &text) {
  Version v;
  size_t i = !text.empty() && (text[0] == 'v' || text[0] == 'V') ? 1 : 0;
  int parts[3] = {-1, -1, -1};
  for (int k = 0; k < 3; k++) {
    if (i >= text.size() || text[i] < '0' || text[i] > '9') return v;
    long n = 0;
    while (i < text.size() && text[i] >= '0' && text[i] <= '9' && n < 100000)
      n = n * 10 + (text[i++] - '0');
    parts[k] = int(n);
    if (k < 2) {
      if (i >= text.size() || text[i] != '.') return v;
      i++;
    }
  }
  v.major = parts[0];
  v.minor = parts[1];
  v.patch = parts[2];
  return v;
}
// <0 older, 0 same, >0 newer.
inline int compare(const Version &a, const Version &b) {
  if (a.major != b.major) return a.major < b.major ? -1 : 1;
  if (a.minor != b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch != b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}
// Release tag from the redirect of ".../releases/latest" (".../releases/tag/v0.25.0-preview"); empty if not plausible.
// Only letters, digits, '.', '-' and '_' are accepted, so the tag can go into the download address unchanged.
inline std::string tagFromLocation(const std::string &location) {
  const std::string key = "/releases/tag/";
  size_t at = location.find(key);
  if (at == std::string::npos) return "";
  std::string tag = location.substr(at + key.size());
  if (tag.empty() || tag.size() > 40) return "";
  for (char c : tag)
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '-' ||
          c == '_'))
      return "";
  return parse(tag).valid() ? tag : "";
}
// Fallback (0.25.2): when there is no release marked "latest" (GitHub then redirects to ".../releases"), the newest
// published release from the API list ".../releases?per_page=1", its "tag_name" found by plain text search.
constexpr const char *listUrl = "https://api.github.com/repos/nassdaniel1987-a11y/mensaampel/releases?per_page=1";
inline std::string tagFromList(const std::string &json) {
  const std::string key = "\"tag_name\":";
  size_t at = json.find(key);
  if (at == std::string::npos) return "";
  at += key.size();
  while (at < json.size() && json[at] == ' ')
    at++;
  if (at >= json.size() || json[at] != '"') return "";
  size_t end = json.find('"', at + 1);
  if (end == std::string::npos) return "";
  return tagFromLocation("/releases/tag/" + json.substr(at + 1, end - at - 1));
}
inline std::string downloadUrl(const std::string &tag) {
  return std::string(downloadBase) + tag + "/" + assetName;
}
// Plain words for the signal strength of a scanned network.
inline const char *strength(int rssi) {
  return rssi >= -60 ? "sehr gut" : rssi >= -70 ? "gut" : rssi >= -80 ? "schwach" : "sehr schwach";
}
} // namespace mensa::netupd

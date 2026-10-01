// Power cut at every single write step of save, reconcile and the first start (firmware/src/storage.hpp on a
// simulated flash). Prints one line per failure and "ok <runs>" at the end.
#include <LittleFS.h>
#include "../../firmware/src/storage.hpp"
#include <cstdio>
void mark(const char *, const std::string &) {}
using mensa::Engine;
static int failures = 0, runs = 0;
static void fail(const std::string &m) {
  failures++;
  printf("FEHLER %s\n", m.c_str());
}
static std::string key(const Engine &e) {
  return e.cardsText(0, false);
}
static Engine stock() {
  Engine e;
  e.prepareHardware();
  e.command({{"type", "confirm"}}, 1000);
  for (int i = 1; i <= 3; i++)
    e.command({{"type", "bind"}, {"uid", "sim:K0" + std::to_string(i)}, {"newUid", "04:0" + std::to_string(i)}}, 1000);
  return e;
}
static void booked(Engine &e, long long now) {
  e.command({{"type", "scan"}, {"uid", "04:01"}}, now);
  e.command({{"type", "remove"}}, now);
}
// Prepared flash with two saved states; returns the last saved state A.
static Engine prepare() {
  flash = FakeFlash{};
  BookStorage s;
  Engine e;
  if (!s.load(e)) fail("leerer Start");
  e = stock();
  if (!s.save(e)) fail("erstes Speichern");
  booked(e, 5000);
  if (!s.save(e)) fail("zweites Speichern");
  return e;
}
int main() {
  for (bool replaces : {true, false}) {
    // 1. Booking saved, power cut at step k.
    for (long k = 0;; k++) {
      Engine a = prepare();
      flash.renameReplaces = replaces;
      BookStorage s;
      Engine boot;
      s.load(boot);
      Engine b = a;
      booked(b, 9000);
      flash.steps = 0;
      flash.budget = k;
      bool saved = s.save(b);
      bool complete = !flash.dead;
      flash.dead = false;
      flash.budget = -1;
      BookStorage s2;
      Engine e;
      runs++;
      if (!s2.load(e))
        fail("Buchung, Schnitt " + std::to_string(k) + ": Abgleich verlangt (" + s2.error + ")");
      else if (key(e) != key(a) && key(e) != key(b))
        fail("Buchung, Schnitt " + std::to_string(k) + ": falscher Bestand");
      else if (saved && key(e) != key(b))
        fail("Buchung, Schnitt " + std::to_string(k) + ": gemeldet gespeichert, aber verloren");
      if (flash.files.count("/book.tmp")) fail("Buchung: Rest book.tmp nach Start");
      Engine c = e;
      booked(c, 20000);
      if (!s2.save(c)) fail("Buchung, Schnitt " + std::to_string(k) + ": danach kein Speichern");
      if (complete) break;
    }
    // 2. Damaged newest slot -> review -> reconcile, power cut at step k; then a second damage + reconcile.
    for (long k = 0;; k++) {
      Engine a = prepare();
      flash.renameReplaces = replaces;
      // Damage the newer slot (generation 2 -> book0).
      flash.files["/book0.bin"][30] ^= 0xff;
      BookStorage s;
      Engine e;
      if (s.load(e)) fail("beschädigt nicht erkannt");
      if (!e.hasRealCards()) fail("beschädigt: Bestand leer angezeigt");
      Engine x = e;
      x.command({{"type", "correct"}, {"uid", "04:02"}, {"out", true}, {"lost", false}}, 6000);
      flash.steps = 0;
      flash.budget = k;
      bool ok = s.reconcile(x);
      bool complete = !flash.dead;
      flash.dead = false;
      flash.budget = -1;
      BookStorage s2;
      Engine r;
      runs++;
      bool loaded = s2.load(r);
      if (loaded && key(r) != key(x))
        fail("Abgleich, Schnitt " + std::to_string(k) + ": falscher Bestand ohne Prüfung");
      if (!loaded && !r.hasRealCards())
        fail("Abgleich, Schnitt " + std::to_string(k) + ": Karten verloren (" + s2.error + ")");
      if (ok && !loaded) fail("Abgleich, Schnitt " + std::to_string(k) + ": gemeldet übernommen, aber Prüfung");
      if (!loaded) {
        if (!s2.reconcile(r)) fail("Abgleich wiederholen nicht möglich: " + s2.error);
        BookStorage s3;
        Engine q;
        if (!s3.load(q)) fail("nach wiederholtem Abgleich: " + s3.error);
      }
      if (complete) {
        // Second damage weeks later: a second reconciliation must work too.
        BookStorage s3;
        Engine q;
        s3.load(q);
        booked(q, 30000);
        s3.save(q);
        for (auto *p : {"/book0.bin", "/book1.bin"})
          if (flash.files.count(p)) flash.files[p][40] ^= 0xff;
        BookStorage s4;
        Engine w;
        if (s4.load(w)) fail("zweite Beschädigung nicht erkannt");
        if (!s4.reconcile(w)) fail("zweiter Abgleich: " + s4.error);
        BookStorage s5;
        Engine v;
        if (!s5.load(v)) fail("nach zweitem Abgleich: " + s5.error);
        break;
      }
    }
    // 3. Very first start interrupted at step k: never asks for a reconciliation, never keeps leftovers.
    for (long k = 0;; k++) {
      flash = FakeFlash{};
      flash.renameReplaces = replaces;
      flash.budget = k;
      BookStorage s;
      Engine e;
      s.load(e);
      bool complete = !flash.dead;
      flash.dead = false;
      flash.budget = -1;
      BookStorage s2;
      Engine r;
      runs++;
      if (!s2.load(r)) fail("Erststart, Schnitt " + std::to_string(k) + ": " + s2.error);
      if (complete) break;
    }
  }
  // 4. Write error and memory guard: refused cleanly, nothing left behind, last state stays.
  {
    Engine a = prepare();
    BookStorage s;
    Engine e;
    s.load(e);
    Engine b = a;
    booked(b, 9000);
    flash.shortWrite = true;
    if (s.save(b)) fail("unvollständiges Schreiben nicht erkannt");
    flash.shortWrite = false;
    if (flash.files.count("/book.tmp")) fail("book.tmp bleibt nach Schreibfehler");
    ESP.maxAlloc = 20000;
    if (s.save(b) || s.error.find("knapp") == std::string::npos) fail("Speicher-Wächter greift nicht");
    ESP.maxAlloc = 200000;
    BookStorage s2;
    Engine r;
    if (!s2.load(r) || key(r) != key(a)) fail("nach Schreibfehler falscher Bestand");
    if (!s2.save(b)) fail("Speichern nach Fehler");
  }
  printf("ok %d %d\n", runs, failures);
  return failures ? 1 : 0;
}

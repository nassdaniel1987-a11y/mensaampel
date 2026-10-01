# Enthaltene freie Software

Die jeweiligen Lizenztexte liegen im Ordner `licenses` bzw. bei der Node-Laufzeit:

- Node.js 22.20.0: `runtime/LICENSE-Node.txt` (einschließlich eingebundener Komponenten).
- React und React DOM 19.1.1, Scheduler: MIT, `licenses/React.txt`, `ReactDOM.txt`, `Scheduler.txt`.
- Lucide React 0.468.0: `licenses/Lucide.txt`.
- nlohmann/json 3.11.3: MIT, `licenses/nlohmann-json.txt`.
- Emscripten 4.0.15: `licenses/Emscripten.txt`; kompiliertes WASM und Laufzeit-Glue.
- Dial-Schrift: Inter (SemiBold/Bold, SIL Open Font License 1.1): `licenses/Inter.txt`, Quelle `vendor/fonts/`, als Glyphen erzeugt in `core/dial_font.hpp` und `src/dial-font.mjs` (`scripts/build-dial-font.py`).

Die Entwicklungsabhängigkeiten sind in `package-lock.json` festgehalten. Die PC-Laufzeit verwendet ausschließlich lokale Dateien und keine externen Schriftarten, Tracker oder Webdienste.

## Gerätepaket

- M5Dial 1.0.3, M5Unified 0.2.23, M5GFX 0.2.30: Lizenzdateien im Gerätepaket unter `licenses`; Bibliotheksquellen im Quellcodearchiv unter `vendor`. Quellen: https://github.com/m5stack/M5Dial, https://github.com/m5stack/M5Unified, https://github.com/m5stack/M5GFX.
- `firmware/src/reader/MensaRFID.*` ist eine bearbeitete Kopie des im M5Dial-Projekt enthaltenen MFRC522-Treibers (Public Domain laut Quelltext). Änderungen: getrennte I²C-Busse, Fehlererkennung, begrenzter Reset, Initialisierung von Leseergebnissen und korrigierte Bitmasken. Der Originalhinweis bleibt enthalten.
- Arduino-ESP32 2.0.17 / Espressif32-Plattform 6.12.0: Quellen und komponentenspezifische Lizenzen unter https://github.com/espressif/arduino-esp32/tree/2.0.17 und https://github.com/platformio/platform-espressif32/tree/v6.12.0. Die Buildkonfiguration verwendet diese festgehaltenen Versionen.
- esptool 4.9.0: GPL-2.0-or-later, unveränderte Originalquellen als `source/esptool-4.9.0.tar.gz` im Gerätepaket; unser Einstieg ist `scripts/flash_tool.py`. https://github.com/espressif/esptool/tree/v4.9.0.
- PyInstaller 6.16.0 verpackt Python und die USB-Werkzeuge. Die Lizenz einschließlich Bootloader-Ausnahme sowie die Lizenzhinweise der eingebundenen Python-Pakete sind unter `licenses` enthalten. https://pyinstaller.org/.

Die JSON-Datei `firmware/manifest.json` enthält Prüfsummen der auslieferbaren Gerätedateien. Das Paket enthält keine WLAN-Kennwörter, Betreuungssitzungen oder Bestandsdaten dieser Entwicklungsumgebung.

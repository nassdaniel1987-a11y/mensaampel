# Prompts für Google Stitch (stitch.withgoogle.com)

So geht's:

1. Jeden Prompt **einzeln** in Stitch einfügen (Englisch versteht Stitch am besten; die Texte auf den Seiten bleiben Deutsch).
2. Für die Ampel- und Betreuungsseite „Web“ bzw. Tablet wählen, für das Dial „Mobile“ (nur als Rahmen, gestaltet wird ein Kreis von 240 × 240).
3. Gefällt ein Entwurf: in Stitch **„Export → Code (HTML)“** und zusätzlich **Screenshots** machen. Beides an Claude schicken: „Bitte dieses Stitch-Design für die Ampelseite übernehmen.“
4. Nicht wundern: Claude übernimmt Aufbau, Farben, Größen und Wirkung, nicht den Code 1:1 – die Seiten müssen ohne Internet laufen und mit dem Dial zusammenarbeiten.

---

## 1 · Ampelseite für die Kinder (Tablet vor der Tür)

```
Design a full-screen kiosk display for a tablet (landscape, 1280×800, also works in portrait) that hangs next to the door of a primary school canteen. It is a "traffic light" telling children aged 6–10 whether they may enter. No interaction except one small fullscreen button and a small sound toggle in a corner. All visible text in German. Must work offline: no web fonts except Inter, no photos, no external images – shapes and simple flat icons only.

The screen has these states; design each one as its own screen:
1. GREEN "Komm herein" – plenty of seats. Below: "12 Plätze frei" and "Bitte einzeln bei der Kartenausgabe melden."
2. YELLOW "Wenige Plätze" – only a few seats left ("3 Plätze frei").
3. RED "Bitte warten" – canteen full. Friendly, not scary. A soft rotating line like "Danke fürs Warten!" and "Nächster Platz frei in ca. 3 Min."
4. RED with countdown "Gleich geht's weiter" – a large circular countdown ring around a big time "1:20" (the next group may enter when it reaches zero), text "Ihr seid die Nächsten!".
5. GREEN with a calm hint pill "Die Mensa ist fast voll – bitte leise reingehen" (with a quiet/volume-low icon).
6. GREY/DARK "Noch geschlossen" – not open yet / no connection ("Die Anzeige hat gerade keine Verbindung").

Every state also shows, smaller: the current time at the top left; two status chips at the top right ("Küche · 8 frei", "Mensa offen · 20 frei" or "Mensa geschlossen" crossed out); and one rotating line in another language at the bottom (e.g. "EN Come in", "TR İçeri gelebilirsin", Arabic right-to-left, Ukrainian, Japanese, Chinese).

Style: friendly and child-oriented but calm, readable from 5 metres. The state must be recognisable by colour AND by a big symbol (a check mark / an open hand "stop" / an hourglass) AND by the word, so colour-blind children understand it too. Very large heading (about 12% of screen height), rounded shapes, soft gradients allowed, strong contrast, no clutter, at most 3 text lines besides the heading. Avoid anything that looks like an error or alarm.
```

---

## 2 · Betreuungsseite (Tablet der Betreuung während des Mittags)

```
Design a clean tablet web app (1280×800 landscape, must also work at 800 px width) for staff running a primary school canteen entrance system. All text in German. Offline: only the Inter font, simple line icons (Lucide style), no photos.

Top bar: app name "Mensaampel", connection status pill ("Dial verbunden"), version, logout. Tabs: "Betrieb" (default), "Einlass & Messungen", "Statistik", "Gerät", "Hilfe".

Design the "Betrieb" tab, which is used during lunch with one hand, quickly:
- At the very top, a large current-status card: a traffic-light dot and text ("Grün · Einlass offen", "Rot · Gruppe voll, nächste in 1:20"), with two big buttons "Pause" / "Weiter" and "Gruppe jetzt freigeben".
- Two room cards side by side: "Küche" (48 seats) and "Mensa" (64 seats): occupied/free as a big number and a progress bar, an "offen/geschlossen" switch, and the allowed seats ("Freigabe 40").
- A compact "Heute erwartet" line: "etwa 85 Essen, bis zu 40 Kinder gleichzeitig, Ausgabe 11:30–12:40, Mensa wird wohl gebraucht".
- A hint area with up to 3 friendly notices (e.g. "Karte M05 ist seit 50 min draußen", "Mensa öffnen? Vorschlag 25 Plätze") each with one action button.
- A card grid of 112 seat cards (K01–K48, M01–M64) as small tiles: free (light), taken (filled), lost (striped); tapping a tile opens details. It must stay readable but be collapsible ("Alle Plätze anzeigen").
- At the bottom: "Neuer Essenstag", "Sicherung herunterladen".

Style: calm, modern, lots of white space, one accent colour (teal), status colours green/amber/red only for status. Big touch targets (at least 48 px). Clear hierarchy: what matters during lunch at the top, statistics and settings out of the way. Also show the "Gerät" tab briefly: a "Gesundheit heute" list with green/yellow/red rows (each row: name, value, one sentence what to do).
```

---

## 3 · Dial-Display (rundes Display am Gerät, 240 × 240 Pixel)

```
Design screens for a tiny ROUND display, 240×240 pixels (a circle; corners are not visible), on a device with a rotating ring, one button and a card reader, used at a school canteen entrance. Show each screen as a 240 px circle on a dark background. All text in German.

Hard constraints (the device draws everything itself): only flat shapes – circles, rings/arcs, straight lines, rounded rectangles, a simple radial gradient as background – and text in ONE font (Inter, bold) in at most 3 sizes. No images, no shadows, no blur, no icons other than ones made of lines and circles (check mark, cross, pause bars, exclamation mark, hand). Everything important must stay inside the circle with margin. Text must be readable at arm's length: main number very large, at most 2 short lines of small text.

Screens:
1. Main "green": big number of free seats "12", label "Plätze frei", small line "Mensa 20 · Küche 8". Green background.
2. Main "yellow": "3" "Plätze frei". Amber.
3. Main "red / group full": countdown ring around the edge running down, in the middle "1:20" and "nächste Gruppe". Red.
4. Card accepted: big check mark, "K12", "Guten Appetit!". Card returned: "K12 zurück, danke!".
5. Card refused: cross, "Karte gesperrt".
6. Staff menu: a vertical list of 3–4 items where the ring scrolls ("Pause", "Mensa freigeben", "Lautstärke", "WLAN-Daten"), selected item highlighted.
7. Start check: "START-CHECK" with four lines, each with a check / warning / cross symbol: "Leser", "Uhr", "Speicher", "WLAN".
8. Holding the button: a white progress ring filling up, "Loslassen" after 3 seconds.

Style: bold, high contrast, calm, friendly for children. The current state must be readable from 2 metres in under one second.
```

---

## Tipps

- Lieber mehrere Varianten erzeugen („Generate variations“) und die beste wählen.
- Beim Dial ruhig nachschärfen: „Make the number bigger, remove everything that is not essential.“
- Bei der Ampelseite: „Make it more playful for 6-year-olds but keep it calm.“

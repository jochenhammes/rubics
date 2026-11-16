# Zauberwürfel

3D-Zauberwürfel im Browser für Desktop, Tablet und Phone – ohne Build-Schritt, direkt über GitHub Pages lauffähig.

- **Darstellung:** Fotorealistische Szene – Würfel auf einem Spieltisch mit grünem Filz, Lampenlicht mit weichem Schatten, Kontaktschatten, Tiefenunschärfe und leichten Gebrauchsspuren auf den Kacheln.
- **Steuerung:** Auf einer Würfelfläche ziehen dreht die Ebene; neben dem Würfel ziehen (oder mit zwei Fingern) dreht und kippt den Würfel auf dem Tisch. Mausrad bzw. Zwei-Finger-Zoom ändert die Größe. Tasten `U D L R F B` drehen die Flächen (mit Umschalt gegenläufig).
- **Hilfe:** Zeigt Schritt für Schritt (Schicht-für-Schicht-Methode) den nächsten Zug als Pfeil am Würfel; auf Wunsch einzeln ausführen oder automatisch lösen lassen.
- **Speichern:** Stand, Zugzähler und Ansicht liegen in einem Cookie und sind beim nächsten Besuch wieder da.
- **Mischen / Zurück / Reset** über die Leiste unten.

## Poker-Variante

Per URL-Parameter wird aus der App ein Texas-Hold'em-Turnier am 3D-Tisch (ohne Würfel):

```
https://jochenhammes.github.io/rubics/?variante=poker
```

- **Sit & Go** gegen 1–7 Computergegner in drei Spielstärken, mit wählbarem Startstack und Blind-Tempo. Regeln, Blindstruktur und Gegner stammen aus der Poker-Engine des Repositories [jochenhammes/texasholdem](https://github.com/jochenhammes/texasholdem).
- **Am Tisch:** Karten werden animiert gegeben, Flop, Turn und River aufgedeckt, gefoldete Hände eingezogen. Stacks, Einsätze und Pot liegen als Chips auf dem Filz und wandern animiert zwischen Stack, Einsatz und Pot; der Dealer-Button wandert mit. Namen, Chipstände und Aktionen stehen als Beschriftung an jedem Platz.
- **Beschriftung:** Ein Tipp auf einen Chipstapel blendet alle Beschriftungen aus bzw. wieder ein.
- **Kleine Bildschirme:** Auf Phones sind höchstens 6 Spieler wählbar, damit der Tisch übersichtlich bleibt.
- **Bedienung:** Fold, Check/Call und Bet/Raise unten; der Einsatz lässt sich per Schieberegler, Zahlenfeld oder Schnellwahl (Min, ½ Pot, Pot, All-in) einstellen. Ziehen schwenkt die Kamera, Mausrad bzw. zwei Finger zoomen.
- **Spielstand:** Das laufende Turnier wird im Browser gespeichert und kann nach dem Neuladen fortgesetzt werden. „Neues Turnier“ oben rechts startet neu.
- Gleichwertige Schreibweise: `?poker`. Kombinierbar mit der einfachen Darstellung: `?variante=poker&grafik=einfach`.

Die Engine liegt fertig gebündelt in `vendor/texasholdem/` (Stand siehe `VERSION` dort). Aktualisieren:

```bash
scripts/build-holdem.sh ../texasholdem
```

## Ressourcenschonende Darstellung

Die Standardansicht nutzt aufwendige Grafik (Schatten, Tiefenunschärfe, Glanz- und Gebrauchsspuren). Auf älteren oder schwächeren Geräten lässt sich per URL-Parameter eine einfache Darstellung einschalten:

```
https://jochenhammes.github.io/rubics/?grafik=einfach
```

- `?grafik=einfach` – einfache Darstellung: keine berechneten Schatten (nur ein fester Schattenfleck), keine Tiefenunschärfe, einfachere Materialien, geringere Auflösung.
- ohne Parameter – volle Darstellung.
- Gleichwertige Schreibweisen: `?lite`, `?grafik=lite`, `?quality=low`.

Der Parameter gilt nur für den jeweiligen Aufruf; wer die einfache Darstellung dauerhaft möchte, speichert die Adresse mit Parameter als Lesezeichen. Spielstand und Bedienung sind in beiden Darstellungen identisch. Kann der Browser kein WebGL 2, wird automatisch die einfache Darstellung verwendet.

Lokal starten:

```bash
python3 -m http.server 8000
```

3D-Darstellung mit [three.js](https://threejs.org) (MIT, liegt in `vendor/`).

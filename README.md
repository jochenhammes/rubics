# Zauberwürfel

3D-Zauberwürfel im Browser für Desktop, Tablet und Phone – ohne Build-Schritt, direkt über GitHub Pages lauffähig.

- **Darstellung:** Fotorealistische Szene – Würfel auf einem Spieltisch mit grünem Filz, Lampenlicht mit weichem Schatten, Kontaktschatten, Tiefenunschärfe und leichten Gebrauchsspuren auf den Kacheln.
- **Steuerung:** Auf einer Würfelfläche ziehen dreht die Ebene; neben dem Würfel ziehen (oder mit zwei Fingern) dreht und kippt den Würfel auf dem Tisch. Mausrad bzw. Zwei-Finger-Zoom ändert die Größe. Tasten `U D L R F B` drehen die Flächen (mit Umschalt gegenläufig).
- **Hilfe:** Zeigt Schritt für Schritt (Schicht-für-Schicht-Methode) den nächsten Zug als Pfeil am Würfel; auf Wunsch einzeln ausführen oder automatisch lösen lassen.
- **Speichern:** Stand, Zugzähler und Ansicht liegen in einem Cookie und sind beim nächsten Besuch wieder da.
- **Mischen / Zurück / Reset** über die Leiste unten.

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

# Zauberwürfel

3D-Zauberwürfel im Browser für Desktop, Tablet und Phone – ohne Build-Schritt, direkt über GitHub Pages lauffähig.

- **Darstellung:** Fotorealistische Szene – Würfel auf einem Spieltisch mit grünem Filz, Lampenlicht mit weichem Schatten und Tiefenunschärfe.
- **Steuerung:** Auf einer Würfelfläche ziehen dreht die Ebene; neben dem Würfel ziehen (oder mit zwei Fingern) dreht und kippt den Würfel auf dem Tisch. Mausrad bzw. Zwei-Finger-Zoom ändert die Größe. Tasten `U D L R F B` drehen die Flächen (mit Umschalt gegenläufig).
- **Hilfe:** Zeigt Schritt für Schritt (Schicht-für-Schicht-Methode) den nächsten Zug als Pfeil am Würfel; auf Wunsch einzeln ausführen oder automatisch lösen lassen.
- **Speichern:** Stand, Zugzähler und Ansicht liegen in einem Cookie und sind beim nächsten Besuch wieder da.
- **Mischen / Zurück / Reset** über die Leiste unten.

Lokal starten:

```bash
python3 -m http.server 8000
```

3D-Darstellung mit [three.js](https://threejs.org) (MIT, liegt in `vendor/`).

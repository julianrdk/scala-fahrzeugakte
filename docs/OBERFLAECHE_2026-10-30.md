# Gemeinsame Erfassung, Tankstellen und Fahrzeugdesign

## Bedienung

- **Erfassen:** Mit einer Arbeit beginnen, Datum und Durchführung prüfen. Kosten, Teile oder Dokumente bei Bedarf aufklappen. Ausgabe/Einnahme und Nur Dokument stehen im Feld Eintragsart bereit.
- **Beleg:** Dateien anhängen (je maximal 4 MiB), einen Beleg auswählen und Dokument auslesen anklicken. Markierte Vorschläge und Positionspreise prüfen. Manuelle Änderungen bleiben erhalten. Originale werden erst beim Speichern hochgeladen.
- **Assistent:** Unten rechts öffnen, beschreiben oder diktieren, Ins Formular übernehmen wählen. Die vorhandenen Felder werden ergänzt; Abweichungen können einzeln übernommen werden. Anhänge bleiben im Formular. Speichern legt Arbeit und verknüpfte Ausgabe gemeinsam an.
- **Tankstellen:** Karte öffnen, Standort oder PLZ wählen und den Ausschnitt verschieben. Erst Suchen ruft Preise ab. Alle drei Kraftstoffe bleiben sichtbar; Umkreis und Nur geöffnet filtern ohne neue Abfrage.
- **Farbe:** Fahrzeug → Stammdaten → Akzentfarbe wählen und Fahrzeugdaten speichern. Standard stellt das bisherige Grün wieder her. Helle Farben werden für lesbare Bedienelemente abgedunkelt.
- **Bilder:** Fahrzeug → Galerie → Standardfoto wählen. Die Übersicht stellt Fotos vollständig in ihrem eigenen Seitenverhältnis dar. Die größte Kachel zeigt das Standardfoto.

Recherchevorlagen, ChatGPT-Kopiertexte und die separate JSON-Importoberfläche sind entfernt. Termine, Historie, interne Erfassungspakete und ZIP-Sicherungen bleiben erhalten. Alte Vorlagenwerte in Sicherungen werden toleriert und nicht verwendet.

## Veröffentlichung

Keine neuen Schlüssel, Dienste oder D1-Migrationen erforderlich. `accent_color` ist ein optionales Feld im vorhandenen Fahrzeugdatensatz. Website und Worker müssen gemeinsam aus diesem Stand veröffentlicht werden, damit die neue Ortsauflösung vorhanden ist.

1. Änderungen in GitHub Desktop prüfen.
2. Titel: **Erfassung vereinfachen und Fahrzeugdesign überarbeiten**
3. Beschreibung: **Manuelle Eingabe, OCR und Chatentwürfe zusammenführen. Tankpreise nur auf Knopfdruck laden, Kartenfehler beheben und Fahrzeugfarben sowie flexible Fotocollage ergänzen. JSON-Import und Recherchevorlagen entfernen.**
4. Commit to main, anschließend Push origin. Der bestehende GitHub-Ablauf prüft und veröffentlicht Website und Worker automatisch.
5. Nach erfolgreichem Ablauf die Website neu laden. Unter Fahrzeugdaten eine Farbe speichern und die Tankstellenkarte öffnen. PLZ und Kartenbewegung müssen ohne Preisabruf funktionieren; Suchen lädt erst die Preise.

Die Umsetzung und Prüfungen bleiben zunächst lokal; keine Produktivkonten werden durch die Entwicklungsprüfungen geändert.

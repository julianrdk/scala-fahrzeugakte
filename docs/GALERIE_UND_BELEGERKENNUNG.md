# Galerie und Belegerkennung

Die Einrichtung folgt [Umstellung auf Cloudflare](UMSTELLUNG_CLOUDFLARE.md). Apps Script wird nicht mehr verwendet.

Unter Fahrzeug → Galerie lassen sich JPG, PNG und WebP bis 4 MiB je Original auswählen, prüfen und gemeinsam speichern. Das Standardfoto wird ausdrücklich gewählt. Die Übersicht zeigt es groß in der Pinnwand; weitere Fotos ergänzen die Collage mit ihren tatsächlichen Bildformaten, ohne Abschneiden oder Verzerren. Bis zu zehn Bilder am Desktop und vier mobil bleiben sichtbar; der Rest ist über die Galerie erreichbar. Vorschauen laden höchstens zu zweit, Originale erst in der Großansicht. Bilder gehören zum ausgewählten Fahrzeug und bleiben im privaten R2-Speicher.

**Erfassen** beginnt mit einer Arbeit; Ausgabe/Einnahme und Nur Dokument sind ebenfalls wählbar. Kosten, Teile und Dokumente werden bei Bedarf aufgeklappt. „Dokument hinzufügen“ hängt Originale an, „Dokument auslesen“ verarbeitet genau einen ausgewählten Beleg einschließlich aller PDF-Seiten. Text-PDFs werden direkt gelesen, Scans lokal mit Tesseract erkannt. Vorschläge erscheinen im selben Formular und sind farblich markiert; manuelle Änderungen bleiben erhalten. Bei geplanten Arbeiten wird ein erkannter Betrag als Schätzung übernommen. Arbeitsdatum und tatsächliche Durchführung separat prüfen. Erst **Speichern** lädt Originale hoch und legt die Einträge an, ohne zweite Vorschauseite.

Für Eigenleistung kann eine gemeinsame Standardwerkstatt hinterlegt werden. Verkäufer und ausführende Werkstatt bleiben getrennt. Die Rechnung zählt einmal als Kosten; Arbeitsverknüpfungen erzeugen keine zweite Ausgabe. Eine Arbeit kann auch eine bereits gespeicherte Ausgabe verknüpfen.

PDF.js, Tesseract und deutsche/englische Sprachdaten werden mit der Website ausgeliefert. Es ist kein zusätzlicher OCR-Schlüssel nötig. Unlesbare oder geschützte Dateien können manuell erfasst werden. Abbruch und manuelle Erfassung bleiben verfügbar; der ChatGPT-JSON-Vertrag v1 bleibt unverändert.

D1 speichert Angaben, Werkstattkopien und Verknüpfungen. R2 speichert unveränderte Originale, kleine Vorschauen und Sicherungen. Beim Abmelden werden private Vorschaucaches und Entwürfe verworfen.

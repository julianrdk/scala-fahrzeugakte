# Galerie und Belegerkennung

Die Einrichtung folgt [Umstellung auf Cloudflare](UMSTELLUNG_CLOUDFLARE.md). Apps Script wird nicht mehr verwendet.

Unter Fahrzeug → Galerie lassen sich JPG, PNG und WebP bis 4 MiB je Original auswählen, prüfen und gemeinsam speichern. Das Standardfoto wird ausdrücklich gewählt. Die Übersicht zeigt es groß in der Pinnwand; weitere Fotos ergänzen die Collage. Vorschauen laden höchstens zu zweit, Originale erst in der Großansicht. Bilder gehören zum ausgewählten Fahrzeug und bleiben im privaten R2-Speicher.

Beim Erfassen zuerst Belegart und Kategorie, danach Durchführung auswählen. Für Eigenleistung kann eine gemeinsame Standardwerkstatt hinterlegt werden. Verkäufer und ausführende Werkstatt bleiben getrennt. Ein PDF oder Belegfoto pro Erkennung auswählen; mehrseitige PDFs sind möglich. Text-PDFs werden direkt gelesen, Scans lokal mit Tesseract erkannt. Angaben und Positionen prüfen und korrigieren, danach speichern. Ein Arbeitsdatum und die tatsächliche Erledigung ausdrücklich bestätigen. Originale werden erst mit dem bestätigten Speichern übertragen. Die Rechnung zählt einmal als Kosten; Arbeitsverknüpfungen erzeugen keine zweite Ausgabe.

PDF.js, Tesseract und deutsche/englische Sprachdaten werden mit der Website ausgeliefert. Es ist kein zusätzlicher OCR-Schlüssel nötig. Unlesbare oder geschützte Dateien können manuell erfasst werden. Abbruch und manuelle Erfassung bleiben verfügbar; der ChatGPT-JSON-Vertrag v1 bleibt unverändert.

D1 speichert Angaben, Werkstattkopien und Verknüpfungen. R2 speichert unveränderte Originale, kleine Vorschauen und Sicherungen. Beim Abmelden werden private Vorschaucaches und Entwürfe verworfen.

# Sicherung und Wiederherstellung

Fahrzeugexporte behalten das Format vehicle-record-backup v1. Kontoexporte verwenden eine v2-Hülle mit Fahrzeugakten und gemeinsamen Einstellungen. Dies ändert den ChatGPT-Importvertrag v1 nicht.

Originale werden in etwa 20-MiB-Teilarchiven verarbeitet. Alle Teile desselben Exports aufbewahren. Archivkennung, Datenprüfsumme, vollständige Teilnummern und SHA-256 jedes Originals werden geprüft. Import hält Dateiverweise statt sämtlicher entpackter Originale im Speicher. Eine Kontoübernahme muss ausdrücklich ausgewählt werden; eine Fahrzeugübernahme erhält andere Fahrzeuge und gemeinsame Einstellungen.

Zunächst wird in einer getrennten Generation gespeichert. Originale werden erneut anhand ihrer SHA-256 geprüft und mit bestätigtem R2-Schreibnachweis erfasst. Erst die ausdrückliche Aktivierung wechselt den Zeiger. Änderungen seit Beginn einer Wiederherstellung blockieren die Aktivierung. Alte Generationen bleiben erhalten.

Die Tagesprüfung erzeugt fortsetzbare R2-Metadatenblöcke und zuletzt ein Manifest. Erst dessen erfolgreicher Abschluss bestätigt die Sicherung. Originaldateien bleiben unverändert und werden über ihre Prüfsummen referenziert. Alte vollständige Sicherungsläufe werden erst nach einem neuen bestätigten Lauf entsprechend der Aufbewahrung entfernt. Originale und frühere Akten werden dabei nicht automatisch gelöscht.

Für den produktiven Wechsel die [Umstellungsanleitung](docs/UMSTELLUNG_CLOUDFLARE.md) beachten. Ein ZIP zusätzlich außerhalb des Cloudflare-Kontos aufbewahren. Bei Kontoverlust allein hilft eine Sicherung im selben Konto nicht.

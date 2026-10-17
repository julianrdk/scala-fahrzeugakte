# Testbericht

Prüfstand der lokalen Abnahme: 18. Oktober 2026, Europe/Berlin. Lokale Umsetzung für **car.jurodak.com**. Bei diesen Tests wurde kein Google-Konto verbunden, keine echte Mail verschickt und keine Website veröffentlicht. Das Ziel-Repository **julianrdk/scala-fahrzeugakte** wurde anschließend vom Nutzer bereitgestellt; der jeweilige Online-Prüflauf ist unter GitHub Actions nachvollziehbar.

## Automatisierte Prüfungen

`pnpm check`: **73 Tests in 5 Dateien**, TypeScript-Prüfung, Vite-Produktionsbuild und Apps-Script-Build. Zusätzlich wird das gebaute Apps-Script-Bundle ohne Browser-/Node-Globals in einem isolierten V8-Kontext geladen; alle vier öffentlichen Top-Level-Funktionen bleiben vorhanden. Veröffentlichungsartefakte enthalten nur Frontend und öffentliche Konfiguration.

`pnpm audit --json`: nach Aktualisierung der Pakete **0 gemeldete Schwachstellen**. Dies ist der Stand der abgefragten Registry, keine Garantie für künftige Meldungen. Exakte Versionen und Integritätshashes im Lockfile.

| Bereich | Nachweis |
| --- | --- |
| JSON-Vertrag | Gute und fehlerhafte Repository-Beispiele, Versionen, Integer-Cent, Kalenderdaten, lokale Referenzen, unbekannte Felder, Markdown-Codeblock |
| Untrusted input | HTML als Text, CSV-/Sheets-Formelinjektion, MIME-Signaturen, Größen-/Hashprüfung |
| Kosten | 50-Euro-Kauf, Einbau ohne neue Zahlung, 10-Euro-Erstattung, 100-Euro-Planung; getrennte Einnahmen/Kauf/Betriebskosten |
| Dubletten | Identische Pakete, geänderte Import-ID, Retry nach verlorener Antwort, neu formulierte Rechnung, doppelte Rechnung im selben Paket, bewusste Begründung |
| Dokumente | Exakte Namen, Mehrdeutigkeit, Hash statt Dateiname, gleicher Name bei verschiedenen Inhalten, mehrfach verwendetes Original |
| Korrektur | Archiv zählt weiter, Storno zählt nicht, ausgeblendete Kategorie zählt weiter, Kostenanteile und Revisionenkonflikt |
| Historie | Alte Kilometer überschreiben keinen neuen bestätigten Stand; unbekannte Beträge/Datum bleiben null; mehr als 100 gespeicherte Einträge |
| Termine | Datum ODER Kilometer, Vorlauf, Monatsende/Schaltjahr, tatsächliche Erledigung, idempotente Erledigung, feste Kalenderregel |
| Verbrauch | Teilbetankungen im vollständigen Intervall; keine Berechnung über eine bekannte Lücke |
| GIS-/REST-Adapter | Deployment-ID, offizieller Endpunkt, Header statt Token-URL, vollständige Scopes, Ablauf und fremde Origin, kein Erfolg bei done:false |
| Google-Backend (simuliert) | Eigentümer/fehlende Identität, idempotentes Setup, benannte Spalten/stringValue, Integrität, atomarer Batch-Fehler, Uploadabbruch/Dateiwiederverwendung |
| Automation (simuliert) | Ein Editortrigger, globale/regelförmige Aktivierung, Bündelung, Versandwiederholung unterdrückt, unklarer Ausgang, Kontingentfehler und ausdrückliche Testmail |
| Wiederherstellung | Tatsächlicher ZIP/CSV-Rundlauf und simulierte neue Google-Ressourcen; neue Drive-IDs, gleiche Originalbytes, Hashes, Beträge und Links; fehlende Teile abgewiesen |

**Simuliert bedeutet:** Die Tests führen den echten Backend-/Adaptercode gegen kontrollierte lokale Google-Service-Ersatzobjekte aus. Sie beweisen keine realen Google-Berechtigungen, Servicequoten oder Mailzustellung.

## Browserprüfung

Im lokalen In-App-Browser mit ausdrücklich aktiviertem Testmodus:

- Manuell 50,00 Euro ohne erfundenes Datum erfasst, Vorschau und bestätigte Historienanzeige geprüft.
- Drei Rechnungen gemeinsam aus einer JSON-Datei geladen, erste vor dem Speichern umbenannt, drei unterschiedliche PNG-Originale gleichzeitig ausgewählt und anhand exakter Namen automatisch zugeordnet. Historie enthält drei verknüpfte Belege; Jahreskosten 60,00 Euro. Der undatierte 50-Euro-Testkauf wird getrennt als offen ausgewiesen.
- 360 × 800 und 1280 × 900 geprüft. Dokument-/Import-/Historienansicht ohne horizontalen Seitenüberlauf; gemessenes documentElement: scrollWidth = clientWidth, jeweils 345 bzw. 1265 CSS-Pixel nach Abzug der Scrollbar.
- Langer Originaldateiname auf 360 Pixeln geprüft. Dabei erkannte Verengung durch die Aktionsbuttons korrigiert; Vorschau/Download liegen mobil in einer eigenen Zeile.
- Tastatur-Navigation mit Tab geprüft; nächster Hauptlink wird fokussiert, sichtbare durchgezogene Fokusmarkierung vorhanden.
- Kosten-Druckvorschau mit Datum, Belegnummern und korrekten Beträgen geprüft. Browserdruck aufgerufen; der native Dialog blockierte die Browsersteuerung und wurde mit Escape geschlossen. **Keine fertige PDF-Datei oder tatsächliche A4-Seitenumbrüche behauptet.** Abschließender PDF-Probedruck in der Einrichtung erforderlich.

Nachweise: [Desktop im Testmodus](docs/screenshots/desktop-testmodus.png), [mobile Dokumentansicht](docs/screenshots/mobile-dokumente-testmodus.png). Die Bilder zeigen ausschließlich synthetische Testdaten. Kein physisches Android-Gerät wurde verwendet.

## Zuordnung zu den Abnahmekriterien

| Nr. | Stand |
| --- | --- |
| 1 | Lokal und im Browser mit drei gemeinsam zugeordneten Testoriginalen geprüft; echter Google-Upload noch offen |
| 2–5 | Automatisiert geprüft; UI-Bearbeitung/Null-Datum zusätzlich im Browser |
| 6 | Fachlogik und Mailautomation mit simulierten Diensten geprüft; reale Triggerzustellung offen |
| 7 | Ablehnung und Tokenmodell lokal geprüft; fremdes echtes Konto/Live-Ablauf erst nach Kontokonfiguration |
| 8–10 | Automatisiert geprüft; HTML wird durch React als Text dargestellt |
| 11 | ZIP-Rundlauf und neue simulierte Google-Ressourcen geprüft; echter Google-Restore offen |
| 12 | Desktop/360-Pixel/Import/langer Name/Tastatur/Druckvorschau geprüft. Physisches Android und fertiger Browser-PDF-Probedruck offen. Tankstellen derzeit hilfreicher externer Link; integrierter Provider samt Karte/Ausfall-/Preisalter-Logik nicht aktiviert |

## Noch vom Kontoinhaber zu erledigen

Die kleinste konkrete Folge steht in [docs/EINRICHTUNG_DEIN_ZIEL.md](docs/EINRICHTUNG_DEIN_ZIEL.md) und ausführlich in [SETUP.md](SETUP.md): neues GitHub-Repository, DNS/HTTPS für car.jurodak.com, gemeinsames Standard-Cloud-Projekt, Eigentümer-Properties und MYSELF-API-Deployment, echter Lese-/Schreibdurchstich, Editortrigger, bewusst angeforderte Testmail, realer Export/Restore und PDF-Probedruck.

Das optionale Tankerkönig-/Kartenmodul ist nicht Teil der aktivierten Version; dafür werden weder Preise simuliert noch ein Key erfordert. Die Kernakte funktioniert unabhängig davon. Diese Grenzen sind keine erfolgreichen Produktivnachweise.

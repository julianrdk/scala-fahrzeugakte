# Testbericht

Prüfstand der lokalen Abnahme: 18. Oktober 2026, Europe/Berlin. Lokale Umsetzung für **car.jurodak.com**. Bei diesen Tests wurde kein Google-Konto verbunden, keine echte Mail verschickt und keine Website veröffentlicht. Das Ziel-Repository **julianrdk/scala-fahrzeugakte** wurde anschließend vom Nutzer bereitgestellt; der jeweilige Online-Prüflauf ist unter GitHub Actions nachvollziehbar.

## Automatisierte Prüfungen

Vollständige lokale Prüfung nach dem Cloudflare-Anmeldeumbau und der Laufzeitkorrektur: **129 Tests in 9 Dateien**, TypeScript-Prüfung, Vite-Produktionsbuild, Apps-Script-Build und Cloudflare-Pages-Build. Die Prüfungen entsprechen den Schritten von `pnpm check`. Zusätzlich wird das gebaute Apps-Script-Bundle ohne Browser-/Node-Globals in einem isolierten V8-Kontext geladen; alle vier öffentlichen Top-Level-Funktionen bleiben vorhanden. Das GitHub-Pages-Artefakt enthält nur Frontend und öffentliche Konfiguration; der Cloudflare-Dienst wird separat gebaut.

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
| Cloudflare-Sitzungen (lokal) | Echtes SQLite-Schema, einmaliger browsergebundener State/PKCE, ausschließlich verifiziertes Eigentümerkonto, AES-GCM-Tokens, gehashte Cookies, 30 Tage/12 Stunden, Logout und Ablauf, Origin/CSRF, widerrufene Freigaben, serverseitiges Refresh vor sechs Minuten Restlaufzeit |
| Cloudflare-Aufrufe und Diagnose | Reproduzierter Abbruch bei workerd-inkompatiblem Redirectmodus; unterstützter manueller Modus bei Codeaustausch, Kontoabruf, Refresh, API und Tageslauf; Weiterleitungen vor Weitergabe von Geheimnissen abgewiesen; feste Fehlerkennungen ohne private Inhalte; fehlende Tabelle ohne Teilanmeldung |
| Sitzungsadapter/Weiterleitung | Neue Adapterinstanz stellt Sitzung ohne OAuth her, nur festes Popup akzeptiert, kein Google-Bearer im Browser, kein automatisches Wiederholen von Schreibzugriffen, fester scripts.run-Umschlag, Unicode/JSON-Ausbruch/Größenlimit/ungültiges UTF-8, Stringargument im Google-Backend validiert |
| Google-Backend (simuliert) | Eigentümer/fehlende Identität, idempotentes Setup, benannte Spalten/stringValue, Integrität, atomarer Batch-Fehler, Uploadabbruch/Dateiwiederverwendung |
| Automation (simuliert) | Ein Editortrigger, globale/regelförmige Aktivierung, Bündelung, Versandwiederholung unterdrückt, unklarer Ausgang, Kontingentfehler und ausdrückliche Testmail |
| Wiederherstellung | Tatsächlicher ZIP/CSV-Rundlauf und simulierte neue Google-Ressourcen; neue Drive-IDs, gleiche Originalbytes, Hashes, Beträge und Links; fehlende Teile abgewiesen |

**Simuliert bedeutet:** Die Tests führen den echten Backend-/Adaptercode gegen kontrollierte lokale Google-Service-Ersatzobjekte aus. Sie beweisen keine realen Google-Berechtigungen, Servicequoten oder Mailzustellung.

## Erster echter Verbindungstest: falsche Integritätsmeldung

Der Nutzer konnte sich verbinden; erst der Lese-/Schreibtest meldete eine direkte Tabellenänderung. Er bestätigte, keine Tabellenzellen geändert zu haben. Der bisherige Code kombinierte Advanced-Sheets-API-Schreibvorgänge mit SpreadsheetApp-Lesevorgängen. Ein Test mit zwischengespeicherten SpreadsheetApp-Werten reproduziert exakt die Fehlermeldung beim Rücklesen des frisch geschriebenen Prüfeintrags. Ein zweiter Regressionstest zeigt, dass derselbe alte Cache echte Änderungen verdecken konnte.

Die Korrektur liest alle Datenblätter und `_Integrity` gemeinsam per `Sheets.Spreadsheets.get` und verwendet die rohen `userEnteredValue`-Felder. Die Prüfsummenberechnung und das Speicherformat bleiben gleich. Es gibt keine neue Prüfsumme für ungeprüfte Daten, keine automatische Freischaltung und keinen Datenreset. Beide Regressionstests sowie ein zusätzlicher Formeltest bestehen; auch alle bisherigen Tests bestehen.

Nach zunächst erneut gemeldetem Fehler bestätigte eine direkte Editor-Diagnose **Leser: neue Korrektur** und **Lesetest: OK**. Der Nutzer bestätigte ausdrücklich den **Lese-/Schreibtest auch auf der Website**, den Eingang der ausdrücklich ausgelösten Testmail sowie Upload/Öffnen/Download des Beispieldokuments. Fremdkonto-Test, automatischer Triggerlauf sowie realer Export/Restore sind damit noch nicht nachgewiesen. Das Einrichtungspaket `examples/einrichtungstest/Belegtest.json` ist gegen das verbindliche Schema geprüft und enthält nur ein Beispieldokument, keine Ausgaben, Arbeiten oder Regeln.

Die Cloudflare-Anmeldung ist inzwischen eingerichtet und in der öffentlichen Website aktiviert. HTTPS, öffentliche Konfiguration, unauthentifizierte Sitzungsprüfung und Start der Anmeldung mit D1-State wurden live geprüft; der echte Google-Rücksprung meldete `GOOGLE_TOKEN`. Ursache im Code: `redirect:'error'` wird von Cloudflares workerd bereits vor dem Netzaufruf abgewiesen. Ein neuer Regressionstest reproduzierte den Abbruch; die Korrektur verwendet durchgehend `manual` und lehnt 3xx-Antworten ausdrücklich ab. Grundlage: [workerd-Implementierung](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c%2B%2B). Der vollständige echte Google-Login, Cookies nach Browserneustart, zweites Konto und Free-CPU-Limit mit 4-MiB-Originalen bleiben bis zur echten Abnahme offen. Tagesprüfungs-Worker ebenfalls noch ausstehend.

## Browserprüfung

Die neue vorgeschaltete Anmeldeansicht wurde lokal bei **360 × 800** geprüft: `scrollWidth = clientWidth = 360`, Merkfunktion/Erklärung lesbar, Testmodus erreichbar, Abmelden führt wieder zur Anmeldeansicht. Nachweis: [Anmeldeseite, lokal vorbereitet](docs/screenshots/anmeldung-mobil-vorbereitet.png), [Abmeldung der lokalen Testakte](docs/screenshots/anmeldung-abgemeldet-lokaler-test.png). Der Google-Button ist auf dieser HTTP-Layoutvorschau absichtlich deaktiviert; kein echter Google-/Cloudflare-Login wurde damit geprüft. Produktive Konfiguration wurde für die Vorschau nicht verändert.

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

## Neutrale Oberfläche und Kontentrennung

Neue Speicher beginnen mit leeren Hersteller-/Modellfeldern; die reservierte Fahrzeugzeile bleibt für Speicherversion 1 bestehen und wird erst nach ausdrücklichem Hinzufügen angezeigt. Bestehende Fahrzeuge werden nicht verändert. SSR-Prüfung der Anmelde- und Hinzufügeansicht ohne Marken-/Modellvorgaben. JSON-Vertrag unverändert; allgemeiner Erfassungsprompt als zusätzliche Fassung.

Acht zusätzliche Google-Backendtests mit drei simulierten Konten prüfen eigene Ressourcen/Kosten, keine Dateierstellung vor Fahrzeugbestätigung, kein Rückfall auf bestehende Eigentümerressourcen, manipulierte Ressourcen, fremde Restore-Kennungen, fehlende Identität und eigenen Mail-/Sicherungslauf. Sieben zusätzliche Cloudflare-Tests prüfen die ausdrückliche Freischaltung, kontoabhängige Bearer/CSRF/Sitzungen, getrenntes Abmelden, vertauschte verschlüsselte Tokens, Berliner Sommer-/Winterzeit und Verarbeitung/Lease/Retry der Tagesprüfung. Kein zweiter echter Google-/Cloudflare-Kontotest behauptet.

Browserprüfung der neutralen Fassung: 360 × 800, neuer lokaler Testmodus → leere Hinzufügeansicht → Volkswagen Golf (2020) bestätigt hinzugefügt; eigener Fahrzeugname in Übersicht und Formular, danach Abmelden ohne Modellanzeige. Kein horizontaler Überlauf: mobil 345/345, Desktop 1265/1265. Bilder: docs/screenshots/fahrzeugakte-anmeldung-neutral.png, fahrzeug-hinzufuegen-neutral.png und fahrzeugakte-golf-desktop-test.png. Ausschließlich lokale Testdaten, kein zweites echtes Konto.

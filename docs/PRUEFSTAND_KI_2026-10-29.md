# Prüfstand des persönlichen KI-Assistenten

Stand: 29.10.2026. Implementierung und Funktionstests verwenden lokale Änderungen und synthetische Konten. In der anschließenden Einrichtung wurden ausschließlich die beiden zusätzlichen KI-Tabellen in der vorhandenen produktiven D1-Datenbank angelegt. Keine Veröffentlichung und keine echten Groq-Anfragen. Commit und Push bleiben beim Nutzer.

## Erfolgreich geprüft

- **246 Tests in 17 Dateien**, einschließlich der bisherigen Fach-, Galerie-, Beleg-, Sicherungs- und Vertragsprüfungen. 44 zusätzliche Fälle betreffen den Assistenten, Schlüsselverwaltung, Audio, Formularübergabe und verspätete Antworten im Fahrzeugadapter.
- Strenge TypeScript-Prüfung, Produktionsbuild für Website und Worker sowie Prüfung der öffentlichen Artefakte erfolgreich. `AI_CREDENTIALS_KEY` ist als unzulässiger Inhalt im Browserbundle abgesichert. Die bestehende Größenwarnung für das Hauptbundle bleibt bestehen; der Assistent und seine Einstellungen werden separat nachgeladen.
- Abhängigkeitsprüfung: **0 bekannte Sicherheitslücken** am Prüftag. Happy DOM ist ausschließlich eine Testabhängigkeit.
- Bestehender großer ZIP-Rundlauf erfolgreich: 268.000.000 Byte in 14 Teilen sowie 960.000.000 Byte in 48 Teilen. Originalprüfsummen, Verknüpfungen und Kosten blieben beim Export und Wiederherstellen erhalten. Ausschließlich lokale Testdateien; kein Cloudflare-Speicherverbrauch.
- Zwei synthetische Konten mit je zwei Fahrzeugen: eigener Schlüssel pro Konto, fremde Fahrzeugkennungen abgewiesen, Clerk-Anmeldung und Website-Ursprung geprüft. Keine Galerie, Dokumente oder Aktenhistorie im Modellkontext.
- AES-GCM mit Kontokennung als zusätzliche authentifizierte Daten. Kopieren verschlüsselter Schlüssel zwischen Konten scheitert. Ungültiger Ersatz erhält den bisherigen Schlüssel. Entfernen verhindert auch ein verspätetes Zurückschreiben während der Prüfung oder Verschlüsselung. Antworten und Aktenexporte enthalten keinen Klartextschlüssel.
- Ein laufender Anbietervorgang pro Konto, höchstens zehn Starts je Kalenderminute. Keine automatischen Wiederholungen. Geprüft: ungültige Modellantworten, Anbieterfehler, Kontingentfehler, Abbruch und geänderte Konto-/Fahrzeuggenerationen.
- Validierung von Kalenderdaten, ganzen Cent, Kilometerständen, Referenzen und Zusatzangaben. Simuliertes Beispiel mit 82.400 km und 65 Euro; Eigenleistungswerkstatt und Verkäufer getrennt. Geplante Beträge bleiben Schätzungen. Mehrere Arbeiten können dieselbe Ausgabe verwenden; wiederholtes Speichern mit identischer Vorgangskennung erzeugt keine zusätzlichen Kosten.
- Manuelle Werte einschließlich bewusst geleerter Felder bleiben geschützt. Abweichungen lassen sich gezielt übernehmen. Bereits bezahlte Rechnungsverknüpfungen bleiben im Browser und werden nicht zum Anbieter geschickt. Der schwebende Einstieg übernimmt den aktuellen Formularstand. Abgewählte Einträge und deren Verknüpfungen werden gemeinsam entfernt. Ein unbestätigter Speichervorgang bleibt gesperrt.
- Simulierte Aufnahme: Freigabe verweigert, Recorderfehler, Zwei-Minuten-Stopp, 4-MiB-Grenze, Schließen, neuer Chat, Verlassen der Seite und verspätete Mikrofonfreigabe. Nach Transkription wird zunächst nur der bearbeitbare Text angezeigt. Verarbeitung erfolgt erst bei Senden. Keine Audioablage in D1/R2.
- Chat beim Schließen erhalten; Reset und Schlüsselwechsel verwerfen Sitzungsentwürfe. Abbruch, Abmelden und Fahrzeugwechsel verhindern die Übernahme verspäteter Ergebnisse.

Der ChatGPT-JSON-Vertrag v1 ist unverändert. Schlüssel und Limits liegen in separaten additiven Tabellen, außerhalb der Fahrzeugdaten und Aktenexporte. Die bestehenden Tests laufen weiterhin auch ohne diese optionalen Tabellen.

## Lokale Cloudflare-Laufzeit

Echtes lokales workerd mit lokaler D1/R2-Umgebung, synthetisch signierten Clerk-Sitzungen und simuliertem Anbieter. Schlüsselprüfung, AES-GCM-Speicherung, Entwurfsvalidierung, Transkription und kontogetrenntes Entfernen erfolgreich. Der kombinierte synthetische KI-Prüflauf dauerte zuletzt rund **60 ms Wandzeit**, einschließlich mehrerer D1-Aufrufe. Das ist **keine** produktive CPU-Messung und keine Angabe zur Modellgeschwindigkeit.

| Verknüpfte Buchungen | Einstieg | Kleine Änderung | Antwort der Änderung |
| --- | --- | --- | --- |
| 100 | 63 ms | 21 ms | 1.816 Byte |
| 1.000 | 58 ms | 18 ms | 1.824 Byte |
| 3.000 | 78 ms | 18 ms | 1.825 Byte |

Die Rohwerte entstehen bei `pnpm test:runtime` in `test-results/runtime.json`; das Verzeichnis wird nicht eingecheckt.

## Anschließende Browserprüfung und Einrichtung

Die Browsersteuerung war später wieder verfügbar. Geprüft wurden Desktop (1280 × 900) und mobiles Layout (390 × 844) mit simulierten Antworten: schwebender Einstieg, Chat schließen und erneut öffnen, Übergabe in die bestehende Erfassung, manuelle Änderung von 65 auf 70 Euro, Erhalt des manuellen Wertes bei abweichendem Vorschlag und dessen gezielte Übernahme. Neuladen verwirft den Chat. Die Browserkonsole zeigte dabei keine Fehler. Dies ist eine Prüfung mobiler Ansichtsgrößen, kein Test auf einem echten Handy. Screenshots liegen lokal unter `test-results/screenshots/ki-desktop.png` und `ki-mobil.png`.

In Cloudflare ist die vorhandene Datenbank `fahrzeugakte-daten` über die Worker-Bindung `DATA_DB` bestätigt. Die additive Migration `0004-ai.sql` wurde über die D1-Konsole ausgeführt; eine separate Abfrage bestätigt `ai_credentials` und `ai_limits`. Bestehende Fachzeilen wurden nicht verändert. Nachweis: `test-results/screenshots/ki-d1-eingerichtet.png`.

Der Nutzer hat die Groq-Einrichtung und das Hinterlegen von `AI_CREDENTIALS_KEY` ausdrücklich auf später verschoben. Das vorbereitete Secret-Formular wurde ohne Speichern geschlossen; `AI_CREDENTIALS_KEY` ist noch nicht angelegt. Bestehende Secrets bleiben erhalten. Ein neu erzeugter, noch nicht verwendeter Verschlüsselungswert wurde ausschließlich in die Zwischenablage kopiert und nicht im Chat ausgegeben. Beim späteren Fortsetzen bei Bedarf frisch erzeugen. Keine Anmeldung oder Schlüsselanlage bei Groq durchgeführt. Die Wrangler-Kommandozeile besitzt keine Cloudflare-Anmeldung; es wurde kein neuer Zugriff dafür eingerichtet.

## Noch offen vor der abschließenden Abnahme

- Prüfung auf echten Geräten. Lokale Probe: `pnpm test:browser`, dann `http://127.0.0.1:5198/tests/browser/index.html?ai`; mobil `?mobile`. Anbieterantworten dort sind ausdrücklich simuliert.
- Echte Textantworten, deutsche relative Datumsangaben und Erkennungsqualität mit einem persönlichen Groq-Free-Schlüssel. Die lokalen Tests prüfen Struktur und Verarbeitung vorgegebener Antworten, nicht die Qualität des echten Modells.
- Echte Mikrofonaufnahme auf Handy und PC, HTTPS-Berechtigung, Transkriptkorrektur, Sitzungsablauf und Anmeldung auf beiden Geräten.
- Produktive Cloudflare-CPU-Zeit einschließlich erster und warmer Aufrufe. Der kostenlose CPU-Rahmen kann aus lokalen Wandzeiten nicht bestätigt werden. Nach Einrichtung über Worker-Metriken prüfen; keine automatische Tarifaufwertung.

Die [Einrichtungsanleitung](KI_ASSISTENT_EINRICHTEN.md) beschreibt Migration, Verschlüsselungssecret, Veröffentlichung und den anschließenden persönlichen Test.

## Nachtrag: Verbindungsfehler bei der Schlüsselprüfung

Die beim persönlichen Schlüsseltest gemeldete Nachricht „Der KI-Dienst antwortet gerade nicht“ ließ sich lokal in workerd reproduzieren. Ursache war `redirect: "error"`: Cloudflare lehnt diese Request-Option bereits beim Erstellen der Anfrage ab, bevor ein Aufruf an Groq erfolgt. Die bisherigen Anbieter-Fixtures umgingen die native Request-Erstellung und deckten diesen Unterschied zu Node.js nicht auf. [Cloudflare dokumentiert die Einschränkung](https://developers.cloudflare.com/workers/runtime-apis/request/).

Die Verbindung verwendet jetzt `redirect: "manual"` und weist Weiterleitungen ausdrücklich ab. Persönliche Schlüssel werden damit nicht an ein Weiterleitungsziel geschickt. Netzwerkfehler, tatsächliche Zeitüberschreitungen und bewusster Abbruch erhalten getrennte Fehlercodes und verständliche Meldungen. Ein erfolgloser Ersatzversuch erhält den bisherigen Schlüssel.

Die Laufzeit-Fixtures erstellen nun jede simulierte Anbieteranfrage mit workerds nativer Request-API. Dieser Test schlug vor der Korrektur mit derselben Meldung fehl und besteht anschließend für Schlüsselprüfung, Chat und Transkription. Zusätzlich sind die unterbundene Weiterleitung, der Erhalt des bisherigen Schlüssels und die Fehlerunterscheidung automatisiert geprüft. **251 Tests in 17 Dateien**, Typprüfung, vollständiger Produktionsbuild und Artefaktprüfung bestehen.

Cloudflare wurde ausschließlich lesend geprüft: `AI_CREDENTIALS_KEY` ist inzwischen als verschlüsseltes Secret im bestehenden Worker vorhanden. Für diese Fehlerkorrektur wurden keine produktiven Einstellungen, Schlüssel oder Fahrzeugdaten geändert und keine echten Groq-Anfragen durchgeführt. Die Korrektur ist lokal vorbereitet; Commit und Push erfolgen weiterhin durch den Nutzer. Nach der automatischen Veröffentlichung muss der persönliche Schlüssel in der App erneut geprüft werden.

## Nachtrag: Diktat am PC und Live-Pegel

Der Nutzer meldet eine falsche Transkription „Vielen Dank.“ am PC, während dieselbe Funktion am Handy funktioniert. Die damalige Aufnahme liegt nicht vor; eine konkrete Ursache wie Mikrofonwahl, Signalqualität oder Anbietererkennung ist deshalb nicht nachgewiesen.

- Lokaler Mikrofonpegel mit Gerätename während der Aufnahme. Messung mit Web Audio ohne Wiedergabe oder zusätzlichen Anbieteraufruf; Hintergrund/Schließen beendet Messung und Aufnahme.
- Eine über mehrere Messungen praktisch stille Aufnahme wird nicht gesendet. Ein niedriger Pegel allein sperrt keine Aufnahme; bei fehlender oder nicht gestarteter Messung bleibt Diktieren möglich. Der Pegel misst ein Audiosignal, keine verlässliche Spracherkennung.
- Die letzte Aufnahme lässt sich lokal anhören. Blob-URL und Audiodaten werden bei Entfernen, neuer Aufnahme und Unmount freigegeben. Keine dauerhafte Audioablage. Die CSP erlaubt dafür ausschließlich eigene und lokale Blob-Medien.
- Native Aufnahme wird vor Freigabe der Mikrofonspur fertiggestellt. Erkennungsmetadaten mit `verbose_json`, Deutsch und Temperatur 0. Unsichere Ergebnisse werden vollständig abgewiesen, statt möglicherweise wichtige Einzelangaben zu verlieren. [Groq erläutert die Metadaten](https://console.groq.com/docs/speech-to-text). Die Schwellen sind eine Heuristik; auch ein scheinbar sicheres Transkript muss geprüft werden. „Vielen Dank“ wird nicht pauschal gesperrt.
- **267 Tests in 17 Dateien**, Typprüfung, Produktionsbuild und lokale workerd-Prüfung erfolgreich. Zusätzlich geprüft: Stille ohne Anbieteraufruf, leise Aufnahme, Pause vor dem Stoppen, nicht verfügbare Pegelmessung, Freigabe der Audioressourcen, unzuverlässige Segmente, leere Anbieterantwort sowie Erhalt eines vorgegebenen Satzes mit 50.700 km, drei Zündkerzen und 10,90 Euro Stückpreis. Der vorgegebene Satz prüft die Verarbeitung einer simulierten Antwort, nicht die tatsächliche Erkennungsqualität.

Browserprüfung mit synthetischem Testton über echten MediaRecorder und Web Audio: beweglicher Pegel, Stopp, korrekt geladene Audiovorschau und prüfbares simuliertes Transkript bestätigt. Desktop und schmale Ansicht mit 390 Pixeln geprüft; kein Test auf einem echten Handy. Kein Zugriff auf das echte Mikrofon und keine Groq-Aufrufe. Nachweise lokal unter `test-results/screenshots/diktat-live-pegel.png`, `diktat-audiovorschau.png` und `diktat-live-pegel-mobil.png`. Ein echter PC-Aufnahmetest nach Veröffentlichung bleibt erforderlich. Alle Änderungen sind lokal; keine Schlüssel, Kontoeinstellungen oder Produktivdaten wurden verändert.

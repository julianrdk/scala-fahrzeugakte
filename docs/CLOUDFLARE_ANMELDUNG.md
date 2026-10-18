# Angemeldet bleiben: Einrichtung in kleinen Schritten

Entscheidung des Nutzers am 18.10.2026: kostenloses Cloudflare-Hosting für den Anmeldedienst, Domain und DNS weiterhin bei IONOS. Kein kostenpflichtiges IONOS-Webhosting bestellen. Cloudflare-Konto laut Nutzer fertig. Der neue Code ist vorbereitet; eine echte Cloudflare-/Google-Anmeldung und die Cloudflare-Laufzeitgrenzen sind noch nicht live geprüft. Die öffentliche Website bleibt bis zur bewussten Aktivierung beim funktionierenden bisherigen Google-Adapter.

## 1. Bereits erledigt: Cloudflare-Konto

Das vom Nutzer gezeigte IONOS-Angebot verlängert ausschließlich `jurodak.com`: 14,42 € für zwölf Monate im Voraus, rechnerisch rund 1,20 €/Monat; danach laut Anzeige 2 €/Monat. Das ist mit dieser Architektur vereinbar. Maßgeblich ist die abschließende Bestellzusammenfassung. Domain nicht löschen oder zur Freigabe kündigen. Keine Werbe-/Mail-Zusatzprodukte für die Fahrzeugakte erforderlich.

Unter https://dash.cloudflare.com/sign-up ein Konto anlegen und E-Mail bestätigen. Kostenlosen Tarif verwenden. Die gesamte Domain muss weder zu Cloudflare umgezogen noch als DNS-Zone hinzugefügt werden. Nur `auth.jurodak.com` wird später per CNAME verbunden. `car.jurodak.com`, die Hauptdomain und bestehende Mail-DNS-Einträge bleiben bestehen.

## 2. Anmeldeprojekt mit GitHub verbinden

In Cloudflare **Workers & Pages → Create application → Pages → Import/Connect an existing Git repository** öffnen. Bei GitHub nur das Repository `julianrdk/scala-fahrzeugakte` freigeben. Projektname beispielsweise **fahrzeugakte-anmeldung**, Produktionsbranch **main**, Framework **None**.

| Einstellung | Wert |
| --- | --- |
| Root directory | Projektwurzel, leer lassen |
| Build command | `npm run build:auth` |
| Build output directory | `auth/dist` |
| Build variable `NODE_VERSION` | `24` |
| Build variable `PNPM_VERSION` | `11.25.0` |

Nur der zusätzliche Anmeldedienst wird hier gebaut; die Fahrzeugoberfläche bleibt bei GitHub Pages. Die konkreten Menünamen können sich ändern. `_worker.js` ist eine Pages Function im Advanced Mode; kein reiner Dateiupload und kein kostenpflichtiger Worker-Tarif erforderlich. Der erste Build kann schon erfolgreich sein, bevor die Kontoeinstellungen vollständig sind; das bestätigt noch keinen Login.

## 3. Private D1-Datenbank anlegen

Cloudflare **Storage & Databases → D1 → Create database**: Name **fahrzeugakte-anmeldung**. In der SQL-Konsole den Inhalt von `auth/schema.sql` ausführen. Die vier Tabellen heißen `oauth_requests`, `credentials`, `sessions`, `account_jobs`. Falls die Konsole nur einzelne Befehle annimmt, die mit Semikolon abgeschlossenen Anweisungen nacheinander ausführen. Es werden keine Fahrzeugdaten oder Belege dorthin kopiert.

Im Pages-Projekt **Settings → Bindings → Add → D1 database** die Datenbank als Binding **DB** anbinden, für **Production**. Keine Vorschauumgebung mit produktiven Secrets/Datenbank ausstatten. Nach Änderungen erneut bereitstellen.

## 4. Google-Client ergänzen

Im **bisherigen Standard-Google-Cloud-Projekt** unter **Google Auth Platform → Clients** den bestehenden Web-Client öffnen. JavaScript-Origin `https://car.jurodak.com` beibehalten. Als autorisierten Weiterleitungs-URI exakt ergänzen:

```text
https://auth.jurodak.com/callback
```

Den Anzeigenamen unter Branding auf **Fahrzeugakte** ändern; der bisherige OAuth-Client und dessen ID bleiben erhalten. Speichern. Das Client-Secret ausschließlich aus dieser Google-Seite in das Cloudflare-Secret aus Schritt 5 übernehmen. Nicht in den Chat, in GitHub oder in die öffentliche `config.json` eintragen. Keine Service Accounts oder neue Google-Datenspeicher anlegen.

## 5. Cloudflare-Werte und Secrets hinterlegen

Im Pages-Projekt **Settings → Variables and Secrets** für **Production** die Werte aus `auth/config.example.json` übernehmen. Die öffentlichen Variablen sind bereits ausgefüllt, einschließlich **ACCOUNT_MODE = multi** für getrennte Konten. **GOOGLE_CLIENT_SECRET** und **TOKEN_KEY** als verschlüsselte **Secrets** hinterlegen.

- `GOOGLE_CLIENT_SECRET`: direkt aus Google übernehmen.
- `TOKEN_KEY`: Inhalt der lokalen, von Git ausgeschlossenen Datei `config/private-auth-key.txt`. Falls noch nicht erzeugt, lokal `node scripts/generate-auth-key.mjs` ausführen. Das Programm schreibt den Schlüssel nur in diese Datei und gibt ihn nicht aus. Die Datei nicht hochladen oder teilen. Erzeugung überschreibt keinen vorhandenen Schlüssel.

Nach Speichern von Binding/Variablen/Secrets erneut bereitstellen. Diese Angaben niemals als Build-Ausgabe ausgeben. Keine bezahlte Tarifumstellung notwendig. Bei ausgeschöpftem kostenlosen Kontingent schlägt der Dienst fehl; es erfolgt kein automatischer Tarifwechsel durch diesen Code.

## 6. Nur die Anmelde-Subdomain verbinden

Im Pages-Projekt unter **Custom domains → Set up a custom domain** die Adresse **auth.jurodak.com** hinzufügen. Cloudflare zeigt das tatsächliche Ziel, etwa `fahrzeugakte-anmeldung.pages.dev`. Dieses Ziel vorher ablesen; der Projektname kann bereits vergeben sein.

Bei IONOS für **auth** einen CNAME auf dieses tatsächlich angezeigte `*.pages.dev`-Ziel setzen. Nicht den vorhandenen **car**-Eintrag ändern. Keine Nameserver- oder MX-Umstellung. Zertifikatsbereitstellung abwarten. `https://auth.jurodak.com/` muss mit gültigem HTTPS eine kurze JSON-Antwort mit `Fahrzeugakte Anmeldung` liefern. `/session` direkt in der Adresszeile ist kein Kontotest: Ohne App-Origin wird der Zugriff absichtlich abgewiesen. Produktionsaufrufe über `*.pages.dev`/Previewhosts werden ebenfalls abgewiesen.

## 7. Bestehendes Google-Backend aktualisieren und erst dann aktivieren

Der Streaming-Aufruf übermittelt das Argument an `scalaApi` als JSON-String. Dafür ist das neu gebaute `apps-script/dist/Code.js` erforderlich. Den vollständigen Inhalt wie bisher in `Code.gs` übernehmen und speichern. **Bestehende Bereitstellung → Bearbeiten → Neue Version → Bereitstellen** verwenden; die bisherige Deployment-ID behalten. Für den neuen Mehrkontobetrieb zusätzlich den Inhalt von `apps-script/dist/appsscript.multi-user.json` als Manifest verwenden (API-Zugriff **ANYONE**, ausschließlich angemeldete Google-Nutzer). In den bestehenden Script Properties **MULTI_USER_MODE = true** ergänzen. **OWNER_EMAIL**, die Ressourcen-IDs und die Integritätsprüfsumme der bisherigen Akte beibehalten. Diese globale Eigentümeradresse kennzeichnet nur die bestehende Akte: Alle anderen Konten verwenden eigene Google UserProperties und eigene private Dateien. Fehlende/widersprüchliche Identität wird weiterhin abgewiesen. Die bestehenden Ressourcen niemals als Standard für andere Nutzer verwenden. `setupOwner` nicht für einen Datenreset verwenden.

Sobald Cloudflare bereitsteht, im GitHub-Repository unter **Settings → Secrets and variables → Actions → Variables** die öffentliche Variable **AUTH_ORIGIN** mit Wert **https://auth.jurodak.com** anlegen. Den Pages-Workflow auf `main` manuell starten. Erst dieser Build aktiviert die Anmeldeseite und den Sitzungsadapter. `public/config.json` im Repository bleibt bis dahin ohne `authOrigin`; der bestehende Zugang bleibt nutzbar. Rückkehr zum bisherigen Adapter: Variable löschen und den Workflow erneut starten. Cloudflare-Sitzungen müssen bei Bedarf separat abgemeldet/gelöscht werden; das Umschalten der Oberfläche widerruft keine bestehende Sitzung.

## 8. Tagesprüfung für alle Konten einrichten

Ein API-Aufruf darf laut Google keine Apps-Script-Trigger erstellen. Deshalb gibt es für getrennte Konten einen zusätzlichen kleinen **Cloudflare Cron Worker**, statt fremden Nutzern Editorzugriff auf dein Script zu geben.

1. In Cloudflare unter Workers & Pages einen Worker **fahrzeugakte-tagespruefung** erstellen. Im Codeeditor den vollständigen gebauten Inhalt von **auth/scheduler-dist/scheduler.js** übernehmen und bereitstellen.
2. Dieselbe D1-Datenbank als **DB** anbinden. Die öffentlichen Variablen und die zwei Secrets aus Schritt 5 auch für diesen Worker hinterlegen; ACCOUNT_MODE muss ebenfalls **multi** sein. Secrets nicht in den Quelltext kopieren.
3. Unter **Settings → Triggers → Cron Triggers** einen Trigger **jede Minute** einrichten. Der Worker verarbeitet pro Aufruf höchstens ein fälliges Konto; der nächste reguläre Kontolauf wird auf 08 Uhr Europe/Berlin geplant. Bei vielen Konten verschiebt sich das Zeitfenster entsprechend. Netzwerk-/Google-Fehler werden später erneut versucht, eine abgebrochene Verarbeitung nach Ablauf einer neunminütigen Lease. Kein minutengenaues Mailversprechen.
4. Google-Freigaben müssen für Hintergrundzugriff gültig bleiben. Der Worker führt die vorhandene tägliche Prüfung mit dem jeweiligen Google-Token aus: nur dessen MailApp, Tabelle und Ordner. Ohne aktivierte Mail-Einstellung und passende Regeln keine Erinnerung. Sichere Verarbeitung auch nach Abmelden; Abmelden beendet die Browser-Sitzung, nicht den ausdrücklich eingerichteten Hintergrunddienst. Google-Zugriff widerrufen beendet auch diesen.
5. In der App unter Einstellungen werden letzter Google-Prüflauf und Cloudflare-Status pro Konto angezeigt. Ein bereits vorhandener Eigentümer-Editortrigger kann zunächst bestehen bleiben; die Versandprotokolle verhindern doppelte Erinnerungen. Nach bestätigtem Cloudflare-Lauf kann der alte Trigger bewusst entfernt werden, um doppelte Sicherungsläufe zu vermeiden.

Die optionale CLI-Vorlage liegt in **auth/scheduler.example.toml**; Kopie in auth/scheduler-dist enthält noch eine Platzhalter-Datenbank-ID. Der HTTP-Endpunkt des Cron Workers liefert immer 404 und erlaubt keine Tagesprüfung per öffentlichem Link. Vor Echtbetrieb Free-CPU-/Cron-Limits prüfen. Es wurde noch kein Worker/Trigger im Nutzerkonto eingerichtet.

## 9. Echte Abnahme und später Dauerbetrieb

1. `car.jurodak.com` neu laden: zunächst Anmeldeseite. **Auf diesem Gerät angemeldet bleiben** aktivieren und **Mit Google anmelden** anklicken. Popup erlauben, eigenes Google-Konto auswählen und benötigte Zugriffe freigeben.
2. Akte öffnen und den Lese-/Schreibtest durchführen. Seite mehrfach neu laden und Browser schließen/öffnen: dieselbe Akte muss ohne erneuten Google-Klick erscheinen.
3. Ein Beispieldokument hochladen, öffnen und herunterladen. Auch die unterstützte 4-MiB-Dateigrenze testen. Cloudflare-Funktionsmetriken auf CPU-Limits/Fehler prüfen. Kostenloser Tarif hat derzeit 10 ms CPU-Zeit pro Aufruf; Netzwerkwartezeit ist etwas anderes. Die Streaming-Weiterleitung vermeidet einen großen zusätzlichen JSON-Parse im Worker. Lokale Tests ersetzen keine Messung im echten Cloudflare-Tarif.
4. Abmelden: Anmeldeseite, und ein Reload darf keinen Zugang wiederherstellen. Privates/anderes Browserfenster muss separat angemeldet werden. Ein zweites verifiziertes Google-Konto muss eine leere Akte mit „Fahrzeug hinzufügen“ erhalten. Ein anderes Modell anlegen, eigene Kosten und ein eigenes Dokument speichern. Wechsel zurück zum ersten Konto: ausschließlich die ursprünglichen Daten. Direkte fremde Datei-/Wiederherstellungskennungen und ein fremder CSRF-Wert müssen abgewiesen werden.
5. Bestehende Erinnerungen, Originale, Export und Sicherung müssen weiterhin funktionieren. Keine Mail ohne ausdrücklichen Test auslösen.

Google steht zunächst weiterhin auf **Testing**. Für unsere fünf Scopes laufen in diesem Modus Refresh Tokens nach sieben Tagen ab. Nach erfolgreicher Abnahme den Veröffentlichungsstatus unter **Audience/Zielgruppe** passend für den persönlichen Dauerbetrieb auf **In production** umstellen, danach einmal neu anmelden, um eine neue Freigabe zu erhalten. **Production macht die privaten Tabellen nicht öffentlich**: Jede Ressource bleibt an das ausführende Google-Konto gebunden. Für alleinige Nutzung/kleinen persönlich bekannten Nutzerkreis beschreibt Google eine Ausnahme von der Verifizierung; ein Unverified-App-Hinweis kann trotzdem bleiben. Für eine allgemein öffentlich angebotene App müssen Googles Anforderungen für die verwendeten sensiblen/eingeschränkten Drive-Scopes erfüllt werden; die Ausnahme für persönliche Nutzung nicht als Freigabe für beliebige öffentliche Nutzung darstellen. Im Testmodus jedes weitere Testkonto ausdrücklich hinzufügen. Eine Google-Verifizierung oder ein erfolgreicher zweiter echter Kontotest ist bislang nicht nachgewiesen.

Mit Merkfunktion gilt eine Sitzung höchstens 30 Tage ab Anmeldung, ohne Merkfunktion serverseitig höchstens zwölf Stunden und ohne dauerhafte Cookie-Laufzeit. Google kann Freigaben vorher widerrufen oder erneute Autorisierung verlangen. Browser-Cookies müssen erlaubt sein. Kein Versprechen einer unbegrenzten Anmeldung.

## Was Cloudflare zusätzlich verarbeitet

Die strukturierte Akte bleibt in Google Sheets, Originale und Sicherungen in Google Drive. Cloudflare speichert die Eigentümeradresse/Google-Kennung, verschlüsselte Google-Zugriffsschlüssel und Sitzungsdaten in D1; der Verschlüsselungsschlüssel liegt getrennt als Cloudflare-Secret. Zusätzlich laufen Lese-/Schreibanfragen und Dateiübertragungen auf dem Weg zu Google durch die Cloudflare Function. Das ist ein zusätzlicher Datenverarbeiter, keine direkte Browser-zu-Google-Verbindung mehr. Dateien werden dort vom Programm nicht dauerhaft abgelegt oder protokolliert. Betreiberzugriff auf das Cloudflare-Konto kann trotzdem Zugriff auf Secrets und laufende Verarbeitung geben.

Der Browser erhält nur einen Host-Cookie mit Secure, HttpOnly und SameSite=Lax sowie einen CSRF-Wert im Arbeitsspeicher. Keine Google-Tokens in Local/Session Storage, URLs, Frontend oder Repository. Serverseitig feste Google-Endpunkte/Deployment-ID, feste Aktionsliste, exakte App-Origin, browsergebundener einmaliger OAuth-State, PKCE-S256, verifizierte Google-Kennung, kontoabhängige Tokens und zusätzliche Apps-Script-Prüfung der ausführenden Identität und des Dateieigentümers. Keine Wiederholung von Schreibzugriffen nach unklaren Antworten; vorhandene operation_id-Logik bleibt zuständig.

## Offizielle Grundlagen

- [Cloudflare Pages Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)
- [Pages mit GitHub verbinden](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [D1 und Secrets an Pages anbinden](https://developers.cloudflare.com/pages/functions/bindings/)
- [Subdomain bei externem DNS verbinden](https://developers.cloudflare.com/pages/configuration/custom-domains/#add-a-custom-subdomain)
- [Workers-Free-Kontingente](https://developers.cloudflare.com/workers/platform/pricing/) und [D1-Preise](https://developers.cloudflare.com/d1/platform/pricing/)
- [Google-Serveranmeldung und Token-Erneuerung](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google: Token-Ablauf im Testmodus](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Google: persönliche Nutzung und Verifizierung](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification#exceptions-verification-requirements)

Zusätzliche Grundlagen: [Google UserProperties](https://developers.google.com/apps-script/guides/properties), [API-Zugriff ANYONE](https://developers.google.com/apps-script/manifest/web-app-api-executable), [Apps-Script-API ohne Triggererstellung](https://developers.google.com/apps-script/api/how-tos/execute#limitations), [Cloudflare-Laufzeitgrenzen](https://developers.cloudflare.com/workers/platform/limits/).

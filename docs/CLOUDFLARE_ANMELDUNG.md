# Angemeldet bleiben: Einrichtung in kleinen Schritten

Entscheidung des Nutzers am 18.10.2026: kostenloses Cloudflare-Hosting für den Anmeldedienst, Domain und DNS weiterhin bei IONOS. Kein kostenpflichtiges IONOS-Webhosting bestellen. Noch kein Cloudflare-Konto vorhanden. Der neue Code ist vorbereitet; eine echte Cloudflare-/Google-Anmeldung und die Cloudflare-Laufzeitgrenzen sind noch nicht live geprüft. Die öffentliche Website bleibt bis zur bewussten Aktivierung beim funktionierenden bisherigen Google-Adapter.

## 1. Domain erhalten und Konto anlegen

Das vom Nutzer gezeigte IONOS-Angebot verlängert ausschließlich `jurodak.com`: 14,42 € für zwölf Monate im Voraus, rechnerisch rund 1,20 €/Monat; danach laut Anzeige 2 €/Monat. Das ist mit dieser Architektur vereinbar. Maßgeblich ist die abschließende Bestellzusammenfassung. Domain nicht löschen oder zur Freigabe kündigen. Keine Werbe-/Mail-Zusatzprodukte für die Fahrzeugakte erforderlich.

Unter https://dash.cloudflare.com/sign-up ein Konto anlegen und E-Mail bestätigen. Kostenlosen Tarif verwenden. Die gesamte Domain muss weder zu Cloudflare umgezogen noch als DNS-Zone hinzugefügt werden. Nur `auth.jurodak.com` wird später per CNAME verbunden. `car.jurodak.com`, die Hauptdomain und bestehende Mail-DNS-Einträge bleiben bestehen.

## 2. Anmeldeprojekt mit GitHub verbinden

In Cloudflare **Workers & Pages → Create application → Pages → Import/Connect an existing Git repository** öffnen. Bei GitHub nur das Repository `julianrdk/scala-fahrzeugakte` freigeben. Projektname beispielsweise **scala-anmeldung**, Produktionsbranch **main**, Framework **None**.

| Einstellung | Wert |
| --- | --- |
| Root directory | Projektwurzel, leer lassen |
| Build command | `npm run build:auth` |
| Build output directory | `auth/dist` |
| Build variable `NODE_VERSION` | `24` |
| Build variable `PNPM_VERSION` | `11.25.0` |

Nur der zusätzliche Anmeldedienst wird hier gebaut; die Fahrzeugoberfläche bleibt bei GitHub Pages. Die konkreten Menünamen können sich ändern. `_worker.js` ist eine Pages Function im Advanced Mode; kein reiner Dateiupload und kein kostenpflichtiger Worker-Tarif erforderlich. Der erste Build kann schon erfolgreich sein, bevor die Kontoeinstellungen vollständig sind; das bestätigt noch keinen Login.

## 3. Private D1-Datenbank anlegen

Cloudflare **Storage & Databases → D1 → Create database**: Name **scala-anmeldung**. In der SQL-Konsole den Inhalt von `auth/schema.sql` ausführen. Die drei Tabellen heißen `oauth_requests`, `credentials`, `sessions`. Falls die Konsole nur einzelne Befehle annimmt, die mit Semikolon abgeschlossenen Anweisungen nacheinander ausführen. Es werden keine Fahrzeugdaten oder Belege dorthin kopiert.

Im Pages-Projekt **Settings → Bindings → Add → D1 database** die Datenbank als Binding **DB** anbinden, für **Production**. Keine Vorschauumgebung mit produktiven Secrets/Datenbank ausstatten. Nach Änderungen erneut bereitstellen.

## 4. Google-Client ergänzen

Im **bisherigen Standard-Google-Cloud-Projekt** unter **Google Auth Platform → Clients** den bestehenden Web-Client öffnen. JavaScript-Origin `https://car.jurodak.com` beibehalten. Als autorisierten Weiterleitungs-URI exakt ergänzen:

```text
https://auth.jurodak.com/callback
```

Speichern. Das Client-Secret ausschließlich aus dieser Google-Seite in das Cloudflare-Secret aus Schritt 5 übernehmen. Nicht in den Chat, in GitHub oder in die öffentliche `config.json` eintragen. Keine Service Accounts oder neue Google-Datenspeicher anlegen.

## 5. Cloudflare-Werte und Secrets hinterlegen

Im Pages-Projekt **Settings → Variables and Secrets** für **Production** die Werte aus `auth/config.example.json` übernehmen. Die vier öffentlichen Variablen sind bereits ausgefüllt. **OWNER_EMAIL**, **GOOGLE_CLIENT_SECRET** und **TOKEN_KEY** als verschlüsselte **Secrets** hinterlegen.

- `OWNER_EMAIL`: exakt dieselbe Eigentümeradresse wie in den bestehenden Apps-Script-Einstellungen.
- `GOOGLE_CLIENT_SECRET`: direkt aus Google übernehmen.
- `TOKEN_KEY`: Inhalt der lokalen, von Git ausgeschlossenen Datei `config/private-auth-key.txt`. Falls noch nicht erzeugt, lokal `node scripts/generate-auth-key.mjs` ausführen. Das Programm schreibt den Schlüssel nur in diese Datei und gibt ihn nicht aus. Die Datei nicht hochladen oder teilen. Erzeugung überschreibt keinen vorhandenen Schlüssel.

Nach Speichern von Binding/Variablen/Secrets erneut bereitstellen. Diese Angaben niemals als Build-Ausgabe ausgeben. Keine bezahlte Tarifumstellung notwendig. Bei ausgeschöpftem kostenlosen Kontingent schlägt der Dienst fehl; es erfolgt kein automatischer Tarifwechsel durch diesen Code.

## 6. Nur die Anmelde-Subdomain verbinden

Im Pages-Projekt unter **Custom domains → Set up a custom domain** die Adresse **auth.jurodak.com** hinzufügen. Cloudflare zeigt das tatsächliche Ziel, etwa `scala-anmeldung.pages.dev`. Dieses Ziel vorher ablesen; der Projektname kann bereits vergeben sein.

Bei IONOS für **auth** einen CNAME auf dieses tatsächlich angezeigte `*.pages.dev`-Ziel setzen. Nicht den vorhandenen **car**-Eintrag ändern. Keine Nameserver- oder MX-Umstellung. Zertifikatsbereitstellung abwarten. `https://auth.jurodak.com/` muss mit gültigem HTTPS eine kurze JSON-Antwort mit `Scala Anmeldung` liefern. `/session` direkt in der Adresszeile ist kein Kontotest: Ohne App-Origin wird der Zugriff absichtlich abgewiesen. Produktionsaufrufe über `*.pages.dev`/Previewhosts werden ebenfalls abgewiesen.

## 7. Bestehendes Google-Backend aktualisieren und erst dann aktivieren

Der Streaming-Aufruf übermittelt das Argument an `scalaApi` als JSON-String. Dafür ist das neu gebaute `apps-script/dist/Code.js` erforderlich. Den vollständigen Inhalt wie bisher in `Code.gs` übernehmen und speichern. **Bestehende Bereitstellung → Bearbeiten → Neue Version → Bereitstellen** verwenden; die bisherige Deployment-ID behalten. Das Manifest, die Akte, die Eigentümerprüfung, die Ressourcen-IDs und die Integritätsprüfsumme bleiben erhalten. `setupOwner` nicht für einen Datenreset verwenden.

Sobald Cloudflare bereitsteht, im GitHub-Repository unter **Settings → Secrets and variables → Actions → Variables** die öffentliche Variable **AUTH_ORIGIN** mit Wert **https://auth.jurodak.com** anlegen. Den Pages-Workflow auf `main` manuell starten. Erst dieser Build aktiviert die Anmeldeseite und den Sitzungsadapter. `public/config.json` im Repository bleibt bis dahin ohne `authOrigin`; der bestehende Zugang bleibt nutzbar. Rückkehr zum bisherigen Adapter: Variable löschen und den Workflow erneut starten. Cloudflare-Sitzungen müssen bei Bedarf separat abgemeldet/gelöscht werden; das Umschalten der Oberfläche widerruft keine bestehende Sitzung.

## 8. Echte Abnahme und später Dauerbetrieb

1. `car.jurodak.com` neu laden: zunächst Anmeldeseite. **Auf diesem Gerät angemeldet bleiben** aktivieren und **Mit Google anmelden** anklicken. Popup erlauben, Eigentümerkonto auswählen und benötigte Zugriffe freigeben.
2. Akte öffnen und den Lese-/Schreibtest durchführen. Seite mehrfach neu laden und Browser schließen/öffnen: dieselbe Akte muss ohne erneuten Google-Klick erscheinen.
3. Ein Beispieldokument hochladen, öffnen und herunterladen. Auch die unterstützte 4-MiB-Dateigrenze testen. Cloudflare-Funktionsmetriken auf CPU-Limits/Fehler prüfen. Kostenloser Tarif hat derzeit 10 ms CPU-Zeit pro Aufruf; Netzwerkwartezeit ist etwas anderes. Die Streaming-Weiterleitung vermeidet einen großen zusätzlichen JSON-Parse im Worker. Lokale Tests ersetzen keine Messung im echten Cloudflare-Tarif.
4. Abmelden: Anmeldeseite, und ein Reload darf keinen Zugang wiederherstellen. Privates/anderes Browserfenster muss separat angemeldet werden. Fremdes Konto muss abgewiesen werden.
5. Bestehende Erinnerungen, Originale, Export und Sicherung müssen weiterhin funktionieren. Keine Mail ohne ausdrücklichen Test auslösen.

Google steht zunächst weiterhin auf **Testing**. Für unsere fünf Scopes laufen in diesem Modus Refresh Tokens nach sieben Tagen ab. Nach erfolgreicher Abnahme den Veröffentlichungsstatus unter **Audience/Zielgruppe** passend für den persönlichen Dauerbetrieb auf **In production** umstellen, danach einmal neu anmelden, um eine neue Freigabe zu erhalten. **Production macht die private Tabelle nicht öffentlich**: Die Eigentümerprüfung bleibt wirksam. Für persönliche Nutzung beschreibt Google eine Ausnahme von der Verifizierung; ein Unverified-App-Hinweis kann trotzdem bleiben. Bei einer verlangten Prüfung erst den tatsächlichen Wortlaut prüfen, nichts als verifiziert ausgeben.

Mit Merkfunktion gilt eine Sitzung höchstens 30 Tage ab Anmeldung, ohne Merkfunktion serverseitig höchstens zwölf Stunden und ohne dauerhafte Cookie-Laufzeit. Google kann Freigaben vorher widerrufen oder erneute Autorisierung verlangen. Browser-Cookies müssen erlaubt sein. Kein Versprechen einer unbegrenzten Anmeldung.

## Was Cloudflare zusätzlich verarbeitet

Die strukturierte Akte bleibt in Google Sheets, Originale und Sicherungen in Google Drive. Cloudflare speichert die Eigentümeradresse/Google-Kennung, verschlüsselte Google-Zugriffsschlüssel und Sitzungsdaten in D1; der Verschlüsselungsschlüssel liegt getrennt als Cloudflare-Secret. Zusätzlich laufen Lese-/Schreibanfragen und Dateiübertragungen auf dem Weg zu Google durch die Cloudflare Function. Das ist ein zusätzlicher Datenverarbeiter, keine direkte Browser-zu-Google-Verbindung mehr. Dateien werden dort vom Programm nicht dauerhaft abgelegt oder protokolliert. Betreiberzugriff auf das Cloudflare-Konto kann trotzdem Zugriff auf Secrets und laufende Verarbeitung geben.

Der Browser erhält nur einen Host-Cookie mit Secure, HttpOnly und SameSite=Lax sowie einen CSRF-Wert im Arbeitsspeicher. Keine Google-Tokens in Local/Session Storage, URLs, Frontend oder Repository. Serverseitig feste Google-Endpunkte/Deployment-ID, feste Aktionsliste, exakte App-Origin, browsergebundener einmaliger OAuth-State, PKCE-S256, verifizierte Eigentümeradresse und zusätzliche bestehende Apps-Script-Eigentümerprüfung. Keine Wiederholung von Schreibzugriffen nach unklaren Antworten; vorhandene operation_id-Logik bleibt zuständig.

## Offizielle Grundlagen

- [Cloudflare Pages Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)
- [Pages mit GitHub verbinden](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [D1 und Secrets an Pages anbinden](https://developers.cloudflare.com/pages/functions/bindings/)
- [Subdomain bei externem DNS verbinden](https://developers.cloudflare.com/pages/configuration/custom-domains/#add-a-custom-subdomain)
- [Workers-Free-Kontingente](https://developers.cloudflare.com/workers/platform/pricing/) und [D1-Preise](https://developers.cloudflare.com/d1/platform/pricing/)
- [Google-Serveranmeldung und Token-Erneuerung](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google: Token-Ablauf im Testmodus](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Google: persönliche Nutzung und Verifizierung](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification#exceptions-verification-requirements)

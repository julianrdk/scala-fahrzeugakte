# Dein Einrichtungsstand

Bestätigtes Ziel: **https://car.jurodak.com**. Die Hauptdomain **jurodak.com** existiert bereits und wird nicht verändert. Das neue GitHub-Repository wurde vom Nutzer angelegt: **https://github.com/julianrdk/scala-fahrzeugakte**.

Schon vorbereitet:

- `public/CNAME` = `car.jurodak.com`
- `public/config.json` mit passender Origin, öffentlicher Client-ID und übernommener API-executable-Deployment-ID
- `config/script-properties.example.json` mit derselben Origin; Eigentümerkonto und eigene Mailadresse noch offen
- Pages-Workflow mit separater Prüfung vor Deployment
- GitHub-Ziel geprüft: `julianrdk/scala-fahrzeugakte`; GitHub-Pages-Host für den DNS-CNAME: `julianrdk.github.io`

Bestätigt am 18. Oktober 2026:

- Code auf `main` hochgeladen, Commit `4b5dd60`; [GitHub-Actions-Prüflauf](https://github.com/julianrdk/scala-fahrzeugakte/actions/runs/39076825672) erfolgreich
- Nutzer hat GitHub Pages als Veröffentlichung über **GitHub Actions** ausgewählt
- Nutzer hat die Domain gespeichert; DNS-CNAME `car.jurodak.com` → `julianrdk.github.io` beim autoritativen IONOS-Nameserver sowie über Cloudflare und Google DNS geprüft
- Nutzer hat das Google-Cloud-Projekt erstellt; tatsächliche Projekt-ID und Projektnummer noch nicht erfasst
- Nutzer hat die **Google Apps Script API**, **Google Sheets API** und **Google Drive API** im Projekt aktiviert
- Nutzer hat die App in **Google Auth Platform → Branding** angelegt
- Nutzer hat das eigene Google-Konto als Testnutzer gespeichert
- Nutzer hat die fünf angeforderten OAuth-Bereiche gespeichert
- Nutzer hat den OAuth-Web-Client erstellt und die öffentliche Client-ID übermittelt; diese ist in `public/config.json` eingetragen
- Nutzer hat das eigenständige Apps-Script-Projekt **Scala Fahrzeugakte Backend** angelegt
- Nutzer hat das Apps-Script-Projekt mit dem vorhandenen Standard-Cloud-Projekt verbunden
- Nutzer hat nach der Anleitung für Code, Manifest, Script Properties, Setup und Bereitstellung die Deployment-ID übermittelt; diese ist in `public/config.json` eingetragen
- GitHub-Pages-Custom-domain `car.jurodak.com` und Build-Typ **workflow** über die GitHub-API bestätigt
- Die drei öffentlichen Repository-Variablen `PAGES_DOMAIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_DEPLOYMENT_ID` gesetzt und zurückgelesen; lokale Release-Konfiguration und Build erfolgreich geprüft
- [Erster vollständiger Actions-Lauf](https://github.com/julianrdk/scala-fahrzeugakte/actions/runs/39079721374): Build einschließlich `pnpm check` und Pages-Deploy erfolgreich, Commit `5624f59`
- Öffentliche Konfiguration unter `http://car.jurodak.com/config.json` abgerufen; Origin, Client-ID und Deployment-ID stimmen mit der lokalen Konfiguration überein
- Gültiges HTTPS mit regulärer Zertifikatsprüfung und passender Live-Konfiguration bestätigt. GitHub meldet Zertifikat **approved**; **Enforce HTTPS** wurde aktiviert und über die API als `true` zurückgelesen. Ein unmittelbar folgender HTTP-Abruf lieferte noch eine zwischengespeicherte 200-Antwort; die Weiterleitung am Edge ist noch nicht separat bestätigt.
- Nutzer meldet beim ersten Lese-/Schreibtest einen Integritätsfehler; Anmeldung zuvor erfolgreich, keine eigenen Tabellenänderungen. Cache-Fehler im bisherigen Backend reproduziert und korrigiert; alle 76 Tests und Build erfolgreich. Aktualisierter Code liegt in `apps-script/dist/Code.js` bereit.

Noch nicht bestätigt oder eingerichtet:

- Autorisierte Domain `jurodak.com` im OAuth-Branding ergänzen; Origin und gespeicherte Scopes beim echten Verbindungstest prüfen
- Echter API-Aufruf zur Bestätigung des bereitgestellten Codes und der privaten Script-Konfiguration
- Eigentümeradresse, private Tabellen/Ordner und täglicher Editortrigger
- Echter Lese-/Schreibtest und ausdrücklich angeforderte Testmail

Nächster Schritt: aktualisierten Inhalt von `apps-script/dist/Code.js` in das vorhandene `Code.gs` übernehmen, speichern und unter **Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Version: Neue Version** das bestehende API-Deployment aktualisieren. Die Deployment-ID bleibt erhalten. Bestehende Tabelle und Properties weiterverwenden, danach den echten Lese-/Schreibtest erneut ausführen. Details stehen in [WEITER_HIER.md](WEITER_HIER.md). Autorisierte Domain `jurodak.com` im OAuth-Branding ergänzen, falls noch offen. Das Client-Secret bleibt privat. Veröffentlichungsstatus zunächst **Testing** lassen.

Eine erfolgreiche lokale Konfigurationsprüfung ersetzt weder den GitHub-Deploy noch den echten Google-Verbindungstest. Die Veröffentlichung wird erst nach bestätigtem Pages-Deploy als erledigt vermerkt. Bestehende Einträge der Hauptdomain `jurodak.com` bleiben unverändert.

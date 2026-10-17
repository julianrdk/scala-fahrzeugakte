# Dein Einrichtungsstand

Bestätigtes Ziel: **https://car.jurodak.com**. Die Hauptdomain **jurodak.com** existiert bereits und wird nicht verändert. Das neue GitHub-Repository wurde vom Nutzer angelegt: **https://github.com/julianrdk/scala-fahrzeugakte**.

Schon vorbereitet:

- `public/CNAME` = `car.jurodak.com`
- `public/config.json` mit passender Origin und übernommener öffentlicher Client-ID; API-executable-Deployment-ID noch ausdrücklich als Platzhalter
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

Noch nicht bestätigt oder eingerichtet:

- GitHub-Pages-Zuordnung der Custom domain unabhängig geprüft
- HTTPS-Zertifikat für die Subdomain
- Autorisierte Domain `jurodak.com` im OAuth-Branding ergänzen; Origin und gespeicherte Scopes beim echten Verbindungstest prüfen
- Apps-Script-Deployment im selben Cloud-Projekt
- Eigentümeradresse, private Tabellen/Ordner und täglicher Editortrigger
- Echter Lese-/Schreibtest und ausdrücklich angeforderte Testmail

Nächster Schritt: den vorbereiteten Code und das Manifest ins bestehende Apps-Script-Projekt übernehmen, die drei privaten Script Properties setzen und **setupOwner** im Editor ausführen. Die gebündelte Anleitung ab diesem bestätigten Stand steht in [WEITER_HIER.md](WEITER_HIER.md). Das Client-Secret bleibt privat. Veröffentlichungsstatus zunächst **Testing** lassen.

Die Website ist noch nicht veröffentlicht: Der Workflow überspringt die Bereitstellung, bis Domain, OAuth-Client-ID und API-executable-Deployment-ID als Repository-Variablen vollständig vorliegen. Der bestätigte DNS-Eintrag allein ersetzt diese Einrichtung nicht. Bestehende Einträge der Hauptdomain `jurodak.com` bleiben unverändert.

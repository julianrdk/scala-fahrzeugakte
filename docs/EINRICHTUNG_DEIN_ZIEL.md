# Dein Einrichtungsstand

Bestätigtes Ziel: **https://car.jurodak.com**. Die Hauptdomain **jurodak.com** existiert bereits und wird nicht verändert. Das neue GitHub-Repository wurde vom Nutzer angelegt: **https://github.com/julianrdk/scala-fahrzeugakte**.

Schon vorbereitet:

- `public/CNAME` = `car.jurodak.com`
- `public/config.json` mit passender Origin; Client-ID und API-executable-Deployment-ID ausdrücklich als Platzhalter
- `config/script-properties.example.json` mit derselben Origin; Eigentümerkonto und eigene Mailadresse noch offen
- Pages-Workflow mit separater Prüfung vor Deployment
- GitHub-Ziel geprüft: `julianrdk/scala-fahrzeugakte`; GitHub-Pages-Host für den DNS-CNAME: `julianrdk.github.io`

Noch nicht bestätigt oder eingerichtet:

- Erster Upload und GitHub-Actions-Prüflauf
- GitHub Pages als Veröffentlichung über GitHub Actions aktivieren
- DNS-CNAME für `car` (lokale DNS-Abfrage am 18.10.2026 meldete, dass der Name nicht vorhanden ist)
- HTTPS-Zertifikat für die Subdomain
- Gemeinsames Cloud-Projekt, OAuth-Client und Apps-Script-Deployment
- Eigentümeradresse, private Tabellen/Ordner und täglicher Editortrigger
- Echter Lese-/Schreibtest und ausdrücklich angeforderte Testmail

Nächster kleiner Schritt nach dem Code-Upload: [Pages-Einstellungen des Repositories](https://github.com/julianrdk/scala-fahrzeugakte/settings/pages) öffnen. Unter **Build and deployment → Source** die Option **GitHub Actions** auswählen.

Anschließend beim Domainanbieter ausschließlich den DNS-Eintrag **`car` → CNAME → `julianrdk.github.io`** einrichten. Bestehende Einträge der Hauptdomain `jurodak.com` nicht ändern. Danach folgen das gemeinsame Google-Cloud-Projekt und die private Google-Akte. Die genaue Folge steht in [SETUP.md](../SETUP.md).

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
- Nutzer meldet denselben Fehler erneut nach eigener Aktualisierung/Bereitstellung. Die Ursache ist noch nicht bestätigt; die aktuelle Bereitstellungs-ID wurde angefragt, um einen Aufruf der alten Bereitstellung auszuschließen. Keine Prüfsumme, Tabelle oder Ressourcen-ID zurücksetzen.
- Nutzer hat dieselbe Deployment-ID erneut übermittelt; auch die veröffentlichte Website verwendet diese ID. Damit ist eine andere Bereitstellungs-ID ausgeschlossen, die zugeordnete Codeversion ist aber noch nicht bestätigt. Nächste Diagnose: `apps-script/diagnostics/Diagnose.gs` als separate Datei im bestehenden Script hinzufügen und im Editor `diagnoseOwnerRead` ausführen. Die Ausgabe zeigt alten/neuen Leser und das Ergebnis eines reinen Lesetests; Daten werden nicht verändert und keine privaten Inhalte ausgegeben.
- Echte Editor-Diagnose laut Nutzer erfolgreich: **Leser: neue Korrektur**, **Lesetest: OK**. Der gespeicherte Editorcode verwendet den neuen Leser und akzeptiert die aktuelle Tabelle einschließlich Integrität. Noch offen ist die Schreibprobe mit diesem Editorcode und damit die Abgrenzung zur über dieselbe ID veröffentlichten Codeversion.
- Nutzer bestätigt ausdrücklich: **Auch auf der Website erfolgreich**. Der echte Lese-/Schreibtest über `https://car.jurodak.com` ist nach Aktualisierung erfolgreich; der zuvor gemeldete Integritätsfehler trat bei diesem Test nicht mehr auf.
- Nutzer bestätigt **mail angekommen**: Die ausdrücklich über die Website ausgelöste Testmail ist im eigenen Postfach eingegangen. Die Triggerinstallation wurde damit noch nicht unabhängig bestätigt.
- Nutzer bestätigt auch den Belegtest: Beispieldokument über die echte Website gespeichert, geöffnet und heruntergeladen. Keine Ausgaben oder Wartungen angelegt.
- HTTP → HTTPS jetzt tatsächlich als **301** mit Ziel `https://car.jurodak.com/` geprüft. Auch der [Actions-Lauf der Backend-Korrektur](https://github.com/julianrdk/scala-fahrzeugakte/actions/runs/39081024114) ist erfolgreich abgeschlossen.
- Neue Nutzerpräferenz: Nach Neuladen und erneutem Besuch angemeldet bleiben; vorgeschaltete private Anmeldeansicht erwünscht. Die aktuelle Implementierung hält Tokens ausschließlich im Arbeitsspeicher und fordert bei jedem Verbinden `select_account` an. Eine dauerhafte Sitzung ist bisher nicht umgesetzt; dafür ist eine andere Anmeldearchitektur nötig, vorzugsweise mit serverseitiger Tokenhaltung und geschütztem Sitzungscookie. Eine Anmeldeansicht allein löst die Sitzungspersistenz nicht.
- Nutzer bestätigt, bei IONOS **nur die Domain**, kein Webhosting zu besitzen. Ein zusätzlicher Serverdienst für die dauerhafte Sitzung ist daher erforderlich; es wurde dafür noch kein Dienst eingerichtet oder Vertrag abgeschlossen.
- Nutzer entscheidet sich ausdrücklich für den kostenlosen Cloudflare-Weg. Noch kein Cloudflare-Konto; erster Schritt ist Konto anlegen und E-Mail bestätigen. Die Domain kann laut gezeigtem IONOS-Angebot für 14,42 € für zwölf Monate verlängert werden (danach laut Anzeige 2 €/Monat). Kein Webhosting-Vertrag erforderlich. Kauf/Verlängerung noch nicht vom Nutzer bestätigt.
- Optionaler Anmeldedienst unter `auth/` und Sitzungsadapter/Anmeldeansicht sind implementiert. 105 lokale Tests in sieben Dateien, TypeScript und alle drei Builds erfolgreich; keine echte Cloudflare-Verbindung behauptet. Google-Tokens verschlüsselt in D1, private Secrets bei Cloudflare, geschützter Host-Cookie und CSRF-Prüfung; Datei-/API-Anfragen werden ebenfalls durch Cloudflare geleitet. `public/config.json` bleibt ohne `authOrigin`, GitHub-Variable `AUTH_ORIGIN` noch nicht gesetzt: bisheriger Zugang bleibt aktiv. Anleitung: [CLOUDFLARE_ANMELDUNG.md](CLOUDFLARE_ANMELDUNG.md). Verschlüsselungsschlüssel lokal erzeugt, ausschließlich in ignorierter Datei `config/private-auth-key.txt`; nicht im Chat oder Repository ausgeben.

Noch nicht bestätigt oder eingerichtet:

- Autorisierte Domain `jurodak.com` im OAuth-Branding ergänzen; Origin und gespeicherte Scopes beim echten Verbindungstest prüfen
- Täglicher Editortrigger und tatsächliche tägliche Sicherung
- Retry/Konflikt, Fremdkonto-Abweisung sowie Export/Wiederherstellung und PDF-Probedruck; echter Originalupload/-download ist vom Nutzer bestätigt
- Cloudflare-Konto, Pages-Projekt, D1/Binding, Secrets, `auth.jurodak.com`, Google-Redirect und neue Apps-Script-Version; anschließend bewusste Aktivierung und echte Sitzungs-/Upload-/Free-CPU-Abnahme. Aktuelle Memory-only-Anmeldung bleibt bis dahin aktiv.

Nächster Schritt: Cloudflare-Konto erstellen und E-Mail bestätigen, anschließend Pages-Projekt aus demselben GitHub-Repository gemäß [CLOUDFLARE_ANMELDUNG.md](CLOUDFLARE_ANMELDUNG.md) anlegen. Nutzer in kleinen Schritten begleiten. Domain-/Mail-DNS beibehalten, nur die zusätzliche Auth-Subdomain verbinden. Keine Kontogeheimnisse im Chat anfordern. Danach Triggerstatus/Export/Wiederherstellung und echte Free-CPU-/Sitzungstests abschließen. Google zunächst **Testing** beibehalten; für den persönlichen Dauerbetrieb nach Abnahme den Status passend ändern, da Refresh Tokens sonst nach sieben Tagen ablaufen. Echte Wartungsregeln und globale Mailaktivierung erst nach persönlicher Bestätigung konfigurieren. Keine Tabellen, Ressourcen-IDs oder Prüfsummen zurücksetzen.

Eine erfolgreiche lokale Konfigurationsprüfung ersetzt weder den GitHub-Deploy noch den echten Google-Verbindungstest. Die Veröffentlichung wird erst nach bestätigtem Pages-Deploy als erledigt vermerkt. Bestehende Einträge der Hauptdomain `jurodak.com` bleiben unverändert.

# Konten- und Bereitstellungsprüfung, 28.10.2026

Die Verwaltungsseiten wurden geprüft. Schlüsselwerte sind nicht in dieser Dokumentation enthalten. Nach ausdrücklicher Freigabe wurden alte Zugangsdaten entfernt; Fahrzeugdaten, Dateien und DNS-Einträge wurden nicht verändert.

## Bereits passend

- **Clerk Production:** Invite-only ist aktiv; die konfigurierten Domains und Zertifikate sind bestätigt.
- **Resend:** `notify.jurodak.com` ist bestätigt. Der eine aktive Schlüssel `Fahrzeugakte` hat nur Versandzugriff für diese Domain und wurde noch nicht verwendet.
- **Cloudflare D1/R2:** Die Datenbank `fahrzeugakte-daten` enthält 21 Tabellen einschließlich der Fahrzeugtabellen. Der private R2-Bucket `fahrzeugakte-originale` ist vorhanden.
- **Cloudflare Worker:** `fahrzeugakte-tagespruefung` ist bereits mit D1 und R2 verbunden und hat einen Minutentakt. Er wird in der neuen Konfiguration weiterverwendet; es wird kein zweiter Worker erstellt.
- **Cloudflare API-Tokens:** Der alte User-Token `scala-fahrzeugakte build token` mit 27 Berechtigungen ist widerrufen. Der neue User-Token `fahrzeugakte` mit Pages- und Workers-Scripts-Bearbeitungsrechten bleibt aktiv. In der Liste der Account-eigenen Tokens gibt es keine Einträge.
- **Google OAuth:** Die Clients `Scala Fahrzeugakte Website` und `Apps Script` wurden gelöscht; beide sind 30 Tage wiederherstellbar. Google meldete zuletzt 1.934 Nutzungen für den Website-Client und 20 für den Apps-Script-Client. Es sind keine OAuth-Clients mehr in diesem Projekt vorhanden. Apps-Script-Projekt, Tabelle, Drive-Dateien und Sicherungen wurden nicht gelöscht.
- **Cloudflare Pages und Worker:** Alte Clerk-Secret-/JWT-, Resend- und Tankerkönig-Schlüssel wurden aus den Einstellungen entfernt. Google-Clientwerte, Apps-Script-Endpunkt und alter Sitzungsschlüssel waren bereits entfernt. Die neue Schlüsselversion wird erst nach manueller Eingabe in den Worker und Veröffentlichung aktiv. Nicht geheime Konfiguration, D1-/R2-Bindungen und Daten blieben bestehen.
- **GitHub Actions:** `PAGES_DOMAIN`, `CLERK_PUBLISHABLE_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `AUTOMATION_ENABLED=false` und `FLEET_RELEASE_READY=false` sind gesetzt. Die Veröffentlichungsfreigabe und die Erinnerungen bleiben damit ausgeschaltet.
- **Veraltete GitHub-Variablen:** `API_ORIGIN`, `APP_BACKEND`, `AUTH_ORIGIN` und `GOOGLE_DEPLOYMENT_ID` wurden entfernt. `GOOGLE_CLIENT_ID` war nicht vorhanden. Die verbleibenden fünf Variablen werden vom neuen Workflow benötigt.
- **Apps Script:** Für das Fahrzeugaktenprojekt ist kein Zeitplantrigger aktiv. Der eine sichtbare Google-Trigger gehört einem anderen Apps-Script-Projekt und bleibt unangetastet.

## Vor dem Wechsel noch offen

- Der Workflow benötigt das Repository-Secret `CLOUDFLARE_API_TOKEN`; es ist noch nicht angelegt. Der neue, eingeschränkte Cloudflare-Token wurde einmalig angezeigt und muss von der Nutzerin in GitHub gespeichert werden.
- Der vorhandene Worker `fahrzeugakte-tagespruefung` enthält derzeit keine Clerk-, Resend- oder Tankerkönig-Secrets. Die Nutzerin trägt dort die neuen Werte selbst ein.
- `TANKERKOENIG_API_KEY` ist weder im Worker noch in Pages gespeichert; der vorhandene Schlüssel wird von der Nutzerin in den Worker übertragen.
- Cloudflare Pages-Builds aus GitHub sind pausiert. Das Projekt verwendet noch die alte Build-Konfiguration `npm run build:auth` mit Ausgabe `auth/dist`; der neue GitHub-Workflow baut `dist` und übermittelt die fertigen Dateien mit Wrangler.
- `auth.jurodak.com` ist als Cloudflare-Pages-Domain aktiv. `car.jurodak.com` zeigt öffentlich noch auf GitHub Pages. Die Domain wird erst nach dem erfolgreichen Cloudflare-Deploy umgestellt.
- Aus den Pages-Einstellungen wurden sämtliche geheimen Provider-Schlüssel entfernt. Die alten D1-/R2-Bindungen bleiben bis zur Prüfung der neuen API erhalten.
- Das Apps-Script-Projekt und die Google-Daten bleiben als Archiv bestehen. Wegen des gelöschten OAuth-Clients können alte Apps-Script-Aufrufe eine erneute Anmeldung oder einen neu eingerichteten Client benötigen.
- In GitHub Actions gibt es noch kein Repository-Secret. Der neue Cloudflare-Tokenwert kann nicht erneut angezeigt werden; er muss von der Nutzerin als `CLOUDFLARE_API_TOKEN` gespeichert werden. Falls der angezeigte Wert nicht mehr vorliegt, ist ein weiterer eingeschränkter Token erforderlich.

## Lokale Prüfung

- `pnpm check`: 202 Tests, TypeScript-Prüfung und Produktionsbuild bestanden.
- `pnpm test:runtime`: 100, 1.000 und 3.000 Buchungen getestet; kleine Änderung jeweils ungefähr 1,8 kB Antwortdaten.
- `pnpm test:large`: Sicherungsrundlauf mit 268 MB und 960 MB Originalen bestanden; 960 MB in 48 Teilen, Laufzeit 49 Sekunden, gemessener Speicher nach Bereinigung ungefähr 300 MB.
- `git diff --check`: keine Formatfehler.
- Nach Entfernung der Google-Webkonfiguration antwortet `https://auth.jurodak.com/` weiterhin mit der erwarteten Clerk-API-Kennung.

Die Laufzeiten stammen aus lokaler Prüfung und sind keine Messung der Cloudflare-Produktion. Die neue Version wurde noch nicht veröffentlicht.

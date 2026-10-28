# Umstellung auf die bereinigte Fahrzeugakte

Die vorhandene Fahrzeugakte wird auf eine gemeinsame Cloudflare-Veröffentlichung umgestellt. Website und API werden aus demselben GitHub-Stand veröffentlicht. Datenbanken und Dateien bleiben erhalten. Alte Clerk-, Resend- und Tankerkönig-Secrets wurden auf ausdrücklichen Wunsch bereits aus Worker und Pages entfernt; bis die neuen Werte eingetragen und veröffentlicht sind, können Anmeldung, Erinnerungen und Tankstellensuche ausfallen.

## Gewählter Weg: direkt produktiv umstellen

Am 28.10.2026 wurde ausdrücklich entschieden, die zusätzliche Cloudflare-Testumgebung zu überspringen. Die folgenden Einrichtungsschritte werden deshalb direkt für die bestehende Produktivumgebung durchgeführt. Die Staging-Anleitung am Ende bleibt eine optionale Vorlage.

Reihenfolge: vorhandene Akte sichern, vorbereitete Einrichtung prüfen, die neuen Schlüssel selbst in Cloudflare und GitHub hinterlegen und danach den geprüften Stand veröffentlichen. Der bestehende Worker `fahrzeugakte-tagespruefung` wird weiterverwendet und übernimmt künftig API und Zeitplan. Es wird kein zweiter Worker angelegt. `FLEET_RELEASE_READY` und `AUTOMATION_ENABLED` bleiben bis zur erfolgreichen Einrichtung `false`.

## Vor dem ersten Push

1. Öffne Cloudflare → **Workers & Pages → scala-fahrzeugakte → Settings → Builds**. Deaktiviere die bisherige automatische Veröffentlichung aus GitHub. Sie verwendet noch `npm run build:auth` und das alte Ausgabe-Verzeichnis `auth/dist`. Dieser alte Build-Befehl wird absichtlich nicht mehr angeboten; ein versehentlicher alter Build soll die laufende Version nicht ersetzen.
2. Öffne GitHub → **scala-fahrzeugakte → Settings → Secrets and variables → Actions → Variables**. Lege `FLEET_RELEASE_READY` mit `false` an. Ohne den Wert `true` veröffentlicht der neue Workflow nichts.
3. Prüfe die Änderungen in GitHub Desktop. Commit und Push starten zunächst nur die Prüfungen.

## Was anschließend wo liegt

- `car.jurodak.com`: Cloudflare Pages liefert die Website; `/api/*` wird intern an `fahrzeugakte-tagespruefung` weitergeleitet.
- `fahrzeugakte-tagespruefung`: vorhandener Worker mit der gemeinsamen API und dem minütlichen Zeitplan. Die nächste Veröffentlichung schaltet seinen öffentlichen workers.dev-Zugang ab.
- `DATA_DB`: vorhandene Datenbank `fahrzeugakte-daten`. `FILES`: vorhandener privater Bucket `fahrzeugakte-originale`.
- Clerk: Anmeldung, Einladung und Passwortverwaltung. Resend: Wartungserinnerungen.
- IONOS bleibt Domainanbieter und DNS-Verwalter. Mailbox.org bleibt für deine normalen E-Mails zuständig.

## 1. Sicherung und Datenbank vorbereiten

1. Benutze die bisherige Website während der abschließenden Umstellung nicht für neue Einträge. Schließe auch alte Tabs auf anderen Geräten.
2. Lade einen vollständigen ZIP-Export der bisherigen Akte herunter und bewahre alle Teile zusammen auf. Zusätzlich unter Cloudflare → **D1 → fahrzeugakte-daten → Time Travel** den aktuellen Wiederherstellungspunkt notieren bzw. einen SQL-Export herunterladen.
3. Die Produktionsdatenbank wurde bereits geprüft: Cloudflare zeigt 21 Tabellen, darunter die neuen Fahrzeugtabellen. Die Migration `0003-fleet.sql` ist damit schon vorhanden; führe sie nicht erneut aus und lösche keine Tabellen.

## 2. Gemeinsamen Worker vorbereiten

Im vorhandenen Worker werden folgende Werte benötigt. Öffentliche Werte stehen in `wrangler.service.jsonc`; geheime Werte gehören ausschließlich in **Settings → Variables and Secrets → Secret**. Bereits vorhandene geheime Werte können nicht aus dem Dashboard zurückgelesen werden. Ersetze sie dort direkt mit den neuen Werten, ohne sie hier oder in GitHub Variables einzutragen.

| Name                    | Art        | Wert / Herkunft                                                                    |
| ----------------------- | ---------- | ---------------------------------------------------------------------------------- |
| `APP_ORIGIN`            | öffentlich | `https://car.jurodak.com`                                                          |
| `CLERK_ISSUER`          | öffentlich | `https://clerk.jurodak.com`                                                        |
| `CLERK_PUBLISHABLE_KEY` | öffentlich | dein vorhandener `pk_live_…` aus Clerk Production                                  |
| `CLERK_SECRET_KEY`      | Secret     | Clerk Production → API Keys                                                        |
| `CLERK_JWT_KEY`         | Secret     | öffentlicher JWT-Prüfschlüssel aus Clerk; PEM mit echten Zeilenumbrüchen oder `\n` |
| `RESEND_API_KEY`        | Secret     | Resend → API keys; Sending access, auf `notify.jurodak.com` begrenzen              |
| `TANKERKOENIG_API_KEY`  | Secret     | vorhandener Tankerkönig-Schlüssel                                                  |
| `MAIL_FROM`             | öffentlich | `Fahrzeugakte <hinweise@notify.jurodak.com>`                                       |
| `AUTOMATION_ENABLED`    | öffentlich | zunächst `false`, später `true`                                                    |

Eine Rotation des Clerk-API-Secret-Schlüssels erfordert nicht automatisch einen neuen JWT-Prüfschlüssel. Der JWT-Prüfschlüssel muss zum tatsächlichen Signierschlüssel passen.

Der vorhandene Worker hat bereits die D1-Bindung `DATA_DB`, den privaten R2-Bucket `FILES` und den Minutentakt. Seine alten Clerk- und Resend-Secrets wurden entfernt; Tankerkönig war nur in Pages eingetragen und wurde dort ebenfalls entfernt. GitHub übernimmt die nächste Veröffentlichung. Keine Secrets in GitHub-Variablen oder Dateien kopieren. Trage die oben genannten neuen Schlüssel unter **Settings → Variables and Secrets → Secret** ein.

## 3. GitHub für die gemeinsame Veröffentlichung

Unter **Settings → Secrets and variables → Actions**:

| Name                    | Platz      | Wert                                                                                    |
| ----------------------- | ---------- | --------------------------------------------------------------------------------------- |
| `PAGES_DOMAIN`          | Variable   | `car.jurodak.com`                                                                       |
| `CLERK_PUBLISHABLE_KEY` | Variable   | derselbe öffentliche Production-Schlüssel                                               |
| `CLOUDFLARE_ACCOUNT_ID` | Variable   | deine Cloudflare-Konto-ID                                                               |
| `AUTOMATION_ENABLED`    | Variable   | zunächst `false`                                                                        |
| `FLEET_RELEASE_READY`   | Variable   | bis zur Freigabe `false`                                                                |
| `CLOUDFLARE_API_TOKEN`  | **Secret** | beschränktes Token zur Veröffentlichung; dieses Secret fehlt derzeit noch im Repository |

Das Cloudflare-Token auf dieses Konto beschränken und nur die für Workers Scripts und Cloudflare Pages benötigten Veröffentlichungsrechte geben. Keine DNS-, Abrechnungs- oder Benutzerverwaltungsrechte. Zusätzliche Ressourcenrechte nur ergänzen, wenn Cloudflare einen konkret erforderlichen Lesezugriff meldet.

Der Workflow verwendet keine Produktiv-Secrets bei Pull Requests oder Tests. D1-Migrationen werden nicht automatisch ausgeführt. Worker und Website stammen aus demselben geprüften Commit. `AUTOMATION_ENABLED` wird bei jeder Veröffentlichung aus der GitHub-Variable übernommen; eine ausschließlich im Dashboard geänderte Variable würde sonst später wieder überschrieben.

## 4. Pages und Domain umstellen

1. Der Pages-Service erhält die Bindung **API → fahrzeugakte-tagespruefung** aus `wrangler.pages.jsonc`. Pages benötigt danach selbst keine Clerk-, Resend-, Tankerkönig- oder Datenbankschlüssel mehr.
2. Der erste Commit auf `main` führt nur die Prüfungen aus, solange `FLEET_RELEASE_READY=false` ist. Nach eingetragenen Secrets und bestandener Prüfung wird `FLEET_RELEASE_READY=true` gesetzt und in GitHub Actions der Workflow **Prüfen und gemeinsam auf Cloudflare veröffentlichen** auf `main` manuell gestartet. Der Workflow prüft erneut und veröffentlicht erst den Worker, dann die Website.
3. Cloudflare → **Workers & Pages → scala-fahrzeugakte → Custom domains → Set up a custom domain**: `car.jurodak.com` hinzufügen. Externen DNS-Anbieter verwenden.
4. IONOS → **Domains & SSL → jurodak.com → DNS**: ausschließlich den CNAME mit Host `car` von `julianrdk.github.io` auf `scala-fahrzeugakte.pages.dev` ändern. Andere Einträge erhalten.
5. Bei Cloudflare DNS-Prüfung und Zertifikat abwarten. `https://car.jurodak.com` muss anschließend die neue Website mit gültigem Zertifikat zeigen.

Der Pages-Wechsel ersetzt den früheren API-Code. Alte Browser-Tabs mit `/v2/…` können danach nicht weiter in die alte Akte schreiben. Während DNS- und Website-Wechsel kann die alte Oberfläche vorübergehend einen Verbindungsfehler zeigen.

## 5. Akte einmalig übernehmen und abnehmen

1. Mit deinem vorhandenen Clerk-Konto anmelden. Für eine vorhandene D1-Akte erscheint **Akte sichern und umstellen**. Die App erstellt vor dem Kopieren eine datierte Sicherung in R2. Die Migration bewahrt Eintrags-IDs, Beträge, Historie und Standardfoto.
2. Bei einem neuen Konto ein Fahrzeug hinzufügen oder einen vorhandenen ZIP-Export ausdrücklich übernehmen.
3. In den Einstellungen einen aktuellen Fahrzeugexport und einen Kontoexport prüfen. Bei einer Wiederherstellung ausdrücklich zwischen einem Fahrzeug und dem gesamten Konto unterscheiden.
4. Zwei Fahrzeuge anlegen, wechseln, neu laden, Standardfoto prüfen. Auf dem zweiten Gerät dieselbe Akte öffnen. Gemeinsame Werkstätten und getrennte Ausgaben kontrollieren.
5. Eine zweite eingeladene Testperson muss ausschließlich ihre eigenen Fahrzeuge und Dateien sehen. Einladung, Passwortzurücksetzung und Sitzungsablauf mit echten Clerk-Konten prüfen.
6. Die tatsächlichen Cloudflare-CPU-Zeiten sowie D1-/R2-Kontingente kontrollieren. Lokale Laufzeiten sind keine Messung des produktiven 10-ms-CPU-Kontingents. Erst nach dieser Prüfung freigeben.

## 6. Alte Dienste stilllegen, neue Tagesprüfung aktivieren

1. Der vorhandene Minutentakt wird mit derselben Worker-Veröffentlichung auf den neuen Code umgestellt. Es gibt keinen zweiten Worker-Cron, der parallel Mails versendet. `AUTOMATION_ENABLED` bleibt bis zur erfolgreichen Funktionsprüfung `false`.
2. Danach GitHub-Variable `AUTOMATION_ENABLED=true` setzen und mit dem nächsten freigegebenen Push veröffentlichen. In der App werden nächster Termin, laufender Schritt, letzter erfolgreicher Abschluss und Fehler angezeigt. Neue Konten werden zum nächsten 08:00-Uhr-Termin in Deutschland eingeplant; angeforderte Sicherungen laufen früher.
3. Den erfolgreichen Abschluss einer echten Tagesprüfung und Sicherung kontrollieren. Eine grüne Cron-Ausführung allein reicht nicht als Nachweis für jedes Konto.
4. **Bereits erledigt:** Alte Google-Werte und geheime Clerk-, Resend- sowie Tankerkönig-Werte wurden aus Pages gelöscht; alte Clerk- und Resend-Secrets wurden aus dem vorhandenen Worker gelöscht. Das neue Setup speichert API-Secrets ausschließlich im Worker. Die alten D1-/R2-Bindungen bleiben bestehen, bis die neue Veröffentlichung und der Cache-Umzug geprüft sind.
5. Vor dem Entkoppeln der alten Datenbank `fahrzeugakte-anmeldung` die aktiven Tankstellen-Caches und Aufrufgrenzen übernehmen (siehe folgenden Abschnitt). Sie enthalten keine Fahrzeugdaten. Die alte Datenbank zunächst sichern und entkoppeln. Eine endgültige Löschung ist ein gesonderter bewusster Schritt.
6. **GitHub-Variablen bereits bereinigt:** `API_ORIGIN`, `APP_BACKEND`, `AUTH_ORIGIN` und `GOOGLE_DEPLOYMENT_ID` wurden entfernt; `GOOGLE_CLIENT_ID` war nicht vorhanden. GitHub Pages nach bestätigtem Cloudflare-Betrieb deaktivieren und dort die alte Custom Domain lösen.
7. `auth.jurodak.com` bei Cloudflare lösen und den zugehörigen CNAME bei IONOS entfernen. Clerk-, Resend- und Mailbox.org-Einträge erhalten.
8. **Google-OAuth ist bereits entfernt:** Die Clients `Scala Fahrzeugakte Website` und `Apps Script` wurden gelöscht und können innerhalb von 30 Tagen wiederhergestellt werden. Alte Apps-Script-Aufrufe können dadurch ausfallen. Das Apps-Script-Projekt, die Tabelle, Drive-Dateien und Sicherungen bleiben als Archiv erhalten. Keine anderen Google-Projekte oder Konten löschen.

## Rückweg und Kosten

Vor der Migration sichern und die alten Deployments dokumentieren. Bis zur ersten neuen Buchung kann kontrolliert auf den alten Stand zurückgegangen werden. Nach neuen Buchungen ist eine alte Website-/API-Version kein sicherer Daten-Rollback: zunächst Schreibzugriffe pausieren, aktuelle Exporte sichern und die Daten gezielt übernehmen. Alte Generationen und Originale bleiben erhalten; kein automatisches Löschen oder Zurücksetzen.

Die App begrenzt R2 auf 1 GB je Konto und 8 GB insgesamt, einschließlich Vorschauen und Sicherungen. Originale bleiben auf 4 MiB begrenzt. D1-Daten, R2-Lese-/Schreibvorgänge, Clerk und Resend haben zusätzliche Anbietergrenzen. R2 ist nutzungsabhängig abrechenbar; die App-Grenze ist keine allgemeine Kostenobergrenze. Keine automatische Tarifaufwertung ist eingebaut.

## Lokal weiterentwickeln

Node 24 und pnpm 11.25.0 verwenden: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test:runtime`.

Für eine lokale Clerk-Verbindung ausschließlich einen Clerk-Development-Schlüssel verwenden. `wrangler.local.jsonc` und `.dev.vars.local` verwenden lokale D1-/R2-Speicher; Produktionsdaten sind dort nicht eingebunden. `pnpm db:local`, anschließend `pnpm dev:api` und `pnpm dev`. Der Browser öffnet `http://127.0.0.1:5173`. `?test=1` öffnet den ausdrücklich getrennten lokalen Testmodus ohne Anbieteranmeldung.

## Tankstellen-Cache vor dem Stilllegen übernehmen

Diese Schritte führst du während der Umstellung aus, nachdem alte Browser-Tabs geschlossen sind. Wrangler muss mit deinem Cloudflare-Konto verbunden sein. Die Abfrage liest ausschließlich die beiden Cachetabellen; OAuth-Daten werden nicht exportiert.

1. Ordner test-results anlegen, sofern noch nicht vorhanden.
2. Cache und gemeinsame Aufrufgrenzen auslesen:

```powershell
pnpm exec wrangler d1 execute fahrzeugakte-anmeldung --remote --json --command "SELECT 'cache' AS kind,cache_key AS identifier,payload,expires_at AS deadline FROM fuel_cache UNION ALL SELECT 'limit',service,NULL,next_at FROM fuel_limits" > test-results/fuel-cache.json
node scripts/prepare-fuel-cache.mjs test-results/fuel-cache.json test-results/fuel-cache.sql
```

3. Die erzeugte SQL-Datei prüfen. Sie enthält nur INSERT-Anweisungen für fuel_cache und fuel_limits. Bei einer Wiederholung vorher eine neue Ausgabedatei wählen.
4. Erst nach angelegten neuen Tabellen übernehmen:

```powershell
pnpm exec wrangler d1 execute DATA_DB --config wrangler.service.jsonc --remote --file test-results/fuel-cache.sql
```

5. Die alte Tankstellensuche danach nicht mehr parallel benutzen. Die gemeinsamen Zeitgrenzen werden übernommen; neuere Zielwerte werden nicht zurückgesetzt. Exportdateien bleiben lokal und sind von Git ausgeschlossen.

## Lokale Sichtprüfung ohne echte Konten

pnpm test:browser startet http://127.0.0.1:5198/tests/browser/index.html mit synthetischen Konten und lokalem D1/R2. Mit ?owner=user_b öffnet sich ein zweites Testkonto; ?mobile zeigt einen schmalen Testrahmen. Der Testzugang ist weder im Produktions-Worker noch im ausgelieferten Website-Build enthalten.

## Getrennte Cloudflare-Testumgebung vor dem produktiven Wechsel

Diese zusätzliche Umgebung ist nach der Entscheidung vom 28.10.2026 optional. Die lokalen Tests ersetzen die Prüfung mit echten Konten und Geräten sowie die Produktionsmessungen nicht; beim direkten Wechsel erfolgen diese Prüfungen in der produktiven Umgebung. Die Vorlagen wrangler.staging.service.jsonc und wrangler.staging.pages.jsonc verwenden eigene Namen. Produktionsdaten oder Produktionsschlüssel werden hierfür nicht übernommen.

1. In Cloudflare eine zusätzliche D1-Datenbank fahrzeugakte-test-daten und einen privaten R2-Bucket fahrzeugakte-test-originale anlegen. Die neue D1-ID ausschließlich in der Staging-Vorlage eintragen.
2. In Clerk auf Development wechseln. Einladungszugang sowie E-Mail/Passwort dort ebenfalls einstellen. Den öffentlichen pk_test-Schlüssel und dessen Frontend-API-Adresse in der Staging-Vorlage eintragen. Als Website die eigene Testdomain fahrzeugakte-test.pages.dev verwenden. Production bleibt unverändert.
3. In Cloudflare ein eigenes Pages-Projekt fahrzeugakte-test anlegen, ohne unabhängigen Git-Autodeploy. Die Testvorlage verbindet es intern mit fahrzeugakte-test-service.
4. Beide SQL-Dateien auth/data-schema.sql und auth/migrations/0003-fleet.sql ausschließlich in der neuen Testdatenbank ausführen.
5. Website mit dem Testschlüssel vorbereiten. PowerShell im Projektordner:

```powershell
$env:PAGES_DOMAIN='fahrzeugakte-test.pages.dev'
$env:CLERK_PUBLISHABLE_KEY='DEIN_OEFFENTLICHER_PK_TEST_SCHLUESSEL'
node scripts/configure.mjs --ci
pnpm check
node scripts/validate-staging.mjs
pnpm exec wrangler deploy --config wrangler.staging.service.jsonc
```

6. Am Test-Worker nur eigene Development-Schlüssel für CLERK_SECRET_KEY und CLERK_JWT_KEY hinterlegen. Für tatsächliche Mailtests einen gesonderten Resend-Versandschlüssel verwenden; zunächst nur deine eigene bestätigte Testadresse benutzen. Keinen produktiven Clerk-Schlüssel, keine produktiven Dateien und keinen Tankerkönig-Schlüssel kopieren. Die Karte kann mit dem externen Link geprüft werden; die API-Fälle laufen automatisiert mit Testantworten.
7. Geprüfte Website bereitstellen:

```powershell
pnpm exec wrangler pages deploy dist --config wrangler.staging.pages.jsonc --branch main
```

8. Zwei eingeladene Development-Konten mit je zwei Fahrzeugen prüfen: Datei-/Kontentrennung, Einladung und Passwortzurücksetzung, Abmelden, paralleles Bearbeiten auf Handy/PC, Sicherung und Wiederherstellung. Für einen echten Cronlauf AUTOMATION_ENABLED nur in der Staging-Vorlage bewusst aktivieren und den Test-Worker erneut bereitstellen. CPU-Zeit unter Cloudflare → Worker → Observability prüfen. Tests beenden, falls die Grenzen des kostenlosen Tarifs überschritten werden; keine automatische Tarifumstellung.
9. Vor dem späteren Produktionsbuild die beiden lokalen PowerShell-Variablen entfernen und die Produktionskonfiguration mit den vorgesehenen GitHub-Variablen erzeugen. Testdatei public/config.json nicht versehentlich als Produktivkonfiguration übernehmen. Der produktive Workflow erzeugt seine Konfiguration selbst.

```powershell
Remove-Item Env:PAGES_DOMAIN
Remove-Item Env:CLERK_PUBLISHABLE_KEY
node scripts/configure.mjs
```

Die Testumgebung wird durch diese Dokumentation nicht angelegt oder veröffentlicht. Beim optionalen Staging-Weg bleibt die Freigabe FLEET_RELEASE_READY bis zur erfolgreichen Abnahme deaktiviert; beim gewählten direkten Weg bis zur abgeschlossenen Einrichtung der Produktivressourcen.

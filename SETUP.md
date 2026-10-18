# Einrichtung – Schritt für Schritt

Stand der technischen Quellenprüfung: 18. Oktober 2026. Zieldomain car.jurodak.com ist bestätigt; Kontokonfiguration, Veröffentlichung und Google-Verbindung stehen noch aus. Alle Platzhalter sind sichtbar. Der lokale Testadapter ersetzt keinen Verbindungstest.

## 1. Neues Repository

Nur den Inhalt dieses Ordners als neues Repository verwenden. Persönliche Handbücher/Fahrzeugnotizen aus dem übergeordneten Verzeichnis nicht aufnehmen. Auf GitHub neues leeres Repository anlegen; Name frei wählbar. GitHub Pages benötigt einen dazu passenden GitHub-Tarif bei privaten Repositories. Alternativ öffentliches Repository mit ausschließlich Quellcode und öffentlicher Konfiguration. Private Akten liegen ausschließlich bei Google.

```sh
git init -b main
git add .
git commit -m "Scala Fahrzeugakte"
git remote add origin DEINE_BEREITGESTELLTE_REPOSITORY_URL
git push -u origin main
```

Die URL ist ein Platzhalter, kein ausführbarer Beispielaccount. Für die erste Veröffentlichung werden die unten genannten Repository-Variablen benötigt. CI prüft den Code auch ohne diese Werte; Deployment wird dann übersprungen.

## 2. Eigene Subdomain, DNS und HTTPS

In Repository → Settings → Pages: Source **GitHub Actions**. Eigene Subdomain wählen, zum Beispiel das Schema `SUBDOMAIN.DEINE-DOMAIN` ohne einen fremden Beispielwert zu übernehmen. Im DNS einen CNAME dieser Subdomain auf **DEIN_GITHUB_BENUTZERNAME.github.io** setzen, ohne Repositorypfad. Keine Wildcard verwenden. Domain im GitHub-Konto verifizieren und in Pages als Custom domain speichern. Bei einer Hauptdomain statt Subdomain die aktuell dokumentierten A/AAAA/ALIAS-Werte von GitHub verwenden; keine alten IP-Werte raten.

HTTPS-Zertifikat abwarten, **Enforce HTTPS** aktivieren. Die Domainprüfung kann vor dem ersten Build konfiguriert werden; die veröffentlichte Oberfläche folgt nach Schritt 7. Vom ersten echten OAuth-Test an ausschließlich die eigene HTTPS-Domain nutzen.

[GitHub: eigene Domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## 3. Gemeinsames Standard-Google-Cloud-Projekt

In der [Cloud Console](https://console.cloud.google.com/) ein Standardprojekt anlegen oder ein geeignetes eigenes verwenden. Projekt-ID und **numerische Projektnummer** unterscheiden. Apps Script und der OAuth-Web-Client müssen diesem selben Standardprojekt zugeordnet sein. Ein automatisch von Apps Script angelegtes Standard-**Default**-Projekt genügt nicht.

In APIs & Services die **Google Apps Script API**, **Google Sheets API** und **Google Drive API** aktivieren. Der zusätzliche API-Zugriffsschalter im Apps-Script-Dashboard ist für das hier verwendete `scripts.run` nicht erforderlich; er betrifft Anwendungen, die Script-Inhalte oder Deployments verwalten. Siehe [Google: API-Autorisierung und Zugriff](https://developers.google.com/apps-script/api/how-tos/enable). Keine Service Accounts; sie werden von diesem Ausführungsweg nicht unterstützt.

## 4. Google Auth Platform / OAuth

Für ein privates Google-Konto Audience **External**. Zunächst Testing wählen und ausschließlich das eigene Konto als Testnutzer eintragen. Branding und Kontaktadresse mit den eigenen Angaben ausfüllen; autorisierte Domain ergänzen.

Web-Anwendung als OAuth-Client erstellen. Authorized JavaScript origins: exakt die eigene HTTPS-Origin ohne Pfad, z. B. `https://` plus die tatsächliche Subdomain. Kein `/#/`, kein Slash am Ende. Das verwendete GIS-Tokenmodell arbeitet mit einem Popup; hier ist keine eigene Redirect-Route implementiert. **Nur die Client-ID** wird öffentlich verwendet; kein Client-Secret ins Frontend oder Repository.

Die fünf Scopes aus `apps-script/appsscript.json` in Data Access prüfen:

| Scope (jeweils `https://www.googleapis.com/auth/…`) | Zweck |
| --- | --- |
| `userinfo.email` | Serverseitige aktive/ausführende Eigentümeridentität prüfen |
| `spreadsheets` | Akte und neue Wiederherstellungstabellen lesen und atomar schreiben |
| `drive` | Eigene private Ordner erstellen, Originale/Sicherungen kopieren und wiederherstellen |
| `script.send_mail` | MailApp-Versand und Restkontingent; kein Postfachlesen |
| `script.scriptapp` | Eigentümertrigger im Editor installieren und Status anzeigen |

**Bewusster Scope-Umfang:** `scripts.run` verlangt ein Token für **alle** vom Script verwendeten Scopes, auch wenn die einzelne Funktion nur liest. Daher enthält auch die Browserautorisierung den Drive-/Mail-/Trigger-Umfang. Es werden darüber keine Inbox-Abfragen oder allgemeinen Drive-Listen im Browser ausgeführt. `drive.file` wird ausdrücklich nicht als ausreichend behauptet: DriveApp, Ordnererzeugung, Kopien und Restore verwenden hier den breiten Drive-Scope. Wer diesen Umfang nicht freigeben möchte, sollte vor Produktivbetrieb eine getrennte Backendarchitektur entwickeln; es gibt keinen versteckten engeren Ersatz.

Testing-Autorisierungen laufen laut Google bei diesen Scopes nach sieben Tagen ab. Für einen späteren Dauerbetrieb kann eine persönlich genutzte App in Production geführt werden; persönliche Nutzung unter Googles Nutzergrenze kann ohne Verifizierung möglich sein, Warnhinweise für unverifizierte Apps können bleiben. Production bedeutet weder dauerhafte Browseranmeldung noch garantierte Triggerautorisierung. Bei Scope-/Projektänderungen oder Widerruf erneut autorisieren. Keine falsche Workspace-„Internal“-Einstellung bei einem privaten Google-Konto verwenden.

[GIS-Tokenmodell](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Audience und sieben Tage](https://support.google.com/cloud/answer/15549945), [persönliche Nutzung](https://support.google.com/cloud/answer/13464323).

## 5. Apps Script anlegen und einmalig initialisieren

1. Im eigenen Konto ein neues **Standalone**-Projekt auf [script.google.com](https://script.google.com/) erstellen, nicht als anonym ausführbare Web-App.
2. Project Settings → Google Cloud Platform project → Projektnummer aus Schritt 3 zuweisen.
3. Lokal `pnpm install --frozen-lockfile` und `pnpm build:backend` ausführen.
4. Inhalt von `apps-script/dist/Code.js` in `Code.gs` übernehmen. Manifestdatei im Editor sichtbar schalten und durch `apps-script/dist/appsscript.json` ersetzen. Advanced Service **Sheets v4** ist darin eingetragen; im Editor kontrollieren.
5. In **Script Properties** zunächst nur `OWNER_EMAIL`, `REMINDER_EMAIL` (dieselbe eigene Google-Adresse) und `APP_ORIGIN` (eigene HTTPS-Origin) eintragen. Vorlage: `config/script-properties.example.json`. Die drei Ressourcen-IDs bleiben zunächst leer; Setup erzeugt und speichert sie automatisch.
6. Im Editor Funktion **setupOwner** auswählen, Run, Google-Dialog prüfen und autorisieren. Es entstehen eine leere Tabelle und zwei private Ordner. IDs landen automatisch in Script Properties. Setup ist idempotent. Tabelle, Ordner und Script nicht mit anderen Konten teilen; geteilte Ressourcen werden abgewiesen.
7. Nach Fehlern dieselbe Setupfunktion erneut ausführen; keine zweiten Tabellen von Hand erzeugen. Bei falschen vorhandenen IDs erst deren Eigentum und Zweck prüfen.

Das Frontend bekommt keine dieser privaten E-Mail-/Ressourcenangaben. Eigene Wartungsintervalle und Fahrzeugdetails bleiben zunächst leer. Erstellte Drive-Dateien liegen unter ihrem Inhalts-Hash; beobachteter Originalname und Anzeigename bleiben in der Dokumenttabelle erhalten und der Download verwendet den Originalnamen.

## 6. API-executable bereitstellen

Deploy → New deployment → Typ **API executable**, Who has access **Only myself**. Das Manifest setzt `executionApi.access = MYSELF`. Keine Web-App-URL und kein anonymes „Execute as me“ verwenden.

Unter Manage deployments die **Deployment-ID dieses API-executable-Deployments** kopieren. Nicht mit Script-ID, Projektnummer, OAuth-Client-ID oder Web-App-URL verwechseln. Die aktuelle REST-Referenz nennt:

```text
POST https://script.googleapis.com/v1/scripts/{deploymentId}:run
Authorization: Bearer <nur im Arbeitsspeicher gehaltenes Access-Token>
Content-Type: application/json

{"function":"scalaApi","parameters":["read",{}],"devMode":false}
```

Einige ältere Beispiele nennen den Parameter noch scriptId. Diese Implementierung richtet sich ausdrücklich nach der aktuellen Deployment-ID-Referenz. Bei Codeänderung eine neue Version diesem Deployment zuweisen, damit die ID erhalten bleibt. `devMode` ist produktiv false. Top-Level-Einstiegspunkte werden im Build geprüft. Eine bloße gespeicherte Datei aktualisiert kein versioniertes Deployment.

[Ausführungsvoraussetzungen](https://developers.google.com/apps-script/api/how-tos/execute), [aktueller REST-Aufruf](https://developers.google.com/apps-script/api/reference/rest/v1/scripts/run), [MYSELF im Manifest](https://developers.google.com/apps-script/manifest/web-app-api-executable).

## 7. Frontend konfigurieren und auf eigener Domain veröffentlichen

Lokal `pnpm configure` ausführen und öffentliche Domain, Client-ID und Deployment-ID eintragen. Es entstehen passende Werte in `public/config.json` und `public/CNAME`. Für Actions zusätzlich Repository → Settings → Secrets and variables → Actions → **Variables**:

```text
PAGES_DOMAIN             = DEINE_TATSAECHLICHE_SUBDOMAIN
GOOGLE_CLIENT_ID          = DEINE_WEB_CLIENT_ID
GOOGLE_DEPLOYMENT_ID      = DEINE_API_EXECUTABLE_DEPLOYMENT_ID
```

Diese Angaben sind keine geheimen Zugangsdaten. Actions baut nur `dist/` als Pages-Artifact. Keine Eigentümeradresse, Kontosecrets, echten Belege oder privaten Exporte hinzufügen. Der Workflow deployt ausschließlich main, nach erfolgreichen Tests und mit vollständigen Variablen. `pnpm check`, Änderungen pushen, Actions-Lauf und Pages-Ergebnis prüfen. `public/CNAME` und Origin müssen zusammenpassen; `node scripts/validate-release.mjs` prüft das.

## 8. Erster echter Durchstich – zwingend vor Echtdaten

Eigene HTTPS-Domain öffnen, **Mit Google verbinden**, eigenes Konto wählen, Scopes prüfen. Einstellungen → **Lese-/Schreibtest starten**. Das Backend prüft Identität und private Ressourcen, schreibt einen einmaligen Audit-Prüfeintrag und liest ihn zurück. Erfolgsstatus muss echt bestätigt sein. Danach eine klar bezeichnete Testrechnung mit kleinem Betrag und einem Test-PDF erfassen, Download/Originalvergleich, Retry, Bearbeitung und Storno prüfen; keine echten Ausgaben erzeugen, bis dieser Weg stimmt.

In separatem Browserprofil mit anderem Google-Konto muss der API-Zugriff scheitern. Ein öffentlich sichtbares Frontend gibt allein keinen Datenzugriff. Bei fehlender aktiver Identität wird absichtlich abgewiesen. Falls dieser Effekt im eigenen Konto trotz korrektem Setup bestehen bleibt, Google-Ausführungskontext prüfen; nicht auf eine anonyme Web-App ausweichen. Das ist ein realer Einrichtungstest, den lokale Mocks nicht beweisen können.

Access Tokens bleiben im Speicher. Nach Neuladen oder Ablauf ist erneutes Verbinden nötig. Die App fordert vor Aufrufen mindestens sechs Minuten Restlaufzeit an; bei abgelaufener Anmeldung bleibt das offene Formular erhalten. Keine Daueranmeldung versprochen.

## 9. Täglicher Trigger und E-Mail

Im Editor **installOwnerTrigger** ausführen und autorisieren. Wiederholen erzeugt keinen weiteren Trigger. Ein täglicher Lauf im Zeitfenster um 08 Uhr Europe/Berlin prüft Erinnerungen und erstellt eine datierte Sicherung. Trigger werden **nicht** über `scripts.run` angelegt.

Eigene bestätigte Regel erfassen, E-Mail für diese Regel bestätigen, globale E-Mail-Einstellung aktivieren. Erst jetzt bewusst **Jetzt ausdrücklich eine Testmail senden** klicken. Inbox und Versandprotokoll prüfen. Quoten und letzter Prüfstatus stehen in Einstellungen. Bei unklarem Versandausgang wird derselbe Hinweis nicht automatisch erneut versandt. Eine Zustellung genau einmal wird nicht zugesichert.

[Installierbare Trigger](https://developers.google.com/apps-script/guides/triggers/installable), [Quoten](https://developers.google.com/apps-script/guides/services/quotas), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app).

## 10. Sicherung und persönlicher Start

Zuerst ZIP/CSV exportieren und in einer frischen Testakte wiederherstellen. Die App zeigt eine Vorschau; neue Tabelle/Ordner werden vor dem Umschalten geprüft. Anschließend echte Fahrzeugdetails und Intervalle selbst bestätigen. Den Erfassungsprompt mit `shared/import-v1.schema.json` ins ChatGPT-Projekt legen. ChatGPT-Ausgabe manuell in die App kopieren und jedes Paket prüfen. Kein automatischer Datentransfer.

Tankpreise funktionieren zunächst über einen frei wählbaren HTTPS-Link. Kein Tankerkönig-Konto/Key ist erforderlich. Eine spätere integrierte Suche muss vor Aktivierung die dann geltenden Bedingungen, Quoten und Kartenrechte prüfen; hier ist keine solche Providerverbindung implementiert.

## Fehlerhilfe

| Meldung | Prüfung |
| --- | --- |
| origin_mismatch / Popup blockiert | Eigene HTTPS-Origin exakt im Web-Client, Browser-Popup erlauben, Bibliothek laden lassen |
| 403 PERMISSION_DENIED | Gleiches Standard-Cloud-Projekt, API aktiviert, API-executable-ID und MYSELF, vollständige Scopes |
| Zugriff verweigert: Identität fehlt | Aktives und ausführendes Konto müssen beide OWNER_EMAIL entsprechen; unbekannte Identität bleibt gesperrt |
| Authorization required | Scopeänderung, Testing-Frist oder Widerruf; im Editor und Browser erneut autorisieren, Deployment aktualisieren |
| Manuelle Tabellenänderung erkannt | Keine Checksumme von Hand „reparieren“. Original sichern und BACKUP_RESTORE.md folgen |
| Keine Serverbestätigung | Derselbe festgelegte Vorgang erneut senden; nicht neu erfassen |
| Revision-Konflikt | Aktuellen Stand laden, offenen Entwurf vergleichen und Änderung gezielt erneut übernehmen |
| E-Mail bleibt aus | Globale und Regelaktivierung, Editortrigger, REMINDER_EMAIL = OWNER_EMAIL, Kontingent und LAST_ERROR prüfen |

## Nachweisblatt für die Kontoeinrichtung

- [x] Repository-URL und eigene Domain bestätigt
- [x] DNS und HTTPS aktiv
- [ ] Gemeinsames Cloud-Projekt und vollständige Scopes geprüft
- [ ] Leere private Ressourcen initialisiert; MYSELF-Deployment aktiv
- [x] Echter Lese-/Schreibdurchstich auf eigener Domain erfolgreich (vom Nutzer am 18.10.2026 bestätigt)
- [ ] Fremdes Konto abgewiesen
- [ ] Originalupload/-download, Retry und Konflikt geprüft
- [ ] Export und Restore auf realem Google-Konto geprüft
- [ ] Trigger und ausdrücklich angeforderte Testmail bestätigt

Kein Häkchen wird durch lokale Tests automatisch ersetzt.

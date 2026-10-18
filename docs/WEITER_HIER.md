# Einrichtung ab dem verbundenen Apps-Script-Projekt

**Aktueller Stand:** Der Nutzer hat ausdrücklich bestätigt, dass der Lese-/Schreibtest **auch auf der Website erfolgreich** war. Die Korrektur ist damit im echten Eigentümerkonto erfolgreich geprüft. Die bestehende Akte wurde beibehalten; es wurde keine Prüfsumme zurückgesetzt. Die Diagnosefunktionen in `apps-script/diagnostics/Diagnose.gs` bleiben als Hilfsmittel verfügbar, müssen für die normale Nutzung aber nicht erneut ausgeführt werden.

Bestätigter Stand am 18.10.2026: Repository hochgeladen, Pages-Quelle GitHub Actions und Custom domain bestätigt, DNS `car.jurodak.com` → `julianrdk.github.io` geprüft. Cloud-Projekt, drei APIs, OAuth-App, eigener Testnutzer und fünf Bereiche sind laut Nutzer eingerichtet. Das eigenständige Script **Scala Fahrzeugakte Backend** ist laut Nutzer mit dem Cloud-Projekt verbunden. Nach der Anleitung für die Schritte 1–5 wurde die Deployment-ID übermittelt. Client-ID und Deployment-ID stehen in `public/config.json`; alle drei Repository-Variablen sind gesetzt und zurückgelesen. [Build, Tests und erster Pages-Deploy](https://github.com/julianrdk/scala-fahrzeugakte/actions/runs/39079721374) waren erfolgreich. Die öffentliche Konfiguration ist über HTTP erreichbar und stimmt überein.

**Jetzt fortsetzen: Cloudflare-Pages-Projekt.** Der Nutzer bestätigt den Eingang der ausdrücklich ausgelösten Testmail und den echten Datei-Rundlauf mit dem Beispieldokument (gespeichert, geöffnet, heruntergeladen). Für die gewünschte dauerhafte Anmeldung hat er den kostenlosen Cloudflare-Weg gewählt und hat inzwischen das Cloudflare-Konto als fertig bestätigt. Code für eine neutrale Oberfläche und getrennte Konten samt Tagesprüfung und 122 lokalen Tests ist vorhanden; die neue Anmeldung ist noch nicht live. Die Schrittfolge steht in [CLOUDFLARE_ANMELDUNG.md](CLOUDFLARE_ANMELDUNG.md). Die Domain bleibt bei IONOS; das gezeigte 40-%-Verlängerungsangebot ist davon unabhängig.

Die Triggerinstallation bleibt unabhängig davon offen: Falls noch nicht erledigt, im bestehenden Google-Script im Editor **installOwnerTrigger** einmal auswählen und ausführen. In den Website-Einstellungen nach Neuladen des Serverstands den Status **Trigger: Eingerichtet** prüfen. Anschließend Sicherungs- und Wiederherstellungstests aus Abschnitt 7 abschließen.

Der erste Lese-/Schreibtest hatte einen Cache-Fehler offengelegt. Die Korrektur liest Daten und Prüfsumme gemeinsam über dieselbe Sheets-API. Alle 76 lokalen Tests, Build, GitHub-Actions-Lauf und der echte Website-Lese-/Schreibtest sind erfolgreich. Details stehen in TEST_REPORT.md.

HTTPS ist mit gültigem Zertifikat erreichbar, HTTP leitet mit 301 auf HTTPS um, die Live-Konfiguration stimmt überein und GitHub bestätigt **Enforce HTTPS = true**. Die GitHub-Variablen und der erfolgreiche Actions-Lauf aus Abschnitt 6 sind bereits erledigt. Autorisierte Domain im OAuth-Branding ergänzen, falls noch offen. Schritte 1–6 dienen als Referenz; bereits bestätigte Schritte nicht erneut durchlaufen.

**Neue Anmeldepräferenz:** Anmeldeansicht, Sitzungsadapter und Cloudflare-Dienst sind implementiert, aber noch nicht aktiviert. Aktuelle öffentliche Konfiguration bleibt beim Memory-only-Modell. Tokens werden im neuen Modell serverseitig verschlüsselt verwaltet; API-/Dateianfragen laufen ebenfalls durch Cloudflare. Für die Aktivierung erst Cloudflare-D1/Secrets/Subdomain und Google-Redirect einrichten, bestehenden Apps-Script-Code aktualisieren und danach GitHub-Variable `AUTH_ORIGIN` setzen. Domain-/Mailbetrieb nicht umziehen. Bis zum echten Kontotest keinen erfolgreichen dauerhaften Login behaupten.

## 1. Programmcode einfügen

Im lokalen Projektordner `C:\Users\micro\Documents\ChatGPT Scala\scala-fahrzeugakte` die Datei `apps-script\dist\Code.js` öffnen. Im Textinhalt Strg+A und Strg+C drücken. Im Google-Apps-Script-Projekt links den Editor und `Code.gs` öffnen, in den vorhandenen Code klicken, Strg+A und Strg+V drücken, dann Strg+S. Der vollständige gebaute Code ist ungefähr 356 KB groß. Nur den Dateiinhalt kopieren.

Die gebaute Datei wird nicht in Git verfolgt. Falls sie nach einem neuen Checkout fehlt, zunächst gemäß SETUP.md Abhängigkeiten installieren und `pnpm build:backend` ausführen. Für diesen Arbeitsplatz ist sie bereits gebaut und geprüft.

## 2. Manifest einfügen

Im Script links Zahnrad → Projekteinstellungen → Häkchen bei **Manifestdatei appsscript.json im Editor anzeigen** setzen. Zurück zum Editor; links `appsscript.json` öffnen. Den gesamten Inhalt durch den Inhalt der lokalen Datei `apps-script\dist\appsscript.json` ersetzen und speichern. Dadurch werden Zeitzone, Sheets-Dienst, die fünf Bereiche und API-Zugriff **MYSELF** konfiguriert.

## 3. Private Einstellungen

Zahnrad → Projekteinstellungen → Skripteigenschaften → Skripteigenschaft hinzufügen. Genau diese drei Werte anlegen und speichern:

| Eigenschaft | Wert |
| --- | --- |
| `OWNER_EMAIL` | Die eigene Google-Kontoadresse, mit der das Script und die privaten Dateien betrieben werden |
| `REMINDER_EMAIL` | Genau dieselbe eigene Google-Adresse |
| `APP_ORIGIN` | `https://car.jurodak.com` |

Die E-Mail-Adressen werden nur in den privaten Script-Einstellungen eingetragen. Die drei Ressourcen-IDs nicht von Hand anlegen: Sie werden beim nächsten Schritt automatisch erstellt und gespeichert.

## 4. Leere Akte erstellen

Zurück zum Editor. Oben im Funktionsmenü **setupOwner** auswählen und **Ausführen** anklicken. Im Google-Dialog das eigene Konto, den App-Namen und die angeforderten Zugriffe prüfen und autorisieren. Bei einer Warnung oder einem Fehler den genauen Text festhalten. Bei Erfolg meldet das Ausführungsprotokoll den Abschluss. In Google Drive entstehen eine Tabelle **Scala Fahrzeugakte** und die beiden privaten Ordner für Originale und Sicherungen. Bei einem Fehler dieselbe Funktion nach der Korrektur erneut ausführen; keine zweite Akte von Hand erstellen.

## 5. API bereitstellen

Erst nach erfolgreichem Setup oben **Bereitstellen → Neue Bereitstellung** wählen. Beim Zahnrad für den Bereitstellungstyp **API-ausführbare Datei / API executable** auswählen. Zugriff **Nur ich / Only myself** setzen, Beschreibung **Scala Fahrzeugakte v1**, dann bereitstellen.

Die **Bereitstellungs-ID / Deployment ID** kopieren. Diese ID braucht die App als nächstes; die Script-ID und eine Web-App-URL sind andere Angaben. Wenn Codex verfügbar ist, nur diese öffentliche Deployment-ID übermitteln. Ein Client-Secret oder Anmeldetoken wird nicht benötigt.

## 6. Domain und Veröffentlichung

In [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding) unter autorisierten Domains `jurodak.com` ergänzen und speichern. Falls Google eine Inhaberschaftsprüfung verlangt, diese erst abschließen. Im OAuth-Web-Client muss die JavaScript-Origin exakt `https://car.jurodak.com` lauten; Weiterleitungs-URIs bleiben für dieses Popup-Tokenmodell leer.

Im [GitHub-Repository](https://github.com/julianrdk/scala-fahrzeugakte) unter **Settings → Secrets and variables → Actions → Variables → New repository variable** diese drei öffentlichen Werte anlegen:

| Name | Wert |
| --- | --- |
| `PAGES_DOMAIN` | `car.jurodak.com` |
| `GOOGLE_CLIENT_ID` | `642087309179-uoqjosp5sn8sjlj038v0fqva6q96hsdk.apps.googleusercontent.com` |
| `GOOGLE_DEPLOYMENT_ID` | Die tatsächliche API-executable-Bereitstellungs-ID aus Schritt 5 |

Unter **Actions** den Workflow **Prüfen und auf eigener Domain veröffentlichen** öffnen, **Run workflow** für `main` starten. Build und Deploy müssen erfolgreich sein. Unter **Settings → Pages** muss als Custom domain `car.jurodak.com` gespeichert sein. Zertifikat abwarten und **Enforce HTTPS** aktivieren, sobald verfügbar. Nur ein erfolgreicher Deploy mit erreichbarer HTTPS-Seite bestätigt die Veröffentlichung.

Codex übernimmt bei Fortsetzung außerdem die Deployment-ID in die lokale `public/config.json`, prüft die Konfiguration und aktualisiert das ZIP. Das ist für den über die Repository-Variablen konfigurierten Actions-Build keine Voraussetzung.

## 7. Echte Verbindung prüfen

`https://car.jurodak.com` öffnen, mit dem eigenen Google-Konto verbinden und in den Einstellungen den **Lese-/Schreibtest** starten. Erst ein echter Erfolg bestätigt den Datenzugriff. Danach mit klar bezeichneten Testdaten Originalupload und Download sowie Export und Wiederherstellung prüfen; außerdem Zugriff mit einem fremden Konto ablehnen lassen. Die genauen Abnahmeschritte stehen in SETUP.md, Abschnitte 8–10.

Im Apps-Script-Editor **installOwnerTrigger** einmal ausführen, um den täglichen Prüf- und Sicherungslauf anzulegen. Für den Test des Mailversands bewusst in der App **Jetzt ausdrücklich eine Testmail senden** wählen und das eigene Postfach prüfen. Echte Wartungsintervalle und globale Mailaktivierung erst nach persönlicher Bestätigung eintragen. Im anfänglichen OAuth-Testmodus können nach sieben Tagen erneute Freigaben erforderlich sein; der spätere Dauerbetrieb wird in SETUP.md erklärt.

Google-Schreibzugriff, Deployment, Testmail und Beispieloriginal-Rundlauf sind vom Nutzer bestätigt. Echte tägliche Sicherung/Wiederherstellung, Fremdkonto-Abweisung und neue Cloudflare-Sitzungen bleiben offen und werden nicht durch lokale Tests ersetzt.

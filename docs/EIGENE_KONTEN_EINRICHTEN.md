# Eigene Konten einrichten

Der Wechsel ist lokal vorbereitet. Die bestehende Website und deine Google-Dateien bleiben zunächst erhalten. Neue Konten verwenden Clerk, Cloudflare D1 und den privaten R2-Dateispeicher. Die Einrichtung und Veröffentlichung führst du selbst durch; keine Schlüssel in den Chat oder nach GitHub kopieren.

## Reihenfolge

1. Clerk, neue D1-Datenbank, privaten R2-Speicher und Resend vorbereiten.
2. Bisherige Tagesprüfungen stoppen und einen vollständigen Google-ZIP-Export erstellen.
3. Den neuen Cloudflare-Dienst und die Website veröffentlichen.
4. Dein neues Konto öffnen, ZIP übernehmen und auf Handy sowie PC prüfen.
5. Erst danach die neue Tagesprüfung und Einladungen für Freunde freigeben.

Bis Abschnitt 6 musst du an deiner bisher veröffentlichten App nichts ändern. Beende während der Übernahme neue Eingaben im alten System. Es gibt danach keine automatische Synchronisation zwischen Google und Cloudflare.

## 1. Clerk für Anmeldung und Einladungen

1. Erstelle ein Konto bei [Clerk](https://dashboard.clerk.com/) und eine Anwendung für die Fahrzeugakte.
2. Aktiviere **E-Mail und Passwort**. Deaktiviere die Social-Provider, einschließlich Google. Telefonnummer/SMS ist nicht erforderlich.
3. Wähle **Access mode → Invite-only**. Die Einschränkung muss bei Clerk aktiv sein; ein ausgeblendeter Registrierungslink allein reicht nicht.
4. Nutze die Development-Instanz nur für lokale Tests. Für `car.jurodak.com` richte eine **Production-Instanz** ein.
5. Gib `car.jurodak.com` als Anwendungsdomain an. Übernimm die von Clerk angezeigten DNS-Einträge bei deinem DNS-Anbieter genau. **`auth.jurodak.com` bleibt der vorhandene Cloudflare-API-Dienst**; verwende diese Adresse nicht als Clerk-Frontend-API.
6. Erlaube als Anwendungsadressen `https://car.jurodak.com/`, als Anmeldung `https://car.jurodak.com/?auth=sign-in` und als Registrierung `https://car.jurodak.com/?auth=sign-up`. Nach erfolgreicher Anmeldung führt die App zu `https://car.jurodak.com/#/`.
7. Notiere für dich den **Publishable key**, **Secret key**, den **JWT Public Key** im vollständigen PEM-Format und die **Frontend API URL**. Letztere ist der fest erwartete Aussteller (`CLERK_ISSUER`).
8. Lege dein erstes Konto im Clerk-Dashboard per Einladung an. Deine Freunde lädst du später dort unter **Users → Invite user** ein. Jeder verwendet seine eigene E-Mail-Adresse und setzt sein eigenes Passwort.

Die App-Anmeldung und Passwort-zurücksetzen sind deutsch lokalisiert. Clerks außerhalb der App gehostetes Account Portal, zu dem Dashboard-Einladungen führen können, verwendet gegebenenfalls Englisch. Nach Annahme der Einladung öffnet man die Fahrzeugakte. Der kostenlose Clerk-Tarif erlaubt derzeit Sitzungen von maximal sieben Tagen; danach ist eine erneute Anmeldung erforderlich. Ein Neuladen allein startet keinen neuen Anmeldevorgang. Geräte und Browser benötigen jeweils eine eigene Anmeldung.

## 2. Privaten Dateispeicher R2 anlegen

1. Öffne [Cloudflare](https://dash.cloudflare.com/) → **Storage & databases → R2**.
2. Aktiviere R2. Cloudflare verlangt dafür eine Abrechnungsfreigabe; prüfe diesen Schritt selbst. Der Start nutzt das enthaltene kostenlose Kontingent, keine Tarifaufwertung.
3. Erstelle den Bucket **`fahrzeugakte-originale`**. Wähle bei Bedarf die angebotene europäische Region/Jurisdiktion und verwende diese Auswahl anschließend auch in den Bindungen.
4. Lasse den Bucket **privat**. Weder eine öffentliche `r2.dev`-Adresse noch eine öffentliche Bucket-Domain aktivieren.

Die App begrenzt gespeicherte Originale, Vorschauen, reservierte Uploads und Sicherungen auf 1.000.000.000 Byte pro Konto und 8.000.000.000 Byte insgesamt. Ein Grenzfall sperrt neue Uploads, löscht aber keine Originale. Nach einem Abbruch können vorsorglich reservierte oder noch nicht verknüpfte Dateien weiter zum Verbrauch zählen; wiederholte Uploads desselben Inhalts verwenden sie wieder. Sie sind in den Einstellungen unter den nicht verknüpften Uploads prüfbar. Anbieterlimits für Anfragen und Rechenzeit gelten zusätzlich; kostenloser Betrieb ist kein unbegrenztes Nutzungsversprechen.

## 3. Neue D1-Datenbank anlegen

1. Öffne **Storage & databases → D1 SQL Database → Create database**.
2. Name: **`fahrzeugakte-daten`**. Die bisherige Datenbank `fahrzeugakte-anmeldung` bleibt bestehen.
3. Öffne die neue Datenbank → **Console**.
4. Kopiere den vollständigen Inhalt von **`auth/data-schema.sql`** in die Konsole und wähle **Execute**. Keine Markdown-Zeichen mitkopieren.

Die SQL-Datei ist wiederholbar und löscht keine bestehenden Daten. Sie legt Datensätze, Kontorevisionen, Speicherreservierungen und die Warteschlange für Tagesprüfungen an. Die bisherige Anmeldedatenbank mit Tankstellen-Caches wird nicht durch dieses Schema ersetzt.

## 4. Wartungsmails vorbereiten

1. Erstelle bei [Resend](https://resend.com/) ein kostenloses Konto.
2. Füge die Versanddomain **`notify.jurodak.com`** hinzu und übernimm die angezeigten DNS-Einträge beim DNS-Anbieter. Bestehende Mailbox-/MX-Einträge deiner Hauptdomain nicht ersetzen.
3. Warte auf erfolgreiche Domainbestätigung und erstelle einen API-Schlüssel mit Sendeberechtigung für diese Domain.
4. Verwende als Absender beispielsweise **`Fahrzeugakte <hinweise@notify.jurodak.com>`**.

Einladungen und Passwortmails verschickt Clerk. Resend wird für die von dir aktivierten Wartungserinnerungen und ausdrücklich ausgelöste Testmails verwendet. Vor jedem Wartungsversand wird die aktuelle bestätigte Konto-Adresse bei Clerk geprüft. Ein unklarer Versand wird protokolliert und nicht automatisch doppelt versendet.

## 5. Bisherige Tagesprüfungen stoppen und exportieren

1. Öffne das bisherige Apps-Script-Projekt. Unter dem **Uhrsymbol / Trigger** entfernst du gegebenenfalls den Trigger für **`dailyOwnerTask`**. Die Funktion und alle Google-Dateien bleiben erhalten; bei einer Rückkehr lässt er sich mit `installOwnerTrigger` neu anlegen.
2. Falls der bisherige Cloudflare-Tagesprüfungs-Worker bereits läuft: deaktiviere dessen Cron-Zeitplan vorübergehend, bis er durch die neue Version ersetzt wird. Sichere den bisherigen Zeitplaneintrag für eine mögliche Rückkehr.
3. Öffne die bisherige Fahrzeugakte → **Fahrzeug → Einstellungen → Vollständigen Export herunterladen**.
4. Bewahre **alle** ZIP-Teile gemeinsam auf. Ein Export mit `UNVOLLSTAENDIG` im Namen muss zuerst vervollständigt werden.
5. Trage ab jetzt nichts Neues mehr in der alten Akte ein, bis die Übernahme abgeschlossen ist.

Dieser Export ist die Übernahmequelle, keine Löschung. Google-Tabelle, Originalordner und bisherige Sicherungen bleiben unverändert erhalten.

## 6. Cloudflare-API konfigurieren und veröffentlichen

Öffne **Workers & Pages → bestehendes Pages-Projekt `scala-fahrzeugakte`**. Die Domain `auth.jurodak.com` bleibt dort zugeordnet.

Unter **Settings → Bindings** ergänzen:

| Name | Typ und Ziel |
| --- | --- |
| `DATA_DB` | D1 → `fahrzeugakte-daten` |
| `FILES` | R2 → `fahrzeugakte-originale` |
| `DB` | Bestehende D1-Bindung für die Tankstellen-Caches beibehalten |

Unter **Settings → Variables and Secrets**, Umgebung **Production**, setzen:

| Name | Typ | Wert |
| --- | --- | --- |
| `APP_ORIGIN` | Variable | `https://car.jurodak.com` |
| `AUTH_ORIGIN` | Variable | `https://auth.jurodak.com` |
| `AUTH_BACKEND` | Variable | `clerk` |
| `CLERK_PUBLISHABLE_KEY` | Variable | Production-Publishable-Key von Clerk, beginnt mit `pk_live_` |
| `CLERK_ISSUER` | Variable | Exakte Clerk-Frontend-API-URL mit `https://`, ohne zusätzlichen abschließenden Schrägstrich |
| `CLERK_SECRET_KEY` | **Secret** | Production-Secret-Key von Clerk |
| `CLERK_JWT_KEY` | **Secret** | Vollständiger PEM-Public-Key; echte Zeilenumbrüche sind erlaubt |
| `RESEND_API_KEY` | **Secret** | Resend-Sendeschlüssel |
| `MAIL_FROM` | Variable | `Fahrzeugakte <hinweise@notify.jurodak.com>` |
| `GOOGLE_AUTOMATION_STOPPED` | Variable | zunächst `false` |
| `TANKERKOENIG_API_KEY` | **Secret** | Bestehenden Wert beibehalten |

Die Vorlage steht in **`auth/cloudflare-config.example.json`**. Bei Clerk-Schlüsselrotation muss auch der hinterlegte JWT-Public-Key aktualisiert werden. Die normale Tokenprüfung arbeitet damit ohne zusätzlichen Netzwerkaufruf. Bereits ausgestellte Sitzungstokens können bis zu ihrem Ablauf gültig bleiben; eine sofortige Fernabmeldung wird nicht versprochen.

Die bisherigen Google-Secrets müssen noch nicht gelöscht werden. Mit `AUTH_BACKEND=clerk` werden die bisherigen Google-HTTP-Routen und der Google-Tageslauf deaktiviert. Der neue Code benötigt sie nicht.

## 7. Website auf neue Konten umstellen

Im [GitHub-Repository](https://github.com/julianrdk/scala-fahrzeugakte) → **Settings → Secrets and variables → Actions → Variables**:

| Name | Wert |
| --- | --- |
| `PAGES_DOMAIN` | `car.jurodak.com` |
| `APP_BACKEND` | `cloudflare` |
| `API_ORIGIN` | `https://auth.jurodak.com` |
| `CLERK_PUBLISHABLE_KEY` | Clerk-Production-Publishable-Key |

**Keine Secret Keys als GitHub-Variable eintragen.** Die Google-Variablen können vorläufig bestehen bleiben; der Cloudflare-Modus verwendet sie nicht. Ein Publishable-Key ist ausdrücklich öffentliche Konfiguration.

Prüfe die lokalen Änderungen in GitHub Desktop. Vorschlag für Summary: **`Eigene Konten und Cloudflare-Datenspeicher ergänzen`**. Commit und **Push origin** starten die bestehenden GitHub-Pages- und Cloudflare-Git-Bereitstellungen. Warte auf beide erfolgreichen Durchläufe. Bindungen und Secrets müssen vor dem neuen Cloudflare-Durchlauf gespeichert sein. Die Cloudflare-Buildkonfiguration bleibt beim bisherigen Projekt und erzeugt weiterhin `auth/dist`.

Für eine ausschließlich lokale Vorschau kannst du die öffentliche Beispielkonfiguration **`config/cloudflare-public.example.json`** kopieren und mit einem Clerk-Development-Key ergänzen. Diese Platzhalterkonfiguration nicht als Produktionskonfiguration veröffentlichen. Der getrennte lokale Testmodus funktioniert weiterhin ohne Clerk-Konto. Die echte Anmeldung ist erst nach deiner Kontokonfiguration prüfbar.

## 8. Daten übernehmen und prüfen

1. Öffne `https://car.jurodak.com/` und melde dich mit deinem eingeladenen Konto an.
2. Das neue Konto bietet **Akte übernehmen** und **Neu beginnen**. Für deine vorhandenen Daten wählst du **Akte übernehmen**.
3. Wähle alle ZIP-Teile deines Exports und prüfe die angezeigten Mengen.
4. Klicke **Originale kopieren und prüfen**. Daten und Dateien landen zunächst in einem getrennten Bereich; die aktive Akte wird noch nicht ersetzt. Für Bilder werden kleine Vorschauen erzeugt.
5. Erst wenn keine Originale oder Vorschauen fehlen, bestätige die Auswahl und klicke **Übernommene Akte aktivieren**.
6. Prüfe Kosten, Historie, Werkstätten, Standardfoto und einen Originaldownload. Melde dich auf dem Handy mit demselben Konto an und kontrolliere denselben Datenstand.
7. Erstelle einen neuen vollständigen Export und bewahre ihn außerhalb von Cloudflare auf.

Bei Abbruch bleiben Ursprungsdaten und die bisher aktive Akte erhalten. Wähle denselben Export erneut; der Übernahmevorgang und bereits gespeicherte Originale werden wiederverwendet. Bei Verbindungsfehlern denselben Speichervorgang wiederholen; die App bestätigt keine ungesicherten Änderungen. Änderungen auf zwei Geräten werden über Revisionen geprüft und bei Konflikten zum Vergleich abgewiesen.

## 9. Neue Tagesprüfung aktivieren

1. Verwende den gebauten Worker **`auth/scheduler-dist/scheduler.js`** und die Vorlage **`auth/cloudflare-scheduler.example.toml`** für den bestehenden Tagesprüfungs-Worker.
2. Binde dort dieselben Ressourcen als `DATA_DB` und `FILES` und hinterlege dieselben Clerk-/Resend-Variablen und Secrets. Der Scheduler benötigt keine Google-Schlüssel und keine Tankstellen-Bindung.
3. Prüfe nochmals, dass alte Google-Trigger und ein alter Google-Cronlauf gestoppt sind.
4. Setze **`GOOGLE_AUTOMATION_STOPPED=true` sowohl im API-Pages-Projekt als auch im neuen Cron-Worker** und veröffentliche beide geänderten Konfigurationen.
5. Aktiviere den in der Vorlage enthaltenen Cron-Zeitplan. Pro Aufruf wird höchstens ein fälliges Konto bearbeitet; weitere Prüfungen erfolgen täglich im Berliner Zeitfenster.
6. In der App → **Einstellungen** eine Testmail ausdrücklich auslösen und die gewünschten E-Mail-Regeln prüfen. In den Einstellungen werden letzte Prüfung, Sicherung und Fehler angezeigt.

Solange die Abschaltbestätigung fehlt, erstellt die neue Tagesprüfung Sicherungen, sendet aber keine automatischen Erinnerungsmails. Automatische Sicherungen enthalten Aktenstand und Verweise auf unveränderte private Originale im gleichen R2-Speicher. Sie schützen nicht vor Verlust des gesamten Cloudflare-Kontos; vollständige ZIPs zusätzlich extern aufbewahren.

## Geschwindigkeit und Grenzen

Der neue Einstieg lädt keine Originaldateien. Pinnwand und Galerie laden Vorschauen von maximal 640 Pixeln und 128 KiB; Originale werden erst bei Großansicht oder Download angefordert. Vorschauen werden nach bestätigter Anmeldung im Browser kontogetrennt wiederverwendet. Abmelden oder Kontowechsel verwirft diesen privaten Cache. Es entsteht dadurch keine Offline-Bearbeitung und keine Hintergrundübertragung unbestätigter Entwürfe.

Lokale Tests beweisen keine Produktionslatenz oder Cloudflare-Free-Rechenzeit. Nach der Einrichtung Öffnen, Speichern und zehn Fotos auf Handy und PC messen: **Einstellungen → Ladezeiten dieses Tabs → Messwerte aktualisieren**. Aktenstart, Vorschauen und Speichern erscheinen getrennt, die Sitzungsprüfung nur beim echten Clerk-Start. Die Messwerte enthalten keine Kontoangaben, verbleiben im Tab und werden beim Abmelden verworfen. API-Fehler, D1-/R2-Kontingente und CPU-Limits zusätzlich im Cloudflare-Dashboard kontrollieren. Der Zielwert für Aktenstart und Speichern ohne Datei liegt unter normaler Verbindung bei zwei Sekunden nach bestätigter Anmeldung; er ist vor der realen Abnahme kein zugesicherter Messwert.

Die Übernahme prüft jede Originaldatei beim Upload anhand Größe und SHA-256. R2 prüft dieselbe SHA-256 beim Schreiben. Die abschließende Aktivierung und tägliche Snapshots verwenden die bestätigten Dateinachweise; sie laden nicht alle Originale erneut herunter. Originaldateien im R2-Dashboard deshalb nicht manuell ändern oder löschen. Ein vollständiger ZIP-Export prüft die tatsächlichen heruntergeladenen Bytes erneut.

Freunde verwenden dieselbe Website mit eigenen Konten und eigenen privaten Akten. Es bleibt zunächst ein Fahrzeug pro Konto. Der verbindliche ChatGPT-JSON-Vertrag v1 und bestehende ZIP-Exporte bleiben verwendbar. Google-Dateien erst nach unabhängiger Prüfung bewusst selbst bereinigen; der Wechsel löscht sie nicht.

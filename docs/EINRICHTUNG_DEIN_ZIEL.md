# Aktueller Einrichtungsstand

Produkt: **Fahrzeugakte**, allgemeine App unter **https://car.jurodak.com**. Repository: **https://github.com/julianrdk/scala-fahrzeugakte**. Der bestehende Repositoryname und die gespeicherten Ressourcen-IDs bleiben erhalten.

## Vom Nutzer bestätigt

- Domain und DNS bei IONOS, GitHub Pages und gültiges HTTPS funktionieren.
- Google-Cloud-Projekt, APIs, OAuth-Web-Client und bestehende API-executable-Bereitstellung eingerichtet.
- Echter Lese-/Schreibtest auf der Website erfolgreich; Cache-/Integritätsfehler korrigiert, keine Prüfsumme zurückgesetzt.
- Bewusst ausgelöste Testmail eingegangen; Beispieldokument in Google gespeichert, geöffnet und heruntergeladen.
- IONOS enthält nur die Domain. Kostenloser Cloudflare-Weg ausdrücklich gewählt; **Cloudflare-Konto inzwischen fertig**.
- Neue Vorgabe: **dieselbe Website, getrennte Google-Konten**, keine eigene Installation je Person. Fahrzeugname und Bild erst nach Anmeldung und Hinzufügen. Neutrales Produkt, keine vorausgefüllten Scala-Daten. Genannte Werbesprüche und redundante Texte entfernen.

## Implementiert und lokal geprüft

- Allgemeine Anmeldeseite; leere Konten führen zu „Fahrzeug hinzufügen“. Hersteller/Modell werden explizit eingegeben. Bestehende Fahrzeugdaten unverändert.
- 122 Tests in neun Dateien sowie Typprüfung und Frontend-/Apps-Script-/Cloudflare-Builds erfolgreich. Lokaler Browser: 360 × 800 und 1280 × 900, Volkswagen Golf angelegt, danach abgemeldet; kein Modell vor Anmeldung, kein horizontaler Überlauf.
- Cloudflare: eigene Tokens/Sitzungen je verifizierter Google-Kennung, verschlüsselte Tokenhaltung, Hash-Cookie, CSRF/Origin. Kontoabhängige Weiterleitung an Google; bei Kontowechsel private Formulare/Importvorschau verwerfen, bei gleicher Wiederanmeldung Eingaben erhalten.
- Google: Mehrkontomodus mit eigenen UserProperties und privaten Ressourcen je ausführendem Konto. Keine globalen Ressourcen als Fallback. Das ursprüngliche Eigentümerkonto behält seine bestehenden Ressourcen. Unterbrochene erstmalige Einrichtung wiederholbar, vorhandene Akte niemals zurücksetzen.
- Zusätzlicher Cron Worker für tägliche Mail-/Sicherungsprüfung je Konto, weil scripts.run keine Trigger erzeugen kann. Noch nicht im Cloudflare-Konto eingerichtet oder echt geprüft.
- Allgemeiner ChatGPT-Prompt in docs/ERFASSUNGSPROMPT_ALLGEMEIN.md; ursprüngliche Anlagen und JSON-Vertrag erhalten.

## Jetzt als Nächstes

In Cloudflare **Workers & Pages → Create application → Pages → bestehendes GitHub-Repository verbinden**, nur julianrdk/scala-fahrzeugakte freigeben. Projektname etwa **fahrzeugakte-anmeldung**, Framework **None**, Build **npm run build:auth**, Ausgabe **auth/dist**, Root leer, Node 24 und pnpm 11.25.0. Den Nutzer in kleinen Schritten begleiten.

Anschließend nach **CLOUDFLARE_ANMELDUNG.md** D1/DB-Binding, öffentliche Variablen, zwei Secrets, auth.jurodak.com und Google-Redirect einrichten. Privater TOKEN_KEY ist bereits ausschließlich in der ignorierten lokalen Datei config/private-auth-key.txt vorhanden; nicht im Chat oder Repository ausgeben. GOOGLE_CLIENT_SECRET direkt Google → Cloudflare übernehmen.

## Noch nicht live aktiviert

- AUTH_ORIGIN ist noch nicht als GitHub-Variable gesetzt; bisheriger Google-Adapter bleibt aktiv.
- Apps-Script-MULTI_USER_MODE und API-Zugriff ANYONE noch nicht im Nutzerkonto aktiviert. Vor Änderung neuen Code und das bereitliegende Mehrkonto-Manifest übernehmen. Bestehende OWNER_EMAIL und alle Ressourcen-IDs beibehalten.
- Cloudflare ACCOUNT_MODE=multi erst zusammen mit dieser Google-Konfiguration verwenden. Cron Worker mit gleicher D1 und Secrets einrichten.
- Echten zweiten Kontotest durchführen: eigene leere Akte, anderes Fahrzeug/eigene Kosten/Dateien, Wechsel zurück zum bisherigen Konto ohne Vermischung. Kein Erfolg für echte Kontentrennung behaupten, bevor dieser Test bestätigt wurde.
- Google steht noch auf Testing; Freigabe nach sieben Tagen kann verfallen. Dauerbetrieb und mögliche Google-Verifizierung vor breiter öffentlicher Nutzung klären. Persönliche Ausnahme nicht als allgemeine öffentliche Freigabe darstellen.
- Echten täglichen Sicherungslauf, Export/Restore und PDF-Probedruck noch abschließen. Bestehende Hauptdomain/Mail-DNS unverändert, nur zusätzliche Auth-Subdomain verbinden.

Die Domainverlängerung ist unabhängig: gezeigtes IONOS-Angebot 14,42 € für zwölf Monate im Voraus, danach laut Anzeige 2 €/Monat. Kauf noch nicht bestätigt. Kein zusätzliches Webhosting erforderlich.

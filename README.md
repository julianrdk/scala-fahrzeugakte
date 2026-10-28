# Fahrzeugakte

Private Fahrzeugakten mit E-Mail-/Passwortanmeldung über Clerk. React/Vite liefert die Oberfläche, Cloudflare D1 speichert strukturierte Daten, privates R2 die Originale. Mehrere Fahrzeuge je Konto, gemeinsame Werkstätten und Recherchevorlagen, getrennte Kosten, Arbeiten, Termine und Galerien.

## Einrichtung und Umstellung

Die vollständige Anleitung steht in [docs/UMSTELLUNG_CLOUDFLARE.md](docs/UMSTELLUNG_CLOUDFLARE.md). Vor dem ersten Push die alte unabhängige Cloudflare-Veröffentlichung abschalten. Der neue Workflow veröffentlicht erst mit FLEET_RELEASE_READY=true. Änderungen und Veröffentlichungen prüft und bestätigt der Nutzer selbst.

## Lokal prüfen

Node 24 und pnpm 11.25.0: pnpm install --frozen-lockfile, pnpm check, pnpm test:runtime. Die Tests verwenden synthetische Konten und getrennte lokale Speicher. Echte Clerk-Anmeldungen und produktive CPU-Messungen bleiben Teil der Abnahme vor Freigabe.

Der ChatGPT-JSON-Vertrag v1 in shared/import-v1.schema.json bleibt verbindlich und unverändert. Das Zielfahrzeug wird außerhalb dieses Vertrags gewählt. Alte vollständige Google-ZIPs bleiben importierbar. Es gibt keine Google-Anmeldung und keinen Apps-Script-Laufzeitbetrieb mehr.

# Fahrzeugakte

Private Fahrzeugakten mit E-Mail-/Passwortanmeldung über Clerk. React/Vite liefert die Oberfläche, Cloudflare D1 speichert strukturierte Daten, privates R2 die Originale. Mehrere Fahrzeuge je Konto, gemeinsame Werkstätten, getrennte Kosten, Arbeiten, Termine und Galerien.

Die gemeinsame Erfassung vereint manuelle Angaben, lokale Belegerkennung und Chatentwürfe mit einem abschließenden Speichern. Tankpreise laden ausschließlich über „Suchen“. Je Fahrzeug sind eine Akzentfarbe und eine Fotocollage mit vollständig sichtbaren Bildern wählbar. Bedienung und Veröffentlichung: [Oberfläche vereinfachen](docs/OBERFLAECHE_2026-10-30.md).

## Einrichtung und Umstellung

Die vollständige Anleitung steht in [docs/UMSTELLUNG_CLOUDFLARE.md](docs/UMSTELLUNG_CLOUDFLARE.md). Vor dem ersten Push die alte unabhängige Cloudflare-Veröffentlichung abschalten. Der neue Workflow veröffentlicht erst mit FLEET_RELEASE_READY=true. Änderungen und Veröffentlichungen prüft und bestätigt der Nutzer selbst.

Der optionale [persönliche KI-Assistent](docs/KI_ASSISTENT_EINRICHTEN.md) erstellt aus Text oder Diktat prüfbare Entwürfe. Jede Person nutzt ihren eigenen Groq-Schlüssel. Benötigt werden die additive Migration `0004-ai.sql` und das Worker-Secret `AI_CREDENTIALS_KEY`. Ohne KI-Einrichtung bleiben manuelle Erfassung und lokale Belegerkennung verfügbar.

## Lokal prüfen

Node 24 und pnpm 11.25.0: pnpm install --frozen-lockfile, pnpm check, pnpm test:runtime. Die Tests verwenden synthetische Konten und getrennte lokale Speicher. Echte Clerk-Anmeldungen und produktive CPU-Messungen bleiben Teil der Abnahme vor Freigabe.

Das interne Erfassungspaket v1 in shared/import-v1.schema.json bleibt unverändert. Ein separater JSON-Import wird nicht mehr angeboten. Alte vollständige Google-ZIPs bleiben importierbar. Es gibt keine Google-Anmeldung und keinen Apps-Script-Laufzeitbetrieb mehr.

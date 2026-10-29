# Persönlichen KI-Assistenten einschalten

Die Erweiterung wird lokal vorbereitet. Es werden keine Produktivschlüssel oder echten Groq-Aufrufe für Tests verwendet. Commit und Push übernimmst du in GitHub Desktop; dein Push auf `main` startet die bestehende Veröffentlichung. Clerk, DNS, R2 und Resend benötigen keine Änderung.

**Einrichtungsstand vom 29.10.2026:** Die beiden D1-Tabellen sind bereits in `fahrzeugakte-daten` angelegt und bestätigt; Schritt 1 ist erledigt. Verschlüsselungssecret und persönlicher Groq-Zugang wurden auf deinen Wunsch zurückgestellt. Es wurde noch nichts veröffentlicht.

## Einmalig als Betreiber

### 1. Zwei zusätzliche Tabellen anlegen

1. Öffne [Cloudflare](https://dash.cloudflare.com/) → **Storage & databases → D1 SQL Database**.
2. Öffne **fahrzeugakte-daten**, also die Datenbank des Workers mit der Bindung `DATA_DB`.
3. Öffne **Console**. Kopiere die SQL-Anweisungen aus `auth/migrations/0004-ai.sql` und führe sie aus. Falls du Kommentare mitkopierst: Zeilenumbrüche erhalten. Die Anweisungen können gefahrlos erneut ausgeführt werden:

```sql
CREATE TABLE IF NOT EXISTS ai_credentials (
  owner TEXT PRIMARY KEY REFERENCES record_accounts(owner),
  version TEXT NOT NULL, ciphertext TEXT NOT NULL, iv TEXT NOT NULL,
  suffix TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_limits (
  owner TEXT PRIMARY KEY REFERENCES record_accounts(owner),
  window INTEGER NOT NULL, requests INTEGER NOT NULL,
  lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0
);
```

Eine leere Ergebnisliste nach `CREATE TABLE` ist normal. Prüfen kannst du mit:

```sql
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ai_credentials','ai_limits');
```

Beide Namen müssen erscheinen. Bestehende Fahrzeugdaten werden durch diese additive Migration nicht verändert. Die normalen Sicherungen bleiben erhalten; KI-Schlüssel und Chats werden nicht in Aktenexporte aufgenommen.

### 2. Verschlüsselungssecret erzeugen und hinterlegen

Dieser Schlüssel schützt die persönlichen Groq-Schlüssel aller Konten. Es ist ein neuer, eigener Schlüssel, kein Clerk-, Resend- oder Groq-Schlüssel.

1. Öffne **PowerShell** über das Windows-Startmenü. Node.js wird dafür nicht benötigt; der aktuelle Ordner ist beliebig.
2. Führe diesen Block aus:

```powershell
$aiVaultBytes = New-Object byte[] 32
$aiVaultGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $aiVaultGenerator.GetBytes($aiVaultBytes)
    Set-Clipboard -Value ([Convert]::ToBase64String($aiVaultBytes))
}
finally {
    $aiVaultGenerator.Dispose()
    [Array]::Clear($aiVaultBytes, 0, $aiVaultBytes.Length)
}
```

3. Die zufällige Zeichenfolge liegt nun in deiner Zwischenablage. Speichere sie in deinem Passwortmanager unter **Fahrzeugakte – AI_CREDENTIALS_KEY**. Nicht hier im Chat einfügen.
4. Cloudflare → **Workers & Pages → fahrzeugakte-tagespruefung → Settings → Runtime variables and secrets → Add variable**.
5. **Key:** `AI_CREDENTIALS_KEY`. **Secret** anhaken. Bei **Value** mit **Strg+V** einfügen und **Add 1 variable and deploy** anklicken.

Das Secret gehört ausschließlich in diesen Worker. Kein neuer Worker, kein Eintrag bei Pages, GitHub oder in `public/config.json` ist erforderlich. Vorhandene Secrets bleiben unverändert. Das Secret später nicht ohne geplante Neuverschlüsselung ersetzen: Ohne den ursprünglichen Wert müssen alle Personen ihren Groq-Schlüssel neu hinterlegen. Gespeicherte Fahrzeuge bleiben davon unberührt.

### 3. Änderungen veröffentlichen

1. In GitHub Desktop die Änderungen prüfen.
2. Vorschlag für den Titel: **Persönlichen KI-Assistenten für Text und Diktat ergänzen**.
3. Beschreibung: **Groq-Schlüssel je Konto verschlüsselt speichern. Arbeiten und Ausgaben als prüfbare Entwürfe vorbereiten, Sprache transkribieren und manuelle Werte erhalten.**
4. **Commit to main → Push origin**. Unter GitHub → **Actions** den erfolgreichen Prüf- und Veröffentlichungsablauf abwarten.
5. `car.jurodak.com` neu laden. Falls Migration oder Secret fehlen, bleibt nur KI deaktiviert; manuelle Erfassung und Belegerkennung bleiben verfügbar.

## Pro Person: eigenen Groq-Free-Zugang verbinden

1. [GroqCloud](https://console.groq.com/) öffnen und eigenes Konto mit eigener Organisation anlegen. Im **Free-Tarif** bleiben. Für diese Einrichtung keine Zahlungsmethode hinzufügen und kein kostenpflichtiges Upgrade auswählen.
2. Unter [API Keys](https://console.groq.com/keys) einen Schlüssel **Fahrzeugakte** erstellen und im eigenen Passwortmanager aufbewahren.
3. In der Fahrzeugakte: **Fahrzeug → Einstellungen → KI-Assistent**. Über den Infobutton ist dieselbe Hilfe erreichbar.
4. Den persönlichen Schlüssel einfügen und **Prüfen und speichern** anklicken. Dabei wird die Modellverfügbarkeit geprüft; es entsteht noch kein Chat- oder Diktataufruf.
5. Anschließend erscheint nur eine Maskierung. Derselbe App-Zugang kann den Schlüssel auf Handy und PC verwenden. Jede weitere Person hinterlegt ihren eigenen Schlüssel. Eine gemeinsame Groq-Organisation würde ihr Kontingent teilen.
6. In Groq Verbrauch und [Limits](https://console.groq.com/settings/limits) ansehen. Optional unter **Settings → Data Controls** „Zero Data Retention“ aktivieren; [Groq erläutert Aufbewahrung und Verarbeitung](https://console.groq.com/docs/your-data).

Die App führt keine Tarifänderung aus, nutzt keinen gemeinsamen Ersatzschlüssel und wiederholt Anbieteranfragen nicht automatisch. Einen außerhalb der App geänderten Groq-Tarif kann sie nicht zuverlässig erkennen. Bei ausgeschöpftem Free-Kontingent kann weiterhin manuell erfasst werden. [Groq-Tarife](https://console.groq.com/docs/billing-faqs), [organisationsbezogene Limits](https://console.groq.com/docs/rate-limits).

## Benutzen und prüfen

- Unten rechts den Chat öffnen oder in der Erfassung **Mit KI** wählen. Ein aktives, nicht archiviertes Fahrzeug ist erforderlich.
- Beispiel: „Gestern selbst Öl und Filter gewechselt, bei 82.400 km, Material 65 Euro.“ Der Assistent bereitet Arbeit und verknüpfte Ausgabe vor. **Entwurf prüfen** öffnet die bestehende Erfassung. Erst **Geprüft speichern** legt Einträge an. Verkäufer und Werkstatt getrennt prüfen.
- Bei vorhandenen manuellen Angaben **Mit KI ergänzen** wählen. Abweichende Vorschläge lassen sich einzeln übernehmen; manuelle Werte bleiben erhalten.
- **Diktieren** startet erst nach deinem Klick und der Mikrofonfreigabe. Nach spätestens zwei Minuten stoppt die Aufnahme. **Transkribieren** zeigt den Text; korrigieren und anschließend **Senden**. Unterstützte Browser können WebM, MP4 oder Ogg aufnehmen. Ohne Unterstützung oder Freigabe bleibt Texteingabe möglich.
- Während der Aufnahme zeigt **Mikrofonpegel** das lokale Eingangssignal und den Namen des verwendeten Mikrofons. Der Balken sollte sich beim Sprechen bewegen. Wenn es am Handy funktioniert und am PC nicht: Im PC-Browser die Website-Einstellungen für das Mikrofon öffnen, das richtige Eingabegerät auswählen und erneut diktieren. Die Mikrofoneinstellung des Codex-Chats kann vom Browser abweichen.
- Nach dem Stoppen lässt sich die letzte **Aufnahme anhören**. Ist deine Stimme dort klar hörbar, aber das Transkript falsch, liegt das Problem bei der Erkennung. Ist sie nicht hörbar, zuerst Mikrofonwahl, Stummschaltung und Eingangslautstärke prüfen. Die Vorschau bleibt nur im Speicher dieser geöffneten Chatansicht; eine neue Aufnahme, Entfernen, Schließen oder Abmelden gibt sie frei. **Senden** verarbeitet erst den kontrollierten Text.
- Eine gemessene praktisch stille Aufnahme wird nicht zu Groq geschickt. Fehlt die technische Möglichkeit zur Pegelmessung, bleibt Diktieren verfügbar. Der Server prüft zusätzlich Groqs Erkennungsmetadaten; unsichere Aufnahmen werden vollständig zurückgewiesen, statt einzelne Angaben stillschweigend zu entfernen. Die Qualitätsprüfung ist eine Heuristik und kann nicht jede falsche Erkennung ausschließen.
- Beim Verlassen der Seite oder Wechsel in den Hintergrund wird eine laufende Aufnahme verworfen und das Mikrofon freigegeben.
- Schließen erhält den Chat während der Sitzung. Neuladen und Abmelden verwerfen ihn. Ein Fahrzeugwechsel warnt bei offenen Entwürfen und setzt den Chat zurück.
- **Weitere Importmöglichkeiten → JSON importieren** bleibt für Vertrag v1 vorhanden. Lokale Belegerkennung benötigt keinen KI-Schlüssel.

Pro Anfrage werden Gespräch, aktueller Entwurf, Fahrzeugbezeichnung und benötigte Werkstattnamen/-zuordnungen an Groq gesendet. Dokumente, Galerie, Adressen und übrige Fahrzeughistorie werden nicht automatisch mitgesendet. Diktate werden zur Transkription übertragen und nicht dauerhaft in D1/R2 abgelegt. Groq beschreibt die USA als Speicherort aufbewahrter Kundendaten; die optionale Aufbewahrungseinstellung gilt beim Anbieter.

## Abschließender echter Test

Nach der Einrichtung mit deinem persönlichen Free-Schlüssel einmal Text und ein kurzes Diktat testen, den Entwurf korrigieren und speichern. Auf Handy und PC prüfen; anschließend mit einem zweiten eingeladenen Konto kontrollieren, dass dort kein eigener Schlüssel eingerichtet ist und keine Entwürfe sichtbar sind.

Lokale Tests verwenden simulierte Antworten und prüfen die Cloudflare-Laufzeit ohne Anbieterzugriff. Sie ersetzen keine Messung der produktiven CPU-Zeit: Cloudflare → Worker → **Metrics / Observability** nach den ersten echten Aufrufen auf CPU-Zeit und Fehler prüfen. Ziel ist der kostenlose Worker-Rahmen; für dessen CPU-Grenze ist die tatsächliche Produktionsmessung maßgeblich. Netzwartezeit auf Groq ist keine CPU-Zeit. Keine automatische Tarifaufwertung vornehmen. Anmeldung, Mikrofonfreigabe und die echten Groq-Antworten können erst nach dieser Einrichtung abschließend abgenommen werden.

import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { assistantService, type AIProfile } from "../shared/assistant";
import type { Adapter } from "./adapter";
import "./assistant.css";

export function AssistantSettings({ adapter }: { adapter: Adapter | null }) {
  const service = assistantService(adapter),
    [profile, setProfile] = useState<AIProfile | null>(null),
    [key, setKey] = useState(""),
    [help, setHelp] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!service) return;
    const c = new AbortController();
    controller.current = c;
    void service
      .aiProfile(undefined, undefined, c.signal)
      .then((p) => {
        if (!c.signal.aborted) setProfile(p);
      })
      .catch(() => {
        if (!c.signal.aborted)
          setError("KI-Einstellungen konnten nicht geladen werden.");
      });
    return () => {
      controller.current?.abort();
    };
  }, [service]);
  async function change(action: "save" | "test" | "remove") {
    if (!service || busy) return;
    if (
      action === "remove" &&
      !confirm("Persönlichen KI-Schlüssel aus der Fahrzeugakte entfernen?")
    )
      return;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const p = await service.aiProfile(action, key || undefined, c.signal);
      if (c.signal.aborted) return;
      setProfile(p);
      setKey("");
      setNotice(
        action === "remove"
          ? "Schlüssel entfernt."
          : action === "save"
            ? "Schlüssel geprüft und gespeichert."
            : "Verbindung erfolgreich geprüft.",
      );
      if (action !== "test") dispatchEvent(new Event("ai-profile-changed"));
    } catch (e) {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : "Aktion nicht bestätigt.");
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="panel ai-settings">
      <div className="ai-settings-heading">
        <h2>KI-Assistent</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="KI-Assistent einrichten – Anleitung"
          aria-expanded={help}
          onClick={() => setHelp(!help)}
        >
          <Info size={20} />
        </button>
      </div>
      {help && (
        <div className="ai-help">
          <h3>Eigenen kostenlosen Zugang einrichten</h3>
          <ol>
            <li>
              Öffne{" "}
              <a
                href="https://console.groq.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                GroqCloud
              </a>{" "}
              und erstelle dein eigenes Konto mit eigener Organisation.
            </li>
            <li>
              Bleibe im <strong>Free-Tarif</strong>. Aktiviere kein
              kostenpflichtiges Upgrade und hinterlege dafür keine
              Zahlungsmethode.
            </li>
            <li>
              Öffne{" "}
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                API Keys
              </a>
              , erstelle einen Schlüssel mit dem Namen „Fahrzeugakte“ und
              kopiere ihn. Bewahre ihn in deinem Passwortmanager auf.
            </li>
            <li>
              Füge ihn unten ein und klicke auf „Prüfen und speichern“. Danach
              kannst du Chat und Diktieren auf deinen Geräten verwenden.
            </li>
            <li>
              In Groq unter <strong>Settings → Data Controls</strong> kannst du
              „Zero Data Retention“ aktivieren.{" "}
              <a
                href="https://console.groq.com/docs/your-data"
                target="_blank"
                rel="noopener noreferrer"
              >
                Hinweise zur Datenverarbeitung
              </a>
            </li>
          </ol>
          <p>
            Text, Diktat und benötigte Formularangaben werden bei einer Anfrage
            an Groq gesendet. Die App speichert keine Audioaufnahmen oder
            Chatverläufe dauerhaft. Groq nennt die USA als Speicherort
            aufbewahrter Kundendaten.
          </p>
          <p>
            Jede Person braucht ihren eigenen Zugang. Schlüssel derselben
            Groq-Organisation teilen deren Kontingent. Bei einem Limit pausiert
            die KI. Die App führt kein Upgrade aus und kann deinen Groq-Tarif
            nicht überprüfen.
          </p>
          <p>
            <a
              href="https://console.groq.com/settings/limits"
              target="_blank"
              rel="noopener noreferrer"
            >
              Kontingente bei Groq ansehen
            </a>{" "}
            ·{" "}
            <a
              href="https://console.groq.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Verbrauch im Groq-Dashboard ansehen
            </a>
          </p>
        </div>
      )}
      {!service ? (
        <p>Im lokalen Testmodus ist kein Anbieterkonto verbunden.</p>
      ) : (
        <>
          <p role="status">
            {!profile
              ? "Verbindung wird geladen …"
              : !profile.available
                ? "Der KI-Assistent ist noch nicht verfügbar."
                : profile.configured
                  ? `Persönlicher Groq-Schlüssel: •••• ${profile.suffix}`
                  : "Noch kein persönlicher Schlüssel hinterlegt."}
          </p>
          {profile?.available && (
            <>
              <label className="field">
                {profile.configured
                  ? "Schlüssel ersetzen"
                  : "Persönlicher Groq-Schlüssel"}
                <input
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={260}
                  placeholder="gsk_…"
                  disabled={busy}
                />
              </label>
              <div className="button-group">
                <button
                  className="button primary"
                  disabled={busy || !key.trim()}
                  onClick={() => void change("save")}
                >
                  Prüfen und speichern
                </button>
                <button
                  className="button"
                  disabled={busy || (!key.trim() && !profile.configured)}
                  onClick={() => void change("test")}
                >
                  Testen
                </button>
                {profile.configured && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => void change("remove")}
                  >
                    Entfernen
                  </button>
                )}
              </div>
              <small>
                Nur dein Konto verwendet diesen Schlüssel. Die Verbindung wird
                ohne Chatnachricht getestet.
              </small>
            </>
          )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

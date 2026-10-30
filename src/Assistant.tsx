import { Send, X, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  assistantService,
  mergeAssistantDraft,
  type AIProfile,
  type AssistantDraft,
  type AssistantMessage,
  type AssistantSeed,
  type DraftConflict,
} from "../shared/assistant";
import { clone } from "../shared/logic";
import type { Adapter } from "./adapter";
import { VoiceInput } from "./VoiceInput";
import "./assistant.css";

export function assistantSuggestions(route: string) {
  return [
    route.includes("tankstellen")
      ? ["Tankvorgang erfassen", "Ich habe getankt: "]
      : ["Arbeit erfassen", "Ich habe folgende Arbeit erledigt: "],
    ["Reparatur planen", "Ich plane folgende Reparatur: "],
    ["Ausgabe erfassen", "Ich habe Folgendes bezahlt: "],
  ];
}
import { fieldNames, display } from "./draft-labels";
export function Assistant({
  adapter,
  open,
  seed,
  route,
  vehicleLabel,
  workshops = [],
  reset,
  onClose,
  onPreview,
  onDirty,
}: {
  adapter: Adapter;
  open: boolean;
  seed: AssistantSeed | null;
  route: string;
  vehicleLabel: string;
  workshops?: { id: string; name: string }[];
  reset: number;
  onClose: () => void;
  onPreview: (draft: AssistantDraft, links?: Record<string, string[]>) => void;
  onDirty: (value: boolean) => void;
}) {
  const service = assistantService(adapter),
    [profile, setProfile] = useState<AIProfile | null>(null),
    [profileVersion, setProfileVersion] = useState(0),
    [text, setText] = useState(""),
    [messages, setMessages] = useState<AssistantMessage[]>([]),
    [draft, setDraft] = useState<AssistantDraft | null>(null),
    [conflicts, setConflicts] = useState<DraftConflict[]>([]),
    [error, setError] = useState(""),
    [pending, setPending] = useState<"message" | "transcript" | null>(null),
    [recording, setRecording] = useState(false),
    [voiceEpoch, setVoiceEpoch] = useState(0),
    [transcript, setTranscript] = useState(false);
  const manual = useRef<AssistantSeed | null>(null),
    controller = useRef<AbortController | null>(null),
    sequence = useRef(0),
    lock = useRef(false),
    pane = useRef<HTMLElement | null>(null),
    content = useRef<HTMLDivElement | null>(null),
    input = useRef<HTMLTextAreaElement | null>(null);
  const onDirtyRef = useRef(onDirty);
  onDirtyRef.current = onDirty;
  useEffect(() => {
    if (open && content.current)
      content.current.scrollTop = content.current.scrollHeight;
  }, [open, messages.length, pending]);
  function cancel() {
    sequence.current++;
    controller.current?.abort();
    lock.current = false;
    setPending(null);
  }
  function clear() {
    cancel();
    setText("");
    setMessages([]);
    setDraft(null);
    setConflicts([]);
    setError("");
    setTranscript(false);
    setRecording(false);
    setVoiceEpoch((n) => n + 1);
    manual.current = null;
    onDirtyRef.current(false);
  }
  useEffect(() => {
    return () => {
      sequence.current++;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    clear();
  }, [reset]);
  useEffect(() => {
    if (!seed) return;
    clear();
    manual.current = clone(seed);
    setDraft(clone(seed.draft));
  }, [seed]);
  useEffect(() => {
    onDirtyRef.current(
      !!draft || !!text.trim() || recording || pending !== null,
    );
  }, [draft, text, recording, pending]);
  useEffect(() => {
    const changed = () => {
      clear();
      setProfile(null);
      setProfileVersion((n) => n + 1);
    };
    addEventListener("ai-profile-changed", changed);
    return () => removeEventListener("ai-profile-changed", changed);
  }, []);
  useEffect(() => {
    if (!open || !service) return;
    const c = new AbortController();
    setError("");
    void service
      .aiProfile(undefined, undefined, c.signal)
      .then((p) => {
        if (!c.signal.aborted) setProfile(p);
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Einstellungen konnten nicht geladen werden.",
          );
      });
    return () => c.abort();
  }, [open, service, profileVersion]);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    input.current?.focus();
    function keyboard(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const nodes = Array.from(
            pane.current?.querySelectorAll<HTMLElement>(
              "button:not([disabled]),a[href],textarea:not([disabled]),input:not([disabled]),audio[controls]",
            ) ?? [],
          ).filter((el) => el.offsetParent !== null),
          first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      before?.focus();
    };
  }, [open]);
  function close() {
    cancel();
    setRecording(false);
    onClose();
  }
  async function send() {
    if (
      !service ||
      !text.trim() ||
      lock.current ||
      recording ||
      !profile?.configured
    )
      return;
    const c = new AbortController(),
      id = ++sequence.current;
    controller.current = c;
    lock.current = true;
    setPending("message");
    setError("");
    const typed = text.trim(),
      history = [...messages, { role: "user" as const, content: typed }].slice(
        -12,
      );
    while (
      history.length > 1 &&
      history.reduce((n, m) => n + m.content.length, 0) > 12000
    )
      history.shift();
    try {
      const result = await service.aiMessage(
        { messages: history, draft },
        c.signal,
      );
      if (id !== sequence.current || c.signal.aborted) return;
      setMessages([...history, { role: "assistant", content: result.message }]);
      setText("");
      setTranscript(false);
      if (result.draft) {
        const merged = mergeAssistantDraft(
          manual.current?.draft ?? null,
          result.draft,
          manual.current?.protectedFields,
        );
        setDraft(merged.draft);
        setConflicts(merged.conflicts);
      }
    } catch (e) {
      if (id === sequence.current && !c.signal.aborted)
        setError(e instanceof Error ? e.message : "Anfrage nicht bestätigt.");
    } finally {
      if (id === sequence.current) {
        lock.current = false;
        setPending(null);
      }
    }
  }
  async function transcribe(audio: Blob) {
    if (!service || lock.current) return;
    const c = new AbortController(),
      id = ++sequence.current;
    controller.current = c;
    lock.current = true;
    setPending("transcript");
    setError("");
    try {
      const result = await service.aiTranscribe(audio, c.signal);
      if (id === sequence.current && !c.signal.aborted) {
        setText((t) => (t ? t + "\n" : "") + result);
        setTranscript(true);
        input.current?.focus();
      }
    } catch (e) {
      if (id === sequence.current && !c.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Transkription fehlgeschlagen.",
        );
    } finally {
      if (id === sequence.current) {
        lock.current = false;
        setPending(null);
      }
    }
  }
  function accept(conflict: DraftConflict) {
    if (!draft) return;
    const next = clone(draft),
      row = next.package[conflict.table].find((r) => r.ref === conflict.ref);
    if (conflict.field === "$workshop")
      next.capture.workshops_by_work_ref = {
        ...next.capture.workshops_by_work_ref,
        [conflict.ref]: conflict.proposed as string | null,
      };
    else if (row) (row as any)[conflict.field] = conflict.proposed;
    setDraft(next);
    if (manual.current) {
      const original = manual.current.draft.package[conflict.table].find(
        (r) => r.ref === conflict.ref,
      );
      if (conflict.field === "$workshop")
        manual.current.draft.capture.workshops_by_work_ref = {
          ...manual.current.draft.capture.workshops_by_work_ref,
          [conflict.ref]: conflict.proposed as string | null,
        };
      else if (original) (original as any)[conflict.field] = conflict.proposed;
    }
    setConflicts((list) => list.filter((c) => c !== conflict));
  }
  if (!open) return null;
  return (
    <div className="ai-layer no-print">
      <div className="ai-backdrop" onClick={close} />
      <section
        className="ai-panel"
        ref={pane}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-title"
      >
        <header>
          <div>
            <h2 id="ai-title">Assistent</h2>
            <small>{vehicleLabel}</small>
          </div>
          <div className="button-group">
            <button
              type="button"
              className="icon-button"
              aria-label="Neuen Chat beginnen"
              onClick={() => {
                if (
                  (!draft && !text.trim() && !recording && !pending) ||
                  confirm("Ungespeicherten KI-Entwurf verwerfen?")
                )
                  clear();
              }}
            >
              <RotateCcw size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Chat schließen"
              onClick={close}
            >
              <X size={21} />
            </button>
          </div>
        </header>
        <div className="ai-content" ref={content}>
          {!service ? (
            <p>
              Im lokalen Testmodus ist kein KI-Anbieter verbunden. Manuelle
              Erfassung und Belegerkennung stehen bereit.
            </p>
          ) : !profile ? (
            <p role="status">KI-Verbindung wird geprüft …</p>
          ) : !profile.available ? (
            <p>
              Der KI-Assistent ist noch nicht verfügbar. Du kannst weiterhin
              manuell erfassen.
            </p>
          ) : !profile.configured ? (
            <p>
              Hinterlege deinen persönlichen Groq-Schlüssel unter{" "}
              <a href="#/fahrzeug/einstellungen" onClick={close}>
                Einstellungen → KI-Assistent
              </a>
              . Dort findest du auch die Anleitung.
            </p>
          ) : null}
          {!messages.length && (
            <>
              <p>Beschreibe, was erledigt wurde oder geplant ist.</p>
              <div className="ai-suggestions">
                {assistantSuggestions(route).map(([label, value]) => (
                  <button
                    className="button"
                    type="button"
                    key={label}
                    onClick={() => {
                      setText(value);
                      input.current?.focus();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          <div
            role="log"
            aria-live="polite"
            aria-label="Chatverlauf"
            className="ai-messages"
          >
            {messages.map((m, i) => (
              <div key={i} className={"ai-message " + m.role}>
                <small>{m.role === "user" ? "Du" : "Assistent"}</small>
                <p>{m.content}</p>
              </div>
            ))}
          </div>
          {draft && (
            <section className="ai-draft">
              <h3>Entwurf</h3>
              {draft.package.work.map((w) => (
                <p key={w.ref}>
                  {w.status === "planned" ? "Geplant" : "Durchgeführt"}:{" "}
                  {w.title}
                </p>
              ))}
              {draft.package.expenses.map((e) => (
                <p key={e.ref}>
                  {e.title}
                  {e.amount_cents != null
                    ? " · " +
                      (e.amount_cents / 100).toLocaleString("de-DE", {
                        minimumFractionDigits: 2,
                      }) +
                      " " +
                      (e.currency ?? "")
                    : ""}
                </p>
              ))}
              {draft.package.warnings.map((w, i) => (
                <p key={i} className="muted">
                  {w}
                </p>
              ))}
              {!!conflicts.length && (
                <div className="ai-conflicts">
                  <p>
                    Deine bisherigen Werte bleiben erhalten. Abweichende
                    Vorschläge kannst du einzeln übernehmen.
                  </p>
                  {conflicts.map((c) => (
                    <div key={c.table + c.ref + c.field}>
                      <strong>{fieldNames[c.field] ?? c.field}</strong>
                      <small>
                        Bisher: {display(c.field, c.current, workshops)}
                      </small>
                      <small>
                        Vorschlag: {display(c.field, c.proposed, workshops)}
                      </small>
                      <button
                        type="button"
                        className="button"
                        onClick={() => accept(c)}
                      >
                        Vorschlag übernehmen
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="button primary"
                disabled={!!pending || recording}
                onClick={() => {
                  try {
                    onPreview(draft, manual.current?.links);
                    onClose();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Formularübernahme nicht möglich.",
                    );
                  }
                }}
              >
                Ins Formular übernehmen
              </button>
            </section>
          )}
          {error && (
            <p className="ai-error" role="alert">
              {error}
            </p>
          )}
          {pending && (
            <div role="status">
              {pending === "transcript"
                ? "Aufnahme wird transkribiert …"
                : "Entwurf wird vorbereitet …"}{" "}
              <button type="button" className="button" onClick={cancel}>
                Abbrechen
              </button>
            </div>
          )}
        </div>
        <form
          className="ai-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor="ai-message">
            {transcript
              ? "Transkript prüfen und bearbeiten"
              : "Deine Nachricht"}
          </label>
          <textarea
            id="ai-message"
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="Was wurde gemacht oder ist geplant?"
            disabled={!!pending}
          />
          <div className="ai-compose-actions">
            <VoiceInput
              key={voiceEpoch}
              disabled={!!pending || !profile?.configured}
              onAudio={(blob) => void transcribe(blob)}
              onError={setError}
              onRecording={setRecording}
            />
            <button
              type="submit"
              className="button primary"
              disabled={
                !!pending || recording || !text.trim() || !profile?.configured
              }
            >
              <Send size={17} />
              Senden
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

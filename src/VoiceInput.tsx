import { Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AI_AUDIO_BYTES } from "../shared/assistant";

export function recorderMime() {
  if (typeof MediaRecorder === "undefined") return null;
  return (
    [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/webm",
    ].find((m) => MediaRecorder.isTypeSupported(m)) ?? null
  );
}
export function VoiceInput({
  disabled,
  onAudio,
  onError,
  onRecording,
}: {
  disabled: boolean;
  onAudio: (blob: Blob) => void;
  onError: (message: string) => void;
  onRecording: (value: boolean) => void;
}) {
  const [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [starting, setStarting] = useState(false);
  const state = useRef<{
      recorder: MediaRecorder;
      stream: MediaStream;
      timer: ReturnType<typeof setInterval>;
      deadline: ReturnType<typeof setTimeout>;
      chunks: Blob[];
      size: number;
      discard: boolean;
    } | null>(null),
    alive = useRef(true),
    pending = useRef(false);
  const callbacks = useRef({ onAudio, onError, onRecording });
  callbacks.current = { onAudio, onError, onRecording };
  function stop(discard = false) {
    const s = state.current;
    if (!s) return;
    s.discard ||= discard;
    clearInterval(s.timer);
    clearTimeout(s.deadline);
    if (s.recorder.state !== "inactive") s.recorder.stop();
    s.stream.getTracks().forEach((t) => t.stop());
  }
  useEffect(() => {
    alive.current = true;
    const hidden = () => {
      if (document.visibilityState === "hidden") stop(true);
    };
    const leaving = () => stop(true);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leaving);
    return () => {
      alive.current = false;
      stop(true);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
    };
  }, []);
  async function start() {
    if (disabled || pending.current || state.current) return;
    pending.current = true;
    setStarting(true);
    let acquired: MediaStream | null = null;
    try {
      const mime = recorderMime();
      if (!mime || !navigator.mediaDevices?.getUserMedia)
        throw Error(
          "Dieser Browser unterstützt keine Aufnahme. Bitte Texteingabe verwenden.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      acquired = stream;
      if (!alive.current || document.visibilityState === "hidden") {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType: mime }),
        s = {
          recorder,
          stream,
          chunks: [] as Blob[],
          size: 0,
          discard: false,
          timer: setInterval(() => {}, 1000),
          deadline: setTimeout(() => stop(), 120000),
        };
      clearInterval(s.timer);
      const started = Date.now();
      s.timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        if (alive.current) setSeconds(elapsed);
        if (elapsed >= 120) stop();
      }, 1000);
      recorder.ondataavailable = (e) => {
        if (!e.data.size) return;
        s.size += e.data.size;
        if (s.size > AI_AUDIO_BYTES) {
          s.discard = true;
          callbacks.current.onError(
            "Aufnahme größer als 4 MiB. Bitte kürzer diktieren.",
          );
          stop(true);
        } else s.chunks.push(e.data);
      };
      recorder.onerror = () => {
        callbacks.current.onError(
          "Aufnahme fehlgeschlagen. Bitte Texteingabe verwenden.",
        );
        stop(true);
      };
      recorder.onstop = () => {
        clearInterval(s.timer);
        clearTimeout(s.deadline);
        stream.getTracks().forEach((t) => t.stop());
        state.current = null;
        if (alive.current) {
          setRecording(false);
          callbacks.current.onRecording(false);
          if (!s.discard && s.size)
            callbacks.current.onAudio(new Blob(s.chunks, { type: mime }));
        }
        s.chunks = [];
      };
      state.current = s;
      setSeconds(0);
      setRecording(true);
      callbacks.current.onRecording(true);
      recorder.start(1000);
    } catch (e) {
      stop(true);
      acquired?.getTracks().forEach((t) => t.stop());
      state.current = null;
      if (alive.current) {
        setRecording(false);
        callbacks.current.onRecording(false);
        callbacks.current.onError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Mikrofon nicht freigegeben. Du kannst den Text direkt eingeben."
            : e instanceof Error
              ? e.message
              : "Mikrofon nicht verfügbar.",
        );
      }
    } finally {
      pending.current = false;
      if (alive.current) setStarting(false);
    }
  }
  return (
    <div className="ai-voice">
      {recording ? (
        <>
          <span role="status">Aufnahme {seconds}s / 120s</span>
          <button type="button" className="button" onClick={() => stop()}>
            <Square size={16} />
            Transkribieren
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Aufnahme verwerfen"
            onClick={() => stop(true)}
          >
            <X size={18} />
          </button>
        </>
      ) : (
        <button
          type="button"
          className="button"
          disabled={disabled || starting}
          onClick={() => void start()}
        >
          <Mic size={18} />
          {starting ? "Mikrofon wird geöffnet …" : "Diktieren"}
        </button>
      )}
    </div>
  );
}

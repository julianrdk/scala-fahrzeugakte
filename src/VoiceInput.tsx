import { Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AI_AUDIO_BYTES } from "../shared/assistant";
import { monitorMicrophone } from "./microphone";

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
    [starting, setStarting] = useState(false),
    [level, setLevel] = useState({ value: 0, measured: false }),
    [microphone, setMicrophone] = useState(""),
    [playback, setPlayback] = useState<string | null>(null);
  const state = useRef<{
      recorder: MediaRecorder;
      stream: MediaStream;
      timer: ReturnType<typeof setInterval>;
      deadline: ReturnType<typeof setTimeout>;
      chunks: Blob[];
      size: number;
      discard: boolean;
      monitor: ReturnType<typeof monitorMicrophone>;
    } | null>(null),
    alive = useRef(true),
    pending = useRef(false),
    playbackUrl = useRef<string | null>(null);
  const callbacks = useRef({ onAudio, onError, onRecording });
  callbacks.current = { onAudio, onError, onRecording };
  function clearPlayback() {
    if (playbackUrl.current) URL.revokeObjectURL(playbackUrl.current);
    playbackUrl.current = null;
    if (alive.current) setPlayback(null);
  }
  function stop(discard = false) {
    const s = state.current;
    if (!s) return;
    s.discard ||= discard;
    clearInterval(s.timer);
    clearTimeout(s.deadline);
    s.monitor?.stop();
    if (s.recorder.state !== "inactive") s.recorder.stop();
    // Let the recorder flush its final audio before stopping normal recordings.
    if (discard) s.stream.getTracks().forEach((t) => t.stop());
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
      clearPlayback();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leaving);
    };
  }, []);
  async function start() {
    if (disabled || pending.current || state.current) return;
    pending.current = true;
    setStarting(true);
    callbacks.current.onError("");
    clearPlayback();
    setLevel({ value: 0, measured: false });
    let acquired: MediaStream | null = null;
    try {
      const mime = recorderMime();
      if (!mime || !navigator.mediaDevices?.getUserMedia)
        throw Error(
          "Dieser Browser unterstützt keine Aufnahme. Bitte Texteingabe verwenden.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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
          monitor: null as ReturnType<typeof monitorMicrophone>,
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
        const signal = s.monitor?.stop();
        if (alive.current) {
          setRecording(false);
          callbacks.current.onRecording(false);
          if (!s.discard && s.size) {
            const blob = new Blob(s.chunks, {
              type: recorder.mimeType || mime,
            });
            try {
              const url = URL.createObjectURL(blob);
              playbackUrl.current = url;
              setPlayback(url);
            } catch {
              // Recording and transcription work without a playback URL too.
            }
            if (signal && signal.samples >= 3 && signal.peak < 0.0001)
              callbacks.current.onError(
                "Es wurde kein hörbares Mikrofonsignal aufgenommen. Bitte die Aufnahme anhören und das ausgewählte Mikrofon prüfen.",
              );
            else callbacks.current.onAudio(blob);
          } else if (!s.discard)
            callbacks.current.onError(
              "Die Aufnahme enthält keine Audiodaten. Bitte erneut diktieren.",
            );
        }
        s.chunks = [];
      };
      state.current = s;
      setSeconds(0);
      setMicrophone(
        stream.getTracks().find((track) => track.kind === "audio")?.label ||
          "Systemmikrofon",
      );
      setRecording(true);
      callbacks.current.onRecording(true);
      recorder.start(1000);
      s.monitor = monitorMicrophone(stream, (value) => {
        if (alive.current) setLevel(value);
      });
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
          <span className="ai-mic-level">
            <meter
              min={0}
              max={1}
              value={Math.min(1, level.value * 12)}
              aria-label="Mikrofonpegel"
            />
            <span>{microphone}</span>
          </span>
          {seconds >= 3 && (!level.measured || level.value < 0.003) && (
            <small role="status">
              {level.measured
                ? "Mikrofon gerade sehr leise. Beim Sprechen sollte sich der Pegel bewegen."
                : "Pegelanzeige nicht verfügbar. Du kannst die Aufnahme anschließend anhören."}
            </small>
          )}
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
      {!recording && playback && (
        <div className="ai-audio-preview">
          <span>Aufnahme anhören</span>
          <audio
            controls
            preload="metadata"
            src={playback}
            aria-label="Letzte Diktataufnahme"
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Audioaufnahme entfernen"
            onClick={clearPlayback}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Assistant } from "../src/Assistant";
import { VoiceInput } from "../src/VoiceInput";
import { Capture, ImportPreview } from "../src/views/Capture";
import {
  AI_AUDIO_BYTES,
  proposalToDraft,
  type AssistantService,
  type AssistantSeed,
} from "../shared/assistant";
import { emptyState } from "../shared/logic";
import type { Adapter } from "../src/adapter";
import { aiProposal } from "./ai-fixture";
let root: Root, host: HTMLDivElement;
let recorders: FakeRecorder[], tracks: { stop: ReturnType<typeof vi.fn> }[];
class FakeRecorder {
  static isTypeSupported(mime: string) {
    return mime.startsWith("audio/webm");
  }
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    recorders.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["synthetic audio"], { type: "audio/webm" }),
    });
    this.onstop?.();
  }
}
function microphone(signal = 0.03, running = true) {
  const input = { signal },
    disconnect = vi.fn(),
    close = vi.fn(async () => {});
  class Audio {
    state = running ? "running" : "suspended";
    resume = vi.fn(async () => {});
    close = close;
    createMediaStreamSource() {
      return { connect: vi.fn(), disconnect };
    }
    createAnalyser() {
      return {
        fftSize: 2048,
        disconnect,
        getFloatTimeDomainData(values: Float32Array) {
          for (let i = 0; i < values.length; i++)
            values[i] = i % 2 ? input.signal : -input.signal;
        },
      };
    }
  }
  vi.stubGlobal("AudioContext", Audio);
  return { input, close, disconnect };
}
const button = (label: string) => {
  const b = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) =>
      b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
  );
  if (!b) throw Error("Button fehlt: " + label);
  return b;
};
const click = async (label: string) => act(async () => button(label).click());
const reply = () =>
  proposalToDraft(aiProposal(), emptyState().Settings[0], "Testauto");
function service() {
  return {
    kind: "test",
    call: vi.fn(),
    aiProfile: vi.fn(async () => ({
      available: true,
      configured: true,
      provider: "groq" as const,
      suffix: "DEMO",
      updatedAt: null,
    })),
    aiMessage: vi.fn(async () => reply()),
    aiTranscribe: vi.fn(
      async () => "Ölwechsel gestern bei 82.400 km, Material 65 Euro",
    ),
  } satisfies Adapter & AssistantService;
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  recorders = [];
  tracks = [];
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        const track = { stop: vi.fn(), kind: "audio", label: "Testmikrofon" };
        tracks.push(track);
        return { getTracks: () => [track] };
      }),
    },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Assistent mit simuliertem Anbieter", () => {
  it("erhält bestehende Rechnungsverknüpfungen ausschließlich im Browser", async () => {
    const p = props(),
      links = { w1: ["existing-private-expense"] };
    await act(async () =>
      root.render(<Assistant {...p} seed={{ draft: reply().draft!, links }} />),
    );
    await click("Arbeit erfassen");
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(JSON.stringify(p.adapter.aiMessage.mock.calls)).not.toContain(
      "existing-private-expense",
    );
    await click("Entwurf prüfen");
    expect(p.onPreview.mock.calls[0][1]).toEqual(links);
  });
  it("verwirft eine laufende Aufnahme beim neuen Chat", async () => {
    vi.stubGlobal("confirm", () => true);
    const p = props();
    await act(async () => root.render(<Assistant {...p} />));
    await click("Diktieren");
    await click("Neuen Chat beginnen");
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(p.adapter.aiTranscribe).not.toHaveBeenCalled();
    expect(button("Diktieren").disabled).toBe(false);
  });
  function props(adapter = service()) {
    return {
      adapter,
      open: true,
      seed: null,
      route: "/erfassen",
      vehicleLabel: "Testauto",
      reset: 0,
      onClose: vi.fn(),
      onPreview: vi.fn(),
      onDirty: vi.fn(),
    };
  }
  it("erstellt beim Öffnen keine KI-Anfrage, reicht den Entwurf zur bestehenden Prüfung weiter und erhält den Chat beim Schließen", async () => {
    const p = props();
    await act(async () => root.render(<Assistant {...p} />));
    expect(p.adapter.aiMessage).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Testauto");
    await click("Arbeit erfassen");
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(p.adapter.aiMessage).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Ölwechsel");
    expect(p.adapter.call).not.toHaveBeenCalled();
    await click("Entwurf prüfen");
    expect(p.onPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        package: expect.objectContaining({ schema_version: 1 }),
      }),
      undefined,
    );
    await act(async () => root.render(<Assistant {...p} open={false} />));
    expect(host.textContent).toBe("");
    await act(async () => root.render(<Assistant {...p} />));
    expect(host.textContent).toContain("Ölwechsel");
  });
  it("zeigt Transkript zur Korrektur und ruft Textverarbeitung erst bei Senden auf", async () => {
    const p = props();
    await act(async () => root.render(<Assistant {...p} />));
    await click("Diktieren");
    expect(recorders[0].state).toBe("recording");
    await click("Transkribieren");
    expect(p.adapter.aiTranscribe).toHaveBeenCalledOnce();
    expect(p.adapter.aiMessage).not.toHaveBeenCalled();
    expect(host.querySelector("textarea")!.value).toContain("82.400");
    expect(host.textContent).toContain("Transkript prüfen und bearbeiten");
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(p.adapter.aiMessage).toHaveBeenCalledOnce();
    expect(tracks[0].stop).toHaveBeenCalled();
  });
  it("verwirft verspätete Antworten nach Abbruch und löscht beim Reset den Sitzungsentwurf", async () => {
    const p = props();
    let resolve!: (v: ReturnType<typeof reply>) => void;
    p.adapter.aiMessage.mockImplementation(
      () => new Promise((r) => (resolve = r)),
    );
    await act(async () => root.render(<Assistant {...p} />));
    await click("Arbeit erfassen");
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    await click("Abbrechen");
    await act(async () => resolve(reply()));
    expect(host.textContent).not.toContain("Entwurf prüfen");
    expect(host.querySelector("textarea")!.value).toContain("Ich habe");
    p.adapter.aiMessage.mockImplementation(async () => reply());
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(host.textContent).toContain("Entwurf prüfen");
    await act(async () => root.render(<Assistant {...p} reset={1} />));
    expect(host.textContent).not.toContain("Entwurf prüfen");
    expect(host.querySelector("textarea")!.value).toBe("");
  });
  it("erhält Eingaben nach Anbieterfehler und löscht sie bei Schlüsselwechsel", async () => {
    const p = props();
    p.adapter.aiMessage.mockRejectedValue(Error("Kontingent ausgeschöpft"));
    await act(async () => root.render(<Assistant {...p} />));
    await click("Ausgabe erfassen");
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(host.textContent).toContain("Kontingent ausgeschöpft");
    expect(host.querySelector("textarea")!.value).toContain("bezahlt");
    await act(async () => dispatchEvent(new Event("ai-profile-changed")));
    expect(host.querySelector("textarea")!.value).toBe("");
  });
  it("vergleicht manuelle Angaben vor dem gezielten Übernehmen", async () => {
    const p = props(),
      manual = reply().draft!;
    manual.package.expenses[0].amount_cents = 7000;
    await act(async () =>
      root.render(<Assistant {...p} seed={{ draft: manual }} />),
    );
    await click("Arbeit erfassen");
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(host.textContent).toContain("70,00");
    expect(host.textContent).toContain("65,00");
    await click("Vorschlag übernehmen");
    await click("Entwurf prüfen");
    expect(p.onPreview.mock.calls[0][0].package.expenses[0].amount_cents).toBe(
      6500,
    );
  });
});
describe("Formularübergabe und vorhandene Speicherregeln", () => {
  it("liest beim schwebenden Einstieg die aktuellen manuellen Felder", async () => {
    const context: { current: (() => AssistantSeed) | null } = {
        current: null,
      },
      adapter = service();
    await act(async () =>
      root.render(
        <Capture
          s={emptyState()}
          adapter={adapter}
          busy={false}
          supported
          run={async (action) => {
            await action();
            return true;
          }}
          onPreview={vi.fn()}
          onReceiptDone={async () => {}}
          onAssistant={vi.fn()}
          onAssistantContext={(factory) => (context.current = factory)}
        />,
      ),
    );
    await click("Manuell");
    const title = host.querySelector<HTMLInputElement>('input[name="title"]')!;
    title.value = "Bereits manuell eingegeben";
    expect(context.current!().draft.package.expenses[0].title).toBe(
      "Bereits manuell eingegeben",
    );
    await act(async () => root.render(<div />));
    expect(context.current).toBe(null);
  });
  it("entfernt abgewählte Ausgaben und deren Verknüpfung gemeinsam aus dem Entwurf", async () => {
    const context: { current: (() => AssistantSeed) | null } = {
        current: null,
      },
      draft = reply().draft!;
    await act(async () =>
      root.render(
        <ImportPreview
          initial={draft.package}
          initialCapture={draft.capture}
          initialLinks={{ w1: ["existing"] }}
          s={emptyState()}
          adapter={service()}
          captureSupported
          busy={false}
          run={async (action) => {
            await action();
            return true;
          }}
          onDone={async () => {}}
          onBack={vi.fn()}
          setProgress={vi.fn()}
          onAssistantContext={(factory) => (context.current = factory)}
        />,
      ),
    );
    await click("Ausgabe aus Entwurf entfernen");
    expect(context.current!().draft.package.expenses).toHaveLength(0);
    expect(context.current!().draft.package.work[0].expense_refs).toEqual([]);
    expect(context.current!().links).toEqual({ w1: ["existing"] });
    await click("Arbeit aus Entwurf entfernen");
    expect(context.current!().draft.package.work).toHaveLength(0);
    expect(context.current!().links).toEqual({});
  });
  it("verhindert eine neue KI-Übergabe während eines unbestätigten Speichervorgangs", async () => {
    const context: { current: (() => AssistantSeed) | null } = {
        current: null,
      },
      draft = reply().draft!,
      adapter = service();
    adapter.call.mockRejectedValue(Error("Verbindung abgebrochen"));
    await act(async () =>
      root.render(
        <ImportPreview
          initial={draft.package}
          initialCapture={draft.capture}
          s={emptyState()}
          adapter={adapter}
          captureSupported
          busy={false}
          run={async (action) => {
            try {
              await action();
              return true;
            } catch {
              return false;
            }
          }}
          onDone={async () => {}}
          onBack={vi.fn()}
          setProgress={vi.fn()}
          onAssistantContext={(factory) => (context.current = factory)}
        />,
      ),
    );
    await click("Geprüft speichern");
    expect(() => context.current!()).toThrow(/Speichervorgang/);
    expect(host.textContent).toContain("Speichern wiederholen");
  });
});

describe("Mikrofon und Lebenszyklus", () => {
  it("zeigt das tatsächliche Mikrofon und den lokal gemessenen Pegel", async () => {
    vi.useFakeTimers();
    const p = props(),
      m = microphone();
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(host.textContent).toContain("Testmikrofon");
    expect(host.querySelector("meter")!.value).toBeGreaterThan(0);
    await click("Aufnahme verwerfen");
    expect(m.close).toHaveBeenCalledOnce();
    expect(p.onAudio).not.toHaveBeenCalled();
  });
  it("sendet eine gemessene stille Aufnahme nicht an die Spracherkennung und erlaubt Anhören", async () => {
    vi.useFakeTimers();
    microphone(0);
    vi.spyOn(URL, "createObjectURL").mockReturnValue(
      "blob:synthetic-dictation",
    );
    const p = props();
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    await act(async () => vi.advanceTimersByTimeAsync(3200));
    expect(host.textContent).toContain("sehr leise");
    await click("Transkribieren");
    expect(p.onAudio).not.toHaveBeenCalled();
    expect(p.onError).toHaveBeenLastCalledWith(
      expect.stringContaining("kein hörbares Mikrofonsignal"),
    );
    expect(host.querySelector("audio")?.src).toBe("blob:synthetic-dictation");
    expect(tracks[0].stop).toHaveBeenCalled();
  });
  it("erhält hörbare Aufnahmen auch bei einer Pause vor dem Stoppen", async () => {
    vi.useFakeTimers();
    const p = props(),
      m = microphone(0.02);
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    await act(async () => vi.advanceTimersByTimeAsync(500));
    m.input.signal = 0;
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    await click("Transkribieren");
    expect(p.onAudio).toHaveBeenCalledOnce();
    expect(m.close).toHaveBeenCalledOnce();
  });
  it("verwirft leise Aufnahmen nicht allein wegen eines niedrigen Pegels", async () => {
    vi.useFakeTimers();
    microphone(0.0005);
    const p = props();
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    await click("Transkribieren");
    expect(p.onAudio).toHaveBeenCalledOnce();
  });
  it("verhindert keine Aufnahme, wenn der Browser die Pegelmessung nicht starten kann", async () => {
    vi.useFakeTimers();
    const p = props(),
      m = microphone(0, false);
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    await act(async () => vi.advanceTimersByTimeAsync(3200));
    expect(host.textContent).toContain("Pegelanzeige nicht verfügbar");
    await click("Transkribieren");
    expect(p.onAudio).toHaveBeenCalledOnce();
    expect(m.close).toHaveBeenCalledOnce();
  });
  it("gibt die lokale Audiovorschau beim Entfernen, einer neuen Aufnahme und Schließen frei", async () => {
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:dictation-1")
      .mockReturnValueOnce("blob:dictation-2")
      .mockReturnValueOnce("blob:dictation-3");
    const revoke = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => {}),
      p = props();
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    await click("Transkribieren");
    await click("Audioaufnahme entfernen");
    expect(revoke).toHaveBeenCalledWith("blob:dictation-1");
    expect(host.querySelector("audio")).toBeNull();
    await click("Diktieren");
    await click("Transkribieren");
    await click("Diktieren");
    expect(revoke).toHaveBeenCalledWith("blob:dictation-2");
    await click("Transkribieren");
    await act(async () => root.render(<div />));
    expect(revoke).toHaveBeenCalledWith("blob:dictation-3");
  });
  it("beendet die Mikrofonspur nach dem letzten Audiopaket", async () => {
    const p = props();
    vi.spyOn(FakeRecorder.prototype, "stop").mockImplementation(function (
      this: FakeRecorder,
    ) {
      this.state = "inactive";
      expect(tracks[0].stop).not.toHaveBeenCalled();
      this.ondataavailable?.({
        data: new Blob(["last audio packet"], { type: "audio/webm" }),
      });
      this.onstop?.();
    });
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    await click("Transkribieren");
    expect(await p.onAudio.mock.calls[0][0].text()).toBe("last audio packet");
    expect(tracks[0].stop).toHaveBeenCalled();
  });
  it("verwirft die Aufnahme beim Verlassen der Seite", async () => {
    const p = props();
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(p.onAudio).not.toHaveBeenCalled();
  });
  function props() {
    return {
      disabled: false,
      onAudio: vi.fn(),
      onError: vi.fn(),
      onRecording: vi.fn(),
    };
  }
  it("bleibt bei verweigerter Freigabe verwendbar und sendet kein Audio", async () => {
    const p = props();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new DOMException("denied", "NotAllowedError"),
    );
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    expect(p.onError).toHaveBeenCalledWith(
      expect.stringContaining("nicht freigegeben"),
    );
    expect(p.onAudio).not.toHaveBeenCalled();
    expect(button("Diktieren").disabled).toBe(false);
  });
  it("stoppt nach zwei Minuten und beendet die Mikrofonspur", async () => {
    vi.useFakeTimers();
    const p = props();
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    await act(async () => vi.advanceTimersByTimeAsync(120000));
    expect(recorders[0].state).toBe("inactive");
    expect(p.onAudio).toHaveBeenCalledOnce();
    expect(tracks[0].stop).toHaveBeenCalled();
  });
  it("verwirft übergroße Aufnahmen", async () => {
    const p = props();
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    await act(async () =>
      recorders[0].ondataavailable?.({
        data: new Blob([new Uint8Array(AI_AUDIO_BYTES + 1)]),
      }),
    );
    expect(p.onAudio).not.toHaveBeenCalled();
    expect(p.onError).toHaveBeenCalledWith(expect.stringContaining("4 MiB"));
    expect(tracks[0].stop).toHaveBeenCalled();
  });
  it("gibt Mikrofon beim Schließen frei und verwirft Aufnahme", async () => {
    const p = props();
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    await act(async () => root.render(<div />));
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(p.onAudio).not.toHaveBeenCalled();
  });
  it("beendet die Spur auch bei Recorderfehler", async () => {
    vi.spyOn(FakeRecorder.prototype, "start").mockImplementation(() => {
      throw Error("Recorder kaputt");
    });
    const p = props();
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(p.onRecording).toHaveBeenLastCalledWith(false);
    expect(p.onAudio).not.toHaveBeenCalled();
  });
  it("nimmt nach verspäteter Freigabe auf geschlossenem Chat nicht auf", async () => {
    let resolve!: (s: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(
      () => new Promise((r) => (resolve = r)),
    );
    const p = props(),
      stop = vi.fn();
    await act(async () => root.render(<VoiceInput {...p} />));
    await click("Diktieren");
    await act(async () => root.render(<div />));
    await act(async () =>
      resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream),
    );
    expect(stop).toHaveBeenCalled();
    expect(recorders).toHaveLength(0);
  });
});

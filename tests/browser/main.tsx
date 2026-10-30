import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import { CloudflareAdapter } from "../../src/CloudflareAdapter";
import "../../src/styles.css";
import { aiProposal } from "../ai-fixture";
import { proposalToDraft } from "../../shared/assistant";
const params = new URLSearchParams(location.search);
if (params.has("mobile")) {
  const frame = document.createElement("iframe");
  frame.src =
    "/tests/browser/index.html?ai" +
    (params.has("voice") ? "&voice" : "") +
    location.hash;
  frame.title = "Mobile Fahrzeugakte";
  frame.style.cssText =
    "width:390px;height:844px;border:1px solid #aaa;border-radius:16px;display:block;margin:20px auto";
  document.getElementById("root")!.replaceChildren(frame);
} else {
  try {
    const config = {
      origin: location.origin,
      apiOrigin: "/api",
      backend: "cloudflare" as const,
      clerkPublishableKey: "pk_test_SYNTHETIC",
    };
    const identity = await fetch(
      "/__fixture-token?owner=" + (params.get("owner") ?? "user_a"),
    ).then((r) => r.json());
    const adapter = new CloudflareAdapter(
      config,
      identity.owner,
      async () => identity.token,
    );
    const initial = await adapter.bootstrap();
    let fuelCalls = 0;
    if (params.has("fuel")) {
      // Only this explicit local fixture fakes GPS and prices. OSM tiles stay real.
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (success: PositionCallback) =>
            queueMicrotask(() =>
              success({
                coords: { latitude: 52.52, longitude: 13.4 },
              } as GeolocationPosition),
            ),
        },
      });
      adapter.fuelStatus = async () => ({ enabled: true });
      adapter.resolveFuelLocation = async (code) =>
        code === "50667"
          ? { lat: 50.94, lng: 6.96, label: "PLZ 50667" }
          : { lat: 52.52, lng: 13.4, label: "PLZ " + code };
      adapter.searchFuel = async (query) => {
        document.getElementById("fixture-fuel-calls")!.textContent =
          "Preisabfragen: " + ++fuelCalls;
        const center =
          "lat" in query
            ? { ...query, label: "Suchbereich" }
            : { lat: 52.52, lng: 13.4, label: "Berlin" };
        return {
          center,
          fetchedAt: new Date().toISOString(),
          cached: true,
          stations: [1, 2].map((n) => ({
            id: "synthetic-station-" + n,
            name: n === 1 ? "Testtankstelle Mitte" : "Testtankstelle West",
            brand: "Test",
            street: "Beispielstraße",
            houseNumber: String(n),
            postCode: "10115",
            place: "Berlin",
            lat: center.lat + n * 0.004,
            lng: center.lng + n * 0.004,
            distance: n * 1.2,
            isOpen: true,
            prices: {
              e5: 1.789 + n * 0.01,
              e10: 1.729 + n * 0.01,
              diesel: 1.619 + n * 0.01,
            },
          })),
        };
      };
    }
    if (params.has("ai")) {
      // Deliberate browser-only fake; neither secrets nor provider usage.
      adapter.aiProfile = async () => ({
        available: true,
        configured: true,
        provider: "groq",
        suffix: "DEMO",
        updatedAt: null,
      });
      adapter.aiMessage = async (input, signal) => {
        await new Promise((r) => setTimeout(r, 500));
        if (signal?.aborted) throw Error("Abgebrochen");
        const p = aiProposal();
        if (input.draft?.package.work[0])
          p.work[0].ref = input.draft.package.work[0].ref;
        if (input.draft?.package.expenses[0]) {
          p.expenses[0].ref = input.draft.package.expenses[0].ref;
          p.work[0].expense_refs = [p.expenses[0].ref];
        }
        return proposalToDraft(
          p,
          adapter.snapshot().state.Settings[0],
          "Lokale Testakte",
        );
      };
      adapter.aiTranscribe = async () =>
        "Gestern selbst Öl und Filter gewechselt, bei 82.400 km, Material 65 Euro";
    }
    if (params.has("voice")) {
      // Explicit local UI fixture: a generated tone, no real microphone access.
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const context = new AudioContext(),
              tone = context.createOscillator(),
              gain = context.createGain(),
              destination = context.createMediaStreamDestination();
            gain.gain.value = 0.06;
            tone.connect(gain).connect(destination);
            tone.start();
            await context.resume();
            const track = destination.stream.getAudioTracks()[0],
              stop = track.stop.bind(track);
            track.stop = () => {
              stop();
              if (context.state !== "closed") {
                tone.stop();
                void context.close();
              }
            };
            return destination.stream;
          },
        },
      });
    }
    createRoot(document.getElementById("root")!).render(
      <>
        <p
          role="status"
          style={{
            padding: "8px 16px",
            margin: 0,
            background: "#fff0cc",
            color: "#59450f",
          }}
        >
          Lokale Testdaten
          {params.has("ai")
            ? " · KI-Antworten simuliert · keine Groq-Aufrufe"
            : ""}
          {params.has("voice") ? " · Mikrofon durch Testton ersetzt" : ""}
          {params.has("fuel") && (
            <>
              {" "}
              · Tankpreise und GPS simuliert ·{" "}
              <span id="fixture-fuel-calls">Preisabfragen: 0</span>
            </>
          )}
        </p>
        <App
          external={{
            adapter,
            config,
            initial,
            logout: async () => {
              adapter.dispose();
              location.reload();
            },
          }}
        />
      </>,
    );
  } catch (error) {
    document.getElementById("root")!.textContent =
      "Lokale Testakte konnte nicht geladen werden: " +
      (error instanceof Error ? error.message : "Unbekannter Fehler");
  }
}

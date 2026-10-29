import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import { CloudflareAdapter } from "../../src/CloudflareAdapter";
import "../../src/styles.css";
import { aiProposal } from "../ai-fixture";
import { proposalToDraft } from "../../shared/assistant";
const params = new URLSearchParams(location.search);
if (params.has("mobile")) {
  const frame = document.createElement("iframe");
  frame.src = "/tests/browser/index.html?ai" + location.hash;
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

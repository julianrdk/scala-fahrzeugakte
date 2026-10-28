import { createRoot } from "react-dom/client";
import { App } from "../../src/App";
import { CloudflareAdapter } from "../../src/CloudflareAdapter";
import "../../src/styles.css";
const params = new URLSearchParams(location.search);
if (params.has("mobile")) {
  const frame = document.createElement("iframe");
  frame.src = "/tests/browser/index.html" + location.hash;
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
    createRoot(document.getElementById("root")!).render(
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
      />,
    );
  } catch (error) {
    document.getElementById("root")!.textContent =
      "Lokale Testakte konnte nicht geladen werden: " +
      (error instanceof Error ? error.message : "Unbekannter Fehler");
  }
}

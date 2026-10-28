import { handle, type FleetEnv } from "./fleet/api";
import { daily } from "./fleet/jobs";
export default {
  fetch(request: Request, env: FleetEnv) {
    return handle(request, env);
  },
  async scheduled(_event: unknown, env: FleetEnv) {
    const result = await daily(env);
    if (!result.ok)
      throw Error(
        "Fahrzeugakte: Tagesaufgabe fehlgeschlagen; Kontoprotokoll prüfen.",
      );
  },
};

import { selectedVehicle } from "../../../shared/fleet";
import {
  fuelBody,
  FuelError,
  fuelStatus,
  searchFuel,
  type FuelEnv,
} from "../fuel";
import { jsonBody } from "../http";
import { backup as legacyBackup } from "../legacy-backup";
import { identity } from "../v2/identity";
import { readState } from "../v2/store";
import { ApiError, problem, storage, type V2Env } from "../v2/types";
import { accountAction, mutate } from "./actions";
import {
  exportMetadata,
  restorePreview,
  restoreStart,
  restoreSwitch,
} from "./backups";
import { document, upload } from "./files";
import { requestBackup, testMail } from "./jobs";
import { createFleet, fleetAccount, migrateLegacy, vehicle } from "./store";
import { bootstrap, listPage, view } from "./views";
import {
  assistantMessage,
  assistantTranscribe,
  changeAIProfile,
  readAIProfile,
} from "../ai";
export type FleetEnv = V2Env & {
  LOCAL_DEVELOPMENT?: string;
  TANKERKOENIG_API_KEY?: string;
  FUEL_GEOCODER_URL?: string;
};
export async function handle(request: Request, env: FleetEnv) {
  const headers = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    }),
    respond = (value: unknown, status = 200) =>
      Response.json(value, { status, headers });
  try {
    const url = new URL(request.url);
    if (
      (url.origin !== env.APP_ORIGIN &&
        !(
          env.LOCAL_DEVELOPMENT === "true" &&
          url.hostname === "127.0.0.1" &&
          env.APP_ORIGIN.startsWith("http://127.0.0.1:")
        )) ||
      (request.headers.get("Origin") &&
        request.headers.get("Origin") !== env.APP_ORIGIN)
    )
      problem(403, "Aufruf nur von der eingerichteten Website erlaubt.");
    if (!["GET", "POST"].includes(request.method))
      problem(405, "Methode nicht erlaubt.");
    if (
      request.method === "POST" &&
      request.headers.get("Origin") !== env.APP_ORIGIN
    )
      problem(403, "Website-Ursprung fehlt.");
    const identityAccount = await identity(request, env),
      owner = identityAccount.owner,
      path = url.pathname.replace(/^\/api/, "");
    let a = await fleetAccount(env, owner);
    if (path === "/v3/migrate" && request.method === "POST") {
      const arg = await jsonBody(request);
      if (arg.confirm !== true)
        problem(400, "Migration bitte ausdrücklich bestätigen.");
      if (!a) {
        const previous = await readState(env, owner);
        await legacyBackup(env, previous.account, previous.state);
        await migrateLegacy(env, owner);
      }
      return respond({ ok: true });
    }
    if (!a) {
      const legacy = await storage(env)
        .db.prepare("SELECT COUNT(*) AS n FROM record_entities WHERE owner=?")
        .bind(owner)
        .first<{ n: number }>();
      if (legacy?.n)
        problem(
          409,
          "Die vorhandene Akte muss einmalig gesichert und umgestellt werden.",
          "MIGRATION_REQUIRED",
        );
      await createFleet(env, owner);
      a = (await fleetAccount(env, owner))!;
    }
    const fuelEnv: FuelEnv = { ...env, DB: storage(env).db };
    if (path === "/v3/ai/profile") {
      if (request.method === "GET")
        return respond(await readAIProfile(env, owner));
      return respond(await changeAIProfile(env, owner, request));
    }
    if (path === "/v3/bootstrap" && request.method === "GET") {
      const out = await bootstrap(env, a),
        id = selectedVehicle(out.vehicles, url.searchParams.get("vehicle"));
      return respond({
        ...out,
        selectedVehicle: id,
        view: id
          ? await view(
              env,
              a,
              id,
              url.searchParams.get("route") ?? "/",
              url.searchParams.get("year") ?? String(new Date().getFullYear()),
            )
          : null,
      });
    }
    if (path === "/v3/fuel/status" && request.method === "GET")
      return respond(await fuelStatus(fuelEnv));
    if (path === "/v3/fuel/search" && request.method === "POST")
      return respond(await searchFuel(fuelEnv, await fuelBody(request)));
    if (path === "/v3/account/export" && request.method === "GET")
      return respond(await exportMetadata(env, a));
    if (path.startsWith("/v3/account/") && request.method === "POST") {
      const name = path.slice("/v3/account/".length),
        arg = await jsonBody(request),
        operation = request.headers.get("Idempotency-Key") ?? "";
      if (name === "testMail")
        return respond({
          result: await testMail(env, a, arg.confirm, operation),
        });
      if (name === "backup")
        return respond({ result: await requestBackup(env, a, operation) });
      if (name === "restoreStart")
        return respond({
          result: await restoreStart(env, a, null, arg.backup),
        });
      if (name === "restorePreview") {
        const target = await storage(env)
          .db.prepare(
            "SELECT vehicle FROM fleet_restores WHERE owner=? AND id=?",
          )
          .bind(owner, arg.id)
          .first<{ vehicle: string | null }>();
        if (!target || target.vehicle !== null)
          problem(404, "Keine Kontowiederherstellung.");
        return respond({ result: await restorePreview(env, a, arg.id) });
      }
      if (name === "restoreSwitch") {
        const target = await storage(env)
          .db.prepare(
            "SELECT vehicle FROM fleet_restores WHERE owner=? AND id=?",
          )
          .bind(owner, arg.id)
          .first<{ vehicle: string | null }>();
        if (!target || target.vehicle !== null)
          problem(404, "Keine Kontowiederherstellung.");
        return respond(
          await restoreSwitch(env, a, arg.id, arg.confirm, operation),
        );
      }
      return respond(await accountAction(env, a, name, arg, operation));
    }
    const match = path.match(/^\/v3\/vehicles\/([^/]+)\/(.+)$/);
    if (!match) problem(404, "Aufruf nicht gefunden.");
    const id = decodeURIComponent(match[1]),
      tail = match[2];
    if (tail === "assistant/message" && request.method === "POST")
      return respond(await assistantMessage(env, a, id, request));
    if (tail === "assistant/transcribe" && request.method === "POST")
      return respond(await assistantTranscribe(env, a, id, request));
    if (tail === "view" && request.method === "GET")
      return respond(
        await view(
          env,
          a,
          id,
          url.searchParams.get("route") ?? "/",
          url.searchParams.get("year") ?? String(new Date().getFullYear()),
        ),
      );
    if (tail === "export" && request.method === "GET")
      return respond(await exportMetadata(env, a, id));
    if (tail.startsWith("list/") && request.method === "GET") {
      const v = await vehicle(env, a, id);
      return respond(
        await listPage(
          env,
          a,
          v,
          tail.slice(5) as any,
          url.searchParams.get("cursor"),
          url.searchParams.get("filter") ?? "",
        ),
      );
    }
    const file = tail.match(/^documents\/([^/]+)\/(original|thumbnail)$/);
    if (file && request.method === "GET") {
      const value = await document(
        env,
        a,
        id,
        decodeURIComponent(file[1]),
        file[2] === "thumbnail",
      );
      headers.set("Content-Type", value.record.mime);
      headers.set(
        "Content-Disposition",
        "attachment; filename*=UTF-8''" + encodeURIComponent(value.record.name),
      );
      return new Response(value.bytes, { headers });
    }
    if (tail === "files" && request.method === "POST")
      return respond({ result: await upload(env, a, id, request) });
    if (tail.startsWith("actions/") && request.method === "POST") {
      const name = tail.slice(8),
        arg = await jsonBody(request),
        operation = request.headers.get("Idempotency-Key") ?? "";
      if (name === "restoreStart")
        return respond({ result: await restoreStart(env, a, id, arg.state) });
      if (name === "restorePreview") {
        const target = await storage(env)
          .db.prepare(
            "SELECT vehicle FROM fleet_restores WHERE owner=? AND id=?",
          )
          .bind(owner, arg.id)
          .first<{ vehicle: string | null }>();
        if (target?.vehicle !== id)
          problem(404, "Wiederherstellung gehört nicht zum Fahrzeug.");
        return respond({ result: await restorePreview(env, a, arg.id) });
      }
      if (name === "restoreSwitch") {
        const target = await storage(env)
          .db.prepare(
            "SELECT vehicle FROM fleet_restores WHERE owner=? AND id=?",
          )
          .bind(owner, arg.id)
          .first<{ vehicle: string | null }>();
        if (target?.vehicle !== id)
          problem(404, "Wiederherstellung gehört nicht zum Fahrzeug.");
        return respond(
          await restoreSwitch(env, a, arg.id, arg.confirm, operation),
        );
      }
      if (name === "orphanFiles") {
        await vehicle(env, a, id);
        return respond({
          result: (
            await storage(env)
              .db.prepare(
                "SELECT o.id,o.name,o.size,o.status,o.created_at FROM record_objects o WHERE o.owner=? AND o.role='original' AND NOT EXISTS(SELECT 1 FROM fleet_entities e WHERE e.owner=o.owner AND e.kind='Documents' AND json_extract(e.payload,'$.sha256')=o.id) AND NOT EXISTS(SELECT 1 FROM fleet_backup_chunks c WHERE c.owner=o.owner)",
              )
              .bind(owner)
              .all()
          ).results,
        });
      }
      return respond(await mutate(env, a, id, name, arg, operation));
    }
    problem(404, "Aufruf nicht gefunden.");
  } catch (error) {
    if (error instanceof FuelError)
      return respond(
        {
          error: error.message,
          code: error.code,
          retryAfter: error.retryAfter,
        },
        error.status,
      );
    if (error instanceof ApiError)
      return respond({ error: error.message, code: error.code }, error.status);
    if (
      error instanceof Error &&
      /Konflikt|Ungültig|ungültig|fehlt|prüfen|Bitte|Kostenanteil|doppelte|Beleg|Import/.test(
        error.message,
      )
    )
      return respond({ error: error.message, code: "VALIDATION" }, 400);
    console.error("Fahrzeugakte: interner Aufruf fehlgeschlagen");
    return respond(
      {
        error: "Aufruf nicht bestätigt. Bitte später erneut versuchen.",
        code: "INTERNAL",
      },
      500,
    );
  }
}

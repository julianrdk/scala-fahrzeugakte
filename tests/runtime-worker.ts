// Test-only entry point. Production Wrangler configs never reference this module.
import { accountAction } from "../auth/src/fleet/actions";
import type { FleetEnv } from "../auth/src/fleet/api";
import { createFleet, fleetAccount, vehicles } from "../auth/src/fleet/store";
import { createAccount } from "../auth/src/v2/store";
import { putObject } from "../auth/src/v2/files";
import service from "../auth/src/worker";
import { hashBytes, meta } from "../shared/logic";
import {
  assistantMessage,
  assistantTranscribe,
  changeAIProfile,
} from "../auth/src/ai";
import { AI_AUDIO_MODEL, AI_TEXT_MODEL } from "../shared/assistant";
import { aiProposal, aiTranscript } from "./ai-fixture";

// Construct outbound requests with workerd's native API before returning fixtures.
// Plain fetch mocks miss options that Node accepts but Cloudflare rejects.
const aiProvider: typeof fetch = async (url, init) => {
  const request = new Request(url, init);
  if (request.url === "https://api.groq.com/openai/v1/models")
    return Response.json({
      data: [{ id: AI_TEXT_MODEL }, { id: AI_AUDIO_MODEL }],
    });
  if (request.url === "https://api.groq.com/openai/v1/chat/completions")
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(aiProposal()) },
        },
      ],
    });
  if (request.url === "https://api.groq.com/openai/v1/audio/transcriptions")
    return Response.json(aiTranscript("Synthetisches Diktat"));
  throw Error("Unbekannter synthetischer Anbieterpfad.");
};
export default {
  async fetch(
    request: Request,
    env: FleetEnv & { FIXTURE_TOKEN: string; BROWSER_TEST_ORIGIN?: string },
  ) {
    const url = new URL(request.url);
    if (url.pathname === "/__fixture") {
      if (request.headers.get("X-Test-Secret") !== env.FIXTURE_TOKEN)
        return new Response(null, { status: 403 });
      const input = (await request.json()) as any,
        db = env.DATA_DB!;
      if (input.schema) {
        for (const statement of input.schema) {
          try {
            await db.prepare(statement).run();
          } catch (e) {
            throw Error(statement.slice(0, 150) + " : " + String(e));
          }
        }
        return Response.json({ ok: true });
      }
      for (const owner of ["user_a", "user_b"]) {
        await createAccount(env, owner, owner + "@example.invalid");
        await createFleet(env, owner);
        let a = (await fleetAccount(env, owner))!;
        if (!(await vehicles(env, a)).length)
          for (const model of ["Erstes Auto", "Zweites Auto"]) {
            await accountAction(
              env,
              a,
              "createVehicle",
              { manufacturer: "Test", model, expected_revision: a.revision },
              crypto.randomUUID(),
            );
            a = (await fleetAccount(env, owner))!;
          }
      }
      const a = (await fleetAccount(env, "user_a"))!,
        v = (await vehicles(env, a))[0];
      if (input.assistant) {
        const at = performance.now(),
          key = "gsk_SYNTHETIC_workerd_abcdefgh1234";
        const profile = await changeAIProfile(
          env,
          a.owner,
          new Request("https://car.jurodak.com/api/v3/ai/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "save", key }),
          }),
          aiProvider,
        );
        const reply = await assistantMessage(
          env,
          a,
          v.id,
          new Request(
            "https://car.jurodak.com/api/v3/vehicles/" +
              v.id +
              "/assistant/message",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: [
                  {
                    role: "user",
                    content:
                      "Ölwechsel gestern bei 82.400 km, Material 65 Euro",
                  },
                ],
              }),
            },
          ),
          aiProvider,
        );
        const audio = new FormData();
        audio.set(
          "audio",
          new Blob(
            [new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])],
            { type: "audio/webm" },
          ),
          "aufnahme.webm",
        );
        const transcript = await assistantTranscribe(
          env,
          a,
          v.id,
          new Request(
            "https://car.jurodak.com/api/v3/vehicles/" +
              v.id +
              "/assistant/transcribe",
            { method: "POST", body: audio },
          ),
          aiProvider,
        );
        const row = await db
          .prepare("SELECT ciphertext FROM ai_credentials WHERE owner=?")
          .bind(a.owner)
          .first<{ ciphertext: string }>();
        return Response.json({
          profile,
          reply,
          transcript,
          encrypted: !!row && !row.ciphertext.includes(key),
          wallMs: performance.now() - at,
        });
      }
      const original = new TextEncoder().encode(
          "%PDF-1.4\nSYNTHETIC BENCHMARK",
        ),
        digest = hashBytes(original);
      if (input.linked)
        await putObject(
          env,
          a.owner,
          digest,
          original,
          "application/pdf",
          "Benchmark.pdf",
          "original",
        );
      for (let i = 0; i < (input.expenses ?? 0); i += 100) {
        const entries = Array.from(
          { length: Math.min(100, input.expenses - i) },
          (_, j) => {
            const id = "expense-" + String(i + j).padStart(5, "0");
            return {
              id,
              payload: JSON.stringify({
                ...meta(id, new Date().toISOString(), v.id),
                ref: id,
                title: "Testrechnung " + (i + j),
                date: "2026-10-28",
                odometer_km: null,
                category: "Pflege",
                amount_cents: 5000,
                currency: "EUR",
                vendor: "Test",
                invoice_number: id,
                document_refs: input.linked ? ["doc-" + id] : [],
                notes: null,
                refund_of_id: null,
              }),
            };
          },
        );
        await db
          .prepare(
            "INSERT OR IGNORE INTO fleet_entities(owner,vehicle,generation,kind,id,payload) SELECT ?,?,?,'Expenses',json_extract(value,'$.id'),json_extract(value,'$.payload') FROM json_each(?)",
          )
          .bind(a.owner, v.id, v.generation, JSON.stringify(entries))
          .run();
        if (input.linked) {
          const records = entries.flatMap((e) => {
            const expense = JSON.parse(e.payload),
              at = expense.created_at,
              doc = "doc-" + e.id,
              work = "work-" + e.id;
            return [
              {
                kind: "Documents",
                id: doc,
                payload: JSON.stringify({
                  ...meta(doc, at, v.id),
                  ref: doc,
                  title: "Beleg " + e.id,
                  document_type: "invoice",
                  source_filename: "Benchmark.pdf",
                  sha256: digest,
                  size: original.length,
                  mime: "application/pdf",
                  drive_id: a.owner + "/original/" + digest,
                  missing: false,
                }),
              },
              {
                kind: "Work",
                id: work,
                payload: JSON.stringify({
                  ...meta(work, at, v.id),
                  ref: work,
                  title: "Arbeit " + e.id,
                  kind: "maintenance",
                  status: "completed",
                  date: expense.date,
                  odometer_km: null,
                  performed_by: "self",
                  description: null,
                  expense_refs: [e.id],
                  document_refs: [doc],
                  parts: [],
                  allocations: [],
                  labor_minutes: null,
                  estimated_cost_cents: null,
                  workshop_snapshot: null,
                }),
              },
              ...[e.id, work].map((entity) => ({
                kind: "DocumentLinks",
                id: "link-" + entity,
                payload: JSON.stringify({
                  ...meta("link-" + entity, at, v.id),
                  document_id: doc,
                  entity_id: entity,
                }),
              })),
            ];
          });
          await db
            .prepare(
              "INSERT OR IGNORE INTO fleet_entities(owner,vehicle,generation,kind,id,payload) SELECT ?,?,?,json_extract(value,'$.kind'),json_extract(value,'$.id'),json_extract(value,'$.payload') FROM json_each(?)",
            )
            .bind(a.owner, v.id, v.generation, JSON.stringify(records))
            .run();
        }
      }
      return Response.json({
        vehicle: v.id,
        vehicles: (await vehicles(env, a)).map((v) => v.id),
      });
    }
    url.protocol = "https:";
    url.host = "car.jurodak.com";
    url.port = "";
    const headers = new Headers(request.headers);
    if (
      env.BROWSER_TEST_ORIGIN &&
      headers.get("Origin") === env.BROWSER_TEST_ORIGIN
    )
      headers.set("Origin", env.APP_ORIGIN);
    return service.fetch(
      new Request(url, new Request(request, { headers })),
      env,
    );
  },
};

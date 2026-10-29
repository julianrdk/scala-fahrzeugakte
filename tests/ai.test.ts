import fs from "node:fs";
import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assistantMessage,
  assistantTranscribe,
  changeAIProfile,
  readAIProfile,
} from "../auth/src/ai";
import { handle } from "../auth/src/fleet/api";
import { exportMetadata } from "../auth/src/fleet/backups";
import { fullState, vehicle } from "../auth/src/fleet/store";
import {
  AI_AUDIO_BYTES,
  AI_AUDIO_MODEL,
  AI_TEXT_MODEL,
  mergeAssistantDraft,
  proposalToDraft,
  validateAssistantRequest,
} from "../shared/assistant";
import { blankPackage, clone, totals } from "../shared/logic";
import { aiProposal } from "./ai-fixture";
import { setupFleet } from "./fleet-fixture";
import { request } from "./fixtures";
let c: Awaited<ReturnType<typeof setupFleet>>;
const key = "gsk_SYNTHETIC_personal_abcdefgh1234",
  secondKey = "gsk_SYNTHETIC_other_account_xyz9876";
const models = () =>
  Response.json({ data: [{ id: AI_TEXT_MODEL }, { id: AI_AUDIO_MODEL }] });
const answer = (proposal: unknown = aiProposal()) =>
  Response.json({
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(proposal) } },
    ],
  });
const json = (body: unknown, signal?: AbortSignal) =>
  new Request("https://car.jurodak.com/api/v3/ai/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
async function save(owner = "user_a", value = key) {
  return changeAIProfile(
    c.env,
    owner,
    json({ action: "save", key: value }),
    vi.fn(async () => models()),
  );
}
async function message(
  body: unknown = {
    messages: [
      {
        role: "user",
        content:
          "Gestern selbst Öl und Filter gewechselt, bei 82.400 km, Material 65 Euro",
      },
    ],
  },
  id = c.a1,
  owner = "user_a",
  fetcher: typeof fetch = vi.fn(async () => answer()),
  signal?: AbortSignal,
) {
  return assistantMessage(
    c.env,
    await c.a(owner),
    id,
    json(body, signal),
    fetcher,
  );
}
async function audio(
  blob: Blob,
  fetcher: typeof fetch = vi.fn(async () =>
    Response.json({ text: " Ölwechsel bei 82.400 km " }),
  ),
  id = c.a1,
  owner = "user_a",
) {
  const form = new FormData();
  form.set("audio", blob, "aufnahme.webm");
  return assistantTranscribe(
    c.env,
    await c.a(owner),
    id,
    new Request(
      "https://car.jurodak.com/api/v3/vehicles/" + id + "/assistant/transcribe",
      { method: "POST", body: form },
    ),
    fetcher,
  );
}
const webm = () =>
  new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])], {
    type: "audio/webm;codecs=opus",
  });
beforeEach(async () => {
  c = await setupFleet();
  c.sql.exec(fs.readFileSync("auth/migrations/0004-ai.sql", "utf8"));
  c.env.AI_CREDENTIALS_KEY = Buffer.alloc(32, 7).toString("base64");
});
afterEach(() => {
  c.sql.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Persönlicher Schlüssel", () => {
  it("schreibt auch nach einem Entfernen während der Verschlüsselung nicht zurück", async () => {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "encrypt").mockImplementation(async (...args) => {
      const encrypted = await encrypt(...args);
      await changeAIProfile(c.env, "user_a", json({ action: "remove" }));
      return encrypted;
    });
    await expect(save()).rejects.toMatchObject({ code: "AI_CANCELLED" });
    expect((await readAIProfile(c.env, "user_a")).configured).toBe(false);
  });
  it("verschlüsselt pro Konto und gibt nur eine Maskierung zurück", async () => {
    expect((await readAIProfile(c.env, "user_a")).configured).toBe(false);
    const out = await save();
    await save("user_b", secondKey);
    expect(out).toMatchObject({
      available: true,
      configured: true,
      suffix: "1234",
    });
    expect(JSON.stringify(out)).not.toContain(key);
    const rows = c.sql.prepare("SELECT * FROM ai_credentials").all();
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain("gsk_");
    expect(rows[0].ciphertext).not.toBe(rows[1].ciphertext);
    const get = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer " + key,
      );
      return models();
    });
    await changeAIProfile(c.env, "user_a", json({ action: "test" }), get);
    expect(
      JSON.stringify(await exportMetadata(c.env, await c.a())),
    ).not.toContain("ai_credentials");
    expect(
      JSON.stringify(await exportMetadata(c.env, await c.a())),
    ).not.toContain(key);
  });
  it("prüft den Schlüssel mit einer Cloudflare-kompatiblen Anfrage ohne automatische Weiterleitung", async () => {
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        expect(request.url).toBe("https://api.groq.com/openai/v1/models");
        expect(request.method).toBe("GET");
        expect(request.redirect).toBe("manual");
        expect(request.headers.get("Authorization")).toBe("Bearer " + key);
        return models();
      },
    );
    expect(
      await changeAIProfile(
        c.env,
        "user_a",
        json({ action: "save", key }),
        fetcher,
      ),
    ).toMatchObject({ configured: true, suffix: "1234" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([302, 307])(
    "folgt einer Weiterleitung %s nicht und erhält den bisherigen Schlüssel",
    async (status) => {
      await save();
      const fetcher = vi.fn(
        async (_url: RequestInfo | URL, init?: RequestInit) => {
          expect(init?.redirect).toBe("manual");
          return new Response(null, {
            status,
            headers: { Location: "https://untrusted.example.invalid/collect" },
          });
        },
      );
      await expect(
        changeAIProfile(
          c.env,
          "user_a",
          json({ action: "save", key: secondKey }),
          fetcher,
        ),
      ).rejects.toMatchObject({ code: "AI_REDIRECT" });
      expect(fetcher).toHaveBeenCalledOnce();
      expect(await readAIProfile(c.env, "user_a")).toMatchObject({
        configured: true,
        suffix: "1234",
      });
    },
  );
  it("bindet den verschlüsselten Schlüssel kryptografisch an das Konto", async () => {
    await save();
    c.sql.exec(
      "INSERT INTO ai_credentials SELECT 'user_b',version,ciphertext,iv,suffix,updated_at FROM ai_credentials WHERE owner='user_a'",
    );
    const fetcher = vi.fn(async () => models());
    await expect(
      changeAIProfile(c.env, "user_b", json({ action: "test" }), fetcher),
    ).rejects.toMatchObject({ code: "AI_KEY_UNAVAILABLE" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("behält bei ungültigem Ersatz den bisherigen Schlüssel", async () => {
    await save();
    const before = c.sql.prepare("SELECT * FROM ai_credentials").get();
    await expect(
      changeAIProfile(
        c.env,
        "user_a",
        json({ action: "save", key: secondKey }),
        vi.fn(async () => new Response(key, { status: 401 })),
      ),
    ).rejects.toMatchObject({ code: "AI_KEY_INVALID" });
    expect(c.sql.prepare("SELECT * FROM ai_credentials").get()).toEqual(before);
    await changeAIProfile(
      c.env,
      "user_a",
      json({ action: "save", key: secondKey }),
      vi.fn(async () => models()),
    );
    expect((await readAIProfile(c.env, "user_a")).suffix).toBe("9876");
  });
  it("entfernt nur den eigenen Schlüssel und sperrt laufende Antworten", async () => {
    await save();
    await save("user_b", secondKey);
    let resolve!: (v: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    const pending = message(undefined, c.a1, "user_a", fetcher);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await changeAIProfile(c.env, "user_a", json({ action: "remove" }));
    resolve(answer());
    await expect(pending).rejects.toMatchObject({ code: "AI_CANCELLED" });
    expect((await readAIProfile(c.env, "user_a")).configured).toBe(false);
    expect((await readAIProfile(c.env, "user_b")).configured).toBe(true);
  });
  it("kann beim Prüfen entfernte Schlüssel nicht wieder anlegen", async () => {
    let resolve!: (v: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    const pending = changeAIProfile(
      c.env,
      "user_a",
      json({ action: "save", key }),
      fetcher,
    );
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await changeAIProfile(c.env, "user_a", json({ action: "remove" }));
    resolve(models());
    await expect(pending).rejects.toMatchObject({ code: "AI_CANCELLED" });
    expect((await readAIProfile(c.env, "user_a")).configured).toBe(false);
  });
  it("deaktiviert nur KI bei fehlendem Secret oder fehlender Migration", async () => {
    c.env.AI_CREDENTIALS_KEY = "";
    expect((await readAIProfile(c.env, "user_a")).available).toBe(false);
    c.env.AI_CREDENTIALS_KEY = Buffer.alloc(32).toString("base64");
    c.sql.exec("DROP TABLE ai_credentials");
    expect((await readAIProfile(c.env, "user_a")).available).toBe(false);
  });
  it("prüft Modellverfügbarkeit und erlaubt keinen fremden Schlüsselparameter", async () => {
    await expect(
      changeAIProfile(
        c.env,
        "user_a",
        json({ action: "save", key, owner: "user_b" }),
      ),
    ).rejects.toMatchObject({ code: "AI_INPUT" });
    await expect(
      changeAIProfile(
        c.env,
        "user_a",
        json({ action: "save", key }),
        vi.fn(async () => Response.json({ data: [] })),
      ),
    ).rejects.toMatchObject({ code: "AI_MODELS" });
  });
});

describe("Erfassung, Datenschutz und Grenzen", () => {
  it("verhindert neue Referenzen anstelle bestehender manueller Zeilen", async () => {
    await save();
    const draft = proposalToDraft(
        aiProposal(),
        JSON.parse((await c.a()).settings),
        "Test",
      ).draft!,
      p = aiProposal();
    p.expenses[0].ref = "new1";
    p.work[0].expense_refs = ["new1"];
    await expect(
      message(
        { messages: [{ role: "user", content: "Titel ergänzen" }], draft },
        c.a1,
        "user_a",
        vi.fn(async () => answer(p)),
      ),
    ).rejects.toMatchObject({ code: "AI_RESPONSE" });
  });
  it("liefert Entwürfe mit einem Rechnungsbetrag und speichert erst über die bestehende Aktion", async () => {
    await save();
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe(AI_TEXT_MODEL);
        expect(body.response_format.json_schema.strict).toBe(true);
        expect(JSON.stringify(body)).not.toContain(key);
        expect(body.messages[1].content).toMatch(/today.*\d{4}-\d{2}-\d{2}/);
        expect(JSON.stringify(body)).not.toContain("Documents");
        return answer();
      },
    );
    const out = await message(undefined, c.a1, "user_a", fetcher);
    expect(out.draft!.package.expenses[0]).toMatchObject({
      amount_cents: 6500,
      odometer_km: 82400,
      date: "2026-10-28",
    });
    let a = await c.a(),
      v = await vehicle(c.env, a, c.a1);
    expect((await fullState(c.env, a, v)).Expenses).toHaveLength(0);
    const op = crypto.randomUUID(),
      arg = {
        ...request(out.draft!.package, {
          operation_id: op,
          capture: out.draft!.capture,
        }),
        expected_revision: v.revision,
      };
    await c.write(c.a1, "commit", arg, "user_a", op);
    await c.write(c.a1, "commit", arg, "user_a", op);
    a = await c.a();
    v = await vehicle(c.env, a, c.a1);
    const s = await fullState(c.env, a, v);
    expect(s.Work).toHaveLength(1);
    expect(s.Expenses).toHaveLength(1);
    expect(totals(s).expenses).toBe(6500);
  });
  it("verwendet Eigenleistungswerkstatt, trennt Verkäufer und lässt fehlende Angaben leer", async () => {
    const a = await c.a(),
      settings = JSON.parse(a.settings);
    settings.workshops = [
      {
        id: "self",
        name: "Eigene Garage",
        address: "Private Adresse",
        archived: false,
      },
    ];
    settings.self_workshop_id = "self";
    c.sql
      .prepare("UPDATE fleet_accounts SET settings=? WHERE owner=?")
      .run(JSON.stringify(settings), a.owner);
    await save();
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(init?.body)).not.toContain("Private Adresse");
        const p = aiProposal();
        p.expenses[0].vendor = null;
        p.work[0].date = null;
        return answer(p);
      },
    );
    const out = await message(undefined, c.a1, "user_a", fetcher);
    expect(out.draft!.capture.workshops_by_work_ref?.w1).toBe("self");
    expect(out.draft!.package.expenses[0].vendor).toBe(null);
    expect(out.draft!.package.work[0].date).toBe(null);
  });
  it("behandelt geplante Kosten als Schätzung und mehrere verknüpfte Arbeiten ohne doppelte Kosten", async () => {
    const p = aiProposal();
    p.work[0].status = "planned";
    p.work[0].estimated_cost_cents = 20000;
    p.work[0].expense_refs = [];
    p.expenses = [];
    const a = await c.a(),
      s = JSON.parse(a.settings),
      out = proposalToDraft(p, s, "Test");
    expect(out.draft!.package.expenses).toHaveLength(0);
    expect(out.draft!.package.work[0].estimated_cost_cents).toBe(20000);
    const multi = aiProposal();
    multi.work.push({ ...multi.work[0], ref: "w2", title: "Filterwechsel" });
    const draft = proposalToDraft(multi, s, "Test").draft!;
    await c.write(
      c.a1,
      "commit",
      request(draft.package, { capture: draft.capture }),
    );
    const state = await fullState(
      c.env,
      await c.a(),
      await vehicle(c.env, await c.a(), c.a1),
    );
    expect(totals(state).expenses).toBe(6500);
  });
  it("trennt zwei Konten mit jeweils zwei Fahrzeugen und weist manipulierte Kennungen zurück", async () => {
    await save();
    await save("user_b", secondKey);
    for (const [owner, ids, k] of [
      ["user_a", [c.a1, c.a2], key],
      ["user_b", [c.b1, c.b2], secondKey],
    ] as const)
      for (const id of ids) {
        const f = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
          expect(new Headers(init?.headers).get("Authorization")).toBe(
            "Bearer " + k,
          );
          return answer();
        });
        expect((await message(undefined, id, owner, f)).draft).not.toBe(null);
      }
    const f = vi.fn(async () => answer());
    await expect(message(undefined, c.b1, "user_a", f)).rejects.toMatchObject({
      status: 404,
    });
    expect(f).not.toHaveBeenCalled();
    await expect(
      message({
        messages: [{ role: "user", content: "Test" }],
        owner: "user_b",
      }),
    ).rejects.toMatchObject({ code: "AI_INPUT" });
  });
  it("begrenzt parallel pro Konto und auf zehn Anfragen je Minute, ohne Wiederholung", async () => {
    await save();
    let resolve!: (v: Response) => void;
    const f = vi.fn(() => new Promise<Response>((r) => (resolve = r))),
      pending = message(undefined, c.a1, "user_a", f);
    await vi.waitFor(() => expect(f).toHaveBeenCalledOnce());
    await expect(message(undefined, c.a2)).rejects.toMatchObject({
      code: "AI_BUSY",
    });
    resolve(answer());
    await pending;
    c.sql
      .prepare(
        "UPDATE ai_limits SET window=?,requests=10,lease=NULL,lease_until=0 WHERE owner='user_a'",
      )
      .run(Math.floor(Date.now() / 60000));
    const limited = vi.fn(async () => answer());
    await expect(
      message(undefined, c.a1, "user_a", limited),
    ).rejects.toMatchObject({ code: "AI_BUSY" });
    expect(limited).not.toHaveBeenCalled();
  });
  it.each([429, 500, 401])(
    "behandelt Anbieterfehler %s ohne Schlüssel im Fehler oder Wiederholung",
    async (status) => {
      await save();
      const f = vi.fn(async () => new Response(key, { status }));
      let error: unknown;
      try {
        await message(undefined, c.a1, "user_a", f);
      } catch (e) {
        error = e;
      }
      expect(error).toBeTruthy();
      expect(String(error)).not.toContain(key);
      expect(f).toHaveBeenCalledOnce();
    },
  );
  it("verwirft ungültige, abgebrochene und veraltete Antworten", async () => {
    await save();
    const bad = aiProposal();
    bad.work[0].expense_refs = ["nicht-vorhanden"];
    await expect(
      message(
        undefined,
        c.a1,
        "user_a",
        vi.fn(async () => answer(bad)),
      ),
    ).rejects.toMatchObject({ code: "AI_RESPONSE" });
    const ctrl = new AbortController(),
      f = vi.fn(async () => {
        ctrl.abort();
        return answer();
      });
    await expect(
      message(undefined, c.a1, "user_a", f, ctrl.signal),
    ).rejects.toMatchObject({ code: "AI_CANCELLED" });
    const archived = vi.fn(async () => {
      c.sql
        .prepare(
          "UPDATE fleet_vehicles SET generation='changed' WHERE owner='user_a' AND id=?",
        )
        .run(c.a1);
      return answer();
    });
    await expect(
      message(undefined, c.a1, "user_a", archived),
    ).rejects.toMatchObject({ code: "AI_CANCELLED" });
  });
  it("gibt weder kaputte Modellantworten noch Netzwerkfehler ungefiltert zurück", async () => {
    await save();
    await expect(
      message(
        undefined,
        c.a1,
        "user_a",
        vi.fn(async () => Response.json({ choices: [] })),
      ),
    ).rejects.toMatchObject({ code: "AI_RESPONSE" });
    await expect(
      message(
        undefined,
        c.a1,
        "user_a",
        vi.fn(async () => {
          throw Error(key);
        }),
      ),
    ).rejects.toMatchObject({ code: "AI_CONNECTION" });
  });
  it("unterscheidet eine Zeitüberschreitung von einem Verbindungsfehler", async () => {
    await save();
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    const fetcher = vi.fn(async () => {
      timeout.abort();
      throw Error(key);
    });
    await expect(
      message(undefined, c.a1, "user_a", fetcher),
    ).rejects.toMatchObject({
      code: "AI_TIMEOUT",
      message:
        "Groq hat innerhalb von 30 Sekunden nicht geantwortet. Bitte später erneut versuchen.",
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("behandelt einen ausdrücklichen Abbruch nicht als Zeitüberschreitung", async () => {
    await save();
    const controller = new AbortController(),
      fetcher = vi.fn(async () => {
        controller.abort();
        throw Error(key);
      });
    await expect(
      message(undefined, c.a1, "user_a", fetcher, controller.signal),
    ).rejects.toMatchObject({ code: "AI_CANCELLED", status: 409 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("Audio und Entwurfsprüfung", () => {
  it("transkribiert ohne Dateiablage oder automatische Buchung", async () => {
    await save();
    const before = c.objects.size,
      f = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
        const form = init?.body as FormData;
        expect(form.get("model")).toBe(AI_AUDIO_MODEL);
        expect(form.get("language")).toBe("de");
        return Response.json({ text: " Ölwechsel bei 82.400 km " });
      });
    expect(await audio(webm(), f)).toEqual({ text: "Ölwechsel bei 82.400 km" });
    expect(c.objects.size).toBe(before);
    expect(
      c.sql
        .prepare("SELECT COUNT(*) n FROM fleet_entities WHERE kind='Expenses'")
        .get()?.n,
    ).toBe(0);
  });
  it("weist zu große und falsch deklarierte Audioaufnahmen vor Anbieteraufruf ab", async () => {
    await save();
    const f = vi.fn(async () => Response.json({ text: "x" }));
    await expect(
      audio(
        new Blob([new Uint8Array(AI_AUDIO_BYTES + 1)], { type: "audio/webm" }),
        f,
      ),
    ).rejects.toMatchObject({ code: "AI_AUDIO" });
    await expect(
      audio(new Blob(["kein audio!............"], { type: "audio/webm" }), f),
    ).rejects.toMatchObject({ code: "AI_AUDIO" });
    expect(f).not.toHaveBeenCalled();
  });
  it("verwirft fremde Fahrzeugkennungen und leere Transkripte", async () => {
    await save();
    const f = vi.fn(async () => Response.json({ text: "" }));
    await expect(audio(webm(), f, c.b2)).rejects.toMatchObject({ status: 404 });
    expect(f).not.toHaveBeenCalled();
    await expect(audio(webm(), f)).rejects.toMatchObject({
      code: "AI_TRANSCRIPT",
    });
  });
  it("erhält manuelle Korrekturen, Positionspreise und zeigt abweichende Vorschläge", async () => {
    const s = JSON.parse((await c.a()).settings),
      draft = proposalToDraft(aiProposal(), s, "Test").draft!,
      manual = clone(draft);
    manual.package.expenses[0].title = "Mein Titel";
    manual.package.expenses[0].amount_cents = 7000;
    manual.capture.prices_by_expense_ref = { e1: [] };
    const merged = mergeAssistantDraft(manual, draft);
    expect(merged.draft.package.expenses[0].title).toBe("Mein Titel");
    expect(merged.draft.package.expenses[0].amount_cents).toBe(7000);
    expect(merged.conflicts.map((c) => c.field)).toContain("amount_cents");
    expect(merged.draft.capture.prices_by_expense_ref).toEqual({ e1: [] });
    expect(draft.package.expenses[0].title).toBe("Öl und Filter");
    const protectedOnly = mergeAssistantDraft(manual, draft, [
      "expenses.e1.title",
    ]);
    expect(protectedOnly.draft.package.expenses[0].amount_cents).toBe(6500);
    manual.package.expenses[0].amount_cents = null;
    expect(
      mergeAssistantDraft(manual, draft, ["expenses.e1.amount_cents"]).draft
        .package.expenses[0].amount_cents,
    ).toBe(null);
  });
  it("prüft Rollen, Größe, Referenzen, Kalenderdaten und Zusatzangaben", async () => {
    expect(() =>
      validateAssistantRequest({
        messages: [{ role: "system", content: "Geheimnisse" }],
      }),
    ).toThrow();
    expect(() =>
      validateAssistantRequest({
        messages: [{ role: "user", content: "x".repeat(4001) }],
      }),
    ).toThrow();
    const p = aiProposal(),
      s = JSON.parse((await c.a()).settings);
    p.work[0].ref = "__proto__";
    expect(() => proposalToDraft(p, s, "Test")).toThrow();
    p.work[0].ref = "w1";
    p.work[0].date = "2026-02-30";
    expect(() => proposalToDraft(p, s, "Test")).toThrow();
    const pkg = blankPackage();
    expect(() =>
      validateAssistantRequest({
        messages: [{ role: "user", content: "Test" }],
        draft: { package: pkg, capture: {}, owner: "user_b" },
      }),
    ).toThrow();
  });
});

describe("Authentifizierte Schnittstellen", () => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  function token(owner: string) {
    const now = Math.floor(Date.now() / 1000),
      h = Buffer.from(
        JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-ai" }),
      ).toString("base64url"),
      p = Buffer.from(
        JSON.stringify({
          iss: "https://synthetic.clerk.accounts.dev",
          sub: owner,
          sid: "sess_test",
          azp: "https://car.jurodak.com",
          iat: now,
          nbf: now - 1,
          exp: now + 300,
          v: 2,
          sts: "active",
        }),
      ).toString("base64url"),
      data = h + "." + p;
    return (
      data +
      "." +
      sign("RSA-SHA256", Buffer.from(data), pair.privateKey).toString(
        "base64url",
      )
    );
  }
  it("prüft Clerk, Website-Ursprung und Fahrzeugberechtigung", async () => {
    c.env.CLERK_ISSUER = "https://synthetic.clerk.accounts.dev";
    c.env.CLERK_PUBLISHABLE_KEY =
      "pk_test_" +
      Buffer.from("synthetic.clerk.accounts.dev$").toString("base64");
    c.env.CLERK_SECRET_KEY = "sk_test_SYNTHETIC";
    c.env.CLERK_JWT_KEY = pair.publicKey
      .export({ format: "pem", type: "spki" })
      .toString();
    const origin = "https://car.jurodak.com",
      url = origin + "/api/v3/ai/profile";
    expect((await handle(new Request(url), c.env)).status).toBe(401);
    const headers = {
      Authorization: "Bearer " + token("user_a"),
      Origin: origin,
      "Content-Type": "application/json",
    };
    expect((await handle(new Request(url, { headers }), c.env)).status).toBe(
      200,
    );
    expect(
      (
        await handle(
          new Request(url, {
            method: "POST",
            headers: { ...headers, Origin: "https://evil.invalid" },
            body: JSON.stringify({ action: "remove" }),
          }),
          c.env,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handle(
          new Request(
            origin + "/api/v3/vehicles/" + c.b1 + "/assistant/message",
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                messages: [{ role: "user", content: "Test" }],
              }),
            },
          ),
          c.env,
        )
      ).status,
    ).toBe(404);
  });
});

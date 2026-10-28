import { backup as backupLegacy } from "../auth/src/legacy-backup";
import { createAccount, readState } from "../auth/src/v2/store";
import { tables } from "../shared/logic";
import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountAction } from "../auth/src/fleet/actions";
import { handle } from "../auth/src/fleet/api";
import {
  exportMetadata,
  restorePreview,
  restoreStart,
  restoreSwitch,
} from "../auth/src/fleet/backups";
import { document } from "../auth/src/fleet/files";
import { daily, requestBackup, testMail } from "../auth/src/fleet/jobs";
import {
  fullState,
  migrateLegacy,
  vehicle,
  vehicles,
} from "../auth/src/fleet/store";
import { nextRun } from "../auth/src/fleet/time";
import { bootstrap, page, view } from "../auth/src/fleet/views";
import worker from "../auth/src/worker";
import { emptyHistoryFilter, selectedVehicle } from "../shared/fleet";
import { canonical, meta, totals } from "../shared/logic";
import { pkg, reminder, request, work } from "./fixtures";
import { pdf, png, setupFleet } from "./fleet-fixture";
let c: Awaited<ReturnType<typeof setupFleet>>;
beforeEach(async () => {
  c = await setupFleet();
});
afterEach(() => {
  c.sql.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function state(id = c.a1, owner = "user_a") {
  const a = await c.a(owner);
  return fullState(c.env, a, await vehicle(c.env, a, id));
}
async function book(id = c.a1, extra: any = {}, op = crypto.randomUUID()) {
  return c.write(
    id,
    "commit",
    request(pkg(), { operation_id: op, ...extra }),
    "user_a",
    op,
  );
}
describe("Mehrere Fahrzeuge, Konto und gezielte Änderungen", () => {
  it("öffnet vier getrennte Fahrzeuge und wählt je Konto das zuletzt aktive Fahrzeug", async () => {
    const a = await bootstrap(c.env, await c.a()),
      b = await bootstrap(c.env, await c.a("user_b"));
    expect(a.vehicles).toHaveLength(2);
    expect(b.vehicles).toHaveLength(2);
    expect(selectedVehicle(a.vehicles, c.a2)).toBe(c.a2);
    expect(selectedVehicle(a.vehicles, c.b1)).toBe(a.vehicles[0].id);
  });
  it.each(["Expenses", "Documents", "Work", "Reminders", "AuditLog"])(
    "hält %s des zweiten Fahrzeugs leer",
    async (table) => {
      const p = pkg();
      p.work = [work()];
      p.reminders = [reminder()];
      await c.write(c.a1, "commit", request(p, { confirm_reminders: true }));
      expect((await state(c.a2))[table as "Expenses"]).toHaveLength(0);
      expect((await state(c.b1, "user_b"))[table as "Expenses"]).toHaveLength(
        0,
      );
    },
  );
  it("speichert nur geänderte Zeilen und gibt keinen vollständigen Stand zurück", async () => {
    const before = c.queries.length,
      out = await book();
    expect(out).not.toHaveProperty("state");
    expect(out.changes.Expenses).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain("NotificationLog");
    expect(
      c.queries
        .slice(before)
        .some((q) => q.includes("DELETE FROM record_entities")),
    ).toBe(false);
  });
  it("lädt für eine kleine Fahrzeugänderung keine Historie", async () => {
    await book();
    const v = (await state()).Vehicles[0],
      start = c.queries.length;
    const out = await c.write(c.a1, "edit", {
      table: "Vehicles",
      id: v.id,
      revision: v.revision,
      patch: { plate: "TEST" },
    });
    expect(out.vehicle?.vehicle.plate).toBe("TEST");
    expect(
      c.queries
        .slice(start)
        .filter((q) => q.startsWith("SELECT payload"))
        .join(" "),
    ).not.toContain("kind='Expenses'");
    expect(JSON.stringify(out).length).toBeLessThan(3000);
  });
  it("lässt parallele Änderungen an zwei Fahrzeugen zu", async () => {
    await Promise.all([c.write(c.a1, "smoke", {}), c.write(c.a2, "smoke", {})]);
    expect((await state()).AuditLog).toHaveLength(1);
    expect((await state(c.a2)).AuditLog).toHaveLength(1);
  });
  it("erkennt Konflikte im selben Fahrzeug und rollt einen fehlerhaften Batch zurück", async () => {
    const a = await c.a(),
      v = await vehicle(c.env, a, c.a1);
    await c.write(c.a1, "smoke", {});
    await expect(
      c.write(c.a1, "smoke", { expected_revision: v.revision }),
    ).rejects.toThrow(/Konflikt/);
    const before = canonical(await state());
    c.failBatch(true);
    await expect(c.write(c.a1, "smoke", {})).rejects.toThrow();
    c.failBatch(false);
    expect(canonical(await state())).toBe(before);
  });
  it("verwendet die Antwort nach verlorenem Schreibaufruf für dieselbe Kennung wieder", async () => {
    const op = crypto.randomUUID(),
      arg = {
        table: "Vehicles",
        id: c.a1,
        revision: (await state()).Vehicles[0].revision,
        patch: { plate: "TEST" },
        expected_revision: 1,
      },
      a = await c.a();
    const { mutate } = await import("../auth/src/fleet/actions");
    const first = await mutate(c.env, a, c.a1, "edit", arg, op),
      second = await mutate(c.env, await c.a(), c.a1, "edit", arg, op);
    expect(second).toEqual(first);
    expect((await state()).AuditLog).toHaveLength(1);
    await expect(
      mutate(
        c.env,
        await c.a(),
        c.a1,
        "edit",
        { ...arg, patch: { plate: "ANDERS" } },
        op,
      ),
    ).rejects.toThrow(/anderen Angaben/);
  });
  it("verhindert doppelte Kosten durch Import- und Vorgangskennung", async () => {
    const p = request(pkg());
    await c.write(c.a1, "commit", p);
    await c.write(c.a1, "commit", p);
    expect(totals(await state()).expenses).toBe(5000);
    expect((await state()).Expenses).toHaveLength(1);
  });
  it("prüft Dubletten weiterhin auch über Belegnummer und Verkäufer", async () => {
    await book();
    const p = pkg();
    p.expenses[0].notes = "Anderer Vorgang";
    await expect(
      c.write(
        c.a1,
        "commit",
        request(p, { operation_id: crypto.randomUUID() }),
      ),
    ).rejects.toThrow(/doppelte/);
  });
  it("teilt Werkstätten und Vorlagen, bewahrt aber historische Werkstattkopien", async () => {
    const a = await c.a(),
      workshops = [
        { id: "own", name: "Garage", address: "Alt", archived: false },
      ];
    await accountAction(
      c.env,
      a,
      "settings",
      {
        revision: a.revision,
        expected_revision: a.revision,
        patch: { workshops, self_workshop_id: "own" },
      },
      crypto.randomUUID(),
    );
    const p = pkg();
    p.work = [work({ expense_refs: ["e1"] })];
    await c.write(
      c.a1,
      "commit",
      request(p, { capture: { workshops_by_work_ref: { w1: "own" } } }),
    );
    expect((await state(c.a2)).Settings[0].workshops).toEqual(workshops);
    const fresh = await c.a();
    await accountAction(
      c.env,
      fresh,
      "settings",
      {
        revision: fresh.revision,
        expected_revision: fresh.revision,
        patch: { workshops: [{ ...workshops[0], name: "Neue Garage" }] },
      },
      crypto.randomUUID(),
    );
    expect((await state()).Work[0].workshop_snapshot?.name).toBe("Garage");
  });
  it("trennt ausgeblendete Kategorien je Fahrzeug", async () => {
    const s = await state();
    await c.write(c.a1, "edit", {
      table: "Settings",
      id: s.Settings[0].id,
      revision: s.Settings[0].revision,
      patch: { hidden_categories: ["Pflege"] },
    });
    expect((await state(c.a2)).Settings[0].hidden_categories).toEqual([]);
  });
  it("archiviert schreibgeschützt und reaktiviert dasselbe Fahrzeug", async () => {
    await c.write(c.a1, "archive", { archived: true });
    await expect(book()).rejects.toThrow(/schreibgeschützt/);
    expect((await state()).Vehicles[0].archived).toBe(true);
    await c.write(c.a1, "archive", { archived: false });
    await book();
    expect((await state()).Expenses).toHaveLength(1);
  });
  it("prüft verknüpfte Rechnungen und Kostenanteile", async () => {
    const p = pkg();
    p.work = [work({ expense_refs: ["e1"] })];
    await c.write(c.a1, "commit", request(p));
    const w = (await state()).Work[0];
    await expect(
      c.write(c.a1, "edit", {
        table: "Work",
        id: w.id,
        revision: w.revision,
        patch: {
          allocations: [{ expense_id: w.expense_refs[0], amount_cents: 5001 }],
        },
      }),
    ).rejects.toThrow(/übersteigen/);
  });
});
describe("Private Originale, Galerie, Wiederherstellung und Migration", () => {
  it("übernimmt eine tatsächlich gespeicherte alte D1-Akte mit IDs, Beträgen und Historie", async () => {
    const p = pkg();
    p.work = [work({ expense_refs: ["e1"] })];
    await c.write(c.a1, "commit", request(p));
    const source = await state(),
      old = await createAccount(c.env, "user_legacy", "legacy@example.invalid");
    for (const kind of tables)
      for (const row of source[kind])
        c.sql
          .prepare(
            "INSERT INTO record_entities(owner,generation,kind,id,payload) VALUES(?,?,?,?,?)",
          )
          .run(old.owner, old.generation, kind, row.id, JSON.stringify(row));
    expect((await http("bootstrap", "user_legacy")).status).toBe(409);
    expect(
      (await http("migrate", "user_legacy", { confirm: true })).status,
    ).toBe(200);
    const a = await c.a("user_legacy"),
      vs = await vehicles(c.env, a),
      out = await fullState(c.env, a, vs[0]);
    expect(out.Expenses).toEqual(source.Expenses);
    expect(out.Work).toEqual(source.Work);
    expect(out.AuditLog).toEqual(source.AuditLog);
    expect(vs).toHaveLength(1);
    await c.write(vs[0].id, "smoke", {}, "user_legacy");
    expect(canonical((await readState(c.env, "user_legacy")).state)).toBe(
      canonical(source),
    );
    expect(
      c.sql
        .prepare(
          "SELECT COUNT(*) n FROM record_entities WHERE owner='user_legacy'",
        )
        .get(),
    ).toMatchObject({ n: tables.reduce((n, k) => n + source[k].length, 0) });
  });
  it("wiederholt die Sicherung vor Migration nach einem Abbruch mit unveränderten Bytes", async () => {
    const s = await state(),
      a = await createAccount(c.env, "user_retry", "retry@example.invalid");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
    try {
      await backupLegacy(c.env, a, s);
      const objects = [...c.objects.keys()],
        usage = c.sql
          .prepare("SELECT bytes FROM record_usage WHERE scope='user_retry'")
          .get();
      vi.setSystemTime(new Date("2026-10-28T11:00:00Z"));
      await backupLegacy(c.env, a, s);
      expect([...c.objects.keys()]).toEqual(objects);
      expect(
        c.sql
          .prepare("SELECT bytes FROM record_usage WHERE scope='user_retry'")
          .get(),
      ).toEqual(usage);
    } finally {
      vi.useRealTimers();
    }
  });

  it("trennt Dateien auch zwischen Fahrzeugen desselben Kontos", async () => {
    const u = await c.file(),
      p = pkg();
    p.documents = [
      {
        ref: "d1",
        source_filename: "Rechnung.pdf",
        title: "Original",
        document_type: "invoice",
      },
    ];
    p.expenses[0].document_refs = ["d1"];
    await c.write(c.a1, "commit", request(p, { documents: { d1: u.id } }));
    const doc = (await state()).Documents[0];
    expect(
      (await document(c.env, await c.a(), c.a1, doc.id, false)).bytes,
    ).toEqual(pdf);
    await expect(
      document(c.env, await c.a(), c.a2, doc.id, false),
    ).rejects.toThrow(/nicht zu diesem Fahrzeug/);
    await expect(
      document(c.env, await c.a("user_b"), c.a1, doc.id, false),
    ).rejects.toThrow(/nicht zu dieser Akte/);
  });
  it("verhindert Verknüpfungen fremder Uploads", async () => {
    const u = await c.file(),
      p = pkg();
    p.documents = [
      {
        ref: "d1",
        source_filename: "Rechnung.pdf",
        title: "Original",
        document_type: "invoice",
      },
    ];
    await expect(
      c.write(
        c.a2,
        "commit",
        request(p, { documents: { d1: u.id }, allow_missing: false }),
      ),
    ).rejects.toThrow(/Beleg fehlt/);
  });
  it("übernimmt Standardfoto, Positionspreise und Originale ohne Änderung anderer Fahrzeuge", async () => {
    const u = await c.file(),
      image = await c.file(c.a1, png, "image/png"),
      p = pkg();
    p.documents = [
      {
        ref: "d1",
        source_filename: "Rechnung.pdf",
        title: "Original",
        document_type: "invoice",
      },
      {
        ref: "photo",
        source_filename: "Auto.png",
        title: "Auto",
        document_type: "photo",
      },
    ];
    p.expenses[0].document_refs = ["d1"];
    await c.write(
      c.a1,
      "commit",
      request(p, { documents: { d1: u.id, photo: image.id } }),
    );
    let s = await state();
    const photo = s.Documents.find((d) => d.document_type === "photo")!;
    await c.write(c.a1, "edit", {
      table: "Vehicles",
      id: c.a1,
      revision: s.Vehicles[0].revision,
      patch: { photo_id: photo.id },
    });
    s = await state();
    const other = canonical(await state(c.a2)),
      r = await restoreStart(c.env, await c.a(), c.a1, s);
    expect(
      (await restorePreview(c.env, await c.a(), r.id)).missing.length,
    ).toBe(2);
    await c.file(c.a1, pdf, "application/pdf", r.id);
    await c.file(c.a1, png, "image/png", r.id);
    expect((await restorePreview(c.env, await c.a(), r.id)).missing).toEqual(
      [],
    );
    await restoreSwitch(c.env, await c.a(), r.id, true, crypto.randomUUID());
    const restored = await state();
    expect(restored.Expenses).toEqual(s.Expenses);
    expect(restored.Vehicles[0].photo_id).toBe(photo.id);
    expect(canonical(await state(c.a2))).toBe(other);
  });
  it("hält Daten vor Aktivierung getrennt und weist fremde Wiederherstellungen ab", async () => {
    const s = await state();
    s.Vehicles[0].model = "Import";
    const r = await restoreStart(c.env, await c.a(), c.a1, s);
    expect((await state()).Vehicles[0].model).not.toBe("Import");
    await expect(
      restorePreview(c.env, await c.a("user_b"), r.id),
    ).rejects.toThrow(/nicht zu diesem Konto/);
    await expect(
      restoreSwitch(c.env, await c.a(), r.id, false, crypto.randomUUID()),
    ).rejects.toThrow(/Bestätigung/);
  });
  it("blockiert Aktivierung nach paralleler Fahrzeugänderung", async () => {
    const r = await restoreStart(c.env, await c.a(), c.a1, await state());
    await c.write(c.a1, "smoke", {});
    await expect(
      restoreSwitch(c.env, await c.a(), r.id, true, crypto.randomUUID()),
    ).rejects.toThrow(/Konflikt/);
  });
  it("exportiert und aktiviert ein gesamtes Konto ausdrücklich", async () => {
    await book();
    const backup = (await exportMetadata(c.env, await c.a())) as any,
      r = await restoreStart(c.env, await c.a(), null, backup);
    expect(
      (await restorePreview(c.env, await c.a(), r.id)).states,
    ).toHaveLength(2);
    await restoreSwitch(c.env, await c.a(), r.id, true, crypto.randomUUID());
    expect(await vehicles(c.env, await c.a())).toHaveLength(2);
    expect(totals(await state()).expenses).toBe(5000);
    expect((await state(c.b1, "user_b")).Expenses).toHaveLength(0);
  });
  it("zählt Dateiwiederholungen einmal und reserviert Quoten vor dem R2-Zugriff", async () => {
    c.failPut(true);
    await expect(c.file()).rejects.toThrow(/R2/);
    c.failPut(false);
    await c.file();
    await c.file();
    expect(c.objects.size).toBe(1);
    c.sql
      .prepare("UPDATE record_usage SET bytes=1000000000 WHERE scope='user_a'")
      .run();
    await expect(c.file(c.a1, png, "image/png")).rejects.toThrow(
      /Speichergrenze/,
    );
  });
  it("erhält Originale und alte Tabellen bei wiederholter Migration", async () => {
    const n = c.sql.prepare("SELECT COUNT(*) AS n FROM record_entities").get();
    await migrateLegacy(c.env, "user_a");
    await migrateLegacy(c.env, "user_a");
    expect(
      c.sql.prepare("SELECT COUNT(*) AS n FROM record_entities").get(),
    ).toEqual(n);
    expect(await vehicles(c.env, await c.a())).toHaveLength(2);
  });
});
describe("Seitennavigation und kleinere Antworten", () => {
  it("sucht in der ganzen Historie und prüft Originalfilter über Fahrzeug und Konto", async () => {
    const u = await c.file(),
      p = pkg();
    p.documents = [
      {
        ref: "d1",
        source_filename: "Rechnung.pdf",
        title: "Original",
        document_type: "invoice",
      },
    ];
    p.expenses[0].title = "Ältere Zündkerzenrechnung";
    p.expenses[0].document_refs = ["d1"];
    await c.write(c.a1, "commit", request(p, { documents: { d1: u.id } }));
    const a = await c.a(),
      v = await vehicle(c.env, a, c.a1),
      e = (await state()).Expenses[0];
    for (let i = 0; i < 70; i++)
      c.sql.prepare("INSERT INTO fleet_entities VALUES(?,?,?,?,?,?)").run(
        a.owner,
        v.id,
        v.generation,
        "Expenses",
        "later-" + i,
        JSON.stringify({
          ...e,
          id: "later-" + i,
          title: "Neuere Rechnung",
          date: "2026-10-28",
          document_refs: [],
        }),
      );
    const filtered = await view(
      c.env,
      a,
      c.a1,
      "/historie?" +
        new URLSearchParams({
          filter: JSON.stringify({
            ...emptyHistoryFilter,
            search: "Zündkerzen",
            proof: "with",
          }),
        }),
      "2026",
    );
    expect(filtered.state.Expenses.map((x) => x.title)).toEqual([
      "Ältere Zündkerzenrechnung",
    ]);
    expect(
      (
        await page(
          c.env,
          a,
          v,
          "Expenses",
          null,
          "history:" +
            JSON.stringify({ ...emptyHistoryFilter, proof: "missing" }),
        )
      ).rows,
    ).toHaveLength(50);
    expect(
      (
        await page(
          c.env,
          a,
          v,
          "Expenses",
          null,
          "history:" + JSON.stringify({ ...emptyHistoryFilter, proof: "with" }),
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("behält die gemeinsame Einstellungsrevision nach fahrzeugbezogenen Änderungen", async () => {
    const s = await state();
    await c.write(c.a1, "edit", {
      table: "Settings",
      id: s.Settings[0].id,
      revision: s.Settings[0].revision,
      patch: { hidden_categories: ["Pflege"] },
    });
    const fresh = (await state()).Settings[0],
      a = await c.a();
    expect(fresh.revision).toBe(a.revision);
    await accountAction(
      c.env,
      a,
      "settings",
      {
        revision: fresh.revision,
        expected_revision: a.revision,
        patch: { external_fuel_url: "https://example.org" },
      },
      crypto.randomUUID(),
    );
    expect((await state(c.a2)).Settings[0].external_fuel_url).toBe(
      "https://example.org",
    );
  });
  it("liefert stabile Seiten von 50 Einträgen ohne Lücken", async () => {
    const a = await c.a(),
      v = await vehicle(c.env, a, c.a1);
    for (let i = 0; i < 123; i++)
      c.sql.prepare("INSERT INTO fleet_entities VALUES(?,?,?,?,?,?)").run(
        a.owner,
        v.id,
        v.generation,
        "AuditLog",
        "id-" + String(i).padStart(3, "0"),
        JSON.stringify({
          ...meta(
            "id-" + String(i).padStart(3, "0"),
            new Date().toISOString(),
            v.id,
          ),
          entity_id: v.id,
          action: "test",
          before: null,
          after: null,
        }),
      );
    let cursor: string | null = null,
      ids: string[] = [];
    do {
      const out = await page(c.env, a, v, "AuditLog", cursor);
      ids.push(...out.rows.map((r) => r.id));
      cursor = out.page.cursor;
    } while (cursor);
    expect(ids).toHaveLength(123);
    expect(new Set(ids).size).toBe(123);
  });
  it.each(["bad", "e30=", "W10="])(
    "weist manipulierten Cursor %s ab",
    async (cursor) => {
      const a = await c.a();
      await expect(
        page(c.env, a, await vehicle(c.env, a, c.a1), "Expenses", cursor),
      ).rejects.toThrow(/Seitennavigation/);
    },
  );
  it("liefert beim Einstieg keine internen vollständigen Protokolle oder Originale", async () => {
    await book();
    const out = await view(c.env, await c.a(), c.a1, "/", "2026");
    expect(out.state.AuditLog).toHaveLength(0);
    expect(out.state.Uploads).toHaveLength(0);
    expect(JSON.stringify(out)).not.toContain("base64");
  });
});
describe("Tagesaufgaben und nachvollziehbare Ergebnisse", () => {
  it.each([
    ["2026-03-28T08:00:00Z", "2026-03-29T06:00:00.000Z"],
    ["2026-10-24T08:00:00Z", "2026-10-25T07:00:00.000Z"],
    ["2026-10-28T06:00:00Z", "2026-10-28T07:00:00.000Z"],
  ])("plant 08 Uhr Berlin nach %s", (at, expected) =>
    expect(new Date(nextRun(Date.parse(at))).toISOString()).toBe(expected),
  );
  it("pausiert ohne Freigabe der Automation", async () => {
    c.env.AUTOMATION_ENABLED = "false";
    expect(await daily(c.env)).toMatchObject({
      processed: 0,
      paused: true,
      ok: true,
    });
  });
  it("begrenzt Testmails auf drei pro Stunde", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        (typeof url === "object" && "url" in url
          ? url.url
          : String(url)
        ).includes("/users/")
          ? Response.json({
              object: "user",
              id: "user_a",
              primary_email_address_id: "e",
              email_addresses: [
                {
                  id: "e",
                  email_address: "a@example.invalid",
                  verification: { status: "verified" },
                  linked_to: [],
                },
              ],
            })
          : Response.json({ id: "sent" }),
      ),
    );
    c.env.CLERK_PUBLISHABLE_KEY =
      "pk_test_" +
      Buffer.from("synthetic.clerk.accounts.dev$").toString("base64");
    c.env.RESEND_API_KEY = "SYNTHETIC";
    c.env.MAIL_FROM = "Test <test@example.invalid>";
    for (let i = 0; i < 3; i++) await testMail(c.env, await c.a(), true);
    await expect(testMail(c.env, await c.a(), true)).rejects.toThrow(
      /drei Testmails/,
    );
  });
  it("sichert in begrenzten Schritten und meldet den Abschluss erst nach Manifest", async () => {
    await book();
    await requestBackup(c.env, await c.a());
    let runs = 0;
    while (
      (
        c.sql
          .prepare("SELECT phase FROM fleet_jobs WHERE owner='user_a'")
          .get() as any
      ).phase !== "idle" &&
      runs++ < 20
    )
      expect((await daily(c.env)).ok).toBe(true);
    expect(runs).toBeLessThan(20);
    expect(
      c.sql
        .prepare("SELECT last_backup FROM fleet_jobs WHERE owner='user_a'")
        .get(),
    ).not.toEqual({ last_backup: null });
    expect(
      [...c.objects.keys()].some((k) => k.includes("snapshot-manifest-")),
    ).toBe(true);
  });
  it("macht einen behandelten Jobfehler im äußeren Worker sichtbar", async () => {
    await requestBackup(c.env, await c.a());
    await book();
    await book(c.a2);
    c.failPut(true);
    await expect(worker.scheduled({}, c.env)).rejects.toThrow(
      /Tagesaufgabe fehlgeschlagen/,
    );
    expect(
      c.sql
        .prepare("SELECT last_error FROM fleet_jobs WHERE owner='user_a'")
        .get(),
    ).not.toEqual({ last_error: null });
  });
});

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
function token(owner: string, extra: any = {}) {
  const at = Math.floor(Date.now() / 1000),
    head = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT", kid: "synthetic" }),
    ).toString("base64url"),
    body = Buffer.from(
      JSON.stringify({
        iss: c.env.CLERK_ISSUER,
        sub: owner,
        sid: "sess_synthetic",
        azp: c.env.APP_ORIGIN,
        iat: at,
        nbf: at - 2,
        exp: at + 60,
        v: 2,
        sts: "active",
        ...extra,
      }),
    ).toString("base64url"),
    value = head + "." + body;
  return (
    value +
    "." +
    sign("RSA-SHA256", Buffer.from(value), pair.privateKey).toString(
      "base64url",
    )
  );
}
async function http(
  path: string,
  owner = "user_a",
  body?: any,
  extra: RequestInit = {},
) {
  c.env.CLERK_JWT_KEY = pair.publicKey
    .export({ format: "pem", type: "spki" })
    .toString();
  c.env.CLERK_PUBLISHABLE_KEY =
    "pk_test_" +
    Buffer.from("synthetic.clerk.accounts.dev$").toString("base64");
  return handle(
    new Request(c.env.APP_ORIGIN + "/api/v3/" + path, {
      method: body === undefined ? "GET" : "POST",
      ...extra,
      headers: {
        Origin: c.env.APP_ORIGIN,
        Authorization: "Bearer " + token(owner),
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        ...extra.headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    c.env,
  );
}
describe("Tatsächlich signierte Clerk-Tokens und API-Grenzen", () => {
  it("startet ein neues verifiziertes Konto ohne falschen Migrationsdialog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          object: "user",
          id: "user_new",
          primary_email_address_id: "e",
          email_addresses: [
            {
              id: "e",
              email_address: "new@example.invalid",
              verification: { status: "verified" },
              linked_to: [],
            },
          ],
          banned: false,
          locked: false,
        }),
      ),
    );
    const response = await http("bootstrap", "user_new");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      vehicles: [],
      selectedVehicle: null,
    });
    expect(
      c.sql
        .prepare(
          "SELECT COUNT(*) n FROM record_entities WHERE owner='user_new'",
        )
        .get(),
    ).toMatchObject({ n: 0 });
  });
  it("prüft vorhandene Konten ohne Anbieter-Netzwerkaufruf", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const r = await http("bootstrap");
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).vehicles).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { exp: 1 },
    { iss: "https://evil.invalid" },
    { azp: "https://evil.invalid" },
    { sub: "invalid" },
  ])("weist ungültige Sitzung %j ab", async (extra) => {
    expect(
      (
        await http("bootstrap", "user_a", undefined, {
          headers: { Authorization: "Bearer " + token("user_a", extra) },
        })
      ).status,
    ).toBe(401);
  });
  it("weist fehlende Anmeldung und fremde Origin ab", async () => {
    expect(
      (
        await http("bootstrap", "user_a", undefined, {
          headers: { Authorization: "" },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await http("bootstrap", "user_a", undefined, {
          headers: { Origin: "https://evil.invalid" },
        })
      ).status,
    ).toBe(403);
  });
  it("prüft alle Fahrzeugrouten unabhängig von einer mitgesendeten Konto-ID", async () => {
    expect((await http("vehicles/" + c.b1 + "/view?route=/")).status).toBe(404);
    expect(
      (
        await http("vehicles/" + c.a1 + "/actions/smoke", "user_a", {
          owner: "user_b",
          expected_revision: 1,
        })
      ).status,
    ).toBe(200);
    expect((await state(c.b1, "user_b")).AuditLog).toHaveLength(0);
  });
  it("sperrt deaktivierte Konten trotz gültiger Sitzung", async () => {
    c.sql
      .prepare("UPDATE record_accounts SET disabled=1 WHERE owner='user_a'")
      .run();
    expect((await http("bootstrap")).status).toBe(403);
  });
  it("gibt interne Datenbankfehler nicht an den Browser weiter", async () => {
    c.failBatch(true);
    const r = await http("vehicles/" + c.a1 + "/actions/smoke", "user_a", {
      expected_revision: 1,
    });
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("D1_ATOMIC_FAILURE");
  });
});

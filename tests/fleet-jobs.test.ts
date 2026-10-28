import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountAction } from "../auth/src/fleet/actions";
import { daily, requestBackup, testMail } from "../auth/src/fleet/jobs";
import { fullState, vehicle } from "../auth/src/fleet/store";
import { blankPackage } from "../shared/logic";
import { reminder, request } from "./fixtures";
import { setupFleet } from "./fleet-fixture";
let c: Awaited<ReturnType<typeof setupFleet>>;
beforeEach(async () => {
  c = await setupFleet();
  c.env.CLERK_PUBLISHABLE_KEY =
    "pk_test_" +
    Buffer.from("synthetic.clerk.accounts.dev$").toString("base64");
  c.env.RESEND_API_KEY = "SYNTHETIC";
  c.env.MAIL_FROM = "Test <test@example.invalid>";
});
afterEach(() => {
  c.sql.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function enable() {
  const a = await c.a();
  await accountAction(
    c.env,
    a,
    "settings",
    {
      revision: a.revision,
      expected_revision: a.revision,
      patch: { email_enabled: true },
    },
    crypto.randomUUID(),
  );
  for (const id of [c.a1, c.a2]) {
    const p = blankPackage();
    p.reminders = [
      reminder({
        title: "Termin " + id,
        due_date: "2020-01-01",
        email_enabled: true,
      }),
    ];
    await c.write(id, "commit", request(p, { confirm_reminders: true }));
  }
}
function mockMail(failFirst = false) {
  const deliveries: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const url =
        typeof input === "object" && "url" in input ? input.url : String(input);
      if (url.includes("/users/"))
        return Response.json({
          object: "user",
          id: "user_a",
          primary_email_address_id: "email1",
          email_addresses: [
            {
              id: "email1",
              email_address: "confirmed@example.invalid",
              verification: { status: "verified" },
              linked_to: [],
            },
          ],
          banned: false,
          locked: false,
        });
      deliveries.push({
        body: JSON.parse(String(init?.body)),
        key: new Headers(init?.headers).get("Idempotency-Key"),
      });
      if (failFirst && deliveries.length === 1) throw Error("lost response");
      return Response.json({ id: "mail1" });
    }),
  );
  return deliveries;
}
async function tick() {
  c.sql.prepare("UPDATE fleet_jobs SET next_run=0 WHERE owner='user_a'").run();
  return daily(c.env);
}
describe("Versand, Fortsetzung und Aufbewahrung", () => {
  it("wiederholt eine Testmail nach verlorener Antwort mit identischem Schlüssel und Inhalt", async () => {
    const sent = mockMail(true),
      op = crypto.randomUUID();
    await expect(testMail(c.env, await c.a(), true, op)).rejects.toThrow();
    await testMail(c.env, await c.a(), true, op);
    await testMail(c.env, await c.a(), true, op);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual(sent[1]);
    expect(
      c.sql
        .prepare(
          "SELECT COUNT(*) n FROM fleet_mail_runs WHERE substr(run_id,1,5)='test-'",
        )
        .get(),
    ).toMatchObject({ n: 1 });
  });
  it("merkt sich bestätigte Sicherungsanforderungen auch nach ihrem Abschluss", async () => {
    const op = crypto.randomUUID();
    await requestBackup(c.env, await c.a(), op);
    await requestBackup(c.env, await c.a(), op);
    for (let i = 0; i < 12; i++) {
      if (
        (
          c.sql
            .prepare("SELECT phase FROM fleet_jobs WHERE owner='user_a'")
            .get() as any
        ).phase === "idle"
      )
        break;
      await tick();
    }
    await requestBackup(c.env, await c.a(), op);
    expect(
      c.sql.prepare("SELECT phase FROM fleet_jobs WHERE owner='user_a'").get(),
    ).toMatchObject({ phase: "idle" });
  });
  it("gibt unbestätigte Sicherungsteile nach einem parallelen Schreibvorgang frei", async () => {
    await c.file();
    await c.write(c.a1, "smoke", {});
    await c.write(c.a2, "smoke", {});
    const before = (
      c.sql
        .prepare("SELECT bytes FROM record_usage WHERE scope='user_a'")
        .get() as any
    ).bytes;
    await requestBackup(c.env, await c.a());
    await tick();
    expect(
      [...c.objects.keys()].some((k) => k.includes("snapshot-chunk-")),
    ).toBe(true);
    await c.write(c.a1, "smoke", {});
    expect((await tick()).ok).toBe(false);
    expect(
      c.sql.prepare("SELECT phase FROM fleet_jobs WHERE owner='user_a'").get(),
    ).toMatchObject({ phase: "cleanup" });
    await tick();
    expect(
      [...c.objects.keys()].some((k) => k.includes("snapshot-chunk-")),
    ).toBe(false);
    expect(
      (
        c.sql
          .prepare("SELECT bytes FROM record_usage WHERE scope='user_a'")
          .get() as any
      ).bytes,
    ).toBe(before);
    expect([...c.objects.keys()].some((k) => !k.includes("snapshot"))).toBe(
      true,
    );
  });
  it("fasst aktive Fahrzeuge zu einer Mail an die bestätigte Adresse zusammen", async () => {
    await enable();
    const sent = mockMail();
    await tick();
    await tick();
    await tick();
    expect(sent).toHaveLength(1);
    expect(sent[0].body.to).toEqual(["confirmed@example.invalid"]);
    expect(sent[0].body.text).toContain("Termin " + c.a1);
    expect(sent[0].body.text).toContain("Termin " + c.a2);
    const a = await c.a(),
      s = await fullState(c.env, a, await vehicle(c.env, a, c.a1));
    expect(s.NotificationLog[0].status).toBe("sent");
  });
  it("versendet archivierte Fahrzeuge nicht", async () => {
    await enable();
    await c.write(c.a2, "archive", { archived: true });
    const sent = mockMail();
    await tick();
    await tick();
    await tick();
    expect(sent[0].body.text).not.toContain("Termin " + c.a2);
  });
  it("verwendet nach verlorener Antwort denselben Inhalt und Resend-Schlüssel", async () => {
    await enable();
    const sent = mockMail(true);
    await tick();
    await tick();
    expect(await tick()).toMatchObject({ ok: false });
    expect(await tick()).toMatchObject({ ok: true });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual(sent[1]);
    expect(
      c.sql
        .prepare("SELECT COUNT(*) n FROM fleet_outbox WHERE status='sent'")
        .get(),
    ).toMatchObject({ n: 2 });
  });
  it("erzwingt drei Testmails über ein rollendes Stundenfenster", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T10:59:00Z"));
    mockMail();
    for (let i = 0; i < 3; i++) await testMail(c.env, await c.a(), true);
    vi.setSystemTime(new Date("2026-10-28T11:01:00Z"));
    await expect(testMail(c.env, await c.a(), true)).rejects.toThrow(
      /drei Testmails/,
    );
  });
  it("begrenzt den Versand der App auf 95 Nachrichten pro UTC-Tag", async () => {
    mockMail();
    const day = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < 95; i++)
      c.sql
        .prepare("INSERT INTO fleet_mail_budget VALUES(?,?)")
        .run(day, "mail-" + i);
    await expect(testMail(c.env, await c.a(), true)).rejects.toThrow(
      /Versandkontingent/,
    );
  });
  it("behält nur bestätigte neue Sicherungen und respektiert die Aufbewahrung", async () => {
    const a = await c.a();
    await accountAction(
      c.env,
      a,
      "settings",
      {
        revision: a.revision,
        expected_revision: a.revision,
        patch: { backup_retention: 1 },
      },
      crypto.randomUUID(),
    );
    for (let round = 0; round < 2; round++) {
      await requestBackup(c.env, await c.a());
      for (let i = 0; i < 20; i++) {
        const j = c.sql
          .prepare("SELECT phase FROM fleet_jobs WHERE owner='user_a'")
          .get() as any;
        if (j.phase === "idle") break;
        expect((await tick()).ok).toBe(true);
      }
    }
    expect(
      c.sql
        .prepare(
          "SELECT COUNT(*) n FROM fleet_backup_runs WHERE owner='user_a'",
        )
        .get(),
    ).toMatchObject({ n: 1 });
  });
  it("behält eine vorherige Sicherung bei vollem Speicher", async () => {
    await requestBackup(c.env, await c.a());
    for (let i = 0; i < 10; i++) {
      if (
        (
          c.sql
            .prepare("SELECT phase FROM fleet_jobs WHERE owner='user_a'")
            .get() as any
        ).phase === "idle"
      )
        break;
      await tick();
    }
    const old = [...c.objects.keys()];
    c.sql
      .prepare("UPDATE record_usage SET bytes=1000000000 WHERE scope='user_a'")
      .run();
    await requestBackup(c.env, await c.a());
    let failed = false;
    for (let i = 0; i < 10; i++) {
      if (!(await tick()).ok) {
        failed = true;
        break;
      }
    }
    expect(failed).toBe(true);
    expect([...c.objects.keys()]).toEqual(old);
  });
});

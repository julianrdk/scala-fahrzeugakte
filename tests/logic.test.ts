import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  autoMatch,
  blankPackage,
  commitImport,
  completeReminder,
  csv,
  currentOdometer,
  dueStatus,
  editEntity,
  emptyState,
  fingerprint,
  fuelIntervals,
  hash,
  hashBytes,
  meta,
  parseImport,
  researchPrompt,
  totals,
  validatePackage,
  verifySignature,
} from "../shared/logic";
import { expense, pkg, reminder, request, work } from "./fixtures";
const at = "2026-10-17T12:00:00Z";
describe("Vertrag und untrusted input", () => {
  it("liest v1 und toleriert einen Markdown-Codeblock", () =>
    expect(
      parseImport("```json\n" + JSON.stringify(pkg()) + "\n```").expenses,
    ).toHaveLength(1));
  it.each([
    ["Version", (p: any) => (p.schema_version = 2)],
    ["Referenz", (p: any) => (p.expenses[0].document_refs = ["fehlt"])],
    ["Cent", (p: any) => (p.expenses[0].amount_cents = 1.2)],
    ["Stringbetrag", (p: any) => (p.expenses[0].amount_cents = "50")],
    ["Datum", (p: any) => (p.expenses[0].date = "2026-02-30")],
    ["Zusatzfeld", (p: any) => (p.secret = "x")],
    ["Ref-Duplikat", (p: any) => p.work.push(work({ ref: "e1" }))],
    ["Intervall", (p: any) => p.reminders.push(reminder({ repeat_months: 0 }))],
  ])("weist %s zurück", (_, change) => {
    const p = pkg();
    change(p);
    expect(() => validatePackage(p)).toThrow();
  });
  it("erhält HTML und Formeln als inerte Strings", () => {
    const p = pkg();
    p.expenses[0].title = "<img src=x onerror=alert(1)>";
    p.expenses[0].notes = '=IMPORTXML("https://example.invalid")';
    expect(parseImport(JSON.stringify(p)).expenses[0].notes).toContain(
      "=IMPORTXML",
    );
  });
  it("sichert CSV gegen Formelinjektion", () => {
    const p = pkg();
    p.expenses[0].title = "=SUM(1,1)";
    const s = commitImport(emptyState(), request(p), at).state;
    expect(csv(s, "Expenses")).toContain("'=SUM");
  });
  it("verlangt keine Datei-Hashes von ChatGPT", () =>
    expect(validatePackage(pkg()).documents).toEqual([]));
  it("prüft SHA-256 gegen Node für Unicode und Binärdaten", () => {
    expect(hash("Öl 🛠")).toBe(
      createHash("sha256").update("Öl 🛠").digest("hex"),
    );
    expect(hashBytes(Uint8Array.from([0, 1, 255]))).toBe(
      createHash("sha256")
        .update(Buffer.from([0, 1, 255]))
        .digest("hex"),
    );
  });
  it("entfernt import_id aus dem fachlichen Fingerprint", () => {
    const p = pkg(),
      q = pkg();
    q.import_id = "neu";
    expect(fingerprint(p)).toBe(fingerprint(q));
  });
  it("prüft Dateisignaturen", () => {
    expect(() =>
      verifySignature(new TextEncoder().encode("%PDF-1.4"), "application/pdf"),
    ).not.toThrow();
    expect(() =>
      verifySignature(new TextEncoder().encode("<html>"), "image/png"),
    ).toThrow();
  });
});
describe("Commit, Kosten und Korrekturen", () => {
  it("erkennt dieselbe Rechnung innerhalb eines Pakets", () => {
    const p = pkg();
    p.expenses.push(expense({ ref: "e2" }));
    expect(() => commitImport(emptyState(), request(p), at)).toThrow(
      /doppelte Rechnung/,
    );
  });
  it("unterstützt mehr als hundert gespeicherte Einträge aus mehreren Paketen", () => {
    const p = blankPackage();
    for (let i = 0; i < 100; i++)
      p.expenses.push(
        expense({
          ref: "e" + i,
          invoice_number: "BELEG-" + i,
          amount_cents: 1000 + i,
        }),
      );
    const first = commitImport(emptyState(), request(p), at).state;
    const q = pkg();
    q.expenses[0].invoice_number = "BELEG-101";
    q.expenses[0].amount_cents = 2000;
    const next = commitImport(
      first,
      request(q, { operation_id: "operation-test-0002" }),
      at,
    ).state;
    expect(next.Expenses).toHaveLength(101);
  });
  it("importiert drei Rechnungen und drei Originale gemeinsam", () => {
    const p = blankPackage(),
      s = emptyState();
    for (let i = 1; i <= 3; i++) {
      const sha = hash("file" + i);
      p.documents.push({
        ref: "d" + i,
        source_filename: "Rechnung" + i + ".pdf",
        title: "Rechnung " + i,
        document_type: "invoice",
      });
      p.expenses.push(
        expense({
          ref: "e" + i,
          amount_cents: i * 1000,
          invoice_number: "TEST-" + i,
          document_refs: ["d" + i],
        }),
      );
      s.Uploads.push({
        ...meta("u" + i, at),
        operation_id: "operation-test-0001",
        sha256: sha,
        size: 9,
        mime: "application/pdf",
        source_filename: "Rechnung" + i + ".pdf",
        drive_id: "drive" + i,
      });
    }
    const out = commitImport(
      s,
      request(p, { documents: { d1: "u1", d2: "u2", d3: "u3" } }),
      at,
    ).state;
    expect(totals(out).expenses).toBe(6000);
    expect(out.DocumentLinks).toHaveLength(3);
    expect(out.Documents).toHaveLength(3);
  });
  it("unterscheidet gleiche Dateinamen und lässt ein Original mehrfach zuordnen", () => {
    const p = blankPackage();
    p.documents.push({
      ref: "d1",
      source_filename: "R.pdf",
      title: "Beleg",
      document_type: "invoice",
    });
    expect(
      autoMatch(p.documents, [{ name: "R.pdf" }, { name: "R.pdf" }]),
    ).toEqual({ d1: null });
    expect(autoMatch(p.documents, [{ name: "r.pdf" }])).toEqual({ d1: null });
    expect(autoMatch(p.documents, [{ name: "R.pdf" }])).toEqual({ d1: 0 });
  });
  it("verwendet identische Dateien nur einmal, selbst bei zwei Dokumentreferenzen", () => {
    const p = pkg();
    p.documents = [
      {
        ref: "d1",
        source_filename: "a.pdf",
        title: "A",
        document_type: "invoice",
      },
      {
        ref: "d2",
        source_filename: "a.pdf",
        title: "B",
        document_type: "invoice",
      },
    ];
    p.expenses[0].document_refs = ["d1", "d2"];
    const s = emptyState();
    s.Uploads.push({
      ...meta("upload", at),
      operation_id: "operation-test-0001",
      sha256: hash("pdf"),
      size: 5,
      mime: "application/pdf",
      source_filename: "a.pdf",
      drive_id: "drive1",
    });
    const out = commitImport(
      s,
      request(p, { documents: { d1: "upload", d2: "upload" } }),
      at,
    ).state;
    expect(out.Documents).toHaveLength(1);
    expect(new Set(out.Expenses[0].document_refs).size).toBe(1);
  });
  it("behandelt denselben Vorgang, neuen Vorgang und verlorene Antwort idempotent", () => {
    const p = pkg(),
      r = request(p),
      first = commitImport(emptyState(), r, at);
    expect(commitImport(first.state, r, at).state.Expenses).toHaveLength(1);
    expect(
      commitImport(
        first.state,
        { ...r, operation_id: "operation-test-0002" },
        at,
      ).state.Expenses,
    ).toHaveLength(1);
    expect(commitImport(first.state, r, at).result.reused).toBe(true);
  });
  it("verweigert dieselbe Kennung für veränderte Daten", () => {
    const p = pkg(),
      first = commitImport(emptyState(), request(p), at);
    p.expenses[0].title = "Anders";
    expect(() => commitImport(first.state, request(p), at)).toThrow(
      /anderen Daten/,
    );
  });
  it("erkennt neu formulierte Rechnungsdubletten und braucht eine Begründung", () => {
    const p = pkg(),
      first = commitImport(emptyState(), request(p), at);
    p.expenses[0].title = "Neue Formulierung";
    const r = request(p, { operation_id: "operation-test-0002" });
    expect(() => commitImport(first.state, r, at)).toThrow(/doppelte Rechnung/);
    expect(
      commitImport(
        first.state,
        { ...r, duplicate_override_reason: "Getrennter Kauf nach Prüfung" },
        at,
      ).state.Expenses,
    ).toHaveLength(2);
  });
  it("bucht 50 Euro Kauf, kostenfreien Einbau, 10 Euro Erstattung und 100 Euro Planung korrekt", () => {
    const p = pkg();
    p.work = [
      work({ expense_refs: ["e1"] }),
      work({ ref: "w2", status: "planned", estimated_cost_cents: 10000 }),
    ];
    p.expenses.push(
      expense({
        ref: "refund",
        title: "Rückgabe",
        amount_cents: -1000,
        invoice_number: "GUT-1",
      }),
    );
    const s = commitImport(emptyState(), request(p), at).state;
    expect(totals(s).expenses).toBe(4000);
    expect(s.Work).toHaveLength(2);
  });
  it("verknüpft einen späteren Einbau mit einer vorhandenen Zahlung", () => {
    const first = commitImport(emptyState(), request(pkg()), at).state,
      p = blankPackage();
    p.work.push(work());
    const second = commitImport(
      first,
      request(p, {
        operation_id: "operation-test-0002",
        links: { w1: [first.Expenses[0].id] },
      }),
      at,
    ).state;
    expect(second.Work[0].expense_refs).toContain(first.Expenses[0].id);
    expect(totals(second).expenses).toBe(5000);
  });
  it("verlangt bewusste Bestätigung fehlender Belege und neuer Regeln", () => {
    const p = pkg();
    p.documents.push({
      ref: "d1",
      source_filename: null,
      title: "Offen",
      document_type: "invoice",
    });
    expect(() => commitImport(emptyState(), request(p), at)).toThrow(
      /Beleg fehlt/,
    );
    const out = commitImport(
      emptyState(),
      request(p, { allow_missing: true }),
      at,
    ).state;
    expect(out.Documents[0].missing).toBe(true);
    p.reminders.push(reminder());
    expect(() =>
      commitImport(emptyState(), request(p, { allow_missing: true }), at),
    ).toThrow(/bestätigen/);
  });
  it("erhält unbekannte Beträge und Daten", () => {
    const p = pkg();
    p.expenses[0].date = null;
    p.expenses[0].amount_cents = null;
    const s = commitImport(emptyState(), request(p), at).state;
    expect(s.Expenses[0].amount_cents).toBeNull();
    expect(s.Expenses[0].date).toBeNull();
    expect(totals(s).unknown).toBe(1);
  });
  it("setzt aktuellen Kilometerstand durch alten Import nicht zurück", () => {
    const s = emptyState();
    s.Odometer.push({
      ...meta("odo1", at),
      date: "2026-10-17",
      km: 85000,
      confirmed: true,
      note: null,
    });
    const p = pkg();
    p.expenses[0].date = "2020-01-01";
    p.expenses[0].odometer_km = 5000;
    expect(currentOdometer(commitImport(s, request(p), at).state)?.km).toBe(
      85000,
    );
  });
  it("unterscheidet versteckte Kategorie, Archivierung und Storno", () => {
    let s = commitImport(emptyState(), request(pkg()), at).state;
    const e = s.Expenses[0];
    s.Settings[0].hidden_categories = ["Wartung & Reparatur"];
    s = editEntity(s, "Expenses", e.id, e.revision, { archived: true }, at);
    expect(totals(s).expenses).toBe(5000);
    s = editEntity(s, "Expenses", e.id, 2, { voided: true }, at);
    expect(totals(s).expenses).toBe(0);
  });
  it("trennt Betriebskosten, Kauf und Einnahmen", () => {
    const p = pkg();
    p.expenses.push(
      expense({
        ref: "purchase",
        invoice_number: "TEST-2",
        category: "Fahrzeugkauf & Verkauf",
        amount_cents: 1000000,
      }),
      expense({
        ref: "sale",
        invoice_number: "TEST-3",
        category: "Fahrzeugkauf & Verkauf",
        cashflow_type: "income",
        amount_cents: 900000,
      }),
    );
    const t = totals(commitImport(emptyState(), request(p), at).state);
    expect(t.operating).toBe(5000);
    expect(t.expenses).toBe(1005000);
    expect(t.income).toBe(900000);
  });
  it("weist konkurrierende Bearbeitung zurück und erhält den neueren Stand", () => {
    const first = commitImport(emptyState(), request(pkg()), at).state,
      e = first.Expenses[0],
      second = editEntity(first, "Expenses", e.id, 1, { title: "Gerät A" }, at);
    expect(() =>
      editEntity(second, "Expenses", e.id, 1, { title: "Gerät B" }, at),
    ).toThrow(/Konflikt/);
    expect(second.Expenses[0].title).toBe("Gerät A");
  });
  it("validiert die Summe optionaler Kostenanteile", () => {
    const p = pkg();
    p.work.push(work({ expense_refs: ["e1"] }));
    const s = commitImport(emptyState(), request(p), at).state;
    expect(() =>
      editEntity(
        s,
        "Work",
        s.Work[0].id,
        1,
        { allocations: [{ expense_id: s.Expenses[0].id, amount_cents: 5001 }] },
        at,
      ),
    ).toThrow(/übersteigen/);
  });
});
describe("Fälligkeiten und Verbrauch", () => {
  function setup() {
    const p = blankPackage();
    p.work.push(work());
    p.reminders.push(reminder());
    return commitImport(
      emptyState(),
      request(p, { confirm_reminders: true }),
      at,
    ).state;
  }
  it("wird nach Datum ODER bestätigtem Kilometer fällig", () => {
    const r = setup().Reminders[0];
    expect(dueStatus(r, "2026-11-30", 1000)).toBe("due");
    expect(dueStatus(r, "2026-01-01", 84000)).toBe("due");
    expect(dueStatus(r, "2026-01-01", null)).toBe("later");
  });
  it("berücksichtigt Vorlauf", () => {
    const r = setup().Reminders[0];
    expect(dueStatus(r, "2026-11-01", 100)).toBe("soon");
    expect(dueStatus(r, "2026-01-01", 83000)).toBe("soon");
  });
  it("berechnet Monatsende und Schaltjahr", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });
  it("startet Wiederholung von tatsächlicher bestätigter Erledigung und nur einmal", () => {
    const s = setup(),
      r = s.Reminders[0],
      w = s.Work[0];
    completeReminder(s, r.id, w.id, at);
    expect(r.due_date).toBe("2027-10-17");
    expect(r.due_odometer_km).toBe(98200);
    const rev = r.revision;
    completeReminder(s, r.id, w.id, at);
    expect(r.revision).toBe(rev);
  });
  it("akzeptiert keine Planung als Erledigung", () => {
    const s = setup();
    s.Work[0].status = "planned";
    expect(() =>
      completeReminder(s, s.Reminders[0].id, s.Work[0].id, at),
    ).toThrow(/abgeschlossene/);
  });
  it("lässt die feste Kalenderregel ausdrücklich zu", () => {
    const s = setup();
    s.Reminders[0].fixed_calendar = true;
    completeReminder(s, s.Reminders[0].id, s.Work[0].id, at);
    expect(s.Reminders[0].due_date).toBe("2027-11-30");
  });
  it("berechnet keine erfundenen Spezifikationen und keine FIN im Prompt", () => {
    const s = setup();
    s.Vehicles[0].vin = "GEHEIME_FIN";
    const text = researchPrompt(s.Reminders[0], s.Vehicles[0]);
    expect(text).toContain("offen");
    expect(text).toContain("Versand");
    expect(text).not.toContain("GEHEIME_FIN");
  });
  it("summiert Teilbetankungen zwischen Volltankungen", () => {
    const p = blankPackage();
    for (const [i, km, l, full] of [
      [1, 1000, 30, true],
      [2, 1200, 10, false],
      [3, 1600, 26, true],
    ] as const)
      p.expenses.push(
        expense({
          ref: "e" + i,
          invoice_number: "TANK-" + i,
          date: "2026-10-0" + i,
          category: "Tanken",
          odometer_km: km,
          fuel: {
            liters: l,
            fuel_type: "E10",
            full_tank: full,
            missed_previous_fillup: false,
            station_name: null,
          },
        }),
      );
    const s = commitImport(emptyState(), request(p), at).state;
    expect(fuelIntervals(s)[0].consumption).toBe(6);
  });
  it("unterbricht den Verbrauch bei ausgelassenen Tankvorgängen", () => {
    const p = blankPackage();
    p.expenses = [
      expense({
        fuel: {
          liters: 30,
          fuel_type: null,
          full_tank: true,
          missed_previous_fillup: false,
          station_name: null,
        },
        odometer_km: 1000,
      }),
      expense({
        ref: "e2",
        date: "2026-10-11",
        invoice_number: "TEST-2",
        odometer_km: 1500,
        fuel: {
          liters: 30,
          fuel_type: null,
          full_tank: true,
          missed_previous_fillup: true,
          station_name: null,
        },
      }),
    ];
    expect(
      fuelIntervals(commitImport(emptyState(), request(p), at).state),
    ).toEqual([]);
  });
});

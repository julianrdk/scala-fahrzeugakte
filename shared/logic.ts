import { sha256 } from "@noble/hashes/sha256";
import { validCatalogReference } from "./vehicle-catalog";
import {
  metadataValue,
  validateCapture,
  validateExtendedState,
  workshopSnapshot,
} from "./capture";
import {
  validateImport as validate,
  validateStored,
} from "./generated/validators.js";
import schema from "./import-v1.schema.json";
import {
  categories,
  type CommitRequest,
  type Doc,
  type Expense,
  type ImportPackage,
  type Meta,
  type Reminder,
  type State,
  type Table,
  type UploadFile,
  type Work,
} from "./types";
export const MAX_FILE = 4 * 1024 * 1024,
  MAX_PACKAGE = 1024 * 1024;
export const mimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const tables: Table[] = [
  "Vehicles",
  "Expenses",
  "Work",
  "Documents",
  "DocumentLinks",
  "Reminders",
  "Imports",
  "AuditLog",
  "Settings",
  "Odometer",
  "Operations",
  "Uploads",
  "NotificationLog",
  "FavoriteStations",
];
export function fail(message: string): never {
  throw new Error(message);
}
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export const canonical = (x: unknown): string =>
  Array.isArray(x)
    ? "[" + x.map(canonical).join(",") + "]"
    : x !== null && typeof x === "object"
      ? "{" +
        Object.keys(x)
          .sort()
          .map(
            (k) =>
              JSON.stringify(k) +
              ":" +
              canonical((x as Record<string, unknown>)[k]),
          )
          .join(",") +
        "}"
      : JSON.stringify(x);
export function hashBytes(bytes: Uint8Array) {
  return Array.from(sha256(bytes), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
}
export function hash(text: string) {
  const utf = unescape(encodeURIComponent(text));
  return hashBytes(Uint8Array.from(utf, (c) => c.charCodeAt(0)));
}
export function fingerprint(p: ImportPackage) {
  const copy = clone(p);
  copy.import_id = null;
  return hash(canonical(copy));
}
export function validDate(x: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    !Number.isNaN(Date.parse(x + "T12:00:00Z")) &&
    new Date(x + "T12:00:00Z").toISOString().slice(0, 10) === x
  );
}
export function parseImport(text: string): ImportPackage {
  if (text.length > MAX_PACKAGE)
    fail(
      "Das JSON-Paket darf höchstens 1 MiB groß sein. Größere Pakete bitte aufteilen.",
    );
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(clean);
  } catch {
    fail(
      "Der Text ist kein gültiges JSON. Bitte Kommas, Anführungszeichen und Klammern prüfen.",
    );
  }
  return validatePackage(value);
}
export function validatePackage(
  value: unknown,
  storage = false,
): ImportPackage {
  const validator = storage ? validateStored : validate;
  if (!validator(value))
    fail(
      "Import prüfen: " +
        validator.errors
          ?.slice(0, 10)
          .map((e) => `${e.instancePath || "/"} ${e.message}`)
          .join("; "),
    );
  const p = value as ImportPackage;
  const seen = new Set<string>();
  for (const key of ["documents", "expenses", "work", "reminders"] as const) {
    for (const row of p[key]) {
      if (seen.has(row.ref))
        fail("Die Referenz " + row.ref + " ist mehrfach vorhanden.");
      seen.add(row.ref);
      for (const [k, v] of Object.entries(row)) {
        if (
          (k === "date" || k.endsWith("_date")) &&
          typeof v === "string" &&
          !validDate(v)
        )
          fail("Ungültiges Kalenderdatum: " + v);
      }
    }
  }
  const refIndexes = new Map<{ ref: string }[], Set<string>>();
  const check = (r: string, a: { ref: string }[]) => {
    let index = refIndexes.get(a);
    if (!index) {
      index = new Set(a.map((x) => x.ref));
      refIndexes.set(a, index);
    }
    if (!index.has(r)) fail("Unbekannte Referenz: " + r);
  };
  p.expenses.forEach((e) =>
    e.document_refs.forEach((r) => check(r, p.documents)),
  );
  p.work.forEach((w) => {
    w.document_refs.forEach((r) => check(r, p.documents));
    w.expense_refs.forEach((r) => check(r, p.expenses));
    const d = w.modification_details;
    if (d)
      for (const date of [d.installation_date, d.removal_date])
        if (date && !validDate(date)) fail("Ungültiges Umbau-Datum.");
  });
  p.reminders.forEach((r) => {
    if (r.basis_work_ref) check(r.basis_work_ref, p.work);
    for (const n of [r.repeat_months, r.repeat_km])
      if (n === 0) fail("Wiederholung muss größer als null sein.");
  });
  return clone(p);
}
export function blankPackage(): ImportPackage {
  return {
    format: "vehicle-record-import",
    schema_version: 1,
    import_id: null,
    vehicle_label: null,
    documents: [],
    expenses: [],
    work: [],
    reminders: [],
    warnings: [],
  };
}
export function meta(id: string, at: string, vehicle_id = "vehicle-1"): Meta {
  return {
    id,
    vehicle_id,
    revision: 1,
    created_at: at,
    updated_at: at,
    archived: false,
    voided: false,
  };
}
export function emptyState(at = new Date().toISOString()): State {
  const s = { schema_version: 1 } as State;
  for (const t of tables) (s[t] as unknown[]) = [];
  s.Vehicles.push({
    ...meta("vehicle-1", at),
    manufacturer: "",
    model: "",
    year: null,
    first_registration: null,
    engine: null,
    vin: null,
    plate: null,
    purchase_date: null,
    purchase_odometer: null,
    fuel_type: null,
    photo_id: null,
  });
  s.Settings.push({
    ...meta("settings", at),
    hidden_categories: [],
    external_fuel_url: "https://www.clever-tanken.de/",
    email_enabled: false,
    backup_retention: 14,
  });
  return s;
}
export function currentOdometer(s: State) {
  const all = [
    ...s.Odometer.filter((r) => r.confirmed && !r.voided).map((r) => ({
      km: r.km,
      date: r.date,
    })),
    ...s.Expenses.filter(
      (r) => !r.voided && r.date !== null && r.odometer_km !== null,
    ).map((r) => ({ km: r.odometer_km!, date: r.date! })),
    ...s.Work.filter(
      (r) =>
        !r.voided &&
        r.status === "completed" &&
        r.date &&
        r.odometer_km !== null,
    ).map((r) => ({ km: r.odometer_km!, date: r.date! })),
  ];
  return (
    all.sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km)[0] ?? null
  );
}
export function odometerWarnings(s: State) {
  const all = [
    ...s.Odometer.filter((x) => x.confirmed && !x.voided).map((x) => ({
      km: x.km,
      date: x.date,
    })),
    ...s.Work.filter(
      (x) =>
        !x.voided &&
        x.status === "completed" &&
        x.date &&
        x.odometer_km !== null,
    ).map((x) => ({ km: x.odometer_km!, date: x.date! })),
    ...s.Expenses.filter(
      (x) => !x.voided && x.date && x.odometer_km !== null,
    ).map((x) => ({ km: x.odometer_km!, date: x.date! })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return all.filter((r, i) => i > 0 && r.km < all[i - 1].km);
}
export function totals(s: State, year?: string) {
  const out = {
    expenses: 0,
    operating: 0,
    income: 0,
    unknown: 0,
    foreign: 0,
    undated: 0,
    byCategory: {} as Record<string, number>,
    months: Array(12).fill(0) as number[],
  };
  for (const e of s.Expenses) {
    if (e.voided) continue;
    if (year && !e.date) {
      out.undated++;
      continue;
    }
    if (year && !e.date?.startsWith(year)) continue;
    if (e.amount_cents === null) {
      out.unknown++;
      continue;
    }
    if (e.currency !== "EUR") {
      out.foreign++;
      continue;
    }
    if (e.cashflow_type === "income") {
      out.income += e.amount_cents;
      continue;
    }
    out.expenses += e.amount_cents;
    if (e.category !== "Fahrzeugkauf & Verkauf")
      out.operating += e.amount_cents;
    out.byCategory[e.category ?? "Ungeklärt"] =
      (out.byCategory[e.category ?? "Ungeklärt"] ?? 0) + e.amount_cents;
    if (e.date) out.months[Number(e.date.slice(5, 7)) - 1] += e.amount_cents;
  }
  return out;
}
export function fuelIntervals(s: State) {
  const rows = s.Expenses.filter(
    (e) => !e.voided && e.category === "Tanken",
  ).sort(
    (a, b) =>
      (a.date ?? "").localeCompare(b.date ?? "") ||
      (a.odometer_km ?? 0) - (b.odometer_km ?? 0),
  );
  const result: {
    from: string;
    to: string;
    km: number;
    liters: number;
    consumption: number;
  }[] = [];
  let anchor: Expense | null = null,
    liters = 0;
  for (const e of rows) {
    const f = e.fuel;
    if (
      !e.date ||
      e.odometer_km === null ||
      !f?.liters ||
      f.full_tank === null
    ) {
      anchor = null;
      liters = 0;
      continue;
    }
    if (f.missed_previous_fillup !== false) {
      anchor = null;
      liters = 0;
    }
    if (!anchor) {
      if (f.full_tank) anchor = e;
      continue;
    }
    if (e.odometer_km <= anchor.odometer_km!) {
      anchor = f.full_tank ? e : null;
      liters = 0;
      continue;
    }
    liters += f.liters;
    if (f.full_tank) {
      const km = e.odometer_km - anchor.odometer_km!;
      result.push({
        from: anchor.date!,
        to: e.date,
        km,
        liters,
        consumption: (liters / km) * 100,
      });
      anchor = e;
      liters = 0;
    }
  }
  return result;
}
export function addMonths(date: string, months: number) {
  const d = new Date(date + "T12:00:00Z"),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, end));
  return d.toISOString().slice(0, 10);
}
export function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dueStatus(r: Reminder, today: string, km: number | null) {
  if (r.voided) return "paused";
  if (
    (r.due_date && r.due_date <= today) ||
    (r.due_odometer_km !== null && km !== null && km >= r.due_odometer_km)
  )
    return "due";
  if (
    (r.due_date && r.due_date <= addDays(today, r.lead_days ?? 30)) ||
    (r.due_odometer_km !== null &&
      km !== null &&
      km >= r.due_odometer_km - (r.lead_km ?? 1000))
  )
    return "soon";
  return "later";
}
export function completeReminder(
  s: State,
  reminderId: string,
  workId: string,
  at: string,
) {
  const r =
    s.Reminders.find((x) => x.id === reminderId) ?? fail("Erinnerung fehlt.");
  const w =
    s.Work.find(
      (x) => x.id === workId && !x.voided && x.status === "completed",
    ) ?? fail("Bitte eine bestätigte abgeschlossene Arbeit auswählen.");
  if (w.kind !== r.work_type)
    fail("Die Arbeit passt nicht zur Erinnerungsart.");
  if (r.completed_work_id === w.id) return;
  if ((r.repeat_months || r.repeat_days) && !w.date)
    fail("Für die Wiederholung fehlt das tatsächliche Arbeitsdatum.");
  if (r.repeat_km && w.odometer_km === null)
    fail("Für die Wiederholung fehlt der tatsächliche Arbeitskilometerstand.");
  if (r.repeat_months || r.repeat_days)
    r.due_date = r.repeat_months
      ? addMonths(
          r.fixed_calendar && r.due_date ? r.due_date : w.date!,
          r.repeat_months,
        )
      : addDays(
          r.fixed_calendar && r.due_date ? r.due_date : w.date!,
          r.repeat_days!,
        );
  else r.due_date = null;
  if (r.repeat_km) r.due_odometer_km = w.odometer_km! + r.repeat_km;
  else r.due_odometer_km = null;
  r.completed_work_id = w.id;
  r.voided = !r.due_date && r.due_odometer_km === null;
  r.revision++;
  r.updated_at = at;
}
export function autoMatch(
  documents: ImportPackage["documents"],
  files: { name: string }[],
) {
  const used: Record<string, number | null> = Object.create(null);
  for (const d of documents) {
    const ids = files
      .map((f, i) => (f.name === d.source_filename ? i : -1))
      .filter((i) => i !== -1);
    used[d.ref] = ids.length === 1 ? ids[0] : null;
  }
  return used;
}
export function duplicates(
  s: State,
  p: ImportPackage,
  documentHashes: Record<string, string>,
) {
  const results = p.expenses.flatMap((e) =>
    s.Expenses.filter(
      (x) =>
        !x.voided &&
        x.amount_cents === e.amount_cents &&
        x.currency === e.currency &&
        ((e.invoice_number &&
          x.invoice_number === e.invoice_number &&
          e.vendor &&
          x.vendor?.trim().toLowerCase() === e.vendor.trim().toLowerCase()) ||
          (e.date &&
            x.date === e.date &&
            e.vendor &&
            x.vendor?.trim().toLowerCase() === e.vendor.trim().toLowerCase()) ||
          e.document_refs.some((ref) =>
            x.document_refs.some(
              (id) =>
                s.Documents.find((d) => d.id === id)?.sha256 ===
                  documentHashes[ref] && documentHashes[ref],
            ),
          )),
    ).map((x) => ({ ref: e.ref, id: x.id, title: x.title })),
  );
  for (let i = 0; i < p.expenses.length; i++)
    for (let j = 0; j < i; j++) {
      const a = p.expenses[i],
        b = p.expenses[j];
      if (
        a.vendor &&
        b.vendor &&
        a.vendor.trim().toLowerCase() === b.vendor.trim().toLowerCase() &&
        a.invoice_number &&
        a.invoice_number === b.invoice_number
      )
        results.push({
          ref: a.ref,
          id: "package-" + b.ref,
          title: b.title + " (auch im aktuellen Paket)",
        });
    }
  return results;
}

export function assertFile(f: UploadFile) {
  if (
    !mimeTypes.includes(f.mime) ||
    !Number.isInteger(f.size) ||
    f.size <= 0 ||
    f.size > MAX_FILE ||
    !f.source_filename ||
    f.source_filename.length > 500 ||
    !/^[a-f0-9]{64}$/.test(f.sha256)
  )
    fail("Datei ungültig. Erlaubt: PDF, JPEG, PNG, WebP bis 4 MiB.");
}
export function verifySignature(b: Uint8Array, mime: string) {
  const match =
    mime === "application/pdf"
      ? String.fromCharCode(...b.slice(0, 5)) === "%PDF-"
      : mime === "image/jpeg"
        ? b[0] === 255 && b[1] === 216 && b[2] === 255
        : mime === "image/png"
          ? [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n)
          : mime === "image/webp"
            ? String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
              String.fromCharCode(...b.slice(8, 12)) === "WEBP"
            : false;
  if (!match) fail("Dateiinhalt und Dateityp passen nicht zusammen.");
}
export function commitImport(
  original: State,
  request: CommitRequest,
  at: string,
): {
  state: State;
  result: { operation_id: string; ids: string[]; reused?: boolean };
} {
  const p = validatePackage(request.package),
    importFingerprint = fingerprint(p),
    fp =
      request.capture && Object.keys(request.capture).length
        ? hash(
            canonical({ package: importFingerprint, capture: request.capture }),
          )
        : importFingerprint;
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(request.operation_id))
    fail("Ungültige Vorgangskennung.");
  const old = original.Operations.find((o) => o.id === request.operation_id);
  if (old) {
    if (old.fingerprint !== fp)
      fail("Der Vorgang gehört zu anderen Daten. Neuen Vorgang starten.");
    if (old.status === "committed")
      return {
        state: original,
        result: {
          ...(old.result as { operation_id: string; ids: string[] }),
          reused: true,
        },
      };
  }
  const capture = validateCapture(request.capture, p, original);
  const imported = original.Imports.find(
    (i) => i.fingerprint === importFingerprint,
  );
  if (imported)
    return {
      state: original,
      result: { operation_id: imported.operation_id, ids: [], reused: true },
    };
  if (p.reminders.length && !request.confirm_reminders)
    fail("Neue Erinnerungsregeln bitte ausdrücklich bestätigen.");
  const hashes: Record<string, string> = Object.create(null);
  for (const d of p.documents) {
    const u = original.Uploads.find((u) => u.id === request.documents[d.ref]),
      existing = original.Documents.find(
        (x) => x.id === request.documents[d.ref],
      );
    if (u) hashes[d.ref] = u.sha256;
    else if (existing?.sha256) hashes[d.ref] = existing.sha256;
    else if (!request.allow_missing)
      fail(
        "Beleg fehlt: " +
          d.title +
          ". Bitte zuordnen oder fehlende Belege bestätigen.",
      );
  }
  if (p.reminders.some((r) => !r.due_date && r.due_odometer_km === null))
    fail("Neue Regeln benötigen ein Datum oder eine Kilometergrenze.");
  const conflicts = duplicates(original, p, hashes);
  if (conflicts.length && !request.duplicate_override_reason?.trim())
    fail(
      "Mögliche doppelte Rechnung: " +
        conflicts.map((x) => x.title).join(", ") +
        ". Bitte prüfen; eine bewusste neue Buchung braucht eine Begründung.",
    );
  const s = clone(original),
    map: Record<string, string> = Object.create(null),
    ids: string[] = [];
  let n = 0;
  const next = (ref: string) => (map[ref] ||= request.operation_id + "-" + ++n);
  p.documents.forEach((d) => {
    const selected = request.documents[d.ref],
      u = s.Uploads.find((x) => x.id === selected),
      existing =
        s.Documents.find((x) => x.id === selected) ||
        s.Documents.find((x) => u && x.sha256 === u.sha256 && !x.missing);
    if (existing) {
      map[d.ref] = existing.id;
      return;
    }
    const id = next(d.ref);
    const doc: Doc = {
      ...d,
      ...meta(id, at),
      source_filename: u?.source_filename ?? d.source_filename,
      sha256: u?.sha256 ?? null,
      size: u?.size ?? null,
      mime: u?.mime ?? null,
      drive_id: u?.drive_id ?? null,
      missing: !u,
    };
    s.Documents.push(doc);
    ids.push(id);
  });
  for (const e of p.expenses) {
    const id = next(e.ref),
      prices = metadataValue(capture?.prices_by_expense_ref, e.ref);
    s.Expenses.push({
      ...e,
      ...meta(id, at),
      document_refs: [...new Set(e.document_refs.map((r) => map[r]))],
      refund_of_id: null,
      ...(prices ? { position_prices: clone(prices) } : {}),
    });
    ids.push(id);
  }
  for (const w of p.work) {
    const extra = metadataValue(request.links, w.ref) ?? [];
    if (extra.some((id) => !s.Expenses.some((e) => e.id === id && !e.voided)))
      fail("Verknüpfte Ausgabe wurde nicht gefunden.");
    const id = next(w.ref),
      profile = metadataValue(capture?.workshops_by_work_ref, w.ref);
    s.Work.push({
      ...w,
      ...meta(id, at),
      document_refs: [...new Set(w.document_refs.map((r) => map[r]))],
      expense_refs: [
        ...new Set([...w.expense_refs.map((r) => map[r]), ...extra]),
      ],
      labor_minutes: null,
      allocations: [],
      ...(profile !== undefined
        ? { workshop_snapshot: workshopSnapshot(s.Settings[0], profile) }
        : {}),
    });
    ids.push(id);
  }
  for (const r of p.reminders) {
    const id = next(r.ref);
    s.Reminders.push({
      ...r,
      ...meta(id, at),
      basis_work_ref: r.basis_work_ref ? map[r.basis_work_ref] : null,
      repeat_days: null,
      fixed_calendar: false,
      completed_work_id: null,
    });
    ids.push(id);
  }
  for (const e of [...s.Expenses, ...s.Work].filter((x) => ids.includes(x.id)))
    for (const docId of e.document_refs)
      s.DocumentLinks.push({
        ...meta(`${e.id}-doc-${docId}`, at),
        entity_id: e.id,
        document_id: docId,
      });
  const result = { operation_id: request.operation_id, ids };
  s.Imports.push({
    ...meta(request.operation_id + "-import", at),
    fingerprint: importFingerprint,
    import_id: p.import_id,
    operation_id: request.operation_id,
  });
  s.Operations = s.Operations.filter((o) => o.id !== request.operation_id);
  s.Operations.push({
    ...meta(request.operation_id, at),
    fingerprint: fp,
    status: "committed",
    result,
  });
  s.AuditLog.push({
    ...meta(request.operation_id + "-audit", at),
    entity_id: request.operation_id,
    action: "import",
    before: null,
    after: {
      ids,
      duplicate_override_reason: request.duplicate_override_reason,
    },
  });
  validateState(s);
  return { state: s, result };
}
export function validateState(s: State) {
  if (s.schema_version !== 1) fail("Unbekannte Speicherversion.");
  for (const t of tables) {
    if (!Array.isArray(s[t])) fail("Tabelle fehlt: " + t);
    const ids = new Set<string>();
    for (const row of s[t]) {
      if (
        typeof row.id !== "string" ||
        !row.id ||
        row.id.length > 512 ||
        typeof row.vehicle_id !== "string" ||
        typeof row.created_at !== "string" ||
        typeof row.updated_at !== "string" ||
        Number.isNaN(Date.parse(row.created_at)) ||
        Number.isNaN(Date.parse(row.updated_at)) ||
        ids.has(row.id) ||
        !Number.isInteger(row.revision) ||
        row.revision < 1 ||
        typeof row.archived !== "boolean" ||
        typeof row.voided !== "boolean"
      )
        fail("Ungültige ID oder Revision in " + t);
      ids.add(row.id);
    }
  }
  if (s.Vehicles.length !== 1 || s.Settings.length !== 1)
    fail("Diese Version erwartet genau ein Fahrzeug und eine Konfiguration.");
  validateExtendedState(s);
  const p = blankPackage();
  p.documents = s.Documents.map((x) =>
    pick(x, schema.definitions.document.properties),
  );
  p.expenses = s.Expenses.map((x) => ({
    ...pick<Expense>(x, schema.definitions.expense.properties),
    ref: x.id,
  }));
  p.work = s.Work.map((x) => ({
    ...pick<Work>(x, schema.definitions.work.properties),
    ref: x.id,
  }));
  p.documents.forEach((x, i) => (x.ref = s.Documents[i].id));
  p.reminders = s.Reminders.map((x) => ({
    ...pick<Reminder>(x, schema.definitions.reminder.properties),
    ref: x.id,
  }));
  p.work.forEach((w) => (w.expense_refs = w.expense_refs ?? []));
  validatePackage(p, true);
  const docIds = new Set(s.Documents.map((d) => d.id)),
    entityIds = new Set([...s.Expenses, ...s.Work].map((e) => e.id));
  for (const l of s.DocumentLinks)
    if (!docIds.has(l.document_id) || !entityIds.has(l.entity_id))
      fail("Ungültige Dokumentverknüpfung.");
  const setting = s.Settings[0];
  if (
    !Array.isArray(setting.hidden_categories) ||
    setting.hidden_categories.some((x) => !categories.includes(x)) ||
    typeof setting.email_enabled !== "boolean" ||
    !Number.isInteger(setting.backup_retention) ||
    setting.backup_retention < 1 ||
    setting.backup_retention > 90 ||
    !/^https:\/\//.test(setting.external_fuel_url) ||
    (setting.prompt_templates !== undefined &&
      (!setting.prompt_templates ||
        typeof setting.prompt_templates !== "object" ||
        Object.values(setting.prompt_templates).some(
          (x) => typeof x !== "string" || x.length > 10000,
        )))
  )
    fail("Ungültige Einstellungen.");
  for (const v of s.Vehicles) {
    if (
      v.power_kw != null &&
      (typeof v.power_kw !== "number" ||
        !Number.isFinite(v.power_kw) ||
        v.power_kw <= 0 ||
        v.power_kw > 10000)
    )
      fail("Ungültige Fahrzeugleistung.");
    if (
      v.catalog_reference != null &&
      !validCatalogReference(v.catalog_reference)
    )
      fail("Ungültige KBA-Quellenreferenz.");
    if (v.accent_color != null && !/^#[0-9a-f]{6}$/i.test(v.accent_color))
      fail("Ungültige Akzentfarbe.");
    for (const k of [
      "manufacturer",
      "model",
      "year",
      "first_registration",
      "engine",
      "vin",
      "plate",
      "purchase_date",
      "fuel_type",
    ] as const)
      if (v[k] !== null && (typeof v[k] !== "string" || v[k]!.length > 500))
        fail("Ungültige Fahrzeugdaten.");
    for (const d of [v.purchase_date, v.first_registration])
      if (d && !validDate(d)) fail("Ungültiges Fahrzeugdatum.");
    if (
      v.purchase_odometer !== null &&
      (!Number.isFinite(v.purchase_odometer) || v.purchase_odometer < 0)
    )
      fail("Ungültige Kaufkilometer.");
    if (
      v.photo_id &&
      !s.Documents.some(
        (d) => d.id === v.photo_id && d.mime?.startsWith("image/"),
      )
    )
      fail("Fahrzeugfoto fehlt.");
  }
  for (const o of s.Odometer)
    if (
      !validDate(o.date) ||
      !Number.isFinite(o.km) ||
      o.km < 0 ||
      o.km > 10000000 ||
      typeof o.confirmed !== "boolean"
    )
      fail("Ungültiger Kilometerstand.");
  for (const d of s.Documents) {
    if (
      d.size !== null &&
      (!Number.isInteger(d.size) || d.size <= 0 || d.size > MAX_FILE)
    )
      fail("Ungültige Dokumentgröße.");
    if (typeof d.missing !== "boolean") fail("Ungültiger Belegstatus.");
    if (d.sha256 !== null && !/^[a-f0-9]{64}$/.test(d.sha256))
      fail("Ungültige Prüfsumme.");
    if (
      !d.missing &&
      (!d.sha256 || !d.drive_id || !d.size || !mimeTypes.includes(d.mime!))
    )
      fail("Unvollständige Dokumentdaten.");
  }
  for (const r of s.Reminders) {
    if (typeof r.fixed_calendar !== "boolean") fail("Ungültige Kalenderregel.");
    if (!r.voided && !r.due_date && r.due_odometer_km === null)
      fail("Aktive Regel benötigt eine Fälligkeitsgrenze.");
    if (r.repeat_months && r.repeat_days)
      fail("Monats- und Tageswiederholung bitte alternativ wählen.");
    if (
      r.repeat_days !== null &&
      (!Number.isInteger(r.repeat_days) || r.repeat_days <= 0)
    )
      fail("Ungültiger Tagesabstand.");
  }
  const expenseIndex = new Map(s.Expenses.map((e) => [e.id, e])),
    allocated = new Map<string, number>();
  for (const w of s.Work)
    if (!w.voided)
      for (const a of w.allocations)
        allocated.set(
          a.expense_id,
          (allocated.get(a.expense_id) ?? 0) + a.amount_cents,
        );
  for (const w of s.Work) {
    if (
      w.labor_minutes !== null &&
      (!Number.isInteger(w.labor_minutes) || w.labor_minutes < 0)
    )
      fail("Arbeitszeit ungültig.");
    for (const a of w.allocations) {
      const expense = expenseIndex.get(a.expense_id);
      if (
        !expense ||
        !w.expense_refs.includes(a.expense_id) ||
        !Number.isInteger(a.amount_cents) ||
        a.amount_cents < 0
      )
        fail("Kostenanteil ungültig.");
      const sum = allocated.get(a.expense_id) ?? 0;
      if (expense.amount_cents === null || sum > Math.abs(expense.amount_cents))
        fail("Kostenanteile übersteigen die Rechnung.");
    }
  }
}
function pick<T>(x: unknown, props: object): T {
  return Object.fromEntries(
    Object.entries(x as object).filter(([k]) => k in props),
  ) as T;
}
const patchFields: Partial<Record<Table, string[]>> = {
  Expenses: [
    "title",
    "category",
    "date",
    "odometer_km",
    "amount_cents",
    "currency",
    "vendor",
    "invoice_number",
    "notes",
    "cashflow_type",
    "fuel",
    "items",
    "archived",
    "voided",
    "refund_of_id",
    "document_refs",
    "position_prices",
  ],
  Work: [
    "title",
    "kind",
    "status",
    "date",
    "odometer_km",
    "performed_by",
    "description",
    "expense_refs",
    "document_refs",
    "parts",
    "estimated_cost_cents",
    "modification_details",
    "labor_minutes",
    "allocations",
    "archived",
    "voided",
    "workshop_snapshot",
  ],
  Documents: ["title", "document_type", "archived"],
  Reminders: [
    "title",
    "due_date",
    "due_odometer_km",
    "repeat_months",
    "repeat_km",
    "repeat_days",
    "lead_days",
    "lead_km",
    "email_enabled",
    "notes",
    "fixed_calendar",
    "archived",
    "voided",
  ],
  Vehicles: [
    "manufacturer",
    "model",
    "year",
    "first_registration",
    "engine",
    "vin",
    "plate",
    "purchase_date",
    "purchase_odometer",
    "fuel_type",
    "photo_id",
    "accent_color",
    "power_kw",
    "catalog_reference",
  ],
  Settings: [
    "hidden_categories",
    "external_fuel_url",
    "email_enabled",
    "backup_retention",
    "workshops",
    "self_workshop_id",
  ],
};
export function editEntity(
  original: State,
  t: Table,
  id: string,
  revision: number,
  patch: Record<string, unknown>,
  at: string,
) {
  const allowed = patchFields[t];
  if (!allowed || Object.keys(patch).some((k) => !allowed.includes(k)))
    fail("Änderung enthält unzulässige Felder.");
  const s = clone(original);
  const row =
    (s[t] as unknown as (Meta & Record<string, unknown>)[]).find(
      (x) => x.id === id,
    ) ?? fail("Eintrag fehlt.");
  if (row.revision !== revision)
    fail(
      "Konflikt: Dieser Eintrag wurde inzwischen geändert. Bitte neu laden und Änderungen vergleichen.",
    );
  const before = clone(row);
  Object.assign(row, patch, { revision: revision + 1, updated_at: at });
  if (
    t === "Expenses" &&
    row.refund_of_id &&
    !s.Expenses.some((e) => e.id === row.refund_of_id)
  )
    fail("Erstattungsbezug fehlt.");
  if (t === "Expenses" || t === "Work") {
    s.DocumentLinks = s.DocumentLinks.filter((l) => l.entity_id !== id);
    for (const doc of row.document_refs as string[])
      s.DocumentLinks.push({
        ...meta(id + "-doc-" + doc, at),
        entity_id: id,
        document_id: doc,
      });
  }
  s.AuditLog.push({
    ...meta(id + "-r" + row.revision, at),
    entity_id: id,
    action: "edit",
    before,
    after: clone(row),
  });
  validateState(s);
  return s;
}
export function csv(s: State, t: Table) {
  const rows = s[t] as unknown as Record<string, unknown>[];
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (v: unknown) => {
    let x = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    if (/^[\s]*[=+@\-]/.test(x)) x = "'" + x;
    return '"' + x.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      keys.map(cell).join(";"),
      ...rows.map((r) => keys.map((k) => cell(r[k])).join(";")),
    ].join("\r\n")
  );
}

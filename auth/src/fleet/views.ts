import {
  emptyHistoryFilter,
  type HistoryFilter,
  type PageInfo,
  type VehicleView,
} from "../../../shared/fleet";
import { currentOdometer, fuelIntervals } from "../../../shared/logic";
import type { State, Table } from "../../../shared/types";
import { problem, storage, type V2Env } from "../v2/types";
import {
  asSummary,
  baseState,
  rows,
  vehicle,
  vehicles,
  type FleetAccount,
  type VehicleRow,
} from "./store";

export async function status(env: V2Env, a: FleetAccount) {
  const { db } = storage(env);
  const data = await db
    .prepare(
      "SELECT j.*,u.bytes,a.email FROM record_accounts a LEFT JOIN fleet_jobs j ON j.owner=a.owner LEFT JOIN record_usage u ON u.scope=a.owner WHERE a.owner=?",
    )
    .bind(a.owner)
    .first<any>();
  return {
    features: { capture: 1, gallery: 1, fleet: 1 },
    account_email: data.email,
    last_check: data.last_run ? new Date(data.last_run).toISOString() : null,
    last_backup: data.last_backup,
    last_error: data.last_error,
    next_check: data.next_run ? new Date(data.next_run).toISOString() : null,
    scheduler: {
      last_run: data.last_run,
      last_error: data.last_error,
      phase: data.phase,
      enabled: env.AUTOMATION_ENABLED === "true",
    },
    storage: { bytes: data.bytes ?? 0, limit: 1000000000 },
  };
}
export async function bootstrap(env: V2Env, a: FleetAccount) {
  return {
    vehicles: (await vehicles(env, a)).map(asSummary),
    settings: JSON.parse(a.settings),
    settingsRevision: a.revision,
    status: await status(env, a),
  };
}
export function encodeCursor(date: string, id: string) {
  return btoa(JSON.stringify({ date, id }));
}
function historyFilter(raw: string): HistoryFilter {
  try {
    const f = { ...emptyHistoryFilter, ...JSON.parse(raw) };
    if (
      typeof f.search !== "string" ||
      f.search.length > 200 ||
      typeof f.category !== "string" ||
      f.category.length > 100 ||
      !["from", "to"].every(
        (k) =>
          typeof f[k] === "string" &&
          (!f[k] || /^\d{4}-\d{2}-\d{2}$/.test(f[k])),
      ) ||
      !["all", "with", "missing"].includes(f.proof) ||
      typeof f.showArchived !== "boolean" ||
      typeof f.showVoided !== "boolean"
    )
      throw Error();
    return f;
  } catch {
    problem(400, "Ungültiger Historienfilter.");
  }
}
function cursorValue(cursor: string | null) {
  if (!cursor) return null;
  try {
    const c = JSON.parse(atob(cursor));
    if (
      typeof c.date !== "string" ||
      typeof c.id !== "string" ||
      c.date.length > 32 ||
      c.id.length > 512
    )
      throw Error();
    return c as { date: string; id: string };
  } catch {
    problem(400, "Ungültige Seitennavigation.");
  }
}
export async function page(
  env: V2Env,
  a: FleetAccount,
  v: VehicleRow,
  kind: Table,
  cursor: string | null,
  filter = "",
) {
  if (
    ![
      "Expenses",
      "Work",
      "Documents",
      "Reminders",
      "Odometer",
      "NotificationLog",
      "AuditLog",
    ].includes(kind)
  )
    problem(400, "Unbekannter Listenbereich.");
  const order = ["Documents", "AuditLog", "NotificationLog"].includes(kind)
      ? "created_at"
      : "date",
    dateSql = "COALESCE(json_extract(payload,'$." + order + "'),'')",
    c = cursorValue(cursor),
    where: string[] = [""],
    args: unknown[] = [];
  if (filter === "photos") {
    where.push("json_extract(payload,'$.document_type')='photo'");
  } else if (filter === "modifications") {
    where.push("json_extract(payload,'$.kind')='modification'");
  } else if (
    filter.startsWith("history:") &&
    ["Expenses", "Work"].includes(kind)
  ) {
    const f = historyFilter(filter.slice(8));
    if (!f.showArchived)
      where.push("COALESCE(json_extract(payload,'$.archived'),0)=0");
    if (!f.showVoided)
      where.push("COALESCE(json_extract(payload,'$.voided'),0)=0");
    if (f.search) {
      where.push(
        "instr(lower(replace(replace(replace(payload,'Ä','ä'),'Ö','ö'),'Ü','ü')),?)>0",
      );
      args.push(f.search.toLocaleLowerCase("de-DE"));
    }
    if (f.category) {
      where.push("json_extract(payload,'$.category')=?");
      args.push(f.category);
    }
    if (f.from) {
      where.push("json_extract(payload,'$.date')>=?");
      args.push(f.from);
    }
    if (f.to) {
      where.push("json_extract(payload,'$.date')<=?");
      args.push(f.to);
    }
    if (f.proof !== "all") {
      const missing =
        "(json_array_length(json_extract(payload,'$.document_refs'))=0 OR EXISTS(SELECT 1 FROM json_each(json_extract(fleet_entities.payload,'$.document_refs')) r WHERE NOT EXISTS(SELECT 1 FROM fleet_entities d WHERE d.owner=fleet_entities.owner AND d.vehicle=fleet_entities.vehicle AND d.generation=fleet_entities.generation AND d.kind='Documents' AND d.id=r.value AND COALESCE(json_extract(d.payload,'$.missing'),0)=0)))";
      where.push(
        f.proof === "missing"
          ? missing
          : "EXISTS(SELECT 1 FROM json_each(json_extract(fleet_entities.payload,'$.document_refs')) r JOIN fleet_entities d ON d.id=r.value AND d.owner=fleet_entities.owner AND d.vehicle=fleet_entities.vehicle AND d.generation=fleet_entities.generation AND d.kind='Documents' WHERE COALESCE(json_extract(d.payload,'$.missing'),0)=0)",
      );
    }
  } else if (filter) problem(400, "Unbekannter Filter.");
  if (c) {
    where.push("(" + dateSql + "<? OR (" + dateSql + "=? AND id<?))");
    args.push(c.date, c.date, c.id);
  }
  const found = await rows(
    env,
    a,
    v,
    kind,
    where
      .filter(Boolean)
      .map((w) => " AND " + w)
      .join(""),
    args,
    "ORDER BY " + dateSql + " DESC,id DESC LIMIT 51",
  );
  const out = found.slice(0, 50),
    last = out.at(-1);
  return {
    rows: out,
    page: {
      table: kind,
      filter,
      cursor:
        found.length > 50 ? encodeCursor(last[order] ?? "", last.id) : null,
      hasMore: found.length > 50,
    } as PageInfo,
  };
}
async function dependencies(
  env: V2Env,
  a: FleetAccount,
  v: VehicleRow,
  s: State,
) {
  if (s.Expenses.length) {
    const ids = s.Expenses.map((e) => e.id),
      linked = await rows(
        env,
        a,
        v,
        "Work",
        " AND EXISTS(SELECT 1 FROM json_each(json_extract(payload,'$.expense_refs')) WHERE value IN (SELECT value FROM json_each(?)))",
        [JSON.stringify(ids)],
      );
    s.Work.push(...linked.filter((w) => !s.Work.some((r) => r.id === w.id)));
  }
  const expenses = new Set(s.Work.flatMap((w) => w.expense_refs)),
    docs = new Set([...s.Work, ...s.Expenses].flatMap((w) => w.document_refs));
  if (expenses.size)
    s.Expenses.push(
      ...(await rows(
        env,
        a,
        v,
        "Expenses",
        " AND id IN (SELECT value FROM json_each(?))",
        [JSON.stringify([...expenses])],
      ).then((rs) => rs.filter((r) => !s.Expenses.some((e) => e.id === r.id)))),
    );
  for (const e of s.Expenses) for (const d of e.document_refs) docs.add(d);
  if (docs.size)
    s.Documents.push(
      ...(await rows(
        env,
        a,
        v,
        "Documents",
        " AND id IN (SELECT value FROM json_each(?))",
        [JSON.stringify([...docs])],
      ).then((rs) =>
        rs.filter((r) => !s.Documents.some((d) => d.id === r.id)),
      )),
    );
  const ids = [...s.Expenses, ...s.Work].map((e) => e.id);
  if (ids.length)
    s.DocumentLinks = await rows(
      env,
      a,
      v,
      "DocumentLinks",
      " AND json_extract(payload,'$.entity_id') IN (SELECT value FROM json_each(?))",
      [JSON.stringify(ids)],
    );
}
export async function listPage(
  env: V2Env,
  a: FleetAccount,
  v: VehicleRow,
  kind: Table,
  cursor: string | null,
  filter: string,
) {
  const out = await page(env, a, v, kind, cursor, filter),
    s = baseState(a, v);
  (s[kind] as unknown[]) = out.rows;
  if (["Expenses", "Work"].includes(kind)) await dependencies(env, a, v, s);
  return {
    ...out,
    related: {
      Expenses: s.Expenses,
      Work: s.Work,
      Documents: s.Documents,
      DocumentLinks: s.DocumentLinks,
    },
    revision: v.revision,
  };
}
export async function dashboard(
  env: V2Env,
  a: FleetAccount,
  v: VehicleRow,
  year: string,
) {
  if (!/^\d{4}$/.test(year)) problem(400, "Ungültiges Jahr.");
  const { db } = storage(env),
    q = (suffix: string, group = "") =>
      db
        .prepare(
          "SELECT " +
            suffix +
            " FROM fleet_entities WHERE owner=? AND vehicle=? AND generation=? AND kind='Expenses'" +
            group,
        )
        .bind(a.owner, v.id, v.generation);
  const amounts = await q(
    "substr(json_extract(payload,'$.date'),1,4) AS year,substr(json_extract(payload,'$.date'),6,2) AS month,json_extract(payload,'$.currency') AS currency,json_extract(payload,'$.category') AS category,json_extract(payload,'$.cashflow_type') AS flow,json_extract(payload,'$.voided') AS voided,json_extract(payload,'$.amount_cents') IS NULL AS unknown,COUNT(*) AS n,SUM(json_extract(payload,'$.amount_cents')) AS cents",
    " GROUP BY year,month,currency,category,flow,voided,unknown",
  ).all<any>();
  const total = {
      expenses: 0,
      operating: 0,
      income: 0,
      unknown: 0,
      foreign: 0,
      undated: 0,
      byCategory: {} as Record<string, number>,
      months: Array(12).fill(0) as number[],
    },
    years = [
      ...new Set<string>(
        amounts.results.flatMap((e) => (e.year ? [e.year] : [])),
      ),
    ];
  for (const r of amounts.results) {
    if (r.voided) continue;
    if (!r.year) {
      total.undated += r.n;
      continue;
    }
    if (r.year !== year) continue;
    if (r.unknown) {
      total.unknown += r.n;
      continue;
    }
    if (r.currency !== "EUR") {
      total.foreign += r.n;
      continue;
    }
    if (r.flow === "income") {
      total.income += r.cents;
      continue;
    }
    total.expenses += r.cents;
    if (r.category !== "Fahrzeugkauf & Verkauf") total.operating += r.cents;
    total.byCategory[r.category ?? "Ungeklärt"] =
      (total.byCategory[r.category ?? "Ungeklärt"] ?? 0) + r.cents;
    total.months[Number(r.month) - 1] += r.cents;
  }
  const s = baseState(a, v);
  const fuel = await rows(
    env,
    a,
    v,
    "Expenses",
    " AND json_extract(payload,'$.category')='Tanken' AND json_extract(payload,'$.voided')=0",
    [],
    "ORDER BY COALESCE(json_extract(payload,'$.date'),'') DESC,id DESC LIMIT 100",
  );
  s.Expenses = fuel;
  s.Odometer = await rows(
    env,
    a,
    v,
    "Odometer",
    " AND json_extract(payload,'$.confirmed')=1",
    [],
    "ORDER BY json_extract(payload,'$.date') DESC,id DESC LIMIT 1",
  );
  return {
    total,
    years,
    odometer: currentOdometer(s),
    intervals: fuelIntervals(s),
  };
}
export async function view(
  env: V2Env,
  a: FleetAccount,
  id: string,
  route: string,
  year: string,
): Promise<VehicleView> {
  const v = await vehicle(env, a, id),
    s = baseState(a, v),
    pages: PageInfo[] = [];
  async function list(kind: Table, filter = "") {
    const p = await page(env, a, v, kind, null, filter);
    (s[kind] as unknown[]) = p.rows;
    pages.push(p.page);
  }
  const path = route.split("?")[0];
  let summary: any;
  if (path === "/") {
    summary = await dashboard(env, a, v, year);
    await list("Reminders");
    await list("Expenses");
    await list("Work");
    s.Documents = await rows(
      env,
      a,
      v,
      "Documents",
      " AND json_extract(payload,'$.document_type')='photo'",
      [],
      "ORDER BY json_extract(payload,'$.created_at') DESC,id DESC LIMIT 10",
    );
    if (
      s.Vehicles[0].photo_id &&
      !s.Documents.some((d) => d.id === s.Vehicles[0].photo_id)
    )
      s.Documents.push(
        ...(await rows(env, a, v, "Documents", " AND id=?", [
          s.Vehicles[0].photo_id,
        ])),
      );
    const count = await storage(env)
      .db.prepare(
        "SELECT COUNT(*) AS n FROM fleet_entities WHERE owner=? AND vehicle=? AND generation=? AND kind='Documents' AND (json_extract(payload,'$.document_type')='photo' OR id=?) AND json_extract(payload,'$.missing')=0 AND json_extract(payload,'$.archived')=0 AND json_extract(payload,'$.voided')=0 AND json_extract(payload,'$.mime') LIKE 'image/%'",
      )
      .bind(a.owner, v.id, v.generation, s.Vehicles[0].photo_id ?? "")
      .first<{ n: number }>();
    summary.photoCount = count?.n ?? 0;
  } else if (path.startsWith("/historie")) {
    const raw = new URLSearchParams(route.split("?")[1] ?? "").get("filter"),
      filter =
        "history:" +
        JSON.stringify(raw ? historyFilter(raw) : emptyHistoryFilter);
    await list("Expenses", filter);
    await list("Work", filter);
    const detail = path.split("/")[2];
    if (detail) {
      for (const kind of ["Expenses", "Work"] as const) {
        const r = await rows(env, a, v, kind, " AND id=?", [detail]);
        if (r.length && !s[kind].some((x) => x.id === detail))
          s[kind].push(...r);
      }
      s.AuditLog = await rows(
        env,
        a,
        v,
        "AuditLog",
        " AND (json_extract(payload,'$.entity_id')=? OR EXISTS(SELECT 1 FROM json_each(json_extract(payload,'$.after.ids')) WHERE value=?))",
        [detail, detail],
        "ORDER BY json_extract(payload,'$.created_at') DESC,id DESC LIMIT 50",
      );
    }
    await dependencies(env, a, v, s);
  } else if (path === "/fahrzeug/galerie") {
    await list("Documents", "photos");
    if (
      s.Vehicles[0].photo_id &&
      !s.Documents.some((d) => d.id === s.Vehicles[0].photo_id)
    )
      s.Documents.push(
        ...(await rows(env, a, v, "Documents", " AND id=?", [
          s.Vehicles[0].photo_id,
        ])),
      );
  } else if (path === "/fahrzeug/dokumente") {
    await list("Documents");
    const ids = s.Documents.map((d) => d.id);
    s.DocumentLinks = await rows(
      env,
      a,
      v,
      "DocumentLinks",
      " AND json_extract(payload,'$.document_id') IN (SELECT value FROM json_each(?))",
      [JSON.stringify(ids)],
    );
    const linked = s.DocumentLinks.map((l) => l.entity_id);
    if (linked.length) {
      s.Expenses = await rows(
        env,
        a,
        v,
        "Expenses",
        " AND id IN (SELECT value FROM json_each(?))",
        [JSON.stringify(linked)],
      );
      s.Work = await rows(
        env,
        a,
        v,
        "Work",
        " AND id IN (SELECT value FROM json_each(?))",
        [JSON.stringify(linked)],
      );
    }
  } else if (path === "/fahrzeug/umbauten") {
    await list("Work", "modifications");
    await dependencies(env, a, v, s);
  } else if (path === "/fahrzeug/termine") {
    await list("Reminders");
    await list("Work");
    await dependencies(env, a, v, s);
  } else if (path === "/fahrzeug/einstellungen") {
    await list("NotificationLog");
  } else if (path === "/erfassen") {
    await list("Expenses");
    await list("Documents");
  } else if (path === "/fahrzeug") {
    await list("Odometer");
  }
  if (!s.Odometer.length)
    s.Odometer = await rows(
      env,
      a,
      v,
      "Odometer",
      " AND json_extract(payload,'$.confirmed')=1",
      [],
      "ORDER BY json_extract(payload,'$.date') DESC,id DESC LIMIT 1",
    );
  const currentAccount = await storage(env)
      .db.prepare(
        "SELECT revision,generation FROM fleet_accounts WHERE owner=?",
      )
      .bind(a.owner)
      .first<{ revision: number; generation: string }>(),
    current = await vehicle(env, a, id);
  if (
    current.revision !== v.revision ||
    currentAccount?.revision !== a.revision ||
    currentAccount?.generation !== a.generation
  )
    problem(
      409,
      "Stand während des Lesens geändert. Bitte erneut laden.",
      "READ_CHANGED",
    );
  return {
    state: s,
    revision: v.revision,
    settingsRevision: a.revision,
    status: await status(env, a),
    pages,
    dashboard: summary,
  };
}

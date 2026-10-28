import {
  ArrowUpRight,
  ChevronRight,
  FileText,
  Plus,
  Wrench,
} from "lucide-react";
import {
  currentOdometer,
  dueStatus,
  fuelIntervals,
  odometerWarnings,
  totals,
} from "../../shared/logic";
import type { State } from "../../shared/types";
import { type Adapter } from "../adapter";
import "../cloudflare.css";
import { VehicleHero } from "../Gallery";
import "../login.css";
import {
  Empty,
  date,
  dueLabels,
  money,
  today,
  workKinds,
} from "../view-support";

export function Dashboard({
  s,
  year,
  setYear,
  connected,
  summary,
}: {
  s: State;
  year: string;
  setYear: (v: string) => void;
  connected: boolean;
  adapter: Adapter | null;
  summary?: any;
}) {
  const total: ReturnType<typeof totals> = summary?.total ?? totals(s, year),
    odo = summary?.odometer ?? currentOdometer(s),
    due = s.Reminders.filter((x) => !x.voided && !x.archived),
    recent = [...s.Expenses, ...s.Work]
      .filter((x) => !x.archived && !x.voided)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 5),
    intervals: ReturnType<typeof fuelIntervals> =
      summary?.intervals ?? fuelIntervals(s),
    max = Math.max(...total.months, 1),
    knownYears: string[] =
      summary?.years ??
      s.Expenses.flatMap((x) => (x.date ? [x.date.slice(0, 4)] : []));
  return (
    <>
      <VehicleHero s={s} total={summary?.photoCount} />
      <div className="section-heading">
        <h2>Kosten</h2>
        <select
          aria-label="Jahr der Kostenübersicht"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          {[...new Set([today().slice(0, 4), ...knownYears, year])]
            .sort()
            .reverse()
            .map((y) => (
              <option key={y}>{y}</option>
            ))}
        </select>
      </div>
      <div className="metrics">
        <div className="metric">
          <span>Ist-Ausgaben {year}</span>
          <strong>{connected ? money(total.expenses) : "—"}</strong>
          <small>Einschließlich Fahrzeugkauf · netto nach Erstattungen</small>
        </div>
        <div className="metric">
          <span>Betriebskosten {year}</span>
          <strong>{connected ? money(total.operating) : "—"}</strong>
          <small>Ohne Fahrzeugkauf und Verkauf</small>
        </div>
        <div className="metric">
          <span>Bestätigter Kilometerstand</span>
          <strong>
            {odo ? odo.km.toLocaleString("de-DE") + " km" : "Noch offen"}
          </strong>
          <small>
            {odo
              ? "Stand: " + date(odo.date)
              : "Den ersten bestätigten Stand ergänzen"}
          </small>
          {odo &&
            today() >
              new Date(Date.parse(odo.date + "T12:00:00Z") + 30 * 86400000)
                .toISOString()
                .slice(0, 10) && (
              <small className="warning-text">Stand älter als 30 Tage</small>
            )}
        </div>
      </div>
      {(total.unknown > 0 || total.foreign > 0 || total.undated > 0) && (
        <p className="muted">
          Separat offen: {total.unknown} unbekannte Beträge, {total.foreign}{" "}
          Beträge in anderer/unklarer Währung und {total.undated} Buchungen ohne
          Datum.
        </p>
      )}
      {total.income > 0 && (
        <p>
          Einnahmen {year}: {money(total.income)} (getrennt von Ausgaben)
        </p>
      )}
      {odometerWarnings(s).length > 0 && (
        <div className="banner warning">
          Die Kilometerhistorie enthält fallende Werte. Bitte im Fahrzeugbereich
          prüfen.
        </div>
      )}
      <div className="two-column">
        <section className="panel">
          <div className="section-heading">
            <h2>Als Nächstes</h2>
            <a href="#/fahrzeug/termine">
              Alle Termine <ArrowUpRight size={15} />
            </a>
          </div>
          {due.length ? (
            due.map((r) => (
              <a
                className="list-row"
                href={"#/fahrzeug/termine?entry=" + r.id}
                key={r.id}
              >
                <span className="row-icon">
                  <Wrench size={18} />
                </span>
                <span>
                  <strong>{r.title}</strong>
                  <small>
                    {r.due_date ? date(r.due_date) : "Datum offen"}
                    {r.due_odometer_km !== null
                      ? " · " +
                        r.due_odometer_km.toLocaleString("de-DE") +
                        " km"
                      : ""}
                  </small>
                </span>
                <span
                  className={"tag " + dueStatus(r, today(), odo?.km ?? null)}
                >
                  {dueLabels[dueStatus(r, today(), odo?.km ?? null)]}
                </span>
              </a>
            ))
          ) : (
            <Empty title="Keine Wartungsregel hinterlegt">
              Ergänze bestätigte Termine oder Kilometergrenzen. Es sind keine
              pauschalen Wartungsintervalle vorbelegt.
            </Empty>
          )}
          <a className="subtle-link" href="#/fahrzeug/termine">
            <Plus size={16} /> Termin ergänzen
          </a>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Ausgabenverlauf</h2>
            <span className="muted">{year}</span>
          </div>
          <div className="chart" aria-label={"Monatliche Ausgaben " + year}>
            {total.months.map((v, i) => (
              <div
                key={i}
                className="chart-col"
                title={
                  new Intl.DateTimeFormat("de-DE", { month: "long" }).format(
                    new Date(2020, i, 1),
                  ) +
                  ": " +
                  money(v)
                }
              >
                <div className="bar-space">
                  <span
                    className={v < 0 ? "bar refund" : "bar"}
                    style={{
                      height: Math.max(2, (Math.abs(v) / max) * 120) + "px",
                    }}
                  />
                </div>
                <small>
                  {
                    [
                      "J",
                      "F",
                      "M",
                      "A",
                      "M",
                      "J",
                      "J",
                      "A",
                      "S",
                      "O",
                      "N",
                      "D",
                    ][i]
                  }
                </small>
                <span className="sr-only">{money(v)}</span>
              </div>
            ))}
          </div>
          {!s.Expenses.length && (
            <p className="muted center">Noch keine Ausgaben.</p>
          )}
          <div className="category-lines">
            {Object.entries(total.byCategory)
              .filter(
                ([c]) => !s.Settings[0].hidden_categories.includes(c as any),
              )
              .map(([c, v]) => (
                <div key={c}>
                  <span>
                    <i />
                    {c}
                  </span>
                  <strong>{money(v)}</strong>
                </div>
              ))}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Letzte Einträge</h2>
          <a href="#/historie">
            Zur Historie <ArrowUpRight size={15} />
          </a>
        </div>
        {recent.length ? (
          recent.map((x) => (
            <a className="list-row" href={"#/historie/" + x.id} key={x.id}>
              <span className="row-icon">
                {"amount_cents" in x ? (
                  <FileText size={18} />
                ) : (
                  <Wrench size={18} />
                )}
              </span>
              <span>
                <strong>{x.title}</strong>
                <small>
                  {date(x.date)} ·{" "}
                  {"category" in x
                    ? (x.category ?? "Kategorie offen")
                    : workKinds[x.kind]}
                </small>
              </span>
              <strong>
                {"amount_cents" in x
                  ? money(x.amount_cents, x.currency)
                  : x.status === "planned"
                    ? "Geplant"
                    : "Arbeit"}
              </strong>
              <ChevronRight size={16} />
            </a>
          ))
        ) : (
          <Empty title="Keine Einträge">
            Erfasse eine Ausgabe oder Arbeit. Dokumente kannst du auch ohne
            Buchung ablegen.
          </Empty>
        )}
      </section>
      {s.Work.some((w) => w.status === "planned" && !w.voided) && (
        <section className="panel">
          <h2>Offene Vorhaben</h2>
          {s.Work.filter((w) => w.status === "planned" && !w.voided).map(
            (w) => (
              <a className="list-row" key={w.id} href={"#/historie/" + w.id}>
                <strong>{w.title}</strong>
                <span>Schätzung: {money(w.estimated_cost_cents)}</span>
              </a>
            ),
          )}
          <p className="muted">
            Geplante Kosten sind in den Ist-Ausgaben nicht enthalten.
          </p>
        </section>
      )}
      {intervals.length > 0 && (
        <section className="panel">
          <h2>Verbrauch aus vollständigen Tankintervallen</h2>
          {intervals.slice(-3).map((x) => (
            <p key={x.to}>
              {date(x.from)} bis {date(x.to)} · {x.km} km ·{" "}
              {x.consumption.toLocaleString("de-DE", {
                maximumFractionDigits: 1,
              })}{" "}
              l/100 km
            </p>
          ))}
        </section>
      )}
    </>
  );
}

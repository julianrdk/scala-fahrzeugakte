import { emptyHistoryFilter, type HistoryFilter } from "../shared/fleet";
import { date } from "./view-support";
import {
  CarFront,
  Check,
  ChevronRight,
  Fuel,
  History,
  LayoutDashboard,
  LogOut,
  Plus,
  Printer,
  Settings2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { emptyState, validatePackage } from "../shared/logic";
import type {
  CaptureMetadata,
  Doc,
  ImportPackage,
  Meta,
  State,
  Table,
} from "../shared/types";
import { hasVehicle, vehicleName } from "../shared/vehicle";
import {
  SignInRequired,
  TestAdapter,
  base64Bytes,
  type Adapter,
  type Config,
} from "./adapter";
import { download } from "./backup";
import "./cloudflare.css";
import { CloudflareAdapter } from "./CloudflareAdapter";
import { CloudStart } from "./CloudStart";
import { FuelView } from "./FuelView";
import { Gallery } from "./Gallery";
import "./login.css";
import { PhotoProvider } from "./PhotoSession";
import { PrintView } from "./PrintView";
import { SettingsView } from "./SettingsView";
import { VehicleSetup } from "./VehicleSetup";
import { Btn, Empty, today, type Runner } from "./view-support";
const Capture = lazy(() =>
  import("./views/Capture").then((m) => ({ default: m.Capture })),
);
const ImportPreview = lazy(() =>
  import("./views/Capture").then((m) => ({ default: m.ImportPreview })),
);
import { Dashboard } from "./views/Dashboard";
import { HistoryView } from "./views/History";
import { Documents, Reminders, VehicleForm } from "./views/Vehicle";
type ExternalSession = {
  adapter: CloudflareAdapter;
  config: Config;
  initial: any;
  logout: () => Promise<void>;
};
export function App({ external }: { external?: ExternalSession } = {}) {
  const [epoch, setEpoch] = useState(0),
    [initial, setInitial] = useState(external?.initial);
  const change = async (id: string) => {
    if (!external) return;
    const out = await external.adapter.selectVehicle(id);
    setInitial(out);
    setEpoch((n) => n + 1);
    location.hash = "/";
  };
  const reload = async () => {
    if (!external) return;
    const out = await external.adapter.bootstrap();
    setInitial(out);
    setEpoch((n) => n + 1);
  };
  return (
    <Suspense fallback={<p role="status">Ansicht wird geladen …</p>}>
      <VehicleApp
        key={epoch}
        external={external ? { ...external, initial } : undefined}
        onVehicleChange={change}
        onReloadFleet={reload}
      />
    </Suspense>
  );
}
function VehicleApp({
  external,
  onVehicleChange,
  onReloadFleet,
}: {
  external?: ExternalSession;
  onVehicleChange?: (id: string) => Promise<void>;
  onReloadFleet?: () => Promise<void>;
}) {
  const [previewCapture, setPreviewCapture] = useState<
      CaptureMetadata | undefined
    >(),
    dirty = useRef(false),
    routeRequest = useRef(0);
  const [needsLogin, setNeedsLogin] = useState(false),
    [accountEpoch] = useState(0),
    [config] = useState<Config | null>(external?.config ?? null),
    [adapter] = useState<Adapter>(external?.adapter ?? new TestAdapter());
  const [state, setState] = useState<State | null>(
      external?.initial.state ?? null,
    ),
    [status, setStatus] = useState<any>(external?.initial.status ?? {}),
    [route, setRoute] = useState(location.hash.slice(1) || "/"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [working, setWorking] = useState(false),
    [loading, setLoading] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [year, setYear] = useState(today().slice(0, 4)),
    [preview, setPreview] = useState<ImportPackage | null>(null),
    [progress, setProgress] = useState(""),
    [printMode, setPrintMode] = useState<"service" | "costs" | "sale">(
      "service",
    ),
    [includeCost, setIncludeCost] = useState(false),
    [showPrintPreview, setShowPrintPreview] = useState(false),
    [printState, setPrintState] = useState<State | null>(null),
    [adding, setAdding] = useState(false);
  useEffect(() => {
    const navigate = () => {
      setRoute(location.hash.slice(1) || "/");
      window.scrollTo({ top: 0, left: 0 });
    };
    const connected = () => setOnline(navigator.onLine);
    addEventListener("hashchange", navigate);
    addEventListener("online", connected);
    addEventListener("offline", connected);
    if (!external)
      void adapter.call("read").then((r) => {
        setState(r.state);
        setStatus(r.status);
      });
    return () => {
      routeRequest.current++;
      removeEventListener("hashchange", navigate);
      removeEventListener("online", connected);
      removeEventListener("offline", connected);
    };
  }, []);
  const busy = working || loading,
    runLock = useRef(false);
  const initialView = useRef(true);
  useEffect(() => {
    if (!external) return;
    if (initialView.current) {
      initialView.current = false;
      return;
    }
    const request = ++routeRequest.current;
    setLoading(true);
    void external.adapter
      .loadView(route, year)
      .then((r) => {
        if (request === routeRequest.current) {
          setState(r.state);
          setStatus(r.status);
        }
      })
      .catch((e) => {
        if (request === routeRequest.current) setError(e.message);
      })
      .finally(() => {
        if (request === routeRequest.current) setLoading(false);
      });
  }, [route, year]);
  const run: Runner = async (action, success) => {
    if (busy || runLock.current) return false;
    runLock.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (success) setNotice(success);
      return true;
    } catch (e) {
      if (e instanceof SignInRequired) setNeedsLogin(true);
      setError(
        e instanceof Error
          ? e.message
          : "Die Aktion konnte nicht bestätigt werden.",
      );
      return false;
    } finally {
      runLock.current = false;
      setWorking(false);
      setProgress("");
    }
  };
  async function refresh(a: Adapter = adapter, fresh = false) {
    const result = await a.call("read", fresh ? { fresh: true } : {});
    setState({ ...result.state });
    setStatus(result.status);
  }
  async function mutate(action: string, arg: any) {
    await adapter.call(action, arg);
    dirty.current = false;
    await refresh();
  }
  const s = state ?? emptyState(),
    path = route.split("?")[0],
    vehicle = s.Vehicles[0],
    isTank = path === "/tankstellen" || path === "/fahrzeug/tankstellen",
    isVehicle = path.startsWith("/fahrzeug") && !isTank,
    active = isTank
      ? "Tankstellen"
      : path.startsWith("/historie")
        ? "Historie"
        : path === "/erfassen"
          ? "Erfassen"
          : isVehicle
            ? "Fahrzeug"
            : "Übersicht";
  let historyFilter: HistoryFilter = emptyHistoryFilter;
  try {
    historyFilter = {
      ...emptyHistoryFilter,
      ...JSON.parse(
        new URLSearchParams(route.split("?")[1] ?? "").get("filter") ?? "{}",
      ),
    };
  } catch {}
  const discard = () =>
    !dirty.current ||
    confirm("Ungespeicherte Eingaben verwerfen und Fahrzeug wechseln?");
  const changeVehicle = async (id: string) => {
    if (!discard()) return;
    await run(async () => {
      await onVehicleChange?.(id);
    });
  };
  const connect = () => run(() => refresh(adapter, true));
  const edit = (table: Table, row: Meta, patch: Record<string, unknown>) =>
    run(async () => {
      if (vehicle.archived)
        throw Error("Bitte zuerst das Fahrzeug reaktivieren.");
      await mutate("edit", {
        table,
        id: row.id,
        revision: row.revision,
        patch,
      });
    }, "Änderung gespeichert.");
  async function openDocument(d: Doc, preview = false) {
    const f = await adapter.call("document", { id: d.id });
    if (!f) throw Error("Originaldatei fehlt.");
    const bytes = base64Bytes(f.base64);
    if (preview) {
      const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else download(bytes, d.source_filename ?? d.title, f.mime);
  }
  const startPreview = (p: ImportPackage, capture?: CaptureMetadata) => {
    setPreviewCapture(capture);
    setPreview(validatePackage(p));
    dirty.current = true;
    location.hash = "/erfassen";
  };
  const logout = () =>
    run(async () => {
      if (!discard()) return;
      if (external) await external.logout();
      else location.href = "/";
    });
  if (!state)
    return (
      <div className="login-screen">
        <p role="status">Akte wird geladen …</p>
      </div>
    );
  if (!hasVehicle(s) || adding) {
    const setup = (
      <VehicleSetup
        busy={busy}
        error={error}
        testMode={adapter.kind === "test"}
        onSave={(input) =>
          run(async () => {
            await mutate("createVehicle", input);
            setAdding(false);
            if (external) await onReloadFleet?.();
          })
        }
        onLogout={logout}
      />
    );
    return (
      <>
        {adding && (
          <button className="button" onClick={() => setAdding(false)}>
            Zurück
          </button>
        )}
        {!hasVehicle(s) && external ? (
          <CloudStart
            adapter={adapter}
            onDone={async () => {
              await onReloadFleet?.();
            }}
            onLogout={logout}
          >
            {setup}
          </CloudStart>
        ) : (
          setup
        )}
      </>
    );
  }
  return (
    <PhotoProvider
      adapter={adapter}
      accountKey={
        String(accountEpoch) + ":" + (adapter.accountId ?? adapter.kind)
      }
    >
      <>
        <a className="skip" href="#main">
          Zum Inhalt
        </a>
        <div className="app-shell no-print" key={accountEpoch}>
          <aside className="sidebar">
            <a className="brand" href="#/">
              <span className="brand-mark">
                <CarFront size={25} />
              </span>
              <span>Fahrzeugakte</span>
            </a>
            <nav aria-label="Hauptnavigation">
              {[
                [LayoutDashboard, "Übersicht", "/"],
                [History, "Historie", "/historie"],
                [Plus, "Erfassen", "/erfassen"],
                [CarFront, "Fahrzeug", "/fahrzeug"],
                [Fuel, "Tankstellen", "/tankstellen"],
              ].map(([Icon, label, to]) => (
                <a
                  key={String(label)}
                  href={"#" + to}
                  className={active === label ? "nav-item active" : "nav-item"}
                  aria-current={active === label ? "page" : undefined}
                >
                  {typeof Icon !== "string" && <Icon size={20} />}
                  <span>{String(label)}</span>
                </a>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <a href="#/fahrzeug/einstellungen">
                <Settings2 size={17} /> Einstellungen
              </a>
            </div>
          </aside>
          <div className="workspace">
            <header className="topbar">
              <div className="vehicle-switch">
                <label>
                  Fahrzeug{" "}
                  <select
                    aria-label="Fahrzeug wechseln"
                    disabled={busy}
                    value={external?.adapter.vehicleId ?? vehicle.id}
                    onChange={(e) => void changeVehicle(e.target.value)}
                  >
                    {external?.adapter.fleet?.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {vehicleName(v.vehicle)}
                        {v.vehicle.archived ? " (archiviert)" : ""}
                      </option>
                    )) ?? (
                      <option value={vehicle.id}>{vehicleName(vehicle)}</option>
                    )}
                  </select>
                </label>
                {external && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      if (discard()) setAdding(true);
                    }}
                  >
                    Fahrzeug hinzufügen
                  </button>
                )}
              </div>
              <div className="top-actions">
                {adapter && (
                  <span className="connection">
                    <span className="private-dot" />
                    {adapter.kind === "test"
                      ? "Lokale Testakte"
                      : needsLogin
                        ? "Anmeldung nötig"
                        : "Angemeldet"}
                  </span>
                )}
                <button
                  className="icon-button"
                  title="Abmelden"
                  aria-label="Abmelden"
                  disabled={busy || !adapter}
                  onClick={logout}
                >
                  <LogOut size={18} />
                </button>
              </div>
            </header>
            <main
              id="main"
              onInputCapture={() => {
                dirty.current = true;
              }}
            >
              <div className="page-heading">
                <div>
                  <h1>{active}</h1>
                </div>
                {!vehicle.archived && (
                  <a className="button primary" href="#/erfassen">
                    <Plus size={18} /> Eintrag hinzufügen
                  </a>
                )}
              </div>
              {!online && (
                <div className="banner warning" role="status">
                  Offline · Der angezeigte Stand wurde nicht erneut bestätigt.
                  Eingaben bleiben in diesem Fenster. Entwürfe kannst du im
                  Erfassungsbereich herunterladen.
                </div>
              )}
              {adapter?.kind === "test" && (
                <div className="banner test" role="status">
                  Testmodus · Daten nur in diesem Browser. Kein Server- oder
                  Mailzugriff.
                </div>
              )}
              {error && (
                <div role="alert" className="banner danger">
                  <TriangleAlert size={20} />
                  <div>
                    {error}
                    {/Anmeldung|erneut verbinden/.test(error) && (
                      <div>
                        <Btn onClick={connect}>Erneut verbinden</Btn>
                      </div>
                    )}
                    {/Konflikt/.test(error) && (
                      <div>
                        <Btn
                          onClick={() =>
                            run(
                              () => refresh(adapter, true),
                              "Aktueller Stand geladen. Bitte deine Änderungen vergleichen.",
                            )
                          }
                        >
                          Aktuellen Stand laden
                        </Btn>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {notice && (
                <div className="banner success" role="status">
                  <Check size={18} />
                  {notice}
                </div>
              )}
              {busy && (
                <div role="status" className="progress">
                  {progress || "Bitte warten · Ergebnis wird geprüft …"}
                </div>
              )}
              {path === "/" && (
                <Dashboard
                  s={s}
                  year={year}
                  setYear={setYear}
                  connected={!!adapter}
                  adapter={adapter}
                  summary={external?.adapter.dashboard}
                />
              )}
              {isTank && (
                <FuelView
                  service={
                    adapter instanceof CloudflareAdapter ? adapter : null
                  }
                  externalUrl={s.Settings[0].external_fuel_url}
                  testMode={adapter.kind === "test"}
                  onReconnect={connect}
                />
              )}
              {path.startsWith("/historie") && (
                <HistoryView
                  filter={historyFilter}
                  onFilter={
                    external
                      ? (filter) => {
                          dirty.current = false;
                          location.hash =
                            "/historie?" +
                            new URLSearchParams({
                              filter: JSON.stringify(filter),
                            });
                        }
                      : undefined
                  }
                  s={s}
                  detailId={path.split("/")[2]}
                  edit={edit}
                  run={run}
                  openDocument={openDocument}
                />
              )}
              {path === "/erfassen" &&
                !vehicle.archived &&
                (preview ? (
                  <ImportPreview
                    key={preview.import_id ?? "preview"}
                    initial={preview}
                    initialCapture={previewCapture}
                    captureSupported={
                      adapter.kind === "test" || status.features?.capture === 1
                    }
                    s={s}
                    adapter={adapter}
                    run={run}
                    busy={busy}
                    onDone={async (reused) => {
                      await refresh();
                      setPreview(null);
                      setNotice(
                        reused
                          ? "Dieses Paket war bereits gespeichert. Vorhandene Einträge wurden geladen."
                          : "Import bestätigt gespeichert.",
                      );
                      location.hash = "/historie";
                    }}
                    onBack={() => setPreview(null)}
                    setProgress={setProgress}
                  />
                ) : (
                  <Capture
                    s={s}
                    adapter={adapter}
                    onPreview={startPreview}
                    run={run}
                    busy={busy}
                    supported={
                      adapter.kind === "test" || status.features?.capture === 1
                    }
                    onReceiptDone={async () => {
                      await refresh();
                      location.hash = "/historie";
                    }}
                  />
                ))}
              {isVehicle && (
                <>
                  <nav className="tabs" aria-label="Fahrzeugbereiche">
                    {[
                      ["Stammdaten", "/fahrzeug"],
                      ["Galerie", "/fahrzeug/galerie"],
                      ["Dokumente", "/fahrzeug/dokumente"],
                      ["Umbauten", "/fahrzeug/umbauten"],
                      ["Termine", "/fahrzeug/termine"],
                      ["Einstellungen", "/fahrzeug/einstellungen"],
                    ].map(([title, to]) => (
                      <a
                        key={to}
                        href={"#" + to}
                        className={path === to ? "selected" : ""}
                      >
                        {title}
                      </a>
                    ))}
                  </nav>
                  {path === "/fahrzeug" && (
                    <VehicleForm
                      key={vehicle.revision}
                      s={s}
                      edit={edit}
                      run={run}
                      mutate={mutate}
                      openDocument={openDocument}
                      onPreview={startPreview}
                    />
                  )}
                  {path === "/fahrzeug/galerie" && (
                    <Gallery
                      s={s}
                      adapter={adapter}
                      edit={edit}
                      run={run}
                      refresh={refresh}
                      busy={busy}
                    />
                  )}
                  {path === "/fahrzeug/dokumente" && (
                    <Documents
                      s={s}
                      edit={edit}
                      run={run}
                      adapter={adapter}
                      refresh={refresh}
                      openDocument={openDocument}
                      onPreview={startPreview}
                    />
                  )}
                  {path === "/fahrzeug/umbauten" && (
                    <section className="panel">
                      <h2>Umbauten & Zubehör</h2>
                      <p className="muted">
                        Bestätigte Einbauten und offene Vorhaben.
                        Abnahmeunterlagen bei der Arbeit verknüpfen.
                      </p>
                      {s.Work.filter(
                        (w) => w.kind === "modification" && !w.voided,
                      ).map((w) => (
                        <a
                          className="list-row"
                          href={"#/historie/" + w.id}
                          key={w.id}
                        >
                          <Wrench size={18} />
                          <span>
                            <strong>{w.title}</strong>
                            <small>
                              {w.modification_details?.status === "installed"
                                ? "Eingebaut"
                                : w.modification_details?.status === "removed"
                                  ? "Ausgebaut"
                                  : w.status === "planned"
                                    ? "Geplant"
                                    : "Erledigt"}{" "}
                              · {date(w.date)}
                            </small>
                          </span>
                          <ChevronRight size={18} />
                        </a>
                      ))}
                      {!s.Work.some((w) => w.kind === "modification") && (
                        <Empty title="Keine Umbauten">
                          Lege beim Erfassen eine Arbeit mit der Art „Umbau“ an.
                        </Empty>
                      )}
                    </section>
                  )}
                  {path === "/fahrzeug/termine" && (
                    <Reminders
                      s={s}
                      edit={edit}
                      run={run}
                      mutate={mutate}
                      onPreview={startPreview}
                    />
                  )}

                  {path === "/fahrzeug/einstellungen" && (
                    <SettingsView
                      s={s}
                      config={config}
                      status={status}
                      adapter={adapter}
                      edit={edit}
                      run={run}
                      refresh={(fresh) => refresh(adapter, fresh)}
                      setProgress={setProgress}
                      mutate={mutate}
                    />
                  )}
                </>
              )}
              {vehicle.archived && (
                <div className="banner warning">
                  Dieses Fahrzeug ist archiviert. Angaben bleiben lesbar; neue
                  Änderungen und Erinnerungen sind pausiert.
                </div>
              )}
              {external?.adapter.pages
                .filter((p) => p.hasMore)
                .map((p) => (
                  <button
                    className="button"
                    disabled={busy}
                    key={p.table}
                    onClick={() =>
                      run(async () => {
                        const out = await external.adapter.loadMore(p);
                        setState(out.state);
                      })
                    }
                  >
                    Weitere{" "}
                    {(
                      {
                        Expenses: "Ausgaben",
                        Work: "Arbeiten",
                        Documents: "Dokumente",
                        Reminders: "Termine",
                        Odometer: "Kilometerstände",
                        NotificationLog: "Versandvorgänge",
                      } as any
                    )[p.table] ?? "Einträge"}{" "}
                    laden
                  </button>
                ))}
              {external && path === "/fahrzeug" && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      if (!discard()) return;
                      await external.adapter.call("archive", {
                        archived: !vehicle.archived,
                      });
                      await onReloadFleet?.();
                    })
                  }
                >
                  {vehicle.archived
                    ? "Fahrzeug reaktivieren"
                    : "Fahrzeug archivieren"}
                </button>
              )}
            </main>
          </div>
        </div>
        <div className="print-tools no-print">
          <span>Drucken:</span>
          <select
            aria-label="Druckfassung"
            value={printMode}
            onChange={(e) => setPrintMode(e.target.value as any)}
          >
            <option value="service">Serviceheft</option>
            <option value="costs">Kostenübersicht</option>
            <option value="sale">Verkaufsfassung</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={includeCost}
              onChange={(e) => setIncludeCost(e.target.checked)}
            />{" "}
            Kosten zeigen
          </label>
          <Btn
            onClick={() =>
              run(async () => {
                setPrintState(
                  adapter.kind === "cloudflare"
                    ? await adapter.call("export")
                    : s,
                );
                setShowPrintPreview(!showPrintPreview);
              })
            }
          >
            Druckvorschau
          </Btn>
          <Btn
            onClick={() =>
              run(async () => {
                setPrintState(
                  adapter.kind === "cloudflare"
                    ? await adapter.call("export")
                    : s,
                );
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => window.print()),
                );
              })
            }
          >
            <Printer size={16} /> Drucken / PDF
          </Btn>
        </div>
        <div className={showPrintPreview ? "screen-print-preview" : undefined}>
          <PrintView
            s={printState ?? s}
            mode={printMode}
            year={year}
            includeCost={includeCost}
          />
        </div>
      </>
    </PhotoProvider>
  );
}

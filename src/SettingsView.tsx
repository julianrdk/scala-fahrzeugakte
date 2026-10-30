import { lazy, Suspense, useState } from "react";
const AssistantSettings = lazy(() =>
  import("./AssistantSettings").then((m) => ({ default: m.AssistantSettings })),
);
import { totals } from "../shared/logic";
import type { Meta, State, Table } from "../shared/types";
import { categories } from "../shared/types";
import { Field } from "./Field";
import { LoadTimings } from "./LoadTimings";
import { Workshops } from "./Workshops";
import type { Adapter, Config } from "./adapter";
import { exportArchive, parseArchives, restoreArchive } from "./backup";
import "./capture.css";
type Runner = (
  action: () => Promise<void>,
  success?: string,
) => Promise<boolean>;
export function SettingsView({
  s,
  config,
  status,
  adapter,
  edit,
  run,
  refresh,
  setProgress,
  mutate,
}: {
  s: State;
  config: Config | null;
  status: any;
  adapter: Adapter | null;
  edit: (t: Table, r: Meta, p: Record<string, unknown>) => Promise<boolean>;
  run: Runner;
  refresh: (fresh?: boolean) => Promise<void>;
  setProgress: (x: string) => void;
  mutate: (a: string, p: any) => Promise<void>;
}) {
  const settings = s.Settings[0],
    [restore, setRestore] = useState<Awaited<
      ReturnType<typeof parseArchives>
    > | null>(null),
    [prepared, setPrepared] = useState<any>(null),
    [switchConfirm, setSwitchConfirm] = useState(false),
    [orphans, setOrphans] = useState<any[] | null>(null),
    [accountRestore, setAccountRestore] = useState(false);
  return (
    <>
      <Suspense
        fallback={<p role="status">KI-Einstellungen werden geladen …</p>}
      >
        <AssistantSettings adapter={adapter} />
      </Suspense>
      <section className="panel">
        <h2>Konto und Speicher</h2>
        {adapter?.accountEmail && <p>Angemeldet als {adapter.accountEmail}</p>}
        <p>
          {adapter?.kind === "cloudflare"
            ? "Einträge: Cloudflare D1 · Originaldateien: privates Cloudflare R2"
            : "Lokale Testdaten in diesem Browser"}
        </p>
        {status.storage && (
          <p className="muted">
            Speicher: {(status.storage.bytes / 1000000).toFixed(1)} MB von{" "}
            {(status.storage.limit / 1000000).toFixed(0)} MB
          </p>
        )}
        <details>
          <summary>Öffentliche Verbindungskonfiguration</summary>
          <pre>{JSON.stringify(config, null, 2)}</pre>
          <p className="muted">
            Diese IDs sind öffentliche Konfiguration. Kein Client-Secret,
            Passwort oder Token eintragen.
          </p>
        </details>
        {adapter?.kind === "cloudflare" && <LoadTimings />}
        <div className="button-group">
          <button
            className="button"
            onClick={() =>
              run(
                async () => {
                  if (!adapter) throw Error("Bitte zuerst verbinden.");
                  const r = await adapter.call("smoke");
                  if (!r.ok) throw Error("Lese-/Schreibtest fehlgeschlagen.");
                },
                adapter?.kind === "test"
                  ? "Lokaler Adapter geprüft. Dies bestätigt keine Server-Verbindung."
                  : "Eigentümerprüfung und echter Lese-/Schreibtest erfolgreich.",
              )
            }
          >
            Lese-/Schreibtest starten
          </button>
          <button
            className="button"
            onClick={() => run(() => refresh(true), "Stand erneut geladen.")}
          >
            Akte neu laden
          </button>
        </div>
      </section>
      <Workshops
        settings={settings}
        edit={edit}
        supported={adapter?.kind === "test" || status.features?.capture === 1}
      />
      <section className="panel">
        <h2>Ansicht und Favoriten</h2>
        <p className="muted">
          Ausgeblendete Kategorien zählen weiterhin in allen Summen.
        </p>
        {categories.map((c) => (
          <label className="check" key={c}>
            <input
              type="checkbox"
              checked={!settings.hidden_categories.includes(c)}
              onChange={(e) =>
                edit("Settings", settings, {
                  hidden_categories: e.target.checked
                    ? settings.hidden_categories.filter((x) => x !== c)
                    : [...settings.hidden_categories, c],
                })
              }
            />
            {c} im Kategorienvergleich zeigen
          </label>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            edit("Settings", settings, {
              external_fuel_url: String(f.get("url")),
            });
          }}
        >
          <Field label="Externe Tankpreis-Seite">
            <input
              name="url"
              type="url"
              pattern="https://.*"
              defaultValue={settings.external_fuel_url}
              required
            />
          </Field>
          <button className="button">Link speichern</button>
        </form>
      </section>
      <section className="panel">
        <h2>E-Mail und Wartungstexte</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.email_enabled}
            onChange={(e) =>
              edit("Settings", settings, { email_enabled: e.target.checked })
            }
          />{" "}
          Erinnerungen global aktivieren
        </label>
        <p className="muted">
          Zusätzlich muss E-Mail pro Regel aktiv sein. Ein täglicher Trigger
          prüft unabhängig von der geöffneten Webseite. Versand erfolgt in einem
          Zeitfenster; Zustellung ist nicht garantiert.
        </p>
        <button
          className="button"
          onClick={() =>
            run(async () => {
              if (!adapter) throw Error("Bitte verbinden.");
              await adapter.call("testMail", { confirm: true });
            }, "Testmail zum Versand angenommen.")
          }
        >
          Jetzt ausdrücklich eine Testmail senden
        </button>
        <dl className="status-grid">
          <dt>Letzte erfolgreiche Prüfung</dt>
          <dd>{status.last_check ?? "Noch nicht bestätigt"}</dd>
          <dt>Nächste Prüfung</dt>
          <dd>{status.next_check ?? "Noch nicht geplant"}</dd>
          <dt>Letzte Sicherung</dt>
          <dd>{status.last_backup ?? "Noch nicht bestätigt"}</dd>
          <dt>Tägliche Prüfung</dt>
          <dd>
            {status.scheduler
              ? status.scheduler.enabled === false
                ? "Pausiert"
                : status.scheduler.last_run
                  ? "Aktiv · " + status.scheduler.phase
                  : "Erster Lauf ausstehend"
              : status.trigger_installed
                ? "Eingerichtet"
                : "Noch nicht bestätigt"}
          </dd>
          <dt>Verbleibendes Mail-Kontingent</dt>
          <dd>{status.remaining_mail_quota ?? "Unbekannt"}</dd>
          <dt>Letzter Fehler</dt>
          <dd>
            {status.scheduler?.last_error ??
              status.last_error ??
              "Keiner gemeldet"}
          </dd>
        </dl>
        <details>
          <summary>Versandprotokoll</summary>
          {s.NotificationLog.length ? (
            s.NotificationLog.map((n) => (
              <p key={n.id}>
                {n.created_at} ·{" "}
                {n.status === "sent"
                  ? "Versand bestätigt"
                  : n.status === "sending"
                    ? "Versandausgang nach Abbruch eventuell unklar"
                    : n.status === "uncertain"
                      ? "Versandausgang unklar"
                      : "Fehlgeschlagen"}{" "}
                · {n.message}
              </p>
            ))
          ) : (
            <p className="muted">Noch keine Versandvorgänge.</p>
          )}
        </details>
      </section>
      <section className="panel">
        <h2>Sichern und exportieren</h2>
        <p>
          Ein vollständiges ZIP enthält Daten, Originaldateien, Prüfsummen,
          Verknüpfungen und CSV-Tabellen. Ab 20 MiB Originaldaten entstehen
          Teilarchive; alle Teile zusammen aufbewahren.
        </p>
        <div className="button-group">
          <button
            className="button primary"
            onClick={() =>
              run(async () => {
                if (!adapter) throw Error("Bitte verbinden.");
                const current =
                  adapter.kind === "cloudflare"
                    ? await adapter.call("export")
                    : (await adapter.call("read")).state;
                await exportArchive(adapter, current, setProgress);
              }, "Vollständiger Export zum Download bereitgestellt.")
            }
          >
            Dieses Fahrzeug exportieren
          </button>
          <button
            className="button"
            onClick={() =>
              run(
                async () => {
                  if (!adapter) throw Error("Bitte verbinden.");
                  await adapter.call("backup");
                  await refresh();
                },
                adapter?.kind === "test"
                  ? "Lokale Testsicherung erstellt."
                  : "Sicherung angefordert. Der Zeitplan verarbeitet sie in mehreren Schritten.",
              )
            }
          >
            Jetzt Sicherung anfordern
          </button>
          {adapter?.kind === "cloudflare" && (
            <button
              className="button"
              onClick={() =>
                run(async () => {
                  await exportArchive(
                    adapter,
                    await adapter.call("export", { account: true }),
                    setProgress,
                  );
                }, "Kontoexport bereitgestellt.")
              }
            >
              Gesamtes Konto exportieren
            </button>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            edit("Settings", settings, {
              backup_retention: Number(
                new FormData(e.currentTarget).get("retention"),
              ),
            });
          }}
        >
          <label className="field">
            <span>Anzahl aufzubewahrender datierter Sicherungen (1–90)</span>
            <input
              name="retention"
              type="number"
              min="1"
              max="90"
              defaultValue={settings.backup_retention}
            />
          </label>
          <button className="button">Aufbewahrung speichern</button>
        </form>
        <p className="muted">
          Tägliche Sicherungen schützen vor Bearbeitungsfehlern. Für Schutz
          gegen Kontoverlust ZIP zusätzlich außerhalb dieses Kontos aufbewahren.{" "}
          {adapter?.kind === "cloudflare"
            ? "Sicherungen verweisen auf die unveränderten Originale im privaten R2-Speicher."
            : "Dateien bleiben im lokalen Testspeicher."}
        </p>
        <button
          className="button"
          onClick={() =>
            run(async () => {
              if (!adapter) throw Error("Bitte verbinden.");
              setOrphans(await adapter.call("orphanFiles"));
            })
          }
        >
          Nicht verknüpfte Uploads anzeigen
        </button>
        {orphans && (
          <div>
            {orphans.length ? (
              orphans.map((o, i) => (
                <p key={i}>
                  {o.name ?? o.source_filename} · {o.created_at} · {o.id}
                </p>
              ))
            ) : (
              <p className="muted">Keine nicht verknüpften Dateien gefunden.</p>
            )}
            <p className="muted">
              Uploads werden nach einem Abbruch wiederverwendet. Zur Bereinigung
              bewusst im privaten Originalspeicher prüfen; die App löscht keine
              Originale automatisch.
            </p>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>In eine frische Akte wiederherstellen</h2>
        <p>
          Wähle alle Teile desselben Exports. Die Vorschau prüft Daten und
          Originale. Anschließend entsteht ein separater Speicherbereich. Erst
          nach deiner Bestätigung wird umgeschaltet.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={accountRestore}
            onChange={(e) => {
              setAccountRestore(e.target.checked);
              setPrepared(null);
            }}
          />{" "}
          Gesamtes Konto einschließlich gemeinsamer Einstellungen
          wiederherstellen
        </label>
        <label className="field">
          <span>ZIP-Dateien auswählen</span>
          <input
            type="file"
            accept=".zip,application/zip"
            multiple
            onChange={(e) => {
              const f = Array.from(e.target.files ?? []);
              setPrepared(null);
              setSwitchConfirm(false);
              run(
                async () => setRestore(await parseArchives(f)),
                "Archiv vollständig geprüft. Noch keine Daten umgeschaltet.",
              );
            }}
          />
        </label>
        {restore && (
          <>
            <p>
              Archivvorschau: {restore.state.Expenses.length} Ausgaben,{" "}
              {restore.state.Work.length} Arbeiten,{" "}
              {restore.state.Documents.length} Dokumente. Ausgaben:{" "}
              {new Intl.NumberFormat("de-DE", {
                style: "currency",
                currency: "EUR",
              }).format(totals(restore.state).expenses / 100)}
              .
            </p>
            <button
              className="button"
              onClick={() =>
                run(async () => {
                  if (!adapter) throw Error("Bitte verbinden.");
                  setPrepared(
                    await restoreArchive(
                      adapter,
                      restore,
                      setProgress,
                      accountRestore,
                    ),
                  );
                }, "Neue Akte erstellt und geprüft. Bestehende Akte ist weiterhin aktiv.")
              }
            >
              Neue Akte erstellen und Originale prüfen
            </button>
          </>
        )}
        {prepared && (
          <div className="review-entry">
            <p>
              Neue Akte: {prepared.state.Expenses.length} Ausgaben ·{" "}
              {prepared.state.Documents.length} Dokumente ·{" "}
              {prepared.missing.length} fehlende Originale
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={switchConfirm}
                onChange={(e) => setSwitchConfirm(e.target.checked)}
              />{" "}
              Ich habe die Vorschau geprüft und möchte die neue Akte aktivieren.
              Die alte Akte bleibt erhalten.
            </label>
            <button
              className="button primary"
              disabled={!switchConfirm || prepared.missing.length > 0}
              onClick={() =>
                run(async () => {
                  await mutate("restoreSwitch", {
                    id: prepared.id,
                    confirm: true,
                    account: prepared.account,
                  });
                  setPrepared(null);
                  setRestore(null);
                }, "Wiederhergestellte Akte ist jetzt aktiv. Ursprungsdaten bleiben erhalten.")
              }
            >
              Auf geprüfte Wiederherstellung umschalten
            </button>
          </div>
        )}
      </section>
    </>
  );
}

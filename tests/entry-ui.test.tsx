// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { Capture, type EntryApply } from "../src/views/Capture";
import type { Adapter } from "../src/adapter";
import { readReceipt } from "../src/ocr";
import {
  emptyState,
  totals,
  clone,
  blankPackage,
  commitImport,
  meta,
} from "../shared/logic";
import { newWork, newExpense } from "../src/entry-draft";
import { reminder } from "./fixtures";
import { ServiceError } from "../src/CloudflareAdapter";
import type { AssistantSeed } from "../shared/assistant";
vi.mock("../src/ocr", () => ({ readReceipt: vi.fn() }));
let root: Root,
  host: HTMLDivElement,
  adapter: Adapter,
  call: Mock<(action: string, arg?: any) => Promise<any>>;
let seed: (() => AssistantSeed) | null,
  apply: EntryApply | null,
  errors: string[],
  saved: Mock<() => void>;
const receipt = {
  pages: [
    {
      page: 1,
      method: "ocr" as const,
      text: "Muster Autoteile GmbH\nRechnungsnummer: RE-42\nRechnungsdatum: 26.10.2026\nBeschreibung  Menge  Einheit  Teilenummer  Einzelpreis netto  Gesamt netto\nÖlfilter  2  Stück  OF-42  12,50  25,00\nRechnungsbetrag: 72,59 EUR",
    },
  ],
  previews: ["blob:preview"],
};
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  errors = [];
  seed = null;
  apply = null;
  saved = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  let state = emptyState();
  call = vi.fn(async (action: string, arg: any) => {
    if (action === "read") return { state };
    if (action === "upload") {
      const upload = {
        ...meta(crypto.randomUUID(), new Date().toISOString()),
        ...arg.file,
        drive_id: "synthetic",
        operation_id: arg.operation_id,
      };
      state.Uploads.push(upload);
      return upload;
    }
    if (action === "commit") {
      const out = commitImport(state, arg, new Date().toISOString());
      state = out.state;
      return out.result;
    }
    throw Error("Unbekannte Aktion");
  });
  adapter = { kind: "test", call } as Adapter;
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.mocked(readReceipt).mockResolvedValue(clone(receipt));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
async function render(
  initial?: ReturnType<typeof blankPackage>,
  state = emptyState(),
) {
  await act(async () =>
    root.render(
      <Capture
        s={state}
        adapter={adapter}
        supported
        busy={false}
        initial={initial}
        onSaved={async () => {
          saved();
        }}
        run={async (action) => {
          try {
            await action();
            return true;
          } catch (e) {
            errors.push((e as Error).message);
            return false;
          }
        }}
        onAssistantContext={(factory) => {
          seed = factory;
        }}
        onAssistantApply={(factory) => {
          apply = factory;
        }}
        onAssistant={vi.fn()}
      />,
    ),
  );
}
function button(label: string) {
  const b = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === label,
  );
  if (!b) throw Error("Button fehlt: " + label);
  return b;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
function control(label: string, index = 0) {
  const el = [...host.querySelectorAll("label.field")]
    .filter((l) => l.querySelector("span")?.textContent === label)
    [index]?.querySelector<HTMLInputElement | HTMLSelectElement>(
      "input,select,textarea",
    );
  if (!el) throw Error("Feld fehlt: " + label);
  return el;
}
async function input(label: string, value: string, index = 0) {
  const el = control(label, index);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
async function attach() {
  const file = new File(["%PDF-1.4\nSYNTHETIC"], "Rechnung.pdf", {
    type: "application/pdf",
  });
  const el = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => {
    Object.defineProperty(el, "files", { configurable: true, value: [file] });
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
describe("Eine Erfassungsseite für Arbeit, Beleg und Assistent", () => {
  it("bietet eine Begründung auch bei einer nur serverseitig erkannten Dublette an", async () => {
    await render();
    await input("Titel", "Arbeit");
    call.mockRejectedValueOnce(
      new ServiceError("Mögliche doppelte Rechnung", "ACTION_INVALID", 400),
    );
    await click("Speichern");
    expect(control("Mögliche Dublette – Begründung")).not.toBeNull();
    expect(control("Titel").closest("fieldset")!.disabled).toBe(false);
  });
  it("übernimmt beim Entfernen einer Arbeit keine verwaisten Ausgabezuordnungen aus dem Chat", async () => {
    const pack = blankPackage();
    pack.work = [
      { ...newWork("w1"), title: "Erste Arbeit" },
      { ...newWork("w2"), title: "Zweite Arbeit" },
    ];
    await render(pack);
    const incoming = clone(seed!().draft);
    await click("Arbeit aus Entwurf entfernen");
    await act(async () => apply!(incoming, { w1: ["removed-expense"] }));
    expect(seed!().links).toEqual({});
    expect(seed!().draft.package.work.map((w) => w.ref)).toEqual(["w2"]);
  });
  it("übernimmt einen KI-Titel auch bei zuvor unbenanntem Formular", async () => {
    await render();
    await input("Kilometerstand", "50700");
    const incoming = clone(seed!().draft);
    incoming.package.work[0].title = "Zündkerzen gewechselt";
    await act(async () => apply!(incoming));
    expect(control("Titel").value).toBe("Zündkerzen gewechselt");
    expect(host.textContent).not.toContain("Vorschlag übernehmen");
  });
  it("speichert eine Arbeit mit vorhandener Ausgabe ohne zweite Kostenbuchung", async () => {
    const paid = blankPackage();
    paid.expenses = [
      { ...newExpense(), title: "Bereits gekauft", amount_cents: 3270 },
    ];
    await adapter.call("commit", {
      operation_id: crypto.randomUUID(),
      package: paid,
      documents: {},
      links: {},
      allow_missing: true,
      confirm_reminders: false,
      duplicate_override_reason: null,
    });
    const state = (await adapter.call("read")).state,
      pack = blankPackage();
    pack.work = [{ ...newWork(), title: "Zündkerzen gewechselt" }];
    await render(pack, state);
    await input("Bereits bezahlte Ausgabe", state.Expenses[0].id);
    await click("Speichern");
    expect(errors).toEqual([]);
    const after = (await adapter.call("read")).state;
    expect(after.Expenses).toHaveLength(1);
    expect(after.Work[0].expense_refs).toEqual([state.Expenses[0].id]);
    expect(totals(after).expenses).toBe(3270);
  });
  it("behält die ausdrückliche Bestätigung neuer Erinnerungen bei", async () => {
    const pack = blankPackage();
    pack.reminders = [reminder({ basis_work_ref: null })];
    await render(pack);
    await click("Speichern");
    expect(errors).toEqual(["Bitte die neuen Wartungsregeln bestätigen."]);
    expect(saved).not.toHaveBeenCalled();
    const confirm = [...host.querySelectorAll("label.check")]
      .find((l) => l.textContent?.includes("Wartungsregeln bestätigen"))!
      .querySelector<HTMLInputElement>("input")!;
    await act(async () => confirm.click());
    await click("Speichern");
    expect(saved).toHaveBeenCalledOnce();
    expect((await adapter.call("read")).state.Reminders).toHaveLength(1);
  });
  it("wiederholt einen unbestätigten Speichervorgang ohne doppelte Buchung oder Upload", async () => {
    await render();
    await input("Titel", "Ölfilter gewechselt");
    await attach();
    const original = call.getMockImplementation()!;
    let lost = true;
    call.mockImplementation(async (action, arg) => {
      const value = await original(action, arg);
      if (action === "commit" && lost) {
        lost = false;
        throw Error("Antwort verloren");
      }
      return value;
    });
    await click("Speichern");
    expect(errors).toContain("Antwort verloren");
    expect(saved).not.toHaveBeenCalled();
    expect(control("Titel").disabled).toBe(false);
    expect(control("Titel").closest("fieldset")!.disabled).toBe(true);
    await click("Speichern wiederholen");
    expect(saved).toHaveBeenCalledOnce();
    const requests = call.mock.calls.filter((c) => c[0] === "commit");
    expect(requests[0][1]).toEqual(requests[1][1]);
    expect(call.mock.calls.filter((c) => c[0] === "upload")).toHaveLength(1);
    const state = (await adapter.call("read")).state;
    expect(state.Work).toHaveLength(1);
    expect(state.Documents).toHaveLength(1);
  });
  it("hält mehrere Entwürfe bearbeitbar und erzeugt passende Umbauangaben", async () => {
    await render();
    await input("Titel", "Dachträger montiert");
    await input("Art der Arbeit", "modification");
    expect(host.textContent).toContain("Umbauangaben");
    await click("Arbeit hinzufügen");
    await input("Titel", "Bremsen geprüft", 1);
    await click("Speichern");
    expect(errors).toEqual([]);
    const state = (await adapter.call("read")).state;
    expect(state.Work).toHaveLength(2);
    expect(state.Work.filter((w: any) => w.modification_details)).toHaveLength(
      1,
    );
  });
  it("weist übergroße Originale vor Erkennung und Upload ab", async () => {
    await render();
    const file = new File(
      ["%PDF-1.4\n" + "x".repeat(4 * 1024 * 1024)],
      "zu-gross.pdf",
      { type: "application/pdf" },
    );
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      Object.defineProperty(input, "files", {
        value: [file],
        configurable: true,
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelector('[role="alert"]')!.textContent).toMatch(
      /4|Datei/,
    );
    expect(readReceipt).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });
  it("speichert eine Arbeit ohne zweite Vorschau und bietet keinen JSON-Import an", async () => {
    await render();
    expect(control("Eintragsart").value).toBe("work");
    await input("Titel", "Zündkerzen gewechselt");
    await click("Speichern");
    expect(errors).toEqual([]);
    expect(saved).toHaveBeenCalledOnce();
    expect((await adapter.call("read")).state.Work[0].title).toBe(
      "Zündkerzen gewechselt",
    );
    expect(host.textContent).not.toMatch(
      /JSON|ChatGPT|Vorschau prüfen|Mit KI ergänzen/,
    );
  });
  it("liest lokal aus, schützt manuelle Angaben und lädt Originale erst beim Speichern hoch", async () => {
    await render();
    await input("Titel", "Eigener Arbeitstitel");
    await input("Tatsächliches Arbeitsdatum", "2026-10-24");
    await attach();
    expect(call.mock.calls.filter((c) => c[0] === "upload")).toHaveLength(0);
    await click("Dokument auslesen");
    expect(control("Titel").value).toBe("Eigener Arbeitstitel");
    expect(control("Tatsächliches Arbeitsdatum").value).toBe("2026-10-24");
    expect(control("Rechnungsbetrag").value).toBe("72,59");
    expect(control("Rechnungsbetrag").closest(".field")!.className).toContain(
      "field-suggested",
    );
    expect(host.querySelector('img[alt="Belegvorschau"]')).not.toBeNull();
    expect(host.textContent).toContain("OCR");
    await click("Speichern");
    expect(errors).toEqual([]);
    const state = (await adapter.call("read")).state;
    expect(state.Work).toHaveLength(1);
    expect(state.Expenses).toHaveLength(1);
    expect(state.Documents).toHaveLength(1);
    expect(totals(state).expenses).toBe(7259);
    expect(state.Work[0].expense_refs).toEqual([state.Expenses[0].id]);
    expect(state.Expenses[0].position_prices[0]).toMatchObject({
      unit_price: "12.50",
      basis: "net",
    });
  });
  it("überschreibt auch einen manuell korrigierten Rechnungsbetrag nicht", async () => {
    const pack = blankPackage();
    pack.expenses = [
      { ...newExpense(), title: "Eigener Beleg", amount_cents: 5000 },
    ];
    await render(pack);
    await input("Rechnungsbetrag", "70,00");
    await act(async () =>
      control("Rechnungsbetrag").dispatchEvent(
        new FocusEvent("focusout", { bubbles: true }),
      ),
    );
    await attach();
    await click("Dokument auslesen");
    expect(control("Rechnungsbetrag").value).toBe("70,00");
    expect(
      control("Rechnungsbetrag").closest(".field")!.className,
    ).not.toContain("field-suggested");
    await click("Speichern");
    expect(errors).toEqual([]);
    expect(totals((await adapter.call("read")).state).expenses).toBe(7000);
  });
  it("behandelt einen eingelesenen Kostenvoranschlag als Schätzung", async () => {
    const pack = blankPackage();
    pack.work = [
      { ...newWork(), title: "Ölwechsel planen", status: "planned" },
    ];
    await render(pack);
    await attach();
    await click("Dokument auslesen");
    expect(control("Kostenschätzung (keine Ausgabe)").value).toBe("72,59");
    expect(host.querySelectorAll(".entry-cost")).toHaveLength(0);
    await click("Speichern");
    expect(errors).toEqual([]);
    const state = (await adapter.call("read")).state;
    expect(state.Expenses).toHaveLength(0);
    expect(state.Work[0].estimated_cost_cents).toBe(7259);
    expect(totals(state).expenses).toBe(0);
  });
  it("behält Anhänge und zwischenzeitliche Korrekturen bei der Chatübernahme", async () => {
    await render();
    await input("Titel", "Ölwechsel");
    await attach();
    const incoming = clone(seed!().draft);
    incoming.package.work[0].title = "KI-Ölwechsel";
    await input("Titel", "Manuelle Korrektur");
    await act(async () => apply!(incoming));
    expect(control("Titel").value).toBe("Manuelle Korrektur");
    expect(host.textContent).toContain("Rechnung.pdf");
    expect(host.textContent).toContain("Vorschlag übernehmen");
    await click("Vorschlag übernehmen");
    expect(control("Titel").value).toBe("KI-Ölwechsel");
    await click("Speichern");
    expect(errors).toEqual([]);
    const state = (await adapter.call("read")).state;
    expect(state.Work[0].document_refs).toEqual([state.Documents[0].id]);
  });
  it("verwirft verspätete OCR-Antworten nach Abbruch", async () => {
    let finish!: (value: typeof receipt) => void;
    vi.mocked(readReceipt).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    await input("Titel", "Bleibt erhalten");
    await attach();
    await click("Dokument auslesen");
    await click("Abbrechen");
    await act(async () => finish(receipt));
    expect(control("Titel").value).toBe("Bleibt erhalten");
    expect(host.querySelectorAll(".entry-cost")).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview", 0, [
      "blob:preview",
    ]);
  });
  it("speichert Dokumente ohne Arbeit oder Ausgabe", async () => {
    await render();
    await input("Eintragsart", "document");
    await attach();
    await click("Speichern");
    expect(errors).toEqual([]);
    const state = (await adapter.call("read")).state;
    expect(state.Work).toHaveLength(0);
    expect(state.Expenses).toHaveLength(0);
    expect(state.Documents).toHaveLength(1);
  });
});

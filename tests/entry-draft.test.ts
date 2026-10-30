import { describe, expect, it } from "vitest";
import {
  applyEntryAssistant,
  entrySeed,
  initialEntry,
  newExpense,
  newWork,
} from "../src/entry-draft";
import { clone, validatePackage } from "../shared/logic";
import { proposalToDraft } from "../shared/assistant";
import { emptyState } from "../shared/logic";
import { aiProposal } from "./ai-fixture";
const proposal = () =>
  proposalToDraft(aiProposal(), emptyState().Settings[0], "Testauto").draft!;
describe("Gemeinsame Erfassung: geschützte Übergaben", () => {
  it("beginnt mit einer Arbeit und überträgt keine Dokumentinhalte an die KI", () => {
    const current = initialEntry();
    current.package.documents.push({
      ref: "d1",
      title: "Privat",
      source_filename: "privat.pdf",
      document_type: "invoice",
    });
    current.package.work[0].document_refs = ["d1"];
    const seed = entrySeed(current, new Set());
    expect(seed.draft.package.work).toEqual([]);
    expect(seed.draft.package.documents).toEqual([]);
    expect(JSON.stringify(seed)).not.toContain("privat");
    expect(() => validatePackage(seed.draft.package)).not.toThrow();
  });
  it("ersetzt den leeren Starteintrag und behält Originale samt Zuordnung", () => {
    const current = initialEntry();
    current.package.documents.push({
      ref: "d1",
      title: "Rechnung",
      source_filename: "beleg.pdf",
      document_type: "invoice",
    });
    current.package.work[0].document_refs = ["d1"];
    const incoming = proposal();
    incoming.package.work[0].ref = "work1";
    const out = applyEntryAssistant(current, incoming, null);
    expect(out.draft.package.work).toHaveLength(1);
    expect(out.draft.package.work[0].title).toBe(
      incoming.package.work[0].title,
    );
    expect(out.draft.package.work[0].document_refs).toEqual(["d1"]);
    expect(out.draft.package.expenses[0].document_refs).toEqual(["d1"]);
    expect(out.conflicts).toEqual([]);
    expect(() => validatePackage(out.draft.package)).not.toThrow();
  });
  it("erhält zwischenzeitliche Korrekturen und bietet Abweichungen einzeln an", () => {
    const baseline = proposal(),
      current = clone(baseline),
      incoming = clone(baseline);
    current.package.work[0].title = "Manuell geändert";
    current.package.expenses[0].amount_cents = 7000;
    incoming.package.expenses[0].amount_cents = 6500;
    const out = applyEntryAssistant(current, incoming, baseline);
    expect(out.draft.package.work[0].title).toBe("Manuell geändert");
    expect(out.draft.package.expenses[0].amount_cents).toBe(7000);
    expect(out.conflicts.map((c) => c.field)).toEqual(
      expect.arrayContaining(["title", "amount_cents"]),
    );
  });
  it("stellt entfernte Einträge nicht wieder her und entfernt verwaiste Verknüpfungen", () => {
    const baseline = proposal(),
      current = clone(baseline);
    current.package.expenses = [];
    current.package.work[0].expense_refs = [];
    const out = applyEntryAssistant(current, baseline, baseline);
    expect(out.draft.package.expenses).toEqual([]);
    expect(out.draft.package.work[0].expense_refs).toEqual([]);
    expect(out.draft.capture.prices_by_expense_ref).toEqual({});
  });
  it("erhält zusätzliche manuelle Einträge und unabhängige Dokumentzuordnungen", () => {
    const current = proposal(),
      baseline = clone(current);
    current.package.work.push({
      ...newWork("manual"),
      title: "Weiterer Eintrag",
      document_refs: ["d2"],
    });
    current.package.expenses.push({
      ...newExpense("manual-cost"),
      title: "Parken",
      amount_cents: 100,
    });
    current.package.documents.push({
      ref: "d2",
      title: "Beleg",
      source_filename: null,
      document_type: "receipt",
    });
    const out = applyEntryAssistant(current, baseline, baseline);
    expect(out.draft.package.work).toHaveLength(2);
    expect(
      out.draft.package.work.find((w) => w.ref === "manual")!.document_refs,
    ).toEqual(["d2"]);
    expect(out.draft.package.work[0].document_refs).toEqual([]);
    expect(out.draft.package.expenses).toHaveLength(2);
  });
});

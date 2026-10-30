import {
  mergeAssistantDraft,
  type AssistantDraft,
  type AssistantSeed,
} from "../shared/assistant";
import { blankPackage, clone } from "../shared/logic";
import type { ExpenseInput, WorkInput } from "../shared/types";

export function newWork(ref = "work1"): WorkInput {
  return {
    ref,
    title: "",
    kind: "maintenance",
    status: "completed",
    date: null,
    odometer_km: null,
    performed_by: "unknown",
    description: null,
    expense_refs: [],
    document_refs: [],
  };
}
export function newExpense(ref = "expense1"): ExpenseInput {
  return {
    ref,
    title: "",
    category: null,
    date: null,
    odometer_km: null,
    amount_cents: null,
    currency: "EUR",
    vendor: null,
    invoice_number: null,
    document_refs: [],
    notes: null,
    cashflow_type: "expense",
  };
}
export function initialEntry(): AssistantDraft {
  const p = blankPackage();
  p.work.push(newWork());
  return { package: p, capture: {} };
}
export function entrySeed(
  draft: AssistantDraft,
  touched: Set<string>,
): AssistantSeed {
  const copy = clone(draft);
  copy.package.documents = [];
  copy.package.reminders = [];
  for (const table of ["work", "expenses"] as const) {
    copy.package[table] = copy.package[table].filter(
      (row) =>
        row.title.trim() ||
        Array.from(touched).some((path) =>
          path.startsWith(table + "." + row.ref + "."),
        ),
    ) as any;
    for (const row of copy.package[table]) {
      row.document_refs = [];
      if (!row.title.trim())
        row.title = table === "work" ? "Neue Arbeit" : "Neue Ausgabe";
    }
  }
  for (const work of copy.package.work)
    work.expense_refs = work.expense_refs.filter((ref) =>
      copy.package.expenses.some((e) => e.ref === ref),
    );
  copy.capture = {
    workshops_by_work_ref: Object.fromEntries(
      Object.entries(copy.capture.workshops_by_work_ref ?? {}).filter(([ref]) =>
        copy.package.work.some((w) => w.ref === ref),
      ),
    ),
    prices_by_expense_ref: Object.fromEntries(
      Object.entries(copy.capture.prices_by_expense_ref ?? {}).filter(([ref]) =>
        copy.package.expenses.some((e) => e.ref === ref),
      ),
    ),
  };
  return {
    draft: copy,
    protectedFields: Array.from(touched).filter(
      (path) => !path.endsWith(".document_refs"),
    ),
  };
}
export function applyEntryAssistant(
  current: AssistantDraft,
  incoming: AssistantDraft,
  baseline: AssistantDraft | null,
) {
  const proposed = clone(incoming),
    manual = clone(current),
    changed: string[] = [];
  const retainedDocuments = clone(current.package.documents),
    retainedRules = clone(current.package.reminders);
  manual.package.documents = [];
  manual.package.reminders = [];
  for (const table of ["work", "expenses"] as const) {
    // An explicit deletion made in the form after opening the chat wins.
    proposed.package[table] = proposed.package[table].filter(
      (row) =>
        !baseline?.package[table].some((b) => b.ref === row.ref) ||
        current.package[table].some((c) => c.ref === row.ref),
    ) as any;
    manual.package[table] = manual.package[table].filter((row) => {
      const old = baseline?.package[table].find((b) => b.ref === row.ref);
      if (!old && !row.title.trim()) return false;
      const edited = Object.keys(row).filter(
        (k) =>
          k !== "document_refs" &&
          JSON.stringify((row as any)[k]) !== JSON.stringify((old as any)?.[k]),
      );
      changed.push(...edited.map((k) => table + "." + row.ref + "." + k));
      return (
        proposed.package[table].some((p) => p.ref === row.ref) ||
        (!!old && edited.length > 0) ||
        (!old && !!row.title.trim())
      );
    }) as any;
    for (const row of manual.package[table]) row.document_refs = [];
  }
  manual.capture.workshops_by_work_ref = Object.fromEntries(
    Object.entries(current.capture.workshops_by_work_ref ?? {}).filter(
      ([ref, value]) =>
        value !== baseline?.capture.workshops_by_work_ref?.[ref],
    ),
  );
  const merged = mergeAssistantDraft(manual, proposed, changed);
  merged.draft.package.documents = retainedDocuments;
  merged.draft.package.reminders = retainedRules;
  for (const table of ["work", "expenses"] as const)
    for (const row of merged.draft.package[table]) {
      const prior = current.package[table].find((p) => p.ref === row.ref);
      row.document_refs =
        prior?.document_refs ??
        (merged.draft.package[table].length === 1
          ? retainedDocuments.map((d) => d.ref)
          : []);
    }
  for (const w of merged.draft.package.work)
    w.expense_refs = w.expense_refs.filter((ref) =>
      merged.draft.package.expenses.some((e) => e.ref === ref),
    );
  const validExpenses = new Set(
    merged.draft.package.expenses.map((e) => e.ref),
  );
  merged.draft.capture.prices_by_expense_ref = Object.fromEntries(
    Object.entries(merged.draft.capture.prices_by_expense_ref ?? {}).filter(
      ([ref]) => validExpenses.has(ref),
    ),
  );
  const validWork = new Set(merged.draft.package.work.map((w) => w.ref));
  merged.draft.capture.workshops_by_work_ref = Object.fromEntries(
    Object.entries(merged.draft.capture.workshops_by_work_ref ?? {}).filter(
      ([ref]) => validWork.has(ref),
    ),
  );
  return merged;
}

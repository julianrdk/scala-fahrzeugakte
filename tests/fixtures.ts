import { blankPackage } from "../shared/logic";
import type {
  CommitRequest,
  ExpenseInput,
  ImportPackage,
  ReminderInput,
  WorkInput,
} from "../shared/types";
export const expense = (patch: Partial<ExpenseInput> = {}): ExpenseInput => ({
  ref: "e1",
  title: "Teile gekauft",
  category: "Wartung & Reparatur",
  date: "2026-10-10",
  odometer_km: null,
  amount_cents: 5000,
  currency: "EUR",
  vendor: "Testhandel",
  invoice_number: "TEST-1",
  document_refs: [],
  notes: null,
  ...patch,
});
export const work = (patch: Partial<WorkInput> = {}): WorkInput => ({
  ref: "w1",
  title: "Teile eingebaut",
  kind: "maintenance",
  status: "completed",
  date: "2026-10-17",
  odometer_km: 83200,
  performed_by: "self",
  description: null,
  expense_refs: [],
  document_refs: [],
  ...patch,
});
export const reminder = (
  patch: Partial<ReminderInput> = {},
): ReminderInput => ({
  ref: "r1",
  title: "Ölwechsel",
  work_type: "maintenance",
  due_date: "2026-11-30",
  due_odometer_km: 84000,
  repeat_months: 12,
  repeat_km: 15000,
  lead_days: 30,
  lead_km: 1000,
  email_enabled: false,
  basis_work_ref: null,
  notes: null,
  ...patch,
});
export function pkg() {
  const p = blankPackage();
  p.expenses.push(expense());
  return p;
}
export const request = (
  p: ImportPackage,
  patch: Partial<CommitRequest> = {},
): CommitRequest => ({
  operation_id: "operation-test-0001",
  package: p,
  documents: {},
  allow_missing: false,
  confirm_reminders: false,
  duplicate_override_reason: null,
  links: {},
  ...patch,
});

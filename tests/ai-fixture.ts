import type { AssistantProposal } from "../shared/assistant";
import { expense, work } from "./fixtures";
// Synthetic provider reply; no real account or provider requests.
export function aiProposal(): AssistantProposal {
  const { document_refs: _e, ...e } = expense({
    title: "Öl und Filter",
    date: "2026-10-28",
    amount_cents: 6500,
    odometer_km: 82400,
  });
  const { document_refs: _w, ...w } = work({
    title: "Ölwechsel",
    date: "2026-10-28",
    odometer_km: 82400,
    expense_refs: [e.ref],
  });
  return {
    reply: "Der Entwurf ist vorbereitet. Bitte Datum und Beträge prüfen.",
    warnings: [],
    expenses: [{ ...e, cashflow_type: "expense", items: [], fuel: null }],
    work: [
      {
        ...w,
        parts: [],
        estimated_cost_cents: null,
        workshop_id: null,
        modification_details: null,
      },
    ],
  };
}

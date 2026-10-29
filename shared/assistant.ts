import { validateAssistant } from "./generated/validators.js";
import { blankPackage, clone, validatePackage } from "./logic";
import type {
  CaptureMetadata,
  ExpenseInput,
  ImportPackage,
  Settings,
  WorkInput,
} from "./types";

export const AI_TEXT_MODEL = "openai/gpt-oss-120b";
export const AI_AUDIO_MODEL = "whisper-large-v3-turbo";
export const AI_AUDIO_BYTES = 4 * 1024 * 1024;
export type AIProfile = {
  available: boolean;
  configured: boolean;
  provider: "groq";
  suffix: string | null;
  updatedAt: string | null;
};
export type AssistantMessage = { role: "user" | "assistant"; content: string };
export type AssistantDraft = {
  package: ImportPackage;
  capture: CaptureMetadata;
};
export type AssistantSeed = {
  draft: AssistantDraft;
  protectedFields?: string[];
  // Browser-only review context. Never included in AssistantRequest.
  links?: Record<string, string[]>;
};
export type AssistantRequest = {
  messages: AssistantMessage[];
  draft?: AssistantDraft | null;
};
export type AssistantReply = {
  message: string;
  draft: AssistantDraft | null;
  warnings: string[];
};
export type AssistantProposal = {
  reply: string;
  warnings: string[];
  expenses: (Omit<ExpenseInput, "document_refs" | "fuel"> & {
    items: NonNullable<ExpenseInput["items"]>;
    fuel: ExpenseInput["fuel"] | null;
  })[];
  work: (Omit<WorkInput, "document_refs" | "modification_details"> & {
    workshop_id: string | null;
    parts: NonNullable<WorkInput["parts"]>;
    modification_details: WorkInput["modification_details"] | null;
    estimated_cost_cents: number | null;
  })[];
};
export interface AssistantService {
  aiProfile(
    action?: "save" | "test" | "remove",
    key?: string,
    signal?: AbortSignal,
  ): Promise<AIProfile>;
  aiMessage(
    input: AssistantRequest,
    signal?: AbortSignal,
  ): Promise<AssistantReply>;
  aiTranscribe(audio: Blob, signal?: AbortSignal): Promise<string>;
}
export function assistantService(value: unknown): AssistantService | null {
  return value && typeof (value as AssistantService).aiMessage === "function"
    ? (value as AssistantService)
    : null;
}
export function validateAssistantRequest(value: unknown): AssistantRequest {
  const x = value as AssistantRequest;
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    Object.keys(x).some((k) => !["messages", "draft"].includes(k)) ||
    !Array.isArray(x.messages) ||
    !x.messages.length ||
    x.messages.length > 12
  )
    throw Error(
      "Bitte eine kurze Nachricht eingeben (höchstens zwölf Gesprächsbeiträge).",
    );
  let length = 0;
  for (const m of x.messages) {
    if (
      !m ||
      Object.keys(m).some((k) => !["role", "content"].includes(k)) ||
      !["user", "assistant"].includes(m.role) ||
      typeof m.content !== "string" ||
      !m.content.trim() ||
      m.content.length > 4000
    )
      throw Error("Nachricht ungültig oder zu lang.");
    length += m.content.length;
  }
  if (length > 12000 || x.messages.at(-1)?.role !== "user")
    throw Error("Gespräch zu lang. Bitte einen neuen Entwurf beginnen.");
  if (x.draft) {
    if (
      Object.keys(x.draft).some((k) => !["package", "capture"].includes(k)) ||
      JSON.stringify(x.draft).length > 20000
    )
      throw Error("Entwurf zu groß.");
    validatePackage(x.draft.package);
    safeRefs(x.draft.package);
    if (x.draft.package.documents.length || x.draft.package.reminders.length)
      throw Error("Für den Assistenten nur Arbeiten und Ausgaben übernehmen.");
  }
  return x;
}
function safeRefs(p: { expenses: { ref: string }[]; work: { ref: string }[] }) {
  if (
    [...p.expenses, ...p.work].some((r) =>
      ["__proto__", "constructor", "prototype"].includes(r.ref),
    )
  )
    throw Error("Ungültige Entwurfsreferenz.");
}
export function proposalToDraft(
  value: unknown,
  settings: Settings,
  label: string,
): AssistantReply {
  if (!validateAssistant(value))
    throw Error(
      "Die KI-Antwort enthält keinen gültigen Entwurf. Bitte erneut beschreiben oder manuell erfassen.",
    );
  const x = value as AssistantProposal;
  if (
    !x.reply.trim() ||
    x.reply.length > 4000 ||
    x.warnings.some((w) => w.length > 1000)
  )
    throw Error("KI-Antwort zu lang.");
  safeRefs(x);
  const p = blankPackage(),
    capture: CaptureMetadata = { workshops_by_work_ref: {} };
  p.vehicle_label = label;
  p.warnings = x.warnings;
  p.expenses = x.expenses.map(({ fuel, ...e }) => ({
    ...e,
    document_refs: [],
    ...(fuel ? { fuel } : {}),
  }));
  p.work = x.work.map(({ workshop_id, modification_details, ...w }) => {
    const selected =
      w.performed_by === "self"
        ? (settings.self_workshop_id ?? null)
        : workshop_id;
    if (
      selected &&
      !settings.workshops?.some((row) => row.id === selected && !row.archived)
    )
      throw Error("Die vorgeschlagene Werkstatt ist nicht verfügbar.");
    capture.workshops_by_work_ref![w.ref] = selected;
    return {
      ...w,
      document_refs: [],
      ...(modification_details ? { modification_details } : {}),
    };
  });
  validatePackage(p);
  return {
    message: x.reply,
    warnings: x.warnings,
    draft: p.work.length || p.expenses.length ? { package: p, capture } : null,
  };
}

// Existing manual values win. Differing proposals remain visible until explicitly accepted.
export type DraftConflict = {
  table: "expenses" | "work";
  ref: string;
  field: string;
  current: unknown;
  proposed: unknown;
};
export function mergeAssistantDraft(
  manual: AssistantDraft | null,
  proposed: AssistantDraft,
  protectedFields?: string[],
): { draft: AssistantDraft; conflicts: DraftConflict[] } {
  if (!manual) return { draft: clone(proposed), conflicts: [] };
  const result = clone(proposed),
    conflicts: DraftConflict[] = [];
  for (const table of ["expenses", "work"] as const) {
    for (const original of manual.package[table]) {
      const next = result.package[table].find(
        (row) => row.ref === original.ref,
      );
      if (!next) {
        (result.package[table] as any[]).push(clone(original));
        continue;
      }
      for (const [field, current] of Object.entries(original)) {
        if (
          protectedFields &&
          !protectedFields.includes(`${table}.${original.ref}.${field}`)
        )
          continue;
        const suggested = (next as any)[field];
        if (
          field === "ref" ||
          (!protectedFields &&
            (current == null ||
              current === "" ||
              (Array.isArray(current) && !current.length)))
        )
          continue;
        if (JSON.stringify(current) !== JSON.stringify(suggested)) {
          conflicts.push({
            table,
            ref: original.ref,
            field,
            current,
            proposed: suggested,
          });
          (next as any)[field] = clone(current);
        }
      }
    }
  }
  result.capture = {
    ...result.capture,
    workshops_by_work_ref: {
      ...result.capture.workshops_by_work_ref,
      ...manual.capture.workshops_by_work_ref,
    },
    prices_by_expense_ref: {
      ...result.capture.prices_by_expense_ref,
      ...manual.capture.prices_by_expense_ref,
    },
  };
  for (const [ref, current] of Object.entries(
    manual.capture.workshops_by_work_ref ?? {},
  )) {
    const proposedWorkshop =
      proposed.capture.workshops_by_work_ref?.[ref] ?? null;
    if (current !== proposedWorkshop)
      conflicts.push({
        table: "work",
        ref,
        field: "$workshop",
        current,
        proposed: proposedWorkshop,
      });
  }
  return { draft: result, conflicts };
}

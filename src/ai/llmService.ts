// Prompt shaping for the Ask-AI feature. The actual HTTP lives in Rust (see
// src/backend/llmApi.ts → src-tauri/src/commands/llm.rs); this module owns the
// system prompt, the per-provider default model, and how notebook context is folded
// into the user turn.
import { askStream, type AskEvent, type AskParams } from "../backend/llmApi";

// Default model per provider (the user can override in Settings). Anthropic
// defaults to the most capable current model.
export const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "claude-opus-4-8",
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o",
  custom: "",
};

export const SYSTEM_PROMPT = [
  "You are an assistant embedded inside the user's personal notebook (a linked",
  "collection of markdown notes). Each question comes with relevant context from",
  "their vault, in labelled sections: the current note (referred to as \"this",
  "note\"), notes it links to, and its ancestor/parent notes. If a \"Selected",
  "passage\" section is present, focus your answer on that excerpt. Ground your",
  "answer in the provided context and say so when it doesn't cover something — do",
  "not pull in unrelated topics. Be concise and direct — you're writing into a",
  "note, so prefer tight prose and markdown the editor renders (headings, lists,",
  "**bold**, `code`, [[wikilinks]] to other notes when you reference them).",
].join(" ");

// No apiKey here by design — Rust reads it from the OS credential store, so it
// never crosses the IPC boundary. A missing key surfaces as a rejection from ask().
export interface AskOptions {
  requestId: string;
  provider: string;
  model: string;
  baseUrl?: string;
  context: string;
  question: string;
  webSearch: boolean;
  onEvent: (e: AskEvent) => void;
}

function userMessage(context: string, question: string): string {
  return context
    ? `Here is the relevant content from my notebook:\n\n${context}\n\n---\n\nQuestion: ${question}`
    : question;
}

export async function ask(o: AskOptions): Promise<void> {
  const model = o.model.trim() || DEFAULT_MODEL[o.provider] || "";
  if (!model) throw new Error("No model set — choose one in Settings.");

  const params: AskParams = {
    requestId: o.requestId,
    provider: o.provider,
    model,
    baseUrl: o.baseUrl || null,
    system: SYSTEM_PROMPT,
    user: userMessage(o.context, o.question),
    webSearch: o.webSearch,
  };
  await askStream(params, o.onEvent);
}

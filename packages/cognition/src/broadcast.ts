import { redactText } from "@atlas/privacy";
import type { BroadcastResult, BroadcastTarget, WorkspaceWinner } from "./types";

const DEFAULT_SUBSCRIBERS: BroadcastTarget[] = [
  { id: "context_builder", role: "local" },
  { id: "runtime_session", role: "local" },
  { id: "agent_response_planner", role: "local" },
  { id: "memory_consolidation", role: "local" },
  { id: "insight_engine", role: "local" },
  { id: "privacy_audit", role: "local" }
];

export function broadcastWorkspace(winner: WorkspaceWinner, subscribers: BroadcastTarget[] = DEFAULT_SUBSCRIBERS): BroadcastResult[] {
  return subscribers.map((subscriber) => createBroadcastResult(winner, subscriber));
}

function createBroadcastResult(winner: WorkspaceWinner, subscriber: BroadcastTarget): BroadcastResult {
  const entry = winner.entry;
  const reason = [...winner.reason];

  if (entry.promptPolicy === "do_not_prompt") {
    return {
      subscriber: subscriber.id,
      delivered: subscriber.id === "privacy_audit",
      mode: subscriber.id === "privacy_audit" ? "metadata_only" : "blocked",
      payload: "do_not_prompt entry withheld; metadata only.",
      sensitivity: entry.sensitivity,
      promptPolicy: entry.promptPolicy,
      privacyDecision: "blocked: do_not_prompt",
      reason: [...reason, "prompt policy blocked broadcast"]
    };
  }

  if (entry.sensitivity === "secret") {
    return {
      subscriber: subscriber.id,
      delivered: subscriber.id === "privacy_audit",
      mode: subscriber.id === "privacy_audit" ? "metadata_only" : "blocked",
      payload: "secret entry withheld; metadata only.",
      sensitivity: entry.sensitivity,
      promptPolicy: entry.promptPolicy,
      privacyDecision: "blocked: secret",
      reason: [...reason, "secret raw content blocked"]
    };
  }

  if (entry.sensitivity === "confidential") {
    return {
      subscriber: subscriber.id,
      delivered: true,
      mode: "summary",
      payload: redactText(entry.summary),
      sensitivity: entry.sensitivity,
      promptPolicy: entry.promptPolicy,
      privacyDecision: "summary: confidential raw blocked",
      reason: [...reason, "confidential content summarized"]
    };
  }

  if (entry.sensitivity === "internal" && subscriber.role === "external_model") {
    return {
      subscriber: subscriber.id,
      delivered: true,
      mode: "summary",
      payload: redactText(entry.summary),
      sensitivity: entry.sensitivity,
      promptPolicy: "summarize_only",
      privacyDecision: "summary: external_model cannot receive internal raw",
      reason: [...reason, "internal content summarized for external target"]
    };
  }

  if (entry.promptPolicy === "summarize_only") {
    return {
      subscriber: subscriber.id,
      delivered: true,
      mode: "summary",
      payload: redactText(entry.summary),
      sensitivity: entry.sensitivity,
      promptPolicy: entry.promptPolicy,
      privacyDecision: "summary: prompt policy",
      reason
    };
  }

  return {
    subscriber: subscriber.id,
    delivered: true,
    mode: "raw",
    payload: redactText(entry.content),
    sensitivity: entry.sensitivity,
    promptPolicy: entry.promptPolicy,
    privacyDecision: "raw: policy-safe local broadcast",
    reason
  };
}

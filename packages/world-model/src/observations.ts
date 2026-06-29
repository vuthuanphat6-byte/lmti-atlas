import { hasSecretLikeMaterial, redactText } from "@atlas/privacy";
import type { PromptPolicy } from "@atlas/types";
import type { SensoryInput, WorldObservation } from "./types";

export function normalizeSensoryInput(input: SensoryInput): SensoryInput {
  const secretLike = detectSecretLike(input.content);
  const sensitivity = secretLike ? "secret" : input.sensitivity;
  const promptPolicy: PromptPolicy = secretLike ? "do_not_prompt" : normalizePromptPolicy(input.promptPolicy, sensitivity);
  const summary = secretLike
    ? "Secret-like sensory input; raw content withheld by policy."
    : input.summary ?? summarize(redactText(input.content));

  return {
    ...input,
    content: secretLike ? "[REDACTED_SECRET_INPUT]" : redactText(input.content),
    summary,
    sensitivity,
    promptPolicy,
    confidence: clamp01(input.confidence)
  };
}

export function sensoryInputToObservation(input: SensoryInput, now = new Date()): WorldObservation {
  const normalized = normalizeSensoryInput(input);
  const statement = normalized.summary ?? summarize(normalized.content);
  const freshness = calculateFreshness(normalized.timestamp, now);
  const supports = extractTaggedRefs(normalized.content, "supports");
  const contradicts = extractTaggedRefs(normalized.content, "contradicts");

  return {
    id: `observation:${normalized.id}`,
    statement,
    evidenceRefs: normalized.sourceRefs,
    source: normalized.source,
    supports,
    contradicts,
    confidence: round(clamp01(normalized.confidence * (0.6 + freshness * 0.4))),
    freshness,
    sensitivity: normalized.sensitivity,
    promptPolicy: normalized.promptPolicy
  };
}

export function isNoiseInput(input: SensoryInput, noiseThreshold = 0.12): boolean {
  const normalized = input.content.trim();
  if (!normalized) {
    return true;
  }
  if (input.confidence < noiseThreshold) {
    return true;
  }
  if (/^(ok|yes|no|hmm|uh|n\/a|none)$/i.test(normalized)) {
    return true;
  }
  return normalized.length < 3 && input.sourceRefs.length === 0;
}

export function detectSecretLike(text: string): boolean {
  return hasSecretLikeMaterial(text);
}

export function summarize(text: string, maxLength = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trim()}...`;
}

export function normalizePromptPolicy(promptPolicy: PromptPolicy | undefined, sensitivity: SensoryInput["sensitivity"]): PromptPolicy {
  if (sensitivity === "secret") {
    return "do_not_prompt";
  }
  if (promptPolicy === "allow_raw" || promptPolicy === "summarize_only" || promptPolicy === "do_not_prompt") {
    return promptPolicy;
  }
  return sensitivity === "public" ? "allow_raw" : "summarize_only";
}

function calculateFreshness(timestamp: string, now: Date): number {
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) {
    return 0.5;
  }
  const ageHours = Math.max(0, (now.getTime() - time) / 3_600_000);
  if (ageHours <= 1) {
    return 1;
  }
  if (ageHours <= 24) {
    return 0.8;
  }
  if (ageHours <= 168) {
    return 0.55;
  }
  return 0.25;
}

function extractTaggedRefs(content: string, label: "supports" | "contradicts"): string[] {
  const pattern = new RegExp(`${label}\\s*:\\s*([a-zA-Z0-9_.,:/-]+)`, "gi");
  const refs: string[] = [];
  for (const match of content.matchAll(pattern)) {
    refs.push(...(match[1] ?? "").split(",").map((part) => part.trim()).filter(Boolean));
  }
  return refs;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

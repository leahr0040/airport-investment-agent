import type { AdapterFailReason, AdapterResult } from "./types";

const ADAPTER_FAILURE_REASONS: readonly AdapterFailReason[] = [
  "timeout",
  "invalid_input",
  "rate_limited",
  "no_data",
  "error",
];

function isAdapterFailReason(value: unknown): value is AdapterFailReason {
  return typeof value === "string" && ADAPTER_FAILURE_REASONS.includes(value as AdapterFailReason);
}

function withSource(detail: string, source?: string): string {
  return source ? `${source}: ${detail}` : detail;
}

export function toAdapterFailure(err: unknown, source?: string): AdapterResult<never> {
  if (err instanceof Error) {
    if (err.name === "TimeoutError") {
      return { ok: false, reason: "timeout", detail: withSource(err.name, source) };
    }

    if ("reason" in err && isAdapterFailReason(err.reason)) {
      return {
        ok: false,
        reason: err.reason,
        detail: withSource(err.reason, source),
      };
    }

    return { ok: false, reason: "error", detail: withSource(err.name, source) };
  }

  return { ok: false, reason: "error", detail: withSource("UnknownError", source) };
}

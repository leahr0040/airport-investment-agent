import { FailureKind, type AdapterResult } from "./types";

export class AdapterError extends Error {
  constructor(
    name: string,
    readonly kind: FailureKind,
    readonly context: Record<string, unknown> | null = null,
    readonly originalError: Error | null = null,
  ) {
    super(name, originalError ? { cause: originalError } : undefined);
    this.name = name;
  }
}

function withSource(detail: string, source?: string): string {
  return source ? `${source}: ${detail}` : detail;
}

function classify(err: unknown, source?: string): Extract<AdapterResult<never>, { ok: false }> {
  if (!(err instanceof Error)) {
    return { ok: false, kind: FailureKind.Unavailable, detail: withSource("UnknownError", source) };
  }

  const kind = err instanceof AdapterError ? err.kind : FailureKind.Unavailable;
  return { ok: false, kind, detail: withSource(err.name, source) };
}

export function toAdapterFailure(err: unknown, source?: string): AdapterResult<never> {
  const failure = classify(err, source);
  const trace = err instanceof Error ? `${err.message} | ${err.stack}` : String(err);
  console.warn("[adapter]", failure.detail, trace);
  return failure;
}

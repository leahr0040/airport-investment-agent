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

export function toNetworkError(err: unknown): AdapterError {
  const code = (err as { code?: unknown } | null)?.code;
  return new AdapterError(
    typeof code === "string" && code ? code : "NetworkError",
    FailureKind.Unavailable,
    null,
    err instanceof Error ? err : null,
  );
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
  const context = err instanceof AdapterError ? err.context : null;
  console.warn("[adapter]", failure.detail, trace, ...(context ? [context] : []));
  return failure;
}

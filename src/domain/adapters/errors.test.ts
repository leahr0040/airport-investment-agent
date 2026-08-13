import { describe, expect, it } from "vitest";
import { toAdapterFailure } from "./errors";

describe("toAdapterFailure", () => {
  it("maps a TimeoutError to a safe timeout failure", () => {
    const error = new Error("upstream timeout");
    error.name = "TimeoutError";

    expect(toAdapterFailure(error)).toEqual({
      ok: false,
      reason: "timeout",
      detail: "TimeoutError",
    });
  });

  it("preserves an explicit adapter failure reason", () => {
    const error = Object.assign(new Error("429 response body with sensitive content"), {
      reason: "rate_limited" as const,
    });

    expect(toAdapterFailure(error)).toEqual({
      ok: false,
      reason: "rate_limited",
      detail: "rate_limited",
    });
  });

  it("uses only an ordinary error's name in its detail", () => {
    const secret = "Bearer fake-token-should-not-leak";
    const error = new Error(`upstream response included ${secret}`);
    error.name = "FetchError";

    const result = toAdapterFailure(error);

    expect(result).toEqual({ ok: false, reason: "error", detail: "FetchError" });
    if (!result.ok) {
      expect(result.detail).not.toContain(secret);
    }
  });

  it("returns a valid error result for a non-Error thrown value", () => {
    expect(toAdapterFailure("unstructured failure")).toEqual({
      ok: false,
      reason: "error",
      detail: "UnknownError",
    });
  });

  it("prefixes a safe detail with its source when provided", () => {
    const error = new Error("upstream timeout");
    error.name = "TimeoutError";

    expect(toAdapterFailure(error, "opensky")).toEqual({
      ok: false,
      reason: "timeout",
      detail: "opensky: TimeoutError",
    });
  });
});

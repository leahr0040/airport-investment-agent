import { describe, expect, it, vi } from "vitest";
import { AdapterError, toAdapterFailure } from "./errors";
import { FailureKind } from "./types";

describe("toAdapterFailure", () => {
  it("maps a TimeoutError to a safe timeout failure", () => {
    const error = new Error("upstream timeout");
    error.name = "TimeoutError";

    expect(toAdapterFailure(error)).toEqual({
      ok: false,
      kind: "unavailable",
      detail: "TimeoutError",
    });
  });

  it("preserves an explicit adapter failure reason", () => {
    const error = new AdapterError("RateLimited", FailureKind.NoData);

    expect(toAdapterFailure(error)).toEqual({
      ok: false,
      kind: "no_data",
      detail: "RateLimited",
    });
  });

  it("never logs the error object itself, so an axios config cannot leak the bearer token", () => {
    const token = "Bearer SUPER-SECRET-OPENSKY-TOKEN";
    const axiosLike = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), {
      config: { headers: { Authorization: token }, url: "https://opensky-network.org/api/flights/departure" },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    toAdapterFailure(axiosLike, "opensky");

    const logged = warn.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("ECONNREFUSED");
    expect(logged).not.toContain(token);
    warn.mockRestore();
  });

  it("never reads an error's message into its detail, only its name", () => {
    const secret = "429 body: Bearer fake-token-should-not-leak";
    const error = Object.assign(new Error(secret), {
      name: "RateLimited",
      kind: FailureKind.Unavailable,
    });

    const result = toAdapterFailure(error, "faa-adip");

    expect(result).toEqual({ ok: false, kind: "unavailable", detail: "faa-adip: RateLimited" });
    if (!result.ok) expect(result.detail).not.toContain(secret);
  });

  it("uses only an ordinary error's name in its detail", () => {
    const secret = "Bearer fake-token-should-not-leak";
    const error = new Error(`upstream response included ${secret}`);
    error.name = "FetchError";

    const result = toAdapterFailure(error);

    expect(result).toEqual({ ok: false, kind: "unavailable", detail: "FetchError" });
    if (!result.ok) {
      expect(result.detail).not.toContain(secret);
    }
  });

  it("returns a valid error result for a non-Error thrown value", () => {
    expect(toAdapterFailure("unstructured failure")).toEqual({
      ok: false,
      kind: "unavailable",
      detail: "UnknownError",
    });
  });

  it("prefixes a safe detail with its source when provided", () => {
    const error = new Error("upstream timeout");
    error.name = "TimeoutError";

    expect(toAdapterFailure(error, "opensky")).toEqual({
      ok: false,
      kind: "unavailable",
      detail: "opensky: TimeoutError",
    });
  });
});

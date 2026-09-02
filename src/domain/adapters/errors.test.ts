import { describe, expect, it, vi } from "vitest";
import { AdapterError, toAdapterFailure, toNetworkError } from "./errors";
import { FailureKind } from "./types";

describe("toNetworkError", () => {
  it("carries the transport code through as the failure name", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
      code: "ECONNREFUSED",
    });

    expect(toAdapterFailure(toNetworkError(refused), "opensky")).toEqual({
      ok: false,
      kind: "unavailable",
      detail: "opensky: ECONNREFUSED",
    });
  });

  it("falls back to NetworkError when the thrown value carries no code", () => {
    expect(toAdapterFailure(toNetworkError(new Error("socket hang up")))).toEqual({
      ok: false,
      kind: "unavailable",
      detail: "NetworkError",
    });
  });

  it("keeps the original error as the cause so the transport stack is not lost", () => {
    const original = new Error("timeout of 3000ms exceeded");
    expect(toNetworkError(Object.assign(original, { code: "ECONNABORTED" })).cause).toBe(original);
  });
});

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

  it("logs the request context an adapter error carries, without leaking it into the returned detail", () => {
    const context = { method: "GET", path: "/api/flights/departure", status: 500, data: "upstream body" };
    const error = new AdapterError("UpstreamError", FailureKind.Unavailable, context);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = toAdapterFailure(error, "opensky");

    expect(warn.mock.calls[0]).toContain(context);
    expect(result).toEqual({ ok: false, kind: "unavailable", detail: "opensky: UpstreamError" });
    warn.mockRestore();
  });

  it("adds no context argument for an error that carries none", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    toAdapterFailure(new Error("plain failure"));

    expect(warn.mock.calls[0]).toHaveLength(3);
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

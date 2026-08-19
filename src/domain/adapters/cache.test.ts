import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache, withCache } from "./cache";

describe("withCache", () => {
  beforeEach(() => {
    clearCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves a same-key request inside the TTL without invoking its producer again", async () => {
    const producer = vi.fn().mockResolvedValue({ value: "cached" });

    await expect(withCache("opensky:KATL", 60_000, producer)).resolves.toEqual({ value: "cached" });
    await expect(withCache("opensky:KATL", 60_000, producer)).resolves.toEqual({ value: "cached" });

    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("invokes producers for different cache keys", async () => {
    const producer = vi.fn().mockResolvedValue("value");

    await withCache("opensky:KATL", 60_000, producer);
    await withCache("opensky:KORD", 60_000, producer);

    expect(producer).toHaveBeenCalledTimes(2);
  });

  it("invokes the producer again after a key expires", async () => {
    const producer = vi.fn().mockResolvedValue("value");

    await withCache("opensky:KATL", 60_000, producer);
    await withCache("opensky:KATL", 60_000, producer);
    vi.advanceTimersByTime(60_001);
    await withCache("opensky:KATL", 60_000, producer);

    expect(producer).toHaveBeenCalledTimes(2);
  });

  it("honours each entry's TTL independently", async () => {
    const shortProducer = vi.fn().mockResolvedValue("short");
    const longProducer = vi.fn().mockResolvedValue("long");

    await withCache("short", 1_000, shortProducer);
    await withCache("long", 60_000, longProducer);
    vi.advanceTimersByTime(1_001);
    await withCache("short", 1_000, shortProducer);
    await withCache("long", 60_000, longProducer);

    expect(shortProducer).toHaveBeenCalledTimes(2);
    expect(longProducer).toHaveBeenCalledTimes(1);
  });

  it("serves two concurrent same-key calls from a single producer invocation", async () => {
    const producer = vi.fn().mockResolvedValue({ value: "shared" });

    const [first, second] = await Promise.all([
      withCache("concurrent-key", 60_000, producer),
      withCache("concurrent-key", 60_000, producer),
    ]);

    expect(first).toEqual({ value: "shared" });
    expect(second).toEqual({ value: "shared" });
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("propagates a rejected producer and does not cache its failure", async () => {
    const producer = vi.fn().mockRejectedValue(new Error("upstream unavailable"));

    await expect(withCache("nas:feed", 60_000, producer)).rejects.toThrow("upstream unavailable");
    await expect(withCache("nas:feed", 60_000, producer)).rejects.toThrow("upstream unavailable");

    expect(producer).toHaveBeenCalledTimes(2);
  });

});

describe("clearCache", () => {
  beforeEach(() => {
    clearCache();
  });

  it("purges entries so a since-cleared key invokes its producer again", async () => {
    const producer = vi.fn().mockResolvedValue("value");

    await withCache("opensky:KATL", 60_000, producer);
    clearCache();
    await withCache("opensky:KATL", 60_000, producer);

    expect(producer).toHaveBeenCalledTimes(2);
  });
});

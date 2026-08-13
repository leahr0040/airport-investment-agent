import { describe, expect, it } from "vitest";
import { isValidIata, isValidIcao } from "./validate";

describe("isValidIcao", () => {
  it("accepts exactly four uppercase letters", () => {
    expect(isValidIcao("KATL")).toEqual(true);
    expect(isValidIcao("KPBI")).toEqual(true);
    expect(isValidIcao("PANC")).toEqual(true);
  });

  it("rejects lower-case and incorrectly sized codes", () => {
    expect(isValidIcao("katl")).toEqual(false);
    expect(isValidIcao("ATL")).toEqual(false);
    expect(isValidIcao("KATLX")).toEqual(false);
    expect(isValidIcao("")).toEqual(false);
  });

  it("rejects whitespace, URL-reserved characters, and newline payloads", () => {
    expect(isValidIcao("KAT ")).toEqual(false);
    expect(isValidIcao("KAT/")).toEqual(false);
    expect(isValidIcao("KA.L")).toEqual(false);
    expect(isValidIcao("KATL\nKORD")).toEqual(false);
  });
});

describe("isValidIata", () => {
  it("accepts exactly three uppercase letters", () => {
    expect(isValidIata("ATL")).toEqual(true);
    expect(isValidIata("DJT")).toEqual(true);
  });

  it("rejects ICAO-length and lower-case codes", () => {
    expect(isValidIata("KATL")).toEqual(false);
    expect(isValidIata("atl")).toEqual(false);
  });
});

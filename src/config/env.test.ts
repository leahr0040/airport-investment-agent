import { describe, expect, it } from "vitest";
import { getEnv } from "./env";

describe("getEnv", () => {
  it("reads the placeholder OpenSky client ID in test workers", () => {
    expect(getEnv().OPENSKY_CLIENT_ID).toEqual("test-opensky-client-id");
  });

  it("uses the default log level when test configuration leaves it unset", () => {
    expect(getEnv().LOG_LEVEL).toEqual("info");
  });
});

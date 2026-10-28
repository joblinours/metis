import { describe, expect, test } from "bun:test";

import { isNewerVersion, versionSchema } from "./update";

describe("isNewerVersion", () => {
  test("compares each part as a number", () => {
    expect(isNewerVersion("0.2.0", "0.1.9")).toBe(true);
    expect(isNewerVersion("0.10.0", "0.9.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true);
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(false);
  });

  test("ranks a release above its own pre-release", () => {
    expect(isNewerVersion("0.2.0", "0.2.0-beta.1")).toBe(true);
    expect(isNewerVersion("0.2.0-beta.2", "0.2.0")).toBe(false);
  });

  test("never reports garbage as newer", () => {
    expect(isNewerVersion("latest", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.2.0", "unknown")).toBe(false);
  });
});

describe("versionSchema", () => {
  test("accepts a version with its trailing newline and rejects anything else", () => {
    expect(versionSchema.parse("1.2.3\n")).toBe("1.2.3");
    expect(versionSchema.safeParse("v1.2.3").success).toBe(false);
    expect(versionSchema.safeParse("").success).toBe(false);
    expect(versionSchema.safeParse("<html>").success).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";

import { parseDeepLink } from "./links";

describe("parseDeepLink", () => {
  test("reads an auth link", () => {
    expect(parseDeepLink("metis-suite://auth?code=abc&state=def")).toEqual({
      kind: "auth",
      code: "abc",
      state: "def",
    });
  });

  test("rejects an auth link missing its code or state", () => {
    expect(parseDeepLink("metis-suite://auth?state=def")).toBeNull();
    expect(parseDeepLink("metis-suite://auth?code=abc")).toBeNull();
    expect(parseDeepLink("metis-suite://auth?code=&state=def")).toBeNull();
  });

  test("reads an open link with a server path", () => {
    expect(parseDeepLink("metis-suite://open?path=%2Fw%2Facme%3Fx%3D1")).toEqual({
      kind: "open",
      path: "/w/acme?x=1",
    });
  });

  test.each([
    ["a protocol-relative path", "//evil.example.org/w"],
    ["an absolute URL", "https://evil.example.org/w"],
    ["a backslash path", "/\\evil.example.org"],
    ["a relative path", "w/acme"],
    ["an empty path", ""],
  ])("rejects an open link to %s", (_label, path) => {
    const params = new URLSearchParams({ path });
    expect(parseDeepLink(`metis-suite://open?${params.toString()}`)).toBeNull();
  });

  test("rejects other schemes and hosts", () => {
    expect(parseDeepLink("https://auth?code=abc&state=def")).toBeNull();
    expect(parseDeepLink("other-app://auth?code=abc&state=def")).toBeNull();
    expect(parseDeepLink("metis-suite://elsewhere?path=%2Fw")).toBeNull();
    expect(parseDeepLink("not a url")).toBeNull();
  });
});

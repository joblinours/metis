import { describe, expect, test } from "bun:test";

import { isRestorablePath, normalizeServer, parseStored } from "./store";

describe("normalizeServer", () => {
  test("adds https:// to a bare host", () => {
    expect(normalizeServer("mail.example.com")).toBe("https://mail.example.com");
    expect(normalizeServer("  mail.example.com  ")).toBe("https://mail.example.com");
  });

  test("keeps the port of a bare host", () => {
    expect(normalizeServer("mail.example.com:8443")).toBe("https://mail.example.com:8443");
  });

  test("reads localhost:3000 as a host and port, not a scheme", () => {
    expect(normalizeServer("localhost:3000")).toBe("https://localhost:3000");
  });

  test("keeps only the origin of an address with a path", () => {
    expect(normalizeServer("https://mail.example.com/w/acme?x=1#y")).toBe(
      "https://mail.example.com",
    );
    expect(normalizeServer("mail.example.com/w/acme")).toBe("https://mail.example.com");
  });

  test("rejects credentials in the address", () => {
    expect(normalizeServer("https://user:pass@mail.example.com")).toBeNull();
    expect(normalizeServer("user@mail.example.com")).toBeNull();
  });

  test("allows plain http only on loopback", () => {
    expect(normalizeServer("http://mail.example.com")).toBeNull();
    expect(normalizeServer("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeServer("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(normalizeServer("http://[::1]:3000")).toBe("http://[::1]:3000");
  });

  test("rejects other schemes and garbage", () => {
    expect(normalizeServer("ftp://mail.example.com")).toBeNull();
    expect(normalizeServer("javascript:alert(1)")).toBeNull();
    expect(normalizeServer("")).toBeNull();
    expect(normalizeServer("   ")).toBeNull();
    expect(normalizeServer("https://")).toBeNull();
  });
});

describe("isRestorablePath", () => {
  test("accepts workspace paths with a query", () => {
    expect(isRestorablePath("/w/acme")).toBe(true);
    expect(isRestorablePath("/w/acme/m/inbox?thread=1")).toBe(true);
  });

  test("rejects double slashes and backslashes", () => {
    expect(isRestorablePath("/w//evil.example.org")).toBe(false);
    expect(isRestorablePath("/w/acme//m")).toBe(false);
    expect(isRestorablePath("/w/acme\\m")).toBe(false);
    expect(isRestorablePath("/w/acme?next=a\\b")).toBe(false);
  });

  test("rejects paths outside /w/", () => {
    expect(isRestorablePath("/")).toBe(false);
    expect(isRestorablePath("/w")).toBe(false);
    expect(isRestorablePath("/w/")).toBe(false);
    expect(isRestorablePath("/native/settings")).toBe(false);
    expect(isRestorablePath("//w/acme")).toBe(false);
    expect(isRestorablePath("/w/acme#x")).toBe(false);
  });
});

describe("parseStored", () => {
  test("drops malformed keys and keeps the rest", () => {
    expect(
      parseStored({
        server: 42,
        lastPath: "/w/acme",
        pendingLogin: { server: "x" },
        settings: { a: 1 },
      }),
    ).toEqual({ lastPath: "/w/acme", settings: { a: 1 } });
  });

  test("reads anything that is not an object as empty", () => {
    expect(parseStored(null)).toEqual({});
    expect(parseStored("config")).toEqual({});
  });
});

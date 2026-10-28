import { describe, expect, test } from "bun:test";

import { decide, isDownload, needsBrowserSession } from "./navigation";

const SERVER = "https://mail.example.com";

function at(raw: string) {
  return decide(new URL(raw), SERVER);
}

describe("decide", () => {
  test.each(["/", "/2fa/verify", "/setup", "/forgot-password", "/reset-password"])(
    "sends the sign-in path %s to the shell's sign-in screen",
    (path) => {
      expect(at(`${SERVER}${path}`)).toBe("sign-in");
    },
  );

  test("hands connect starts to the browser through a ticket", () => {
    expect(at(`${SERVER}/api/connections/start/google/mail`)).toBe("connect");
  });

  test("opens the shell's settings for /native/settings before the /native/ prefix", () => {
    expect(at(`${SERVER}/native/settings`)).toBe("settings");
    expect(at(`${SERVER}/native/login?challenge=x`)).toBe("external");
  });

  test.each(["/invite/abc", "/oauth/consent"])("opens %s in the browser", (path) => {
    expect(at(`${SERVER}${path}`)).toBe("external");
  });

  test("allows app pages on the server", () => {
    expect(at(`${SERVER}/w/acme/m/inbox`)).toBe("allow");
  });

  test("sends other origins to the browser", () => {
    expect(at("https://example.org/w/acme")).toBe("external");
    expect(at("https://evil.mail.example.com/w/acme")).toBe("external");
  });

  test("treats http and https on the same host as different origins", () => {
    expect(at("http://mail.example.com/w/acme")).toBe("external");
  });

  test("treats another port on the same host as another origin", () => {
    expect(at("https://mail.example.com:8443/w/acme")).toBe("external");
    expect(decide(new URL("http://localhost:3001/w/acme"), "http://localhost:3000")).toBe(
      "external",
    );
  });

  test("sends everything outside when no server is paired", () => {
    expect(decide(new URL(`${SERVER}/w/acme`), null)).toBe("external");
  });
});

describe("isDownload", () => {
  test("matches only the server's download route", () => {
    expect(isDownload(new URL(`${SERVER}/api/drive/download?id=1`), SERVER)).toBe(true);
    expect(isDownload(new URL("https://example.org/api/drive/download"), SERVER)).toBe(false);
    expect(isDownload(new URL(`${SERVER}/api/drive/download/x`), SERVER)).toBe(false);
  });
});

describe("needsBrowserSession", () => {
  test("matches Google hosts and their subdomains only", () => {
    expect(needsBrowserSession(new URL("https://drive.google.com/uc"))).toBe(true);
    expect(needsBrowserSession(new URL("https://doc-0.googleusercontent.com/x"))).toBe(true);
    expect(needsBrowserSession(new URL("https://notgoogle.com/x"))).toBe(false);
    expect(needsBrowserSession(new URL("https://google.com.example.org/x"))).toBe(false);
  });
});

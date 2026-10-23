import { afterEach, expect, test } from "bun:test";
import { MIN_PASSWORD_LENGTH, passwordError } from "../src/lib/password-policy";
import { checkPwnedPassword } from "../src/lib/pwned-passwords.server";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("requires a longer password for new credentials", () => {
  expect(passwordError("a".repeat(MIN_PASSWORD_LENGTH - 1))).toContain(String(MIN_PASSWORD_LENGTH));
  expect(passwordError("guclu-ve-uzun-bir-sifre")).toBeNull();
});

test("rejects trivial repeated and common passwords", () => {
  expect(passwordError("aaaaaaaaaa")).toContain("tekrarından");
  expect(passwordError("1234567890")).toContain("tahmin");
});

test("checks only a hash prefix and detects an exposed password", async () => {
  let requestedUrl = "";
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:42\n");
  }) as typeof fetch;

  await expect(checkPwnedPassword("password")).resolves.toEqual({ exposed: true, count: 42 });
  expect(requestedUrl).toBe("https://api.pwnedpasswords.com/range/5BAA6");
});

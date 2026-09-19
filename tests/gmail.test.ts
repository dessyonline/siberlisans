import { expect, test } from "bun:test";
import { createRawEmail } from "../src/lib/gmail.server";

test("creates a Gmail-safe UTF-8 password reset message", () => {
  const raw = createRawEmail("customer@example.com", "Şifre sıfırlama", "Bağlantı: https://example.com/şifre");
  expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(normalized, "base64").toString("utf8");
  expect(decoded).toContain("To: customer@example.com");
  expect(decoded).toContain("Subject: =?UTF-8?B?");
  expect(decoded).toContain("Bağlantı: https://example.com/şifre");
});
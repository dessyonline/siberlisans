import { expect, test } from "bun:test";
import { MIN_PASSWORD_LENGTH, passwordError } from "../src/lib/password-policy";

test("requires a longer password for new credentials", () => {
  expect(passwordError("a".repeat(MIN_PASSWORD_LENGTH - 1))).toContain(String(MIN_PASSWORD_LENGTH));
  expect(passwordError("guclu-ve-uzun-bir-sifre")).toBeNull();
});

test("rejects trivial repeated and common passwords", () => {
  expect(passwordError("aaaaaaaaaa")).toContain("tekrarından");
  expect(passwordError("1234567890")).toContain("tahmin");
});

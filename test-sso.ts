import { createSsoToken, verifySsoToken } from "./src/lib/cyberlab.server.ts";

async function main() {
  const token = await createSsoToken({
    sub: "123",
    email: "test@example.com",
    name: "Test",
    plan: "lifetime",
    access_expires_at: null
  });
  console.log("Token:", token);
  const verify = await verifySsoToken(token);
  console.log("Verify:", verify);
}
main();

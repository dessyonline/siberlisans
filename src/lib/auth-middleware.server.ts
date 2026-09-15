import { createMiddleware } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { getUserByToken, SESSION_COOKIE } from "./auth.server";

/**
 * MySQL tabanlı oturum doğrulaması.
 * context.userId / context.user / context.isAdmin sağlar.
 */
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const user = await getUserByToken(getCookie(SESSION_COOKIE));
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return next({
    context: { userId: user.id, user, isAdmin: user.roles.includes("admin") },
  });
});

export const requireAdmin = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const user = await getUserByToken(getCookie(SESSION_COOKIE));
  if (!user) throw new Response("Unauthorized", { status: 401 });
  if (!user.roles.includes("admin")) throw new Response("Forbidden", { status: 403 });
  return next({ context: { userId: user.id, user, isAdmin: true } });
});

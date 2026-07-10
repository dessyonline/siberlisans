import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "crypto";
import { CORS, gate, json } from "@/lib/license-feature.server";

const CREATE_PROXY_URL = process.env.LOVABLE_CREATE_PROXY_URL ?? "";

export const Route = createFileRoute("/api/create-project")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const g = await gate(request, {
          eventName: "create_project",
          rateLimit: { limit: 10, windowMs: 60_000 },
        });
        if ("response" in g) return g.response;
        const { body } = g;

        if (!CREATE_PROXY_URL) {
          return json({ ok: true, projectId: randomUUID() });
        }
        const token = (body.token as string | undefined) ?? "";
        try {
          const upstream = await fetch(CREATE_PROXY_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: "Bearer " + token } : {}),
            },
            body: JSON.stringify(body),
          });
          const data = (await upstream.json().catch(() => null)) as
            | { projectId?: string; id?: string; error?: string }
            | null;
          if (!upstream.ok || !data) {
            return json({ ok: false, error: data?.error ?? "Proje oluşturulamadı." });
          }
          return json({ ok: true, projectId: data.projectId ?? data.id ?? randomUUID() });
        } catch (e) {
          return json({ ok: false, error: (e as Error).message });
        }
      },
    },
  },
});

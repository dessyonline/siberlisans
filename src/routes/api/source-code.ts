import { createFileRoute } from "@tanstack/react-router";
import { PRIVATE_CORS, cleanProxyBody, gate, privateJson } from "@/lib/license-feature.server";

const CORS_ALL = { ...PRIVATE_CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
export const Route = createFileRoute("/api/source-code")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_ALL }),
      GET: async () => privateJson({ ok: true, files: [] }, 200, CORS_ALL),
      POST: async ({ request }) => {
        const g = await gate(request, {
          eventName: "source_code",
          rateLimit: { limit: 10, windowMs: 60_000 },
          cors: CORS_ALL,
        });
        if ("response" in g) return g.response;
        const { body } = g;

        const sourceBase = (process.env.SOURCE_PROXY_URL ?? "")
          .replace(/\/+$/, "")
          .replace(/\/(api\/)?projects$/i, "")
          .replace(/\/api$/i, "");
        if (!sourceBase) {
          return privateJson({ ok: true, files: [] }, 200, CORS_ALL);
        }
        const projectId = (body.projectId as string | undefined) ?? "";
        if (!projectId) return privateJson({ ok: false, error: "projectId gerekli." }, 400, CORS_ALL);
        const target = `${sourceBase}/projects/${projectId}/source-code`;
        const upstreamBody = cleanProxyBody(body);
        try {
          const upstream = await fetch(target, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(upstreamBody),
          });
          const data = (await upstream.json().catch(() => null)) as
            | { files?: Array<{ path: string; content: string }> }
            | null;
          if (!upstream.ok || !data) {
            return privateJson({ ok: false, error: "Kaynak kod alınamadı." }, 502, CORS_ALL);
          }
          return privateJson({ ok: true, files: data.files ?? [] }, 200, CORS_ALL);
        } catch (e) {
          return privateJson({ ok: false, error: (e as Error).message }, 502, CORS_ALL);
        }
      },
    },
  },
});

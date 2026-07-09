import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://siberlisans.lovable.app";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const body = [
          "User-agent: *",
          "Allow: /",
          "Disallow: /admin",
          "Disallow: /hesabim",
          "Disallow: /cuzdan",
          "Disallow: /destek",
          "Disallow: /guvenlik",
          "Disallow: /favorilerim",
          "Disallow: /davet",
          "Disallow: /bildirimler",
          "Disallow: /odeme",
          "Disallow: /aktivasyon",
          "Disallow: /bakiye-yukle",
          "Disallow: /kripto-yukle",
          "Disallow: /api/",
          "",
          `Sitemap: ${BASE_URL}/sitemap.xml`,
          "",
        ].join("\n");
        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});

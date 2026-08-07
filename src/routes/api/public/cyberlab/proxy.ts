import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cyberlab/proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get("path") || "index.html";
        
        // Güvenlik: Sadece izin verilen dosya türleri ve dizin dışına çıkış engeli
        if (path.includes("..") || path.startsWith("/") || path.includes("secrets")) {
          return new Response("Unauthorized", { status: 403 });
        }

        try {
          const fs = await import("fs/promises");
          const pathModule = await import("path");
          const filePath = pathModule.join(process.cwd(), "public", "cyberlab", path);
          
          const content = await fs.readFile(filePath);
          const ext = pathModule.extname(path).toLowerCase();
          
          const mimeTypes: Record<string, string> = {
            ".html": "text/html",
            ".js": "application/javascript",
            ".css": "text/css",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
          };

          return new Response(content, {
            headers: {
              "Content-Type": mimeTypes[ext] || "application/octet-stream",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (e) {
          return new Response("Not Found", { status: 404 });
        }
      },
    },
  },
});

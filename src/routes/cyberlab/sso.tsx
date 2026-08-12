import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/cyberlab/sso")({
  component: CyberlabSsoHandler,
});

function CyberlabSsoHandler() {
  const navigate = useNavigate();
  const search = Route.useSearch() as { token?: string };

  useEffect(() => {
    if (search.token) {
      localStorage.setItem("cyberlab_sso_token", search.token);
      // Proxy üzerinden index.html'e token ile git
      // ÖNEMLİ: TanStack Start bazen query string'i yutabiliyor, hash üzerinden de deniyoruz.
      const targetUrl = "/cyberlab/index.html?token=" + encodeURIComponent(search.token);
      console.log("[SSO] Redirecting to:", targetUrl);
      
      // Try multiple ways to escape TanStack Router's grasp for an external static file
      window.location.replace(targetUrl);
      
      // Fallback
      window.setTimeout(() => {
        window.location.href = targetUrl;
      }, 50);
    } else {
      console.warn("[SSO] No token found in URL, navigating back to /cyberlab");
      navigate({ to: "/cyberlab" });
    }
  }, [search.token, navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-black font-mono text-primary">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="neon-text-glow">CyberLab Oturumu Doğrulanıyor...</p>
      </div>
    </div>
  );
}

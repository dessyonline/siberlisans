import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/cyberlab/sso")({
  component: CyberlabSsoHandler,
});

function CyberlabSsoHandler() {
  const navigate = useNavigate();
  const search = Route.useSearch() as { token?: string };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (token) {
      console.log("[SSO] Token found, setting to localStorage and redirecting...");
      localStorage.setItem("cyberlab_sso_token", token);
      
      const targetUrl = "/cyberlab/index.html?token=" + encodeURIComponent(token);
      
      // Force immediate redirect to bypass TanStack Router
      window.location.replace(targetUrl);
      
      // Safety timeout
      setTimeout(() => {
        window.location.href = targetUrl;
      }, 100);
    } else {
      console.warn("[SSO] No token found in URL");
      navigate({ to: "/cyberlab" });
    }
  }, [navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-black font-mono text-primary">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="neon-text-glow">CyberLab Oturumu Doğrulanıyor...</p>
      </div>
    </div>
  );
}

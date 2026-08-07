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
      // SSO sonrası ana sayfaya yönlendir
      window.location.href = "/cyberlab/index.html";
    } else {
      navigate({ to: "/cyberlab" });
    }
  }, [search.token, navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-black font-mono text-primary">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="neon-text-glow">CyberLab Oturumu Açılıyor...</p>
      </div>
    </div>
  );
}

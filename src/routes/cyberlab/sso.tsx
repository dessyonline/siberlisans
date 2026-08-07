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
      // SPA içinde kalmak için window.location.href yerine index.html'e yönlendiriyoruz
      // siber-sso.js head'de olduğu için bu sayfada da çalışacak ve token'ı yakalayacak.
      // Ancak döngüyü kırmak için index.html'e temiz bir yönlendirme yapıyoruz.
      window.location.replace("/cyberlab/index.html?token=" + encodeURIComponent(search.token));
    } else {
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

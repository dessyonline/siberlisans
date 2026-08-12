import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/cyberlab/sso")({
  component: CyberlabSsoHandler,
});

function CyberlabSsoHandler() {
  useEffect(() => {
    // TanStack Router might handle the search params, but for SSO we need raw URL access
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    console.log("[SSO] Current URL:", window.location.href);
    
    if (token) {
      console.log("[SSO] Token detected in URL, writing to localStorage...");
      localStorage.setItem("cyberlab_sso_token", token);
      
      // Navigate to index.html directly
      window.location.href = "/cyberlab/index.html?token=" + encodeURIComponent(token);
    } else {
      // Fallback: check if it's already in localStorage
      const existing = localStorage.getItem("cyberlab_sso_token");
      if (existing) {
         window.location.assign("/cyberlab/index.html");
      } else {
         window.location.assign("/cyberlab");
      }
    }
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-black font-mono text-primary">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="neon-text-glow">CYBERLAB_BRIDGE_INITIALIZING...</p>
      </div>
    </div>
  );
}

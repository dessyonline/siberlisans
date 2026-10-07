import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/unsubscribe")({
  head: () => ({
    meta: [
      { title: "E-posta aboneliğinden çık — Siber Lisans" },
      { name: "description", content: "Siber Lisans e-posta bildirimlerinden çıkış yapın." },
      { property: "og:title", content: "E-posta aboneliğinden çık — Siber Lisans" },
      { property: "og:description", content: "Siber Lisans e-posta bildirimlerinden çıkış yapın." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnsubscribePage,
});

type State = "loading" | "valid" | "used" | "invalid" | "done" | "error";

function UnsubscribePage() {
  const [state, setState] = useState<State>("loading");
  const [token, setToken] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(t);
    if (!t) return setState("invalid");
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then((r) => r.json().catch(() => ({})))
      .then((d: { valid?: boolean; reason?: string }) => {
        if (d.valid) setState("valid");
        else if (d.reason === "already_unsubscribed") setState("used");
        else setState("invalid");
      })
      .catch(() => setState("error"));
  }, []);

  const confirm = async () => {
    setState("loading");
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = (await r.json().catch(() => ({}))) as { success?: boolean; reason?: string };
      setState(d.success ? "done" : d.reason === "already_unsubscribed" ? "used" : "error");
    } catch {
      setState("error");
    }
  };

  const msg: Record<State, string> = {
    loading: "Kontrol ediliyor…",
    valid: "Siber Lisans e-postalarını artık almak istemiyor musun?",
    used: "Bu adres zaten abonelikten çıkarılmış.",
    invalid: "Bağlantı geçersiz veya süresi dolmuş.",
    done: "Abonelikten çıkarıldın. Artık e-posta almayacaksın.",
    error: "Bir sorun oluştu, lütfen tekrar dene.",
  };

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="glass-card max-w-md w-full p-8 text-center space-y-6">
        <h1 className="text-2xl font-bold">E-posta aboneliği</h1>
        <p className="text-muted-foreground">{msg[state]}</p>
        {state === "valid" && (
          <button
            onClick={confirm}
            className="neon-glow rounded-md bg-primary px-6 py-3 font-mono text-primary-foreground"
          >
            Abonelikten çık
          </button>
        )}
      </div>
    </main>
  );
}

import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { setPasswordWithToken } from "@/lib/password-reset.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Terminal, KeyRound } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/sifre-belirle")({
  component: SetPasswordPage,
  validateSearch: z.object({ token: z.string().max(64).optional() }),
  head: () => ({
    meta: [
      { title: "Şifre Belirle — SiberPHP" },
      { name: "description", content: "Hesabınız için yeni bir şifre oluşturun." },
      { property: "og:title", content: "Şifre Belirle — SiberPHP" },
      { property: "og:description", content: "Hesabınız için yeni bir şifre oluşturun." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function SetPasswordPage() {
  const { token } = useSearch({ from: "/sifre-belirle" });
  const navigate = useNavigate();
  const submit = useServerFn(setPasswordWithToken);
  const { refresh } = useAuth();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!token) return toast.error("[!] geçersiz bağlantı");
    if (password.length < 6) return toast.error("[!] şifre en az 6 karakter olmalı");
    if (password !== again) return toast.error("[!] şifreler eşleşmiyor");
    setLoading(true);
    try {
      const res = await submit({ data: { token, password } });
      setLoading(false);
      if (!res.ok) return toast.error(res.error ?? "İşlem başarısız");
      await refresh();
      toast.success("[✓] şifren güncellendi");
      navigate({ to: "/hesabim" });
    } catch {
      setLoading(false);
      toast.error("İşlem başarısız, tekrar deneyin.");
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="glass-card rounded-lg p-6 sm:p-8">
        <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
          <Terminal className="h-4 w-4 text-primary" />
          $ ./passwd --reset
        </div>
        <h1 className="mt-2 font-mono text-2xl neon-text">Şifre Belirle</h1>

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pw" className="font-mono text-xs">
              yeni şifre
            </Label>
            <Input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw2" className="font-mono text-xs">
              yeni şifre (tekrar)
            </Label>
            <Input
              id="pw2"
              type="password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              className="font-mono"
            />
          </div>
          <Button onClick={save} disabled={loading} className="w-full font-mono neon-glow">
            <KeyRound className="mr-2 h-4 w-4" />
            {loading ? "kaydediliyor…" : "şifreyi kaydet"}
          </Button>
        </div>
      </div>
    </div>
  );
}

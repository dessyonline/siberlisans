import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Terminal, Gift } from "lucide-react";

const authSearch = z.object({ ref: z.string().max(20).optional() });

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: authSearch,
  head: () => ({ meta: [{ title: "Giriş / Kayıt — SiberPHP" }] }),
});

function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const search = useSearch({ from: "/auth" });
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const refCode = search.ref?.toUpperCase() ?? "";

  useEffect(() => {
    if (user) navigate({ to: "/hesabim" });
  }, [user, navigate]);

  const signIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Giriş başarılı");
    navigate({ to: "/hesabim" });
  };

  const signUp = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/hesabim`,
        data: {
          display_name: displayName || email.split("@")[0],
          ...(refCode ? { ref: refCode } : {}),
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(refCode ? `Hesap oluşturuldu — davet kodu: ${refCode}` : "Hesap oluşturuldu. Giriş yapılıyor…");
    navigate({ to: "/hesabim" });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="glass-card rounded-lg p-6 sm:p-8">
        <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
          <Terminal className="h-4 w-4 text-primary" />
          $ ./auth --secure
        </div>
        <h1 className="mt-2 font-mono text-2xl neon-text">Hesabına Giriş</h1>
        <Tabs defaultValue="signin" className="mt-6">
          <TabsList className="w-full font-mono">
            <TabsTrigger value="signin" className="flex-1">giriş</TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">kayıt</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="space-y-4 mt-4">
            <Field label="e-posta" value={email} onChange={setEmail} type="email" />
            <Field label="şifre" value={password} onChange={setPassword} type="password" />
            <Button disabled={loading} onClick={signIn} className="w-full font-mono neon-glow">
              {"> "}giriş yap
            </Button>
          </TabsContent>
          <TabsContent value="signup" className="space-y-4 mt-4">
            {refCode && (
              <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2.5 text-xs font-mono text-primary">
                <Gift className="h-4 w-4" />
                <span>
                  Davet kodu: <span className="font-bold">{refCode}</span> · İlk siparişinde ₺25 bakiye kazanırsın
                </span>
              </div>
            )}
            <Field label="görünen ad" value={displayName} onChange={setDisplayName} />
            <Field label="e-posta" value={email} onChange={setEmail} type="email" />
            <Field label="şifre (min 6)" value={password} onChange={setPassword} type="password" />
            <Button disabled={loading} onClick={signUp} className="w-full font-mono neon-glow">
              {"> "}hesap oluştur
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
    </div>
  );
}

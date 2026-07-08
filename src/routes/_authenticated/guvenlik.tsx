import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Trash2, ArrowLeft, Terminal, MonitorSmartphone } from "lucide-react";
import { MfaEnroll } from "@/components/security/MfaEnroll";
import { MfaChallenge } from "@/components/security/MfaChallenge";
import { trustedDeviceExpiry, untrustDevice, TRUSTED_DEVICE_TTL_DAYS } from "@/lib/trusted-device";

export const Route = createFileRoute("/_authenticated/guvenlik")({
  component: SecurityPage,
  head: () => ({
    meta: [
      { title: "Güvenlik — SiberPHP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Factor = { id: string; friendly_name?: string | null; status: string; created_at: string };

function SecurityPage() {
  const navigate = useNavigate();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [aal, setAal] = useState<"aal1" | "aal2" | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"idle" | "enroll" | "verify-remove" | "step-up">("idle");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const [{ data: f }, { data: a }, roleRes] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      u.user ? supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" }) : Promise.resolve({ data: false }),
    ]);
    setFactors(((f?.totp as Factor[]) ?? []).filter((x) => x.status === "verified"));
    setAal((a?.currentLevel as "aal1" | "aal2" | null) ?? null);
    setIsAdmin(Boolean(roleRes.data));
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const enabled = factors.length > 0;

  const askRemove = (id: string) => {
    setRemoveTarget(id);
    if (aal !== "aal2") {
      // Kaldırmak için önce aal2 gerek
      setMode("verify-remove");
    } else {
      doRemove(id);
    }
  };

  const doRemove = async (id: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return toast.error(`[!] ${error.message}`);
    toast.success("[✓] 2FA kaldırıldı");
    setRemoveTarget(null);
    setMode("idle");
    refresh();
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Terminal className="h-3.5 w-3.5 text-primary" /> $ ./security --panel
          </div>
          <h1 className="mt-1 font-mono text-2xl neon-text">Güvenlik</h1>
        </div>
        <Link to="/hesabim" className="font-mono text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> hesabım
        </Link>
      </div>

      {/* Admin uyarısı */}
      {!loading && isAdmin && aal !== "aal2" && (
        <div className="rounded-md border border-warn/40 bg-warn/5 p-4 font-mono text-xs">
          <div className="flex items-center gap-2 text-warn">
            <ShieldAlert className="h-4 w-4" />
            <span className="font-semibold">admin paneline erişim için 2FA gerekiyor</span>
          </div>
          <div className="mt-1 text-muted-foreground">
            {enabled
              ? "Bu oturumda henüz 2FA doğrulaması yapmadın. Aşağıdan doğrula, sonra admin paneline gidebilirsin."
              : "Önce 2FA'yı kur, sonra /admin sayfasına yönlendirileceksin."}
          </div>
          {enabled && (
            <Button
              size="sm"
              className="mt-3 font-mono neon-glow"
              onClick={() => setMode("step-up")}
            >
              {"> "}şimdi doğrula
            </Button>
          )}
        </div>
      )}

      {/* 2FA kart */}
      <div className="glass-card rounded-lg p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-md p-2 ${enabled ? "bg-primary/15 text-primary" : "bg-warn/10 text-warn"}`}>
            {enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm font-semibold">İki Adımlı Doğrulama (2FA)</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground leading-relaxed">
              Authenticator uygulamasıyla üretilen 6 haneli kod ile hesabına ekstra bir güvenlik katmanı ekle.
              Şifren çalınsa bile telefonuna erişimi olmayan biri hesabına giremez.
            </div>
            <div className="mt-2 font-mono text-[10px]">
              durum:{" "}
              {loading ? (
                <span className="text-muted-foreground">…</span>
              ) : enabled ? (
                <span className="text-primary">[✓] aktif</span>
              ) : (
                <span className="text-warn">[!] devre dışı</span>
              )}
              {enabled && aal && (
                <span className="ml-2 text-muted-foreground">· oturum: {aal}</span>
              )}
            </div>
          </div>
        </div>

        {mode === "idle" && !enabled && (
          <Button onClick={() => setMode("enroll")} className="font-mono neon-glow w-full sm:w-auto">
            {"> "}2FA'yı kur
          </Button>
        )}

        {mode === "enroll" && (
          <div className="border-t border-border/40 pt-4">
            <MfaEnroll
              onDone={() => {
                setMode("idle");
                refresh();
              }}
            />
            <button
              onClick={() => setMode("idle")}
              className="mt-3 font-mono text-[10px] text-muted-foreground hover:text-primary"
            >
              ← vazgeç
            </button>
          </div>
        )}

        {mode === "verify-remove" && removeTarget && (
          <div className="border-t border-border/40 pt-4">
            <div className="mb-3 rounded-md border border-warn/30 bg-warn/5 p-3 font-mono text-[11px] text-warn">
              [!] 2FA kaldırmak için önce mevcut 2FA kodunla doğrulanman gerekiyor.
            </div>
            <MfaChallenge
              factorId={removeTarget}
              title="kaldırma onayı"
              onCancel={() => {
                setRemoveTarget(null);
                setMode("idle");
              }}
              onSuccess={() => doRemove(removeTarget)}
            />
          </div>
        )}

        {mode === "step-up" && enabled && (
          <div className="border-t border-border/40 pt-4">
            <MfaChallenge
              factorId={factors[0]?.id}
              title="oturum doğrulama"
              onCancel={() => setMode("idle")}
              onSuccess={async () => {
                setMode("idle");
                await refresh();
                toast.success("[✓] doğrulandı — admin paneline yönlendiriliyorsun");
                if (isAdmin) navigate({ to: "/admin" });
              }}
            />
          </div>
        )}

        {enabled && mode === "idle" && (
          <div className="border-t border-border/40 pt-3 space-y-2">
            {factors.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-2 rounded border border-border/40 bg-background/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs truncate">{f.friendly_name || "authenticator"}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    eklendi: {new Date(f.created_at).toLocaleDateString("tr-TR")}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => askRemove(f.id)} className="font-mono text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card rounded-lg p-4 font-mono text-[11px] text-muted-foreground space-y-1">
        <div className="text-primary">// ipucu</div>
        <div>· admin paneli için 2FA <span className="text-primary">zorunludur</span>.</div>
        <div>· şifre değişikliği ve hassas hesap işlemleri 2FA aktifken kod isteyecektir.</div>
        <div>· telefonunu kaybedersen destek üzerinden kimlik doğrulaması ile sıfırlanır.</div>
      </div>
    </div>
  );
}

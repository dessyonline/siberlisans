import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Users, Wallet, Share2, Gift } from "lucide-react";

export const Route = createFileRoute("/_authenticated/davet")({
  component: DavetPage,
  head: () => ({
    meta: [{ title: "Davet Et — SiberPHP" }, { name: "robots", content: "noindex" }],
  }),
});

function DavetPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["referral-info", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [profileRes, invitedRes, bonusRes] = await Promise.all([
        supabase.from("profiles").select("referral_code, referred_by").eq("id", user!.id).single(),
        supabase
          .from("profiles")
          .select("id, email, display_name, created_at, referral_bonus_paid")
          .eq("referred_by", user!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("wallet_transactions")
          .select("amount_try")
          .eq("user_id", user!.id)
          .eq("kind", "referral_bonus"),
      ]);
      const totalBonus = (bonusRes.data ?? []).reduce((s, r) => s + Number(r.amount_try), 0);
      return {
        code: (profileRes.data as { referral_code: string | null } | null)?.referral_code ?? null,
        invited: invitedRes.data ?? [],
        totalBonus,
      };
    },
  });

  const link =
    typeof window !== "undefined" && data?.code
      ? `${window.location.origin}/auth?ref=${data.code}`
      : "";

  const copy = async (val: string, label: string) => {
    try {
      await navigator.clipboard.writeText(val);
      toast.success(`[✓] ${label} kopyalandı`);
    } catch {
      toast.error("kopyalanamadı");
    }
  };

  const share = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "SiberPHP — Güvenli lisans dağıtım sistemi",
          text: "Bu davet linki ile kayıt olursan ikinize de ₺10 bakiye (min ₺300 alışverişte)!",
          url: link,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      copy(link, "link");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-12 space-y-6">
      <div>
        <div className="font-mono text-[11px] text-muted-foreground">$ ./davet --code={data?.code ?? "…"}</div>
        <h1 className="mt-1.5 font-mono text-2xl md:text-3xl neon-text">Arkadaşını Davet Et</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-lg">
          Davet linkinle kayıt olan her arkadaşın ilk siparişini tamamladığında{" "}
          <span className="text-primary font-mono">ikinize de ₺25 cüzdan bakiyesi</span> yatar.
        </p>
      </div>

      <div className="glass-card rounded-lg p-5 corner-cut">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          davet kodun
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <div className="text-3xl font-mono neon-text tracking-widest select-all">
            {data?.code ?? "…"}
          </div>
          <Button size="sm" variant="outline" className="font-mono" onClick={() => copy(data?.code ?? "", "kod")}>
            <Copy className="h-3.5 w-3.5 mr-1" /> kopyala
          </Button>
        </div>
        {link && (
          <div className="mt-4">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              paylaşım linki
            </div>
            <div className="flex items-stretch gap-2 flex-wrap">
              <code className="flex-1 min-w-0 rounded-md border border-border/60 bg-background/50 px-3 py-2 font-mono text-xs text-foreground/90 break-all">
                {link}
              </code>
              <Button size="sm" variant="outline" className="font-mono" onClick={() => copy(link, "link")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" className="font-mono neon-glow" onClick={share}>
                <Share2 className="h-3.5 w-3.5 mr-1" /> paylaş
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground font-mono text-[10px] uppercase">
            <Users className="h-3.5 w-3.5" /> davet ettiğin
          </div>
          <div className="mt-2 text-3xl font-mono neon-text">{data?.invited.length ?? 0}</div>
        </div>
        <div className="glass-card rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground font-mono text-[10px] uppercase">
            <Wallet className="h-3.5 w-3.5" /> kazandığın bonus
          </div>
          <div className="mt-2 text-3xl font-mono neon-text">
            ₺{(data?.totalBonus ?? 0).toLocaleString("tr-TR")}
          </div>
        </div>
      </div>

      <div className="glass-card rounded-lg p-5">
        <div className="flex items-center gap-2 font-mono text-sm mb-3">
          <Gift className="h-4 w-4 text-primary" />
          <span>Davet Ettiklerin</span>
        </div>
        {(data?.invited ?? []).length === 0 ? (
          <div className="text-xs text-muted-foreground font-mono py-8 text-center">
            henüz davet ettiğin arkadaş yok
          </div>
        ) : (
          <div className="space-y-2">
            {(data?.invited ?? []).map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs truncate">
                    {u.display_name ?? u.email?.split("@")[0]}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {new Date(u.created_at).toLocaleDateString("tr-TR")}
                  </div>
                </div>
                <div
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase ${
                    u.referral_bonus_paid
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-warn/40 bg-warn/10 text-warn"
                  }`}
                >
                  {u.referral_bonus_paid ? "bonus ödendi" : "sipariş bekliyor"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center">
        <Link to="/hesabim" className="text-xs font-mono text-muted-foreground hover:text-primary">
          ← hesabıma dön
        </Link>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getPartnerStats, updatePartnerSlug } from "@/lib/partner.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Copy,
  Users,
  Wallet,
  Share2,
  Gift,
  MousePointerClick,
  Percent,
  TrendingUp,
  QrCode,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/davet")({
  component: DavetPage,
  head: () => ({
    meta: [{ title: "Partner Paneli — SiberPHP" }, { name: "robots", content: "noindex" }],
  }),
});

function DavetPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const statsFn = useServerFn(getPartnerStats);
  const slugFn = useServerFn(updatePartnerSlug);

  const { data: profile } = useQuery({
    queryKey: ["referral-info", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [profileRes, invitedRes, bonusRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("referral_code, referred_by, partner_slug, display_name")
          .eq("id", user!.id)
          .single(),
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
      const p = profileRes.data as {
        referral_code: string | null;
        partner_slug: string | null;
        display_name: string | null;
      } | null;
      return {
        code: p?.referral_code ?? null,
        slug: p?.partner_slug ?? null,
        displayName: p?.display_name ?? null,
        invited: invitedRes.data ?? [],
        totalBonus,
      };
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["partner-stats", user?.id],
    enabled: !!user,
    queryFn: () => statsFn(),
    refetchInterval: 60000,
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = profile?.code ? `${origin}/p/${profile.slug ?? profile.code}` : "";
  const authLink = profile?.code ? `${origin}/auth?ref=${profile.code}` : "";

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
          text: "Davet linkimle kayıt ol, ilk ₺300+ siparişinde %5 indirim kuponu senin, %5 nakit benim olsun!",
          url: link,
        });
      } catch {
        /* cancelled */
      }
    } else {
      copy(link, "link");
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-10 space-y-6">
      <div>
        <div className="font-mono text-[11px] text-muted-foreground">
          $ ./partner --code={profile?.code ?? "…"}
        </div>
        <h1 className="mt-1.5 font-mono text-2xl md:text-3xl neon-text">Partner Paneli</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-xl">
          Davet linkinle kayıt olan arkadaşın en az ₺300 tutarında sipariş verdiğinde{" "}
          <span className="text-primary font-mono">sana %5 nakit</span> cüzdanına,{" "}
          <span className="text-primary font-mono">arkadaşına %5 indirim kuponu</span> düşer
          (sipariş başına max ₺40). En fazla 5 davet.
        </p>
      </div>

      {/* Analytics KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          icon={MousePointerClick}
          label="tıklama (30g)"
          value={stats?.clicks30d ?? 0}
          sub={`toplam ${stats?.clicksTotal ?? 0}`}
        />
        <Kpi
          icon={Percent}
          label="dönüşüm"
          value={`%${stats?.conversionRate ?? 0}`}
          sub={`${stats?.conversions ?? 0} sipariş`}
        />
        <Kpi
          icon={Users}
          label="davet"
          value={`${profile?.invited.length ?? 0}/5`}
        />
        <Kpi
          icon={Wallet}
          label="kazanç"
          value={`₺${(profile?.totalBonus ?? 0).toLocaleString("tr-TR")}`}
          sub={`30g ₺${stats?.earnings30d ?? 0}`}
        />
      </div>

      {/* Chart */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <div className="font-mono text-sm">Son 30 gün</div>
        </div>
        <MiniChart daily={stats?.daily ?? []} />
      </div>

      {/* Link + QR */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="glass-card rounded-lg p-5 md:col-span-2 corner-cut">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            davet linkin
          </div>
          <div className="mt-1 text-2xl font-mono neon-text tracking-widest select-all break-all">
            {profile?.code ?? "…"}
          </div>

          <div className="mt-4 space-y-2">
            <LinkRow label="landing link" value={link} onCopy={copy} />
            <LinkRow label="direkt kayıt" value={authLink} onCopy={copy} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={share} className="neon-glow font-mono">
              <Share2 className="h-3.5 w-3.5 mr-1" /> paylaş
            </Button>
            <Button size="sm" variant="outline" className="font-mono" onClick={() => copy(link, "link")}>
              <Copy className="h-3.5 w-3.5 mr-1" /> linki kopyala
            </Button>
          </div>
        </div>

        <div className="glass-card rounded-lg p-4 flex flex-col items-center justify-center">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <QrCode className="h-3 w-3" /> QR
          </div>
          {link && (
            <div className="bg-white p-2 rounded">
              <QRCodeSVG value={link} size={140} level="M" />
            </div>
          )}
          <div className="text-[10px] font-mono text-muted-foreground mt-2 text-center break-all px-1">
            {profile?.slug ?? profile?.code}
          </div>
        </div>
      </div>

      {/* Vanity slug */}
      <SlugEditor
        current={profile?.slug ?? null}
        onSave={async (slug) => {
          await slugFn({ data: { slug } });
          qc.invalidateQueries({ queryKey: ["referral-info", user?.id] });
        }}
      />

      {/* Share templates */}
      <ShareTemplates link={link} name={profile?.displayName ?? "SiberPHP"} onCopy={copy} />

      {/* Invited list */}
      <div className="glass-card rounded-lg p-5">
        <div className="flex items-center gap-2 font-mono text-sm mb-3">
          <Gift className="h-4 w-4 text-primary" />
          <span>Davet Ettiklerin ({profile?.invited.length ?? 0}/5)</span>
        </div>
        {(profile?.invited ?? []).length === 0 ? (
          <div className="text-xs text-muted-foreground font-mono py-8 text-center">
            henüz davet ettiğin arkadaş yok — linkini paylaşmaya başla
          </div>
        ) : (
          <div className="space-y-2">
            {(profile?.invited ?? []).map((u) => (
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

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="glass-card rounded-lg p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase font-mono text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-2xl font-mono neon-text">{value}</div>
      {sub && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function LinkRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (v: string, l: string) => void;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 rounded-md border border-border/60 bg-background/50 px-3 py-2 font-mono text-[11px] text-foreground/90 break-all">
          {value || "…"}
        </code>
        <Button
          size="sm"
          variant="outline"
          className="font-mono shrink-0"
          onClick={() => onCopy(value, label)}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function MiniChart({ daily }: { daily: Array<{ d: string; clicks: number; earn: number }> }) {
  const max = useMemo(() => Math.max(1, ...daily.map((d) => d.clicks)), [daily]);
  if (!daily.length)
    return <div className="text-xs text-muted-foreground font-mono py-6 text-center">veri yok</div>;
  return (
    <div className="flex items-end gap-[3px] h-24">
      {daily.map((d) => {
        const h = (d.clicks / max) * 100;
        return (
          <div
            key={d.d}
            className="flex-1 rounded-t bg-primary/30 hover:bg-primary/60 transition-colors relative group"
            style={{ height: `${Math.max(2, h)}%` }}
            title={`${d.d} · ${d.clicks} tıklama · ₺${d.earn}`}
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-mono bg-background border border-border/60 rounded px-1.5 py-0.5">
              {d.clicks}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SlugEditor({
  current,
  onSave,
}: {
  current: string | null;
  onSave: (slug: string) => Promise<void>;
}) {
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await onSave(value);
      toast.success("Özel link güncellendi");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "hata");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="glass-card rounded-lg p-5">
      <div className="font-mono text-sm mb-1">Özel Link (vanity)</div>
      <div className="text-[11px] font-mono text-muted-foreground mb-3">
        3-24 karakter · harf, rakam, - _ · /p/<span className="text-primary">{value || "kullaniciadi"}</span>
      </div>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          placeholder="ornek: siberphp-partner"
          className="font-mono"
          maxLength={24}
        />
        <Button
          onClick={submit}
          disabled={busy || value.length < 3 || value === current}
          className="font-mono shrink-0"
        >
          {current === value && value ? <Check className="h-4 w-4" /> : "kaydet"}
        </Button>
      </div>
    </div>
  );
}

function ShareTemplates({
  link,
  name,
  onCopy,
}: {
  link: string;
  name: string;
  onCopy: (v: string, l: string) => void;
}) {
  const templates = useMemo(
    () => [
      {
        label: "kısa",
        text: `SiberPHP davet linkim: ${link} — ilk ₺300+ siparişinde sana %5 indirim kuponu (max ₺40).`,
      },
      {
        label: "twitter/x",
        text: `Lisans işini SiberPHP'de hallediyorum, güvenli ve hızlı. Davet linkimle kayıt ol, ilk ₺300+ siparişinde %5 indirim kuponu senin olsun 👾\n${link}`,
      },
      {
        label: "whatsapp",
        text: `Selam! SiberPHP'den anında lisans alabiliyorsun. Bu linkle kayıt ol, ilk ₺300+ siparişinde %5 (max ₺40) indirim kuponu kazan: ${link}`,
      },
      {
        label: "discord",
        text: `**${name}** SiberPHP partneri 🎯\n> Bu linkle kayıt ol, ilk ₺300+ siparişinde %5 indirim kuponu (max ₺40) kazan.\n${link}`,
      },
    ],
    [link, name],
  );

  if (!link) return null;

  return (
    <div className="glass-card rounded-lg p-5">
      <div className="font-mono text-sm mb-3">Paylaşım Şablonları</div>
      <div className="grid md:grid-cols-2 gap-3">
        {templates.map((t) => (
          <div key={t.label} className="rounded border border-border/60 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-[10px] uppercase text-muted-foreground">{t.label}</div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 font-mono text-[10px]"
                onClick={() => onCopy(t.text, t.label)}
              >
                <Copy className="h-3 w-3 mr-1" /> kopyala
              </Button>
            </div>
            <div className="text-xs whitespace-pre-wrap text-foreground/90">{t.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

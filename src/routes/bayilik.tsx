import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { listDealerTiers, getMyDealerInfo, applyForDealership } from "@/lib/dealer.functions";
import { getAccountSummary } from "@/lib/account-summary.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Handshake, TrendingUp, Percent, Users, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/bayilik")({
  head: () => ({
    meta: [
      { title: "Bayilik Programı — %20'ye Varan Komisyon | SiberLisans" },
      {
        name: "description",
        content:
          "SiberLisans bayisi ol: bayiye özel toptan fiyat listesi, toplu lisans alımı ve müşteri paneli. Başvur, onay al, satmaya başla.",
      },
      { property: "og:title", content: "Bayilik Programı | SiberLisans" },
      {
        property: "og:description",
        content: "Toptan fiyat listesi ve toplu lisans alımı ile bayi ol.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DealerLanding,
});

function DealerLanding() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ company: "", phone: "", channel: "", volume: "", note: "" });
  const [sending, setSending] = useState(false);

  const tiersFn = useServerFn(listDealerTiers);
  const mineFn = useServerFn(getMyDealerInfo);
  const applyFn = useServerFn(applyForDealership);
  const summaryFn = useServerFn(getAccountSummary);

  const { data: tiers } = useQuery({
    queryKey: ["dealer-tiers"],
    queryFn: () => tiersFn(),
  });

  const { data: mine } = useQuery({
    queryKey: ["dealer-self", user?.id],
    enabled: !!user,
    queryFn: () => mineFn(),
  });

  const { data: summary } = useQuery({
    queryKey: ["account-summary", user?.id],
    enabled: !!user,
    queryFn: () => summaryFn(),
  });

  const submit = async () => {
    if (!form.company.trim()) return toast.error("Firma / rumuz adı gerekli");
    setSending(true);
    try {
      await applyFn({
        data: {
          companyName: form.company.trim(),
          contactPhone: form.phone.trim(),
          channel: form.channel.trim(),
          monthlyVolume: Number(form.volume) || 0,
          note: form.note.trim(),
        },
      });
      toast.success("Başvurun alındı, en kısa sürede dönüş yapılacak");
      setForm({ company: "", phone: "", channel: "", volume: "", note: "" });
      qc.invalidateQueries({ queryKey: ["dealer-self"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const pending = mine?.application?.status === "pending";
  const rejected = mine?.application?.status === "rejected";

  const balance = summary?.balance_try ?? 0;
  const balanceOk = balance >= 1000;

  return (
    <div className="relative overflow-hidden">
      <div className="cyber-grid absolute inset-0 opacity-30" aria-hidden />
      <div className="hero-orb absolute -top-32 -left-24 h-96 w-96" aria-hidden />
      <div className="hero-orb absolute -bottom-32 -right-24 h-96 w-96" aria-hidden />

      <div className="relative mx-auto max-w-5xl px-4 py-14">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 font-mono text-[11px] text-primary">
            <Handshake className="h-3.5 w-3.5" /> $ ./dealer-program --apply
          </div>
          <h1 className="mt-4 text-3xl font-bold md:text-4xl">
            SiberLisans <span className="neon-text">Bayilik Programı</span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Kendi müşteri kitlene lisans sat, <strong className="text-primary">bayiye özel toptan fiyatlarla</strong>{" "}
            kendi stoğunu oluştur ve aradaki farkı kâr olarak cebinde bırak.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Percent, t: "Toptan indirim", d: "Seviyene göre kendi alımlarında bayi indirimi" },
            { icon: TrendingUp, t: "Seviye sistemi", d: "Ciron arttıkça indirim oranın yükselir" },
            { icon: Users, t: "Müşteri paneli", d: "Getirdiğin müşteriler ve ciro raporu" },
            { icon: ShieldCheck, t: "API & entegrasyon", d: "Kendi sitende satış için bayi API'si ve katalog akışı" },
          ].map((f) => (
            <div key={f.t} className="glass-card rounded-xl border border-border/60 p-4">
              <f.icon className="h-5 w-5 text-primary" />
              <div className="mt-2 font-mono text-sm font-semibold">{f.t}</div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>

        {/* Seviyeler */}
        <h2 className="mt-12 font-mono text-lg">$ bayi seviyeleri</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(tiers ?? []).map((t) => (
            <div
              key={t.slug}
              className="glass-card relative rounded-xl border border-primary/25 p-5 corner-cut"
            >
              <div className="font-mono text-xs uppercase tracking-wider text-primary">{t.slug}</div>
              <div className="mt-1 text-lg font-semibold">{t.name}</div>
              <div className="mt-4 font-mono text-3xl neon-text">%{Number(t.discount_percent)}</div>
              <div className="font-mono text-[11px] text-muted-foreground">toptan indirim</div>
              <div className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
                <div>
                  gereken ciro:{" "}
                  <span className="text-foreground">₺{Number(t.min_volume_try).toLocaleString("tr-TR")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Başvuru */}
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="glass-card rounded-xl border border-border/60 p-6">
            <h2 className="font-mono text-lg">$ nasıl çalışır</h2>
            <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
              {[
                "Aşağıdaki formu doldurup bayilik başvurusu yap.",
                "Ekibimiz başvuruyu inceler ve onaylar.",
                "Sana özel bayi kodun ve davet linkin oluşur.",
                "Toptan fiyat listesinden dilediğin ürünü indirimli alırsın.",
                "Sattıkça ciron artar, seviyen ve indirim oranın yükselir.",
              ].map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/50 font-mono text-[10px] text-primary">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>

          <div className="glass-card rounded-xl border border-primary/30 p-6">
            {!user ? (
              <div className="text-center">
                <h2 className="font-mono text-lg">$ giriş gerekli</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Bayilik başvurusu yapmak için hesabına giriş yap.
                </p>
                <Button asChild className="mt-4 w-full font-mono">
                  <Link to="/auth">giriş yap / kayıt ol</Link>
                </Button>
              </div>
            ) : mine?.dealer ? (
              <div className="text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
                <h2 className="mt-2 font-mono text-lg">Zaten bayisin</h2>
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  bayi kodun: <span className="text-primary">{mine.dealer.code}</span>
                </p>
                <Button asChild className="mt-4 w-full font-mono">
                  <Link to="/bayi">
                    bayi paneline git <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : pending ? (
              <div className="text-center">
                <h2 className="font-mono text-lg">Başvurun inceleniyor</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Başvurun alındı. Sonuçlandığında bildirim göndereceğiz.
                </p>
              </div>
            ) : (
              <>
                <h2 className="font-mono text-lg">$ bayilik başvurusu</h2>
                <div
                  className={`mt-3 rounded-md border p-3 font-mono text-xs ${
                    balanceOk ? "border-primary/40 bg-primary/5 text-primary" : "border-amber-500/40 bg-amber-500/10 text-amber-500"
                  }`}
                >
                  <div>şart: cüzdanında en az ₺1.000 bakiye</div>
                  <div className="mt-1 text-foreground/80">
                    mevcut bakiye: ₺{balance.toLocaleString("tr-TR")}
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Bu tutar senden alınmaz — kendi cüzdanında kalır, dilediğin an lisans alımında kullanırsın.
                  </p>
                  {!balanceOk && (
                    <Button asChild size="sm" variant="outline" className="mt-2 w-full font-mono">
                      <Link to="/cuzdan">$ bakiye yükle</Link>
                    </Button>
                  )}
                </div>
                {rejected && mine?.application?.admin_note && (
                  <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 font-mono text-xs text-destructive">
                    önceki başvuru reddedildi: {mine.application.admin_note}
                  </p>
                )}

                <div className="mt-4 space-y-3">
                  <Input
                    placeholder="Firma / rumuz adı *"
                    value={form.company}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                  />
                  <Input
                    placeholder="İletişim telefonu"
                    value={form.phone}
                    maxLength={40}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                  <Input
                    placeholder="Satış kanalın (Instagram, Discord, web sitesi…)"
                    value={form.channel}
                    maxLength={60}
                    onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="Aylık tahmini ciro (₺)"
                    value={form.volume}
                    onChange={(e) => setForm({ ...form, volume: e.target.value })}
                  />
                  <Textarea
                    placeholder="Kısaca kendinden ve müşteri kitlenden bahset"
                    rows={3}
                    maxLength={1000}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                  <Button onClick={submit} disabled={sending || !balanceOk} className="w-full font-mono">
                    {sending ? "gönderiliyor…" : "$ başvuruyu gönder"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

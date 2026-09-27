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
import {
  Handshake,
  TrendingUp,
  Percent,
  Users,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Wallet,
  Rocket,
  ChevronDown
} from "lucide-react";

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
  const balancePercent = Math.min(100, Math.max(0, (balance / 1000) * 100));

  return (
    <div className="relative overflow-hidden bg-background min-h-screen">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]" aria-hidden />
      
      <div className="hero-orb absolute -top-40 -left-40 h-[500px] w-[500px] bg-primary/20 blur-[120px]" aria-hidden />
      <div className="hero-orb absolute top-40 -right-40 h-[400px] w-[400px] bg-cyan-500/20 blur-[100px]" aria-hidden />
      <div className="hero-orb absolute -bottom-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 bg-purple-500/10 blur-[150px]" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-4 py-20 lg:py-32">
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto flex flex-col items-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 font-mono text-xs text-primary shadow-[0_0_15px_rgba(var(--primary),0.2)] animate-pulse">
            <Rocket className="h-4 w-4" /> Yeni Nesil Dijital Satış Ağı
          </div>
          
          <h1 className="mt-8 text-5xl font-extrabold tracking-tight md:text-7xl lg:text-8xl">
            SiberLisans <br className="hidden md:block" />
            <span className="bg-gradient-to-r from-primary via-cyan-400 to-purple-500 bg-clip-text text-transparent drop-shadow-sm">
              Bayilik Programı
            </span>
          </h1>
          
          <p className="mx-auto mt-6 max-w-2xl text-lg md:text-xl text-muted-foreground leading-relaxed">
            Kendi müşteri kitlene lisans sat, <strong className="text-foreground">bayiye özel toptan fiyatlarla</strong>{" "}
            kendi stoğunu oluştur ve aradaki farkı kâr olarak cebinde bırak. 
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Button size="lg" className="h-14 px-8 text-base font-bold shadow-[0_0_30px_rgba(var(--primary),0.4)] hover:scale-105 transition-all duration-300" onClick={() => document.getElementById("basvuru")?.scrollIntoView({ behavior: "smooth" })}>
              Hemen Başvur <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" variant="outline" className="h-14 px-8 text-base border-primary/30 hover:bg-primary/10 hover:text-primary transition-all duration-300" onClick={() => document.getElementById("nasil-calisir")?.scrollIntoView({ behavior: "smooth" })}>
              Nasıl Çalışır? <ChevronDown className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Percent, t: "Toptan İndirim", d: "Seviyene göre kendi alımlarında benzersiz bayi indirimi oranları" },
            { icon: TrendingUp, t: "Dinamik Seviye", d: "Aylık ciron arttıkça kâr marjın ve indirim oranın otomatik yükselir" },
            { icon: Users, t: "Gelişmiş Panel", d: "Getirdiğin müşteriler, siparişler, ciro ve detaylı analitik raporları" },
            { icon: ShieldCheck, t: "API Entegrasyonu", d: "Kendi e-ticaret sitende tam otomatik satış için bayi API'si (Yakında)" },
          ].map((f, i) => (
            <div key={f.t} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-background/40 backdrop-blur-xl p-6 transition-all duration-500 hover:-translate-y-2 hover:border-primary/50 hover:shadow-[0_8px_30px_rgba(var(--primary),0.15)]">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-all duration-500 group-hover:bg-primary/20" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground shadow-inner">
                <f.icon className="h-7 w-7" />
              </div>
              <h3 className="mt-5 font-mono text-base font-bold text-foreground">{f.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>

        {/* Seviyeler */}
        <div className="mt-32">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">Bayi <span className="text-primary">Seviyeleri</span></h2>
            <p className="mt-3 text-muted-foreground">Ne kadar çok satış yaparsan, o kadar çok kazanırsın.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {(tiers ?? []).map((t, index) => (
              <div
                key={t.slug}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-background/50 backdrop-blur-md p-8 transition-all duration-300 hover:-translate-y-2 hover:border-primary/50 hover:shadow-[0_0_40px_rgba(var(--primary),0.2)]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="relative z-10">
                  <div className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 font-mono text-xs font-medium text-primary">
                    SEVİYE {index + 1}
                  </div>
                  <div className="mt-4 text-2xl font-bold">{t.name}</div>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/70 group-hover:from-primary group-hover:to-cyan-400 transition-all duration-300">%{Number(t.discount_percent)}</span>
                    <span className="text-sm font-mono text-muted-foreground">indirim</span>
                  </div>
                  </div>
              </div>
            ))}
          </div>
        </div>

        {/* Başvuru & Nasıl Çalışır */}
        <div id="basvuru" className="mt-32">
          <div className="grid gap-12 lg:grid-cols-5">
            
            {/* Timeline */}
            <div id="nasil-calisir" className="lg:col-span-2">
              <h2 className="text-3xl font-bold mb-8">Nasıl <span className="text-primary">Çalışır?</span></h2>
              <div className="relative border-l-2 border-primary/20 ml-4 space-y-10 py-2">
                {[
                  { title: "Başvurunu Yap", desc: "Cüzdanında 1000₺ bakiye bulundurarak sağdaki formu doldur." },
                  { title: "Hızlı Onay", desc: "Ekibimiz başvurunu inceler ve en kısa sürede onaylar." },
                  { title: "Sisteme Dahil Ol", desc: "Sana özel bayi kodun ve indirimli toptan fiyatların aktifleşir." },
                  { title: "Satışa Başla", desc: "Kendi müşterilerine satıp, panelinden tek tıkla teslim et." },
                  { title: "Seviye Atla", desc: "Ciron arttıkça sistem otomatik olarak indirim oranını yükseltir." },
                ].map((s, i) => (
                  <div key={i} className="relative pl-8 group">
                    <div className="absolute -left-[17px] top-1 flex h-8 w-8 items-center justify-center rounded-full border-4 border-background bg-primary/20 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-[0_0_15px_rgba(var(--primary),0.5)] font-mono text-sm font-bold">
                      {i + 1}
                    </div>
                    <h4 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{s.title}</h4>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Application Form */}
            <div className="lg:col-span-3">
              <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-background/60 backdrop-blur-2xl p-6 sm:p-10 shadow-2xl">
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
                
                {!user ? (
                  <div className="relative z-10 flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                      <Handshake className="h-10 w-10 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold">Giriş Yapmalısın</h2>
                    <p className="mt-3 text-muted-foreground max-w-md">
                      Bayilik fırsatlarından yararlanmak ve başvuru formunu görmek için lütfen hesabına giriş yap.
                    </p>
                    <Button asChild size="lg" className="mt-8 font-mono shadow-[0_0_20px_rgba(var(--primary),0.3)]">
                      <Link to="/auth">Giriş Yap veya Kayıt Ol</Link>
                    </Button>
                  </div>
                ) : mine?.dealer ? (
                  <div className="relative z-10 flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-24 w-24 rounded-full bg-green-500/10 flex items-center justify-center mb-6 border border-green-500/20">
                      <CheckCircle2 className="h-12 w-12 text-green-500" />
                    </div>
                    <h2 className="text-3xl font-bold">Harika! Zaten Bayisin.</h2>
                    <div className="mt-6 flex flex-col items-center gap-2">
                      <span className="text-sm text-muted-foreground uppercase tracking-widest font-mono">Bayi Kodun</span>
                      <code className="px-6 py-3 rounded-xl bg-primary/10 border border-primary/30 text-2xl font-mono text-primary font-bold shadow-inner">
                        {mine.dealer.code}
                      </code>
                    </div>
                    <Button asChild size="lg" className="mt-10 font-mono w-full sm:w-auto shadow-[0_0_20px_rgba(var(--primary),0.3)]">
                      <Link to="/bayi">
                        Bayi Paneline Geçiş Yap <ArrowRight className="ml-2 h-5 w-5" />
                      </Link>
                    </Button>
                  </div>
                ) : pending ? (
                  <div className="relative z-10 flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-24 w-24 rounded-full bg-cyan-500/10 flex items-center justify-center mb-6 border border-cyan-500/20">
                      <TrendingUp className="h-12 w-12 text-cyan-500 animate-pulse" />
                    </div>
                    <h2 className="text-3xl font-bold">Başvurun İncelemede</h2>
                    <p className="mt-4 text-muted-foreground max-w-md leading-relaxed">
                      Başvurunu başarıyla aldık. Ekibimiz en kısa sürede değerlendirip sana geri dönüş yapacak. Lütfen bildirimlerini takip et.
                    </p>
                  </div>
                ) : (
                  <div className="relative z-10">
                    <div className="mb-8">
                      <h2 className="text-2xl font-bold">Başvuru Formu</h2>
                      <p className="mt-2 text-sm text-muted-foreground">Kendi dijital lisans işini bugün kurmaya başla.</p>
                    </div>

                    {/* Balance Check */}
                    <div className={`mb-8 rounded-2xl border p-5 ${balanceOk ? "border-primary/30 bg-primary/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className={`font-mono text-xs font-bold uppercase tracking-wider ${balanceOk ? "text-primary" : "text-amber-500"}`}>
                            Katılım Şartı
                          </div>
                          <div className="mt-1 text-sm text-foreground font-medium">Cüzdanda en az 1.000₺ Bakiye</div>
                        </div>
                        <Wallet className={`h-6 w-6 ${balanceOk ? "text-primary" : "text-amber-500"}`} />
                      </div>
                      
                      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-background border border-white/5">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${balanceOk ? "bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" : "bg-amber-500"}`} 
                          style={{ width: `${balancePercent}%` }} 
                        />
                      </div>
                      
                      <div className="mt-3 flex items-center justify-between text-xs font-mono">
                        <span className="text-muted-foreground">Mevcut: <strong className="text-foreground">₺{balance.toLocaleString("tr-TR")}</strong></span>
                        <span className="text-muted-foreground">Hedef: ₺1.000</span>
                      </div>
                      
                      {!balanceOk && (
                        <div className="mt-4 pt-4 border-t border-amber-500/20">
                          <p className="text-xs text-amber-500/80 mb-3">
                            *Bu tutar sizden kesilmez, başvurudan sonra kendi lisans alımlarınızda kullanabilirsiniz.
                          </p>
                          <Button asChild size="sm" className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold">
                            <Link to="/cuzdan">Hemen Bakiye Yükle</Link>
                          </Button>
                        </div>
                      )}
                    </div>

                    {rejected && mine?.application?.admin_note && (
                      <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
                        <div className="font-bold text-destructive text-sm mb-1">Önceki Başvuru Reddedildi</div>
                        <p className="text-xs text-destructive/80">{mine.application.admin_note}</p>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Firma / Rumuz Adı *</label>
                          <Input
                            placeholder="Örn: Siber Bilişim"
                            value={form.company}
                            maxLength={120}
                            onChange={(e) => setForm({ ...form, company: e.target.value })}
                            className="bg-background/50 h-12"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">İletişim Telefonu *</label>
                          <Input
                            placeholder="05XX XXX XX XX"
                            value={form.phone}
                            maxLength={40}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            className="bg-background/50 h-12"
                          />
                        </div>
                      </div>
                      
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Satış Kanalı</label>
                          <Input
                            placeholder="Instagram, Discord, Web Site..."
                            value={form.channel}
                            maxLength={60}
                            onChange={(e) => setForm({ ...form, channel: e.target.value })}
                            className="bg-background/50 h-12"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Aylık Tahmini Ciro (₺)</label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="Örn: 5000"
                            value={form.volume}
                            onChange={(e) => setForm({ ...form, volume: e.target.value })}
                            className="bg-background/50 h-12"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2">
                        <label className="text-xs font-medium text-muted-foreground">Ek Notlar & Kendinden Bahset</label>
                        <Textarea
                          placeholder="Müşteri kitleniz, hedefleriniz..."
                          rows={4}
                          maxLength={1000}
                          value={form.note}
                          onChange={(e) => setForm({ ...form, note: e.target.value })}
                          className="bg-background/50 resize-none"
                        />
                      </div>

                      <Button 
                        onClick={submit} 
                        disabled={sending || !balanceOk} 
                        size="lg"
                        className="w-full h-14 mt-4 text-base font-bold shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:scale-[1.02] transition-all"
                      >
                        {sending ? "Gönderiliyor..." : "Başvuruyu Gönder"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

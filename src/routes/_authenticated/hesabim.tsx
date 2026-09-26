import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DeliveryPayload, type DeliveryType } from "@/components/DeliveryPayload";
import { toast } from "sonner";
import { Copy, Download, KeyRound, Search, ShoppingCart, User as UserIcon, LogOut, Filter, Wallet, Heart, Gift, Bell, ShieldCheck, RefreshCw, Users, Trophy, Palette, Sparkles, Film, LayoutDashboard } from "lucide-react";
import { AccountHero } from "@/components/account/AccountHero";
import { ActivityFeed } from "@/components/account/ActivityFeed";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TierCard } from "@/components/TierCard";
import { AVATARS, UserAvatar } from "@/components/UserAvatar";
import { SubscriptionsBlock } from "@/components/SubscriptionsBlock";
import { BadgesBlock } from "@/components/BadgesBlock";
import { DailyStreakCard } from "@/components/DailyStreakCard";
import { AffiliateBlock } from "@/components/AffiliateBlock";
import { TransferButton } from "@/components/TransferButton";
import { getMyAiSubscription } from "@/lib/ai-subscriptions.functions";
import { getMyEmailVerificationStatus, resendMyEmailVerificationCode, verifyEmailCode } from "@/lib/auth.functions";
import { listMyAiJobs } from "@/lib/ai-tools.functions";
import { ReviewPromptCard } from "@/components/ReviewPromptCard";
import {
  listMyOrders,
  getMyAvatar,
  updateMyAvatar,
  updateMyTelegramHandle,
  changeMyPassword,
  getMyWalletBalance,
  getTelegramStatus,
  generateTelegramVerifyCode,
  type MyOrder,
} from "@/lib/hesabim.functions";

export const Route = createFileRoute("/_authenticated/hesabim")({
  component: MyAccount,
  head: () => ({
    meta: [
      { title: "Hesabım — SiberPHP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const STATUS_LABEL: Record<string, { l: string; c: string; bg: string }> = {
  pending: { l: "havale bekleniyor", c: "text-warn", bg: "bg-warn/10 border-warn/30" },
  reviewing: { l: "inceleniyor", c: "text-cyan", bg: "bg-cyan/10 border-cyan/30" },
  approved: { l: "onaylı", c: "text-primary", bg: "bg-primary/10 border-primary/30" },
  rejected: { l: "reddedildi", c: "text-destructive", bg: "bg-destructive/10 border-destructive/30" },
};

type Order = MyOrder;

function MyAccount() {
  const { user, signOut } = useAuth();
  const subFn = useServerFn(getMyAiSubscription);
  const jobsFn = useServerFn(listMyAiJobs);
  const ordersFn = useServerFn(listMyOrders);
  const { data: orders, isLoading, isError: ordersFailed, refetch: retryOrders } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: () => ordersFn(),
    retry: 2,
  });

  const { data: aiSub } = useQuery({
    queryKey: ["my-ai-sub", user?.id],
    enabled: !!user,
    queryFn: () => subFn(),
    retry: 2,
  });

  const approvedKeys = useMemo(
    () =>
      (orders ?? [])
        .filter((o) => o.status === "approved")
        .flatMap((o) =>
          (o.keys ?? [])
            .map((k) => k.license_key)
            .filter((k): k is NonNullable<typeof k> => !!k?.key_value)
            .map((k) => ({
              product: k.product?.name ?? o.product?.name ?? "-",
              productSlug: k.product?.slug ?? o.product?.slug ?? "",
              deliveryType: (k.product?.delivery_type ?? o.product?.delivery_type ?? "key") as DeliveryType,
              keyValue: k.key_value,
              activationToken: k.activation_token,
              expiresAt: k.expires_at,
              durationDays: k.duration_days,
              date: o.created_at,
              orderId: o.id,
            })),
        ),
    [orders],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-12">
      <div className="min-w-0">
        <div className="font-mono text-[11px] text-muted-foreground truncate">
          $ whoami · <span className="text-foreground/80">{user?.email}</span>
        </div>
        <h1 className="mt-1.5 font-mono text-2xl md:text-3xl neon-text">Hesabım</h1>
      </div>

      <div className="mt-4">
        <AccountHero
          userId={user?.id ?? ""}
          email={user?.email ?? ""}
          aiCredits={
            aiSub ? { remaining: aiSub.credits_remaining, total: aiSub.credits_total } : null
          }
        />
      </div>

      <Tabs defaultValue="overview" className="mt-6 md:mt-8">
        <TabsList className="grid w-full grid-cols-4 sm:grid-cols-8 font-mono h-auto">
          <TabsTrigger value="overview" className="text-[11px] sm:text-sm py-2">
            <LayoutDashboard className="mr-1 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">genel</span>
          </TabsTrigger>
          <TabsTrigger value="orders" className="text-[11px] sm:text-sm py-2">
            <ShoppingCart className="mr-1 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">siparişler</span>
          </TabsTrigger>
          <TabsTrigger value="keys" className="text-[11px] sm:text-sm py-2">
            <KeyRound className="mr-1 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">anahtarlar</span>
          </TabsTrigger>
          <TabsTrigger value="videos" className="text-[11px] sm:text-sm py-2">
            <Film className="mr-1 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">videolar</span>
          </TabsTrigger>
          <TabsTrigger value="subs" className="text-[11px] sm:text-sm py-2">
            <RefreshCw className="mr-1 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">abonelikler</span>
          </TabsTrigger>
          <TabsTrigger value="partner" className="text-[11px] sm:text-sm py-2">
            <Users className="mr-1 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">partner</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="text-[11px] sm:text-sm py-2">
            <UserIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">profil</span>
          </TabsTrigger>
          <TabsTrigger value="badges" className="text-[11px] sm:text-sm py-2">
            <Trophy className="mr-1 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">rozetler</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-4">
          <ReviewPromptCard />
          {/* hızlı erişim */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 font-mono">
            <div className="glass-card rounded-md px-3 py-2.5">
              <div className="text-muted-foreground text-[10px] uppercase tracking-wider">sipariş</div>
              <div className="text-lg neon-text leading-tight">{orders?.length ?? 0}</div>
            </div>
            <div className="glass-card rounded-md px-3 py-2.5">
              <div className="text-muted-foreground text-[10px] uppercase tracking-wider">anahtar</div>
              <div className="text-lg neon-text leading-tight">{approvedKeys.length}</div>
            </div>
            <Link
              to="/hesabim/lisanslar"
              className="glass-card corner-cut flex items-center gap-3 rounded-md px-3 py-2.5 hover:neon-glow transition"
            >
              <KeyRound className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-muted-foreground text-[10px] uppercase tracking-wider">lisanslarım</div>
                <div className="text-primary text-sm truncate">$ HWID & süre →</div>
              </div>
            </Link>
            <Link
              to="/favorilerim"
              className="glass-card corner-cut flex items-center gap-3 rounded-md px-3 py-2.5 hover:neon-glow transition"
            >
              <Heart className="h-4 w-4 text-destructive fill-destructive shrink-0" />
              <div className="min-w-0">
                <div className="text-muted-foreground text-[10px] uppercase tracking-wider">favoriler</div>
                <div className="text-primary text-sm truncate">$ favorilerin →</div>
              </div>
            </Link>
            <Link
              to="/davet"
              className="glass-card corner-cut flex items-center gap-3 rounded-md px-3 py-2.5 hover:neon-glow transition"
            >
              <Gift className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-muted-foreground text-[10px] uppercase tracking-wider">davet et & ₺25 kazan</div>
                <div className="text-primary text-sm truncate">$ arkadaşını davet et →</div>
              </div>
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <TierCard />
            <DailyStreakCard />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ActivityFeed userId={user?.id ?? ""} />
            <div className="space-y-3">
              <BadgesBlock />
              <Link
                to="/gorevler"
                className="glass-card corner-cut rounded-md p-4 flex items-center gap-3 hover:border-primary/60 transition group"
              >
                <Trophy className="h-8 w-8 text-primary shrink-0 group-hover:scale-110 transition" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    görevler & liderlik
                  </div>
                  <div className="font-semibold">Puan kazan · Kupona çevir</div>
                  <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                    görevleri tamamla · aylık top 20'ye gir
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          {ordersFailed ? (
            <div className="mb-3 flex items-center justify-between gap-3 font-mono text-sm text-muted-foreground">
              <span>Siparişler geçici olarak yüklenemedi.</span>
              <Button variant="outline" size="sm" onClick={() => void retryOrders()}>yeniden dene</Button>
            </div>
          ) : null}
          <OrdersTab orders={orders ?? []} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="keys" className="mt-6">
          <KeysTab keys={approvedKeys} />
        </TabsContent>
        <TabsContent value="videos" className="mt-6">
          <MyVideosTab fetchJobs={() => jobsFn() as Promise<AiJob[]>} />
        </TabsContent>
        <TabsContent value="subs" className="mt-6">
          <SubscriptionsBlock />
        </TabsContent>
        <TabsContent value="partner" className="mt-6">
          <AffiliateBlock />
        </TabsContent>
        <TabsContent value="profile" className="mt-6">
          <ProfileTab 
            userId={user?.id ?? ""} 
            email={user?.email ?? ""} 
            telegramHandle={(user as any)?.telegram_handle ?? ""}
            onSignOut={signOut} 
          />
        </TabsContent>
        <TabsContent value="badges" className="mt-6">
          <BadgesBlock />
        </TabsContent>
      </Tabs>
    </div>
  );
}


function OrdersTab({ orders, isLoading }: { orders: Order[]; isLoading: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    const lc = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (!lc) return true;
      const inItems = (o.items ?? []).some((it) =>
        it.product_name_snapshot.toLowerCase().includes(lc),
      );
      return (
        (o.product?.name ?? "").toLowerCase().includes(lc) ||
        o.reference_code.toLowerCase().includes(lc) ||
        inItems
      );
    });
  }, [orders, q, status]);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ürün adı veya referans kodu…"
            className="pl-9 font-mono text-sm"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto rounded-md border border-border/60 bg-background/50 p-1 font-mono text-xs">
          <Filter className="h-3.5 w-3.5 text-muted-foreground ml-1 shrink-0" />
          {[
            { v: "all", l: "hepsi" },
            { v: "pending", l: "bekleyen" },
            { v: "reviewing", l: "inceleniyor" },
            { v: "approved", l: "onaylı" },
            { v: "rejected", l: "reddedildi" },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setStatus(f.v)}
              className={`shrink-0 rounded px-2.5 py-1 transition ${
                status === f.v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {isLoading && (
          <div className="glass-card rounded-lg p-8 text-center font-mono text-sm text-muted-foreground animate-pulse">
            yükleniyor…
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="glass-card rounded-lg p-8 text-center font-mono text-muted-foreground">
            {orders.length === 0 ? (
              <>
                henüz sipariş yok ·{" "}
                <Link to="/urunler" className="text-primary">
                  ürünlere göz at
                </Link>
              </>
            ) : (
              "filtreye uyan sipariş yok"
            )}
          </div>
        )}
        {filtered.map((o) => {
          const s = STATUS_LABEL[o.status] ?? STATUS_LABEL.pending;
          const validKeys = (o.keys ?? [])
            .map((k) => k.license_key)
            .filter((k): k is NonNullable<typeof k> => !!k?.key_value);
          const itemCount = (o.items ?? []).reduce((sum, it) => sum + it.quantity, 0);
          const title =
            o.product?.name ??
            (itemCount > 0 ? `Sepet siparişi · ${itemCount} ürün` : "—");
          return (
            <div key={o.id} className="glass-card rounded-lg p-3 sm:p-4">
              <div className="font-mono text-sm space-y-2">
                {/* top row: product name + status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold break-words leading-snug">{title}</div>
                      {(o.items ?? []).length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                        {(o.items ?? []).map((it, i) => (
                          <li key={i} className="truncate">
                            <span className="text-primary/60">·</span> {it.product_name_snapshot}
                            {it.quantity > 1 ? ` ×${it.quantity}` : ""}
                            {it.warranty && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-primary/80">
                                <ShieldCheck className="inline h-3 w-3" />
                                garanti{it.warranty_label ? ` · ${it.warranty_label}` : ""}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-0.5 text-[11px] text-muted-foreground break-all">
                      ref: {o.reference_code} ·{" "}
                      {new Date(o.created_at).toLocaleDateString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  <div className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase whitespace-nowrap ${s.bg} ${s.c}`}>
                    {s.l}
                  </div>
                </div>
                {/* bottom row: price + detail button */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
                  <div className="neon-text text-base font-bold">
                    ₺{Number(o.price_try).toLocaleString("tr-TR")}
                  </div>
                  <div className="flex items-center gap-2">
                    {o.status === "approved" && (
                      <>
                        <TransferButton orderId={o.id} />
                      </>
                    )}

                    <Button asChild size="sm" variant="outline" className="font-mono h-8 text-xs">
                      <Link to="/odeme/$orderId" params={{ orderId: o.id }}>
                        detay →
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
              {validKeys.length > 0 && (
                <div className="mt-3 space-y-2">
                  {validKeys.map((lk, i) => {
                    const dt = (lk.product?.delivery_type ?? o.product?.delivery_type ?? "key") as DeliveryType;
                    return (
                      <div key={i}>
                        {validKeys.length > 1 && lk.product?.name && (
                          <div className="mb-1 font-mono text-[10px] text-primary/70">
                            &gt; {lk.product.name}
                          </div>
                        )}
                        <DeliveryPayload
                          deliveryType={dt}
                          keyValue={lk.key_value}
                          activationToken={lk.activation_token}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type KeyRow = {
  product: string;
  productSlug: string;
  deliveryType: DeliveryType;
  keyValue: string;
  activationToken: string | null;
  expiresAt: string | null;
  durationDays: number | null;
  date: string;
  orderId: string;
};

function KeysTab({ keys }: { keys: KeyRow[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const lc = q.trim().toLowerCase();
    if (!lc) return keys;
    return keys.filter(
      (k) => k.product.toLowerCase().includes(lc) || k.keyValue.toLowerCase().includes(lc),
    );
  }, [keys, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, KeyRow[]>();
    for (const k of filtered) {
      const arr = map.get(k.product) ?? [];
      arr.push(k);
      map.set(k.product, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const downloadAll = () => {
    if (filtered.length === 0) return;
    const lines = filtered.map(
      (k) =>
        `# ${k.product} · ${new Date(k.date).toLocaleDateString("tr-TR")}\n${
          k.deliveryType === "link_token" && k.activationToken
            ? `https://siberlisans.lovable.app/aktivasyon/${k.activationToken}`
            : k.keyValue
        }`,
    );
    const blob = new Blob([lines.join("\n\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `siberphp-anahtarlar-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`[✓] ${filtered.length} anahtar indirildi`);
  };

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ürün veya anahtar ara…"
            className="pl-9 font-mono text-sm"
          />
        </div>
        <Button variant="outline" size="sm" onClick={downloadAll} disabled={filtered.length === 0} className="font-mono">
          <Download className="mr-1.5 h-3.5 w-3.5" /> tümünü indir (.txt)
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        {grouped.length === 0 && (
          <div className="glass-card rounded-lg p-8 text-center font-mono text-muted-foreground">
            {keys.length === 0 ? "henüz teslim edilmiş anahtar yok" : "arama sonucu bulunamadı"}
          </div>
        )}
        {grouped.map(([product, rows]) => (
          <div key={product} className="glass-card rounded-lg p-4">
            <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 mb-3">
              <div className="font-mono text-sm font-semibold neon-text truncate">{product}</div>
              <span className="font-mono text-[10px] text-muted-foreground">{rows.length} adet</span>
            </div>
            <div className="space-y-2">
              {rows.map((k, i) => (
                <KeyRowItem key={`${k.orderId}-${i}`} row={k} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyRowItem({ row }: { row: KeyRow }) {
  const isToken = row.deliveryType === "link_token" && !!row.activationToken;
  const display = isToken
    ? `https://siberlisans.lovable.app/aktivasyon/${row.activationToken}`
    : row.keyValue;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(display);
      toast.success("[✓] kopyalandı");
    } catch {
      toast.error("[!] kopyalanamadı");
    }
  };

  // süre bilgisi
  const exp = row.expiresAt ? new Date(row.expiresAt) : null;
  const now = Date.now();
  const msLeft = exp ? exp.getTime() - now : null;
  const daysLeft = msLeft != null ? Math.ceil(msLeft / 86_400_000) : null;
  const expired = daysLeft != null && daysLeft <= 0;
  const soon = daysLeft != null && daysLeft > 0 && daysLeft <= 7;
  const totalDays = row.durationDays ?? (exp ? Math.max(1, Math.round((exp.getTime() - new Date(row.date).getTime()) / 86_400_000)) : null);
  const pct = exp && totalDays ? Math.max(0, Math.min(100, (msLeft! / (totalDays * 86_400_000)) * 100)) : null;
  const barColor = expired ? "bg-destructive" : soon ? "bg-warn" : "bg-primary";
  const labelColor = expired ? "text-destructive" : soon ? "text-warn" : "text-muted-foreground";

  return (
    <div className="rounded-md border border-border/50 bg-background/40 p-2 font-mono text-xs space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate">
          <span className="text-muted-foreground mr-2">{isToken ? "link:" : "key:"}</span>
          <span className="text-foreground break-all">{display}</span>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {new Date(row.date).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })}
        </span>
        <Button size="sm" variant="ghost" onClick={copy} className="h-7 w-7 p-0 shrink-0">
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      {exp && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            {pct != null && (
              <div className="h-1 rounded-full bg-border/40 overflow-hidden">
                <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
              </div>
            )}
            <div className={`mt-0.5 text-[10px] ${labelColor}`}>
              {expired
                ? `süresi doldu · ${exp.toLocaleDateString("tr-TR")}`
                : `${daysLeft} gün kaldı · ${exp.toLocaleDateString("tr-TR")}`}
            </div>
          </div>
          {(soon || expired) && row.productSlug && (
            <Button asChild size="sm" variant="outline" className="h-7 shrink-0 text-[10px] font-mono neon-glow">
              <Link to="/urun/$slug" params={{ slug: row.productSlug }}>yenile →</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileTab({ userId, email, telegramHandle, onSignOut }: { userId: string; email: string; telegramHandle?: string; onSignOut: () => void }) {
  const [telegram, setTelegram] = useState(telegramHandle || "");
  const [tgSaving, setTgSaving] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);

  const avatarFn = useServerFn(getMyAvatar);
  const updateAvatarFn = useServerFn(updateMyAvatar);
  const updateTelegramFn = useServerFn(updateMyTelegramHandle);
  const changePasswordFn = useServerFn(changeMyPassword);
  const verificationStatusFn = useServerFn(getMyEmailVerificationStatus);
  const resendVerificationFn = useServerFn(resendMyEmailVerificationCode);
  const verifyEmailFn = useServerFn(verifyEmailCode);
  const tgStatusFn = useServerFn(getTelegramStatus);
  const generateTgCodeFn = useServerFn(generateTelegramVerifyCode);

  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ["profile-avatar", userId],
    enabled: !!userId,
    queryFn: () => avatarFn(),
  });
  const { data: emailVerification, refetch: refetchEmailVerification } = useQuery({
    queryKey: ["email-verification", userId],
    enabled: !!userId,
    queryFn: () => verificationStatusFn(),
  });
  const { data: tgStatus, refetch: refetchTgStatus } = useQuery({
    queryKey: ["telegram-status", userId],
    enabled: !!userId,
    queryFn: () => tgStatusFn(),
  });
  const [tgPairing, setTgPairing] = useState(false);

  const resendVerification = async () => {
    setVerificationBusy(true);
    try {
      const result = await resendVerificationFn();
      if (!result.ok) throw new Error(result.error);
      if (result.verified) return toast.success("[✓] e-posta zaten doğrulanmış");
      toast.success("[✓] 6 haneli doğrulama kodu e-postana gönderildi");
    } catch (e) {
      toast.error(`[!] ${(e as Error).message}`);
    } finally {
      setVerificationBusy(false);
    }
  };

  const confirmEmail = async () => {
    if (!/^\d{6}$/.test(verificationCode)) return toast.error("[!] 6 haneli doğrulama kodunu gir");
    setVerificationBusy(true);
    try {
      const result = await verifyEmailFn({ data: { email, code: verificationCode } });
      if (!result.ok) throw new Error(result.error);
      setVerificationCode("");
      await refetchEmailVerification();
      toast.success("[✓] e-posta adresin doğrulandı");
    } catch (e) {
      toast.error(`[!] ${(e as Error).message}`);
    } finally {
      setVerificationBusy(false);
    }
  };

  const pickAvatar = async (id: string) => {
    if (!userId) return;
    setAvatarSaving(true);
    try {
      await updateAvatarFn({ data: { avatarId: id } });
      toast.success("[✓] avatar güncellendi");
      refetchProfile();
    } catch (e) {
      toast.error(`[!] ${(e as Error).message}`);
    } finally {
      setAvatarSaving(false);
    }
  };

  const generateTgCode = async () => {
    setTgPairing(true);
    try {
      await generateTgCodeFn();
      await refetchTgStatus();
      toast.success("[✓] eşleştirme kodu oluşturuldu");
    } catch (e) {
      toast.error(`[!] ${(e as Error).message}`);
    } finally {
      setTgPairing(false);
    }
  };

  const changePw = async () => {
    if (pw.length < 6) return toast.error("[!] şifre en az 6 karakter olmalı");
    if (pw !== pw2) return toast.error("[!] şifreler eşleşmiyor");
    setSaving(true);
    try {
      await changePasswordFn({ data: { password: pw } });
      setPw("");
      setPw2("");
      toast.success("[✓] şifre güncellendi");
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes("2FA")) {
        toast.error("[!] şifre değişikliği için önce 2FA doğrulaması gerekli");
        window.location.href = "/guvenlik";
        return;
      }
      toast.error(`[!] ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const updateTelegram = async () => {
    setTgSaving(true);
    try {
      await updateTelegramFn({ data: { telegramHandle: telegram } });
      toast.success("[✓] telegram güncellendi");
    } catch (e) {
      toast.error(`[!] ${(e as Error).message}`);
    } finally {
      setTgSaving(false);
    }
  };

  const currentAvatarId = profile?.avatar_id ?? null;

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-5">
        <div className="flex items-center gap-3">
          <UserAvatar id={currentAvatarId} size={48} />
          <div className="min-w-0">
            <div className="font-mono text-xs text-muted-foreground">$ id --user</div>
            <div className="font-mono text-sm break-all">{email}</div>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-lg p-5">
        <div className="flex items-center gap-2 font-mono text-sm font-semibold">
          <ShieldCheck className={`h-4 w-4 ${emailVerification?.verified ? "text-primary" : "text-warn"}`} />
          E-posta Doğrulama
        </div>
        {emailVerification?.verified ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">[✓] {email} adresi doğrulanmış.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="font-mono text-xs text-muted-foreground">
              E-postana gelen 6 haneli kodu gir. Kod 15 dakika geçerlidir.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="font-mono tracking-[0.4em] sm:max-w-48"
              />
              <Button size="sm" disabled={verificationBusy} onClick={confirmEmail} className="font-mono">
                {verificationBusy ? "işleniyor…" : "> kodu doğrula"}
              </Button>
              <Button size="sm" variant="outline" disabled={verificationBusy} onClick={resendVerification} className="font-mono">
                kodu tekrar gönder
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="glass-card rounded-lg p-5">
        <div className="flex items-center gap-2 font-mono text-sm font-semibold">
          <ShieldCheck className={`h-4 w-4 ${tgStatus?.chat_id ? "text-primary" : "text-warn"}`} />
          Telegram Bildirimleri
        </div>
        {tgStatus?.chat_id ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            [✓] Telegram hesabınız başarıyla eşleştirildi. (ID: {tgStatus.chat_id})
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="font-mono text-xs text-muted-foreground">
              Şifre sıfırlama, yeni sipariş veya admin mesajlarını doğrudan Telegram'dan alın.
            </p>
            {tgStatus?.verify_code ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <p className="font-mono text-xs text-muted-foreground mb-3">
                  Aşağıdaki butona tıklayarak Telegram botumuzu başlatın.
                </p>
                <Button asChild size="sm" className="font-mono">
                  <a href={`https://t.me/siberlisans_infobot?start=${tgStatus.verify_code}`} target="_blank" rel="noreferrer">
                    &gt; Telegram'ı Aç
                  </a>
                </Button>
                <p className="mt-3 font-mono text-[10px] text-muted-foreground break-all">
                  veya manuel link: https://t.me/siberlisans_infobot?start={tgStatus.verify_code}
                </p>
              </div>
            ) : (
              <Button size="sm" disabled={tgPairing} onClick={generateTgCode} className="font-mono">
                {tgPairing ? "işleniyor…" : "> Eşleştirme Kodu Al"}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="glass-card rounded-lg p-5">
        <div className="font-mono text-sm font-semibold">Avatar Seç</div>
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">
          hacker temalı hazır avatarlardan birini seç · seçim anında kaydedilir
        </div>
        <div className="mt-3 grid grid-cols-6 sm:grid-cols-8 gap-2">
          {AVATARS.map((a) => {
            const selected = currentAvatarId === a.id;
            return (
              <button
                key={a.id}
                type="button"
                disabled={avatarSaving}
                onClick={() => pickAvatar(a.id)}
                className={`group flex flex-col items-center gap-1 rounded-md border p-1.5 transition ${
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border/50 hover:border-primary/50 hover:bg-primary/5"
                } ${avatarSaving ? "opacity-60 cursor-wait" : ""}`}
                title={a.label}
              >
                <UserAvatar id={a.id} size={36} />
                <span className="font-mono text-[9px] text-muted-foreground truncate w-full text-center">
                  {a.label.toLowerCase()}
                </span>
              </button>
            );
          })}
        </div>
      </div>


      <div className="glass-card rounded-lg p-5">
        <div className="font-mono text-sm font-semibold">Şifre Değiştir</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input
            type="password"
            placeholder="yeni şifre"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="font-mono text-sm"
          />
          <Input
            type="password"
            placeholder="tekrar"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        <Button
          size="sm"
          onClick={changePw}
          disabled={saving || !pw || !pw2}
          className="mt-3 font-mono"
        >
          {saving ? "kaydediliyor…" : "> şifreyi güncelle"}
        </Button>
      </div>

      <div className="glass-card rounded-lg p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Güvenlik & 2FA
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
            iki adımlı doğrulama, oturum güvenliği, hassas işlem kilitleri
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="font-mono self-start sm:self-auto shrink-0 border-primary/40 text-primary hover:bg-primary/10">
          <Link to="/guvenlik">{"> "}yönet</Link>
        </Button>
      </div>


      <div className="glass-card rounded-lg p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold">Bildirim Tercihleri</div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
            hangi bildirimleri almak istediğinizi seçin
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="font-mono self-start sm:self-auto shrink-0">
          <Link to="/bildirimler"><Bell className="mr-1.5 h-3.5 w-3.5" /> yönet</Link>
        </Button>
      </div>

      <div className="glass-card rounded-lg p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-sm font-semibold">
            <Palette className="h-4 w-4 text-primary" /> Tema
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
            koyu (cyber neon) veya açık (beyaz / mavimsi) tema arasında geçiş yap
          </div>
        </div>
        <ThemeToggle className="self-start sm:self-auto shrink-0 border border-border/60" />
      </div>

      <div className="glass-card rounded-lg p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold">Oturumu Kapat</div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
            tüm cihazlarda çıkış için tekrar giriş yapmanız gerekir.
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onSignOut} className="font-mono self-start sm:self-auto shrink-0">
          <LogOut className="mr-1.5 h-3.5 w-3.5" /> çıkış
        </Button>
      </div>
    </div>
  );
}

function WalletBalance() {
  const { user } = useAuth();
  const walletFn = useServerFn(getMyWalletBalance);
  const { data } = useQuery({
    queryKey: ["wallet", user?.id],
    enabled: !!user,
    queryFn: () => walletFn(),
    refetchInterval: 30000,
  });
  const n = Number(data?.balance_try ?? 0);
  return <>{n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</>;
}


type AiJob = {
  id: string;
  kind: string;
  prompt: string;
  params: { duration?: number; aspect?: string; quality?: string } | null;
  cost_try: number | null;
  status: string;
  result_url: string | null;
  error: string | null;
  created_at: string;
};

function MyVideosTab({ fetchJobs }: { fetchJobs: () => Promise<AiJob[]> }) {
  const { user } = useAuth();
  const { data: jobs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["my-ai-jobs", user?.id],
    enabled: !!user,
    queryFn: () => fetchJobs() as Promise<AiJob[]>,
    refetchInterval: 15000,
    retry: 2,
  });

  const videos = useMemo(
    () => jobs.filter((j) => (j.kind ?? "").toLowerCase().startsWith("video")),
    [jobs],
  );

  return (
    <div>
      {isError ? (
        <div className="mb-3 flex items-center justify-between gap-3 font-mono text-sm text-muted-foreground">
          <span>Video işlemleri geçici olarak yüklenemedi.</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>yeniden dene</Button>
        </div>
      ) : null}
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-xs text-muted-foreground">
          $ ./my-videos —— toplam {videos.length}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="font-mono h-8">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> yenile
        </Button>
      </div>

      {isLoading && (
        <div className="glass-card rounded-lg p-8 text-center font-mono text-sm text-muted-foreground animate-pulse">
          yükleniyor…
        </div>
      )}

      {!isLoading && videos.length === 0 && (
        <div className="glass-card rounded-lg p-8 text-center font-mono text-muted-foreground">
          henüz AI video yok ·{" "}
          <Link to="/araclar/video" className="text-primary">video üret →</Link>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {videos.map((j) => {
          const badge =
            j.status === "completed"
              ? "bg-primary/20 text-primary"
              : j.status === "failed"
                ? "bg-destructive/20 text-destructive"
                : "bg-warn/20 text-warn";
          return (
            <div key={j.id} className="glass-card rounded-lg p-3 font-mono text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${badge}`}>{j.status}</span>
                <span className="text-muted-foreground">
                  {new Date(j.created_at).toLocaleString("tr-TR")}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {j.params?.duration ?? "-"}s · {j.params?.aspect ?? "-"} · {j.params?.quality ?? "-"} · ₺
                {Number(j.cost_try ?? 0).toFixed(2)}
              </div>
              <div className="text-foreground/90 line-clamp-3">{j.prompt}</div>

              {j.result_url && (
                <div className="space-y-2">
                  <video
                    src={j.result_url}
                    controls
                    className="w-full rounded-md border border-border/40 bg-black/40"
                  />
                  <div className="flex gap-2">
                    <a
                      href={j.result_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1"
                    >
                      <Button variant="outline" size="sm" className="w-full font-mono h-8">
                        <Download className="mr-1.5 h-3.5 w-3.5" /> indir
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="font-mono h-8"
                      onClick={() => {
                        navigator.clipboard.writeText(j.result_url!);
                        toast.success("Bağlantı kopyalandı");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {j.error && (
                <div className="text-destructive text-[11px]">hata: {j.error}</div>
              )}

              {(j.status === "queued" || j.status === "processing") && !j.result_url && (
                <div className="text-[11px] text-muted-foreground animate-pulse">
                  işleniyor… (bir kaç dakika sürebilir)
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

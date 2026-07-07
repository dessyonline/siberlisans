import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DeliveryPayload, type DeliveryType } from "@/components/DeliveryPayload";
import { toast } from "sonner";
import { Copy, Download, KeyRound, Search, ShoppingCart, User as UserIcon, LogOut, Filter } from "lucide-react";

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

type Order = {
  id: string;
  status: string;
  price_try: number;
  reference_code: string;
  created_at: string;
  product: { name: string; slug: string; delivery_type: string } | null;
  keys: { license_key: { key_value: string; activation_token: string | null } | null }[] | null;
};

function MyAccount() {
  const { user, signOut } = useAuth();
  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, status, price_try, reference_code, created_at, product:products(name, slug, delivery_type), keys:order_keys(license_key:license_keys(key_value, activation_token))"
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Order[];
    },
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
              product: o.product?.name ?? "-",
              productSlug: o.product?.slug ?? "",
              deliveryType: (o.product?.delivery_type ?? "key") as DeliveryType,
              keyValue: k.key_value,
              activationToken: k.activation_token,
              date: o.created_at,
              orderId: o.id,
            })),
        ),
    [orders],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-muted-foreground">$ whoami · {user?.email}</div>
          <h1 className="mt-2 font-mono text-2xl md:text-3xl neon-text">Hesabım</h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs">
          <div className="text-right">
            <div className="text-muted-foreground">toplam sipariş</div>
            <div className="text-lg neon-text">{orders?.length ?? 0}</div>
          </div>
          <div className="text-right">
            <div className="text-muted-foreground">aktif anahtar</div>
            <div className="text-lg neon-text">{approvedKeys.length}</div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="orders" className="mt-8">
        <TabsList className="grid w-full grid-cols-3 font-mono">
          <TabsTrigger value="orders" className="text-xs sm:text-sm">
            <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> siparişler
          </TabsTrigger>
          <TabsTrigger value="keys" className="text-xs sm:text-sm">
            <KeyRound className="mr-1.5 h-3.5 w-3.5" /> anahtarlar
          </TabsTrigger>
          <TabsTrigger value="profile" className="text-xs sm:text-sm">
            <UserIcon className="mr-1.5 h-3.5 w-3.5" /> profil
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-6">
          <OrdersTab orders={orders ?? []} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="keys" className="mt-6">
          <KeysTab keys={approvedKeys} />
        </TabsContent>
        <TabsContent value="profile" className="mt-6">
          <ProfileTab email={user?.email ?? ""} onSignOut={signOut} />
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
      return (
        (o.product?.name ?? "").toLowerCase().includes(lc) ||
        o.reference_code.toLowerCase().includes(lc)
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
          const lk = o.keys?.[0]?.license_key;
          const dt = (o.product?.delivery_type ?? "key") as DeliveryType;
          return (
            <div key={o.id} className="glass-card rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold break-words">{o.product?.name}</div>
                  <div className="text-xs text-muted-foreground break-all">
                    ref: {o.reference_code} ·{" "}
                    {new Date(o.created_at).toLocaleDateString("tr-TR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <div className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase ${s.bg} ${s.c}`}>
                  {s.l}
                </div>
                <div className="neon-text shrink-0">₺{Number(o.price_try).toLocaleString("tr-TR")}</div>
                <Button asChild size="sm" variant="outline" className="font-mono shrink-0">
                  <Link to="/odeme/$orderId" params={{ orderId: o.id }}>
                    detay →
                  </Link>
                </Button>
              </div>
              {lk?.key_value && (
                <div className="mt-3">
                  <DeliveryPayload
                    deliveryType={dt}
                    keyValue={lk.key_value}
                    activationToken={lk.activation_token}
                  />
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
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 p-2 font-mono text-xs">
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
  );
}

function ProfileTab({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);

  const changePw = async () => {
    if (pw.length < 6) return toast.error("[!] şifre en az 6 karakter olmalı");
    if (pw !== pw2) return toast.error("[!] şifreler eşleşmiyor");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) return toast.error(`[!] ${error.message}`);
    setPw("");
    setPw2("");
    toast.success("[✓] şifre güncellendi");
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-5">
        <div className="font-mono text-xs text-muted-foreground">$ id --user</div>
        <div className="mt-1 font-mono text-sm break-all">{email}</div>
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

      <div className="glass-card rounded-lg p-5 flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-sm font-semibold">Oturumu Kapat</div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
            tüm cihazlarda çıkış için tekrar giriş yapmanız gerekir.
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onSignOut} className="font-mono">
          <LogOut className="mr-1.5 h-3.5 w-3.5" /> çıkış
        </Button>
      </div>
    </div>
  );
}

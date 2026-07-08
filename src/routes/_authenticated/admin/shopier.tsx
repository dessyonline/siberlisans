import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { registerShopierWebhook, listShopierWebhooks } from "@/lib/shopier.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/shopier")({
  component: ShopierAdmin,
});

function ShopierAdmin() {
  const registerFn = useServerFn(registerShopierWebhook);
  const listFn = useServerFn(listShopierWebhooks);
  const [url, setUrl] = useState("https://siberlisans.lovable.app/api/public/hooks/shopier");
  const [event, setEvent] = useState("order.created");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useQuery({
    queryKey: ["shopier-webhooks"],
    queryFn: () => listFn(),
  });

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <div>
        <h1 className="font-mono text-2xl neon-text">Shopier Entegrasyonu</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ödeme akışı: Müşteri "Shopier ile Öde" butonuna tıklar → Shopier'de ödeme yapar →
          buradaki webhook siparişi otomatik onaylar ve key atar.
          <br />
          Ürün başına Shopier link'ini <span className="text-primary">Admin › Ürünler</span> altındaki
          "shopier_url" alanına girmelisin.
        </p>
      </div>

      <section className="glass-card rounded-lg p-5 space-y-3">
        <h2 className="font-mono text-sm tracking-widest uppercase text-muted-foreground">
          Adım 1 · Webhook Kaydet
        </h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono text-xs" />
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
          >
            <option value="order.created">order.created</option>
            <option value="order.fulfilled">order.fulfilled</option>
          </select>
        </div>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setToken(null);
            try {
              const res = await registerFn({ data: { url, event } });
              if (res.token) {
                setToken(res.token);
                toast.success("Webhook kaydedildi · token aşağıda");
              } else {
                toast.error("Token dönmedi — bu URL için zaten kayıt olabilir");
              }
              list.refetch();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="w-full font-mono"
        >
          {busy ? "kaydediliyor…" : "webhook kaydet ve token al"}
        </Button>
        {token && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
            <div className="text-[10px] tracking-widest text-muted-foreground uppercase mb-1">
              webhook token — bunu bana ver, SHOPIER_WEBHOOK_TOKEN olarak kaydedeyim
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all font-mono text-xs">{token}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(token); toast.success("Kopyalandı"); }}
                className="text-muted-foreground hover:text-primary"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-warn">
              ⚠ Bu token sadece bir kez gösterilir. Şimdi kopyala.
            </p>
          </div>
        )}
      </section>

      <section className="glass-card rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-sm tracking-widest uppercase text-muted-foreground">
            Kayıtlı Webhook'lar
          </h2>
          <Button size="sm" variant="ghost" onClick={() => list.refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> yenile
          </Button>
        </div>
        {list.isLoading && <p className="text-xs text-muted-foreground">yükleniyor…</p>}
        {list.error && <p className="text-xs text-destructive">{(list.error as Error).message}</p>}
        {list.data && Array.isArray((list.data as any).data ?? list.data) && (
          <ul className="space-y-2">
            {((list.data as any).data ?? list.data).map((w: any) => (
              <li key={w.id} className="rounded-md border border-border/50 p-3 font-mono text-xs">
                <div className="text-primary">{w.event}</div>
                <div className="text-muted-foreground break-all">{w.url}</div>
                <div className="text-[10px] text-muted-foreground opacity-60">id: {w.id}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

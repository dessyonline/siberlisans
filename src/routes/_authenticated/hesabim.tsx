import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hesabim")({
  component: MyAccount,
  head: () => ({ meta: [{ title: "Hesabım — SiberPHP" }] }),
});

const STATUS_LABEL: Record<string, { l: string; c: string }> = {
  pending: { l: "havale bekleniyor", c: "text-warn" },
  reviewing: { l: "inceleniyor", c: "text-cyan" },
  approved: { l: "onaylı", c: "text-primary" },
  rejected: { l: "reddedildi", c: "text-destructive" },
};

function MyAccount() {
  const { user } = useAuth();
  const { data: orders } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, price_try, reference_code, created_at, product:products(name, slug), keys:order_keys(license_key:license_keys(key_value))")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="font-mono text-xs text-muted-foreground">$ whoami · {user?.email}</div>
      <h1 className="mt-2 font-mono text-3xl neon-text">Hesabım</h1>

      <h2 className="mt-8 font-mono text-lg">Siparişlerim</h2>
      <div className="mt-4 space-y-3">
        {(orders ?? []).length === 0 && (
          <div className="glass-card rounded-lg p-8 text-center font-mono text-muted-foreground">
            henüz sipariş yok · <Link to="/urunler" className="text-primary">ürünlere göz at</Link>
          </div>
        )}
        {(orders ?? []).map((o) => {
          const s = STATUS_LABEL[o.status] ?? STATUS_LABEL.pending;
          const key = o.keys?.[0]?.license_key?.key_value;
          return (
            <div key={o.id} className="glass-card rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-sm">
                <div>
                  <div className="font-semibold">{o.product?.name}</div>
                  <div className="text-xs text-muted-foreground">ref: {o.reference_code}</div>
                </div>
                <div className={`text-xs uppercase ${s.c}`}>{s.l}</div>
                <div className="neon-text">₺{Number(o.price_try).toLocaleString("tr-TR")}</div>
                <Button asChild size="sm" variant="outline" className="font-mono">
                  <Link to="/odeme/$orderId" params={{ orderId: o.id }}>detay</Link>
                </Button>
              </div>
              {key && (
                <div className="mt-3 flex items-center gap-2 rounded border border-primary/30 bg-primary/5 px-3 py-2 font-mono text-primary text-sm">
                  <KeyRound className="h-4 w-4" />
                  <code className="flex-1 break-all">{key}</code>
                  <button onClick={() => { navigator.clipboard.writeText(key); toast.success("Kopyalandı"); }}>
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

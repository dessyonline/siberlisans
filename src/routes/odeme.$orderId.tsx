import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { markOrderPaid } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy, Upload, CheckCircle2, Clock, XCircle } from "lucide-react";

export const Route = createFileRoute("/odeme/$orderId")({
  component: Payment,
});

const STATUS: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: "havale bekleniyor", cls: "text-warn", icon: Clock },
  reviewing: { label: "ödeme kontrol ediliyor", cls: "text-cyan", icon: Clock },
  approved: { label: "onaylandı", cls: "text-primary", icon: CheckCircle2 },
  rejected: { label: "reddedildi", cls: "text-destructive", icon: XCircle },
};

function Payment() {
  const { orderId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const markPaidFn = useServerFn(markOrderPaid);

  const { data: order } = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, price_try, reference_code, receipt_path, product:products(name, slug), keys:order_keys(license_key:license_keys(key_value))")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  const { data: bank } = useQuery({
    queryKey: ["bank", "active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const upload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const path = `${user.id}/${orderId}-${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("receipts").upload(path, file, { upsert: true });
      if (error) throw error;
      await markPaidFn({ data: { orderId, receiptPath: path } });
      toast.success("Dekont alındı. İnceleme başlatıldı.");
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center font-mono">
        <p>Bu sayfayı görüntülemek için giriş yapmalısın.</p>
        <Button asChild className="mt-4"><Link to="/auth">giriş</Link></Button>
      </div>
    );
  }
  if (!order) return <div className="p-12 font-mono text-center">yükleniyor…</div>;

  const S = STATUS[order.status] ?? STATUS.pending;
  const deliveredKey = order.keys?.[0]?.license_key?.key_value;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="font-mono text-xs text-muted-foreground">$ ./order --id={orderId.slice(0, 8)}</div>
      <h1 className="mt-2 font-mono text-2xl neon-text">Ödeme Talimatı</h1>

      <div className={`mt-4 glass-card rounded-lg p-4 flex items-center gap-3 font-mono ${S.cls}`}>
        <S.icon className="h-5 w-5" />
        <span className="uppercase text-sm">{S.label}</span>
        <span className="text-muted-foreground text-xs ml-auto">
          {order.product?.name} · ₺{Number(order.price_try).toLocaleString("tr-TR")}
        </span>
      </div>

      {order.status === "approved" && deliveredKey && (
        <div className="mt-6 glass-card rounded-lg p-6 neon-glow">
          <div className="font-mono text-xs text-muted-foreground">$ ./license/deliver</div>
          <h2 className="mt-2 font-mono text-lg">Lisans Anahtarınız</h2>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 font-mono text-primary break-all">
            <code className="flex-1">{deliveredKey}</code>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(deliveredKey); toast.success("Kopyalandı"); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {order.status === "rejected" && (
        <div className="mt-6 glass-card rounded-lg p-6 border-destructive/40">
          <p className="font-mono">Ödemeniz reddedildi. Destek ile iletişime geçiniz.</p>
        </div>
      )}

      {(order.status === "pending" || order.status === "reviewing") && (
        <>
          <div className="mt-6 glass-card rounded-lg p-6">
            <h2 className="font-mono text-lg">Havale Bilgileri</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Aşağıdaki bilgilere <span className="text-primary">tam tutarı</span> transfer edin ve
              açıklama alanına <span className="text-primary">referans kodunu</span> yazın.
            </p>
            <dl className="mt-4 space-y-3 font-mono text-sm">
              <Row label="banka" value={bank?.bank_name ?? "—"} />
              <Row label="alıcı" value={bank?.holder_name ?? "—"} />
              <Row label="IBAN" value={bank?.iban ?? "—"} copyable />
              <Row label="tutar" value={`₺${Number(order.price_try).toLocaleString("tr-TR")}`} copyable />
              <Row label="açıklama / referans" value={order.reference_code} copyable highlight />
            </dl>
          </div>

          <div className="mt-6 glass-card rounded-lg p-6">
            <h2 className="font-mono text-lg">Dekont Yükle</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Havaleyi yaptıktan sonra dekont/makbuz görselini yükleyin (jpg/png/pdf, max 5MB).
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Input
                type="file"
                accept="image/*,application/pdf"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 5 * 1024 * 1024) return toast.error("Dosya 5MB'ı aşamaz");
                  upload(f);
                }}
                className="font-mono"
              />
              <Upload className="h-5 w-5 text-primary" />
            </div>
            {order.receipt_path && (
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                ✓ Yüklenen: {order.receipt_path.split("/").pop()}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value, copyable, highlight }: { label: string; value: string; copyable?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`flex items-center gap-2 ${highlight ? "text-primary neon-text" : ""}`}>
        <span className="break-all">{value}</span>
        {copyable && (
          <button onClick={() => { navigator.clipboard.writeText(value); toast.success("Kopyalandı"); }} className="text-muted-foreground hover:text-primary">
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </dd>
    </div>
  );
}

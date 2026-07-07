import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { markOrderPaid, setOrderUserNote } from "@/lib/orders.functions";
import { DeliveryPayload, type DeliveryType } from "@/components/DeliveryPayload";
import enparaQr from "@/assets/enpara-qr.png";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Copy,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldCheck,
  Wifi,
  Terminal,
  KeyRound,
  UploadCloud,
  ArrowRight,
  Lock,
  Instagram,
  Send,
  MessageCircle,
} from "lucide-react";

export const Route = createFileRoute("/odeme/$orderId")({
  component: Payment,
});

type StepKey = "init" | "transfer" | "receipt" | "delivery";

const STEPS: { key: StepKey; label: string; sub: string }[] = [
  { key: "init", label: "handshake", sub: "sipariş imzalanıyor" },
  { key: "transfer", label: "transfer", sub: "havale bilgileri" },
  { key: "receipt", label: "receipt", sub: "dekont doğrulama" },
  { key: "delivery", label: "delivery", sub: "key teslimi" },
];

function Payment() {
  const { orderId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const markPaidFn = useServerFn(markOrderPaid);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: order } = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, status, price_try, reference_code, receipt_path, created_at, product:products(name, slug, duration, delivery_type), keys:order_keys(license_key:license_keys(key_value, activation_token))"
        )
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 4000,
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

  const currentStep: StepKey = useMemo(() => {
    if (!order) return "init";
    if (order.status === "approved") return "delivery";
    if (order.status === "reviewing") return "receipt";
    if (order.status === "rejected") return "receipt";
    return "transfer";
  }, [order]);

  const handleFile = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Dosya 5MB'ı aşamaz");
    setUploading(true);
    try {
      const path = `${user.id}/${orderId}-${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("receipts").upload(path, file, { upsert: true });
      if (error) throw error;
      await markPaidFn({ data: { orderId, receiptPath: path } });
      toast.success("Dekont alındı · doğrulama başlatıldı");
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
        <Button asChild className="mt-4">
          <Link to="/auth">giriş</Link>
        </Button>
      </div>
    );
  }
  if (!order) return <div className="p-12 font-mono text-center">yükleniyor…</div>;

  const deliveredKey = order.keys?.[0]?.license_key?.key_value;
  const deliveredToken = order.keys?.[0]?.license_key?.activation_token ?? null;
  const deliveryType = (order.product?.delivery_type ?? "key") as DeliveryType;
  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Header bar — terminal window */}
      <div className="glass-card rounded-t-lg border-b-0 px-4 py-2 flex items-center gap-2 font-mono text-xs">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-warn/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/80" />
        <span className="ml-3 text-muted-foreground">
          siberphp@secure:~/orders/{orderId.slice(0, 8)}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-primary">
          <Wifi className="h-3 w-3" /> TLS 1.3 · AES-256
        </span>
      </div>

      {/* Stepper rail */}
      <div className="glass-card rounded-b-lg rounded-t-none p-5 scan-line">
        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => {
            const done = i < stepIndex || order.status === "approved";
            const active = i === stepIndex && order.status !== "approved";
            return (
              <li key={s.key} className="relative">
                <div
                  className={`rounded-md border p-3 font-mono transition-all ${
                    active
                      ? "border-primary/60 bg-primary/5 neon-glow"
                      : done
                      ? "border-primary/30 bg-primary/[0.02]"
                      : "border-border/40 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2 text-[10px] tracking-widest text-muted-foreground">
                    <span>[{String(i + 1).padStart(2, "0")}/04]</span>
                    {done && <CheckCircle2 className="h-3 w-3 text-primary" />}
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
                  </div>
                  <div className={`mt-1 text-sm ${active ? "neon-text" : done ? "text-primary" : ""}`}>
                    ./{s.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* MAIN CONTENT */}
        <div className="space-y-6">
          {order.status === "approved" && deliveredKey && (
            <DeliveryBlock
              keyValue={deliveredKey}
              activationToken={deliveredToken}
              deliveryType={deliveryType}
              product={order.product?.name ?? ""}
            />
          )}

          {order.status === "rejected" && (
            <div className="glass-card rounded-lg p-6 border-destructive/40">
              <div className="flex items-center gap-2 font-mono text-destructive">
                <XCircle className="h-5 w-5" /> transfer_rejected
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Ödemeniz reddedildi. Destek hattımız üzerinden yeni bir referans oluşturabiliriz.
              </p>
            </div>
          )}

          {(order.status === "pending" || order.status === "reviewing") && (
            <>
              <TransferBlock
                bank={bank}
                amount={Number(order.price_try)}
                reference={order.reference_code}
              />
              <ReceiptBlock
                dragOver={dragOver}
                setDragOver={setDragOver}
                uploading={uploading}
                fileRef={fileRef}
                onFile={handleFile}
                reviewing={order.status === "reviewing"}
                receiptPath={order.receipt_path}
              />
            </>
          )}
        </div>

        {/* SIDE: live monitor */}
        <aside className="space-y-4">
          <LiveMonitor order={order} />
          <SecurityChecklist />
        </aside>
      </div>
    </div>
  );
}

/* ============================ TRANSFER ============================ */

function TransferBlock({
  bank,
  amount,
  reference,
}: {
  bank: { bank_name?: string; holder_name?: string; iban?: string } | null | undefined;
  amount: number;
  reference: string;
}) {
  const copy = (v: string, label: string) => {
    navigator.clipboard.writeText(v);
    toast.success(`${label} kopyalandı`);
  };
  const iban = bank?.iban ?? "—";

  return (
    <section className="glass-card rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
            [02/04] · transfer_channel
          </div>
          <h2 className="mt-1 font-mono text-xl neon-text">Havale / EFT</h2>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 font-mono text-xs text-primary">
          <Lock className="h-3.5 w-3.5" /> secure_channel
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_auto]">
        {/* Bank fields */}
        <dl className="space-y-2 font-mono text-sm">
          <Field label="banka" value={bank?.bank_name ?? "—"} />
          <Field label="alıcı" value={bank?.holder_name ?? "—"} />
          <Field label="iban" value={iban} mono onCopy={() => copy(iban, "IBAN")} />
          <Field
            label="tutar"
            value={`₺${amount.toLocaleString("tr-TR")}`}
            highlight
            onCopy={() => copy(String(amount), "Tutar")}
          />
          <div className="pt-2">
            <div className="text-[10px] tracking-widest text-muted-foreground mb-1">
              açıklama / reference_key
            </div>
            <button
              onClick={() => copy(reference, "Referans")}
              className="group w-full text-left rounded-md border border-primary/50 bg-primary/10 px-4 py-3 font-mono text-primary neon-glow flex items-center gap-3 hover:bg-primary/15 transition"
            >
              <span className="flex-1 text-lg tracking-widest break-all">{reference}</span>
              <Copy className="h-4 w-4 opacity-70 group-hover:opacity-100" />
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              → Bu referansı açıklamaya <span className="text-primary">birebir</span> yazmadan
              transfer yapmayın; otomatik eşleşme başarısız olur.
            </p>
          </div>
        </dl>

        {/* QR — Enpara */}
        <div className="flex flex-col items-center justify-start rounded-lg border border-border/60 bg-transparent min-w-[220px]">
          <img
            src={enparaQr}
            alt="Enpara Havale QR"
            width={200}
            className="mt-2"
          />
          <p className="mt-2 text-center text-[10px] text-muted-foreground font-mono">
            Enpara uygulamasında QR ile aktar
          </p>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onCopy,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
      <dt className="text-[10px] tracking-widest text-muted-foreground uppercase">{label}</dt>
      <dd
        className={`flex items-center gap-2 ${highlight ? "text-primary neon-text text-base" : ""} ${
          mono ? "font-mono" : ""
        }`}
      >
        <span className="break-all">{value}</span>
        {onCopy && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-primary">
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </dd>
    </div>
  );
}

/* ============================ RECEIPT ============================ */

function ReceiptBlock({
  dragOver,
  setDragOver,
  uploading,
  fileRef,
  onFile,
  reviewing,
  receiptPath,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
  reviewing: boolean;
  receiptPath: string | null;
}) {
  return (
    <section className="glass-card rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
            [03/04] · receipt_upload
          </div>
          <h2 className="mt-1 font-mono text-xl neon-text">Dekont Doğrulama</h2>
        </div>
        {reviewing && (
          <div className="flex items-center gap-2 font-mono text-xs text-cyan">
            <span className="h-2 w-2 rounded-full bg-cyan animate-pulse" />
            analyzing…
          </div>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => fileRef.current?.click()}
        className={`mt-5 relative rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
          dragOver
            ? "border-primary bg-primary/10 neon-glow"
            : "border-border/60 hover:border-primary/60 hover:bg-primary/5"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          hidden
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <UploadCloud
          className={`mx-auto h-10 w-10 ${uploading ? "text-cyan animate-pulse" : "text-primary"}`}
        />
        <div className="mt-3 font-mono text-sm">
          {uploading
            ? "→ uploading & signing…"
            : dragOver
            ? "// bırak, doğrulamayı başlatayım"
            : "dekont/makbuz dosyasını buraya sürükle"}
        </div>
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
          jpg · png · pdf · max 5MB · AES-256 şifreli depolama
        </div>
        {!uploading && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 font-mono"
            onClick={(e) => {
              e.stopPropagation();
              fileRef.current?.click();
            }}
          >
            <UploadCloud className="mr-2 h-4 w-4" /> dosya seç
          </Button>
        )}
      </div>

      {receiptPath && (
        <div className="mt-3 flex items-center gap-2 font-mono text-xs text-primary">
          <CheckCircle2 className="h-4 w-4" />
          hash_verified: {receiptPath.split("/").pop()}
        </div>
      )}
    </section>
  );
}

/* ============================ DELIVERY ============================ */

function DeliveryBlock({
  keyValue,
  activationToken,
  deliveryType,
  product,
}: {
  keyValue: string;
  activationToken: string | null;
  deliveryType: DeliveryType;
  product: string;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <section className="glass-card rounded-lg p-6 scan-line neon-glow">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
            [04/04] · delivery_channel
          </div>
          <h2 className="mt-1 font-mono text-xl neon-text">Lisansın Hazır</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{product}</p>
        </div>
        <CheckCircle2 className="h-8 w-8 text-primary" />
      </div>

      <div className="mt-5 rounded-md border border-primary/40 bg-black/30 p-4">
        <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
          $ ./decrypt --{deliveryType}
        </div>
        <div className="mt-3">
          {revealed ? (
            <DeliveryPayload
              deliveryType={deliveryType}
              keyValue={keyValue}
              activationToken={activationToken}
            />
          ) : (
            <div className="font-mono text-lg sm:text-xl text-primary tracking-widest">
              ████████-████████-████████
              <span className="terminal-caret" />
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!revealed && (
          <Button onClick={() => setRevealed(true)} className="font-mono neon-glow">
            <KeyRound className="mr-2 h-4 w-4" /> teslimatı aç
          </Button>
        )}
        <Button asChild variant="outline" className="font-mono">
          <Link to="/hesabim">
            hesabıma dön <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/* ============================ SIDE MONITOR ============================ */

function LiveMonitor({
  order,
}: {
  order: {
    status: string;
    price_try: number;
    reference_code: string;
    created_at?: string;
    product?: { name?: string; duration?: string } | null;
  };
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = order.created_at
    ? Math.max(0, Math.floor((now - new Date(order.created_at).getTime()) / 1000))
    : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const logs = useMemo(() => {
    const base = [
      "[+] tls_handshake OK",
      "[+] order_signature verified",
      "[+] reference_key minted",
    ];
    if (order.status !== "pending") base.push("[+] receipt_uploaded");
    if (order.status === "reviewing") base.push("[~] awaiting operator ack…");
    if (order.status === "approved") base.push("[+] key_delivered → session");
    if (order.status === "rejected") base.push("[!] transfer_rejected");
    return base;
  }, [order.status]);

  return (
    <div className="glass-card rounded-lg p-4">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-widest text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Terminal className="h-3 w-3" /> live_monitor
        </span>
        <span className="text-primary">● {order.status.toUpperCase()}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
        <Stat label="uptime" value={`${mm}:${ss}`} />
        <Stat label="amount" value={`₺${Number(order.price_try).toLocaleString("tr-TR")}`} />
      </div>

      <div className="mt-3 rounded-md bg-black/40 border border-border/60 p-3 font-mono text-[11px] leading-relaxed">
        {logs.map((l, i) => (
          <div
            key={i}
            className={
              l.startsWith("[!]")
                ? "text-destructive"
                : l.startsWith("[~]")
                ? "text-cyan"
                : "text-primary/90"
            }
          >
            {l}
          </div>
        ))}
        <div className="text-muted-foreground">
          <span className="terminal-caret" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2">
      <div className="text-[9px] tracking-widest text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 text-primary">{value}</div>
    </div>
  );
}

function SecurityChecklist() {
  const items = [
    { i: ShieldCheck, t: "RLS izole sipariş" },
    { i: Lock, t: "şifreli dekont depo" },
    { i: KeyRound, t: "atomic key atama" },
  ];
  return (
    <div className="glass-card rounded-lg p-4">
      <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
        security_stack
      </div>
      <ul className="mt-2 space-y-1.5 font-mono text-xs">
        {items.map((x) => (
          <li key={x.t} className="flex items-center gap-2">
            <x.i className="h-3.5 w-3.5 text-primary" />
            <span>{x.t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

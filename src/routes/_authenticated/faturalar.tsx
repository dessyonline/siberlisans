import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { listMyInvoices, getMyBillingProfile, updateBillingProfile } from "@/lib/invoices.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileText, Download, ArrowLeft, Building2, Save, Search, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/faturalar")({
  component: MyInvoices,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Faturalarım — SiberPHP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function MyInvoices() {
  const [search, setSearch] = useState("");

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["my-invoices"],
    queryFn: () => listMyInvoices(),
  });

  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ["my-billing-profile"],
    queryFn: () => getMyBillingProfile(),
  });

  const [form, setForm] = useState({
    billing_name: "",
    billing_tax_id: "",
    billing_address: "",
  });
  const [formInit, setFormInit] = useState(false);

  if (profile && !formInit) {
    setForm({
      billing_name: profile.billing_name ?? "",
      billing_tax_id: profile.billing_tax_id ?? "",
      billing_address: profile.billing_address ?? "",
    });
    setFormInit(true);
  }

  const save = useMutation({
    mutationFn: () =>
      updateBillingProfile({
        data: {
          billing_name: form.billing_name.trim() || null,
          billing_tax_id: form.billing_tax_id.trim() || null,
          billing_address: form.billing_address.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("[✓] fatura bilgileri güncellendi");
      refetchProfile();
    },
    onError: (e: Error) => toast.error(`[!] ${e.message}`),
  });

  const filtered = (invoices ?? []).filter((i) => {
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    return (
      i.invoice_number.toLowerCase().includes(t) ||
      (i.order?.reference_code ?? "").toLowerCase().includes(t)
    );
  });

  const totalSpend = (invoices ?? []).reduce((s, i) => s + Number(i.total_try), 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-xs text-muted-foreground flex items-center gap-2">
            <Receipt className="h-3.5 w-3.5 text-primary" /> $ ./invoices --list
          </div>
          <h1 className="mt-1 font-mono text-2xl neon-text">Faturalarım</h1>
        </div>
        <Link
          to="/hesabim"
          className="font-mono text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> hesabım
        </Link>
      </div>

      {/* özet */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="glass-card rounded-lg p-3">
          <div className="font-mono text-[10px] text-muted-foreground">toplam fatura</div>
          <div className="font-mono text-xl mt-1">{invoices?.length ?? 0}</div>
        </div>
        <div className="glass-card rounded-lg p-3">
          <div className="font-mono text-[10px] text-muted-foreground">toplam harcama</div>
          <div className="font-mono text-xl mt-1 text-primary">
            ₺{totalSpend.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="glass-card rounded-lg p-3 col-span-2 md:col-span-1">
          <div className="font-mono text-[10px] text-muted-foreground">kdv (%20 dahil)</div>
          <div className="font-mono text-xl mt-1 text-warn">
            ₺
            {(invoices ?? [])
              .reduce((s, i) => s + Number(i.vat_amount_try), 0)
              .toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* fatura profili */}
      <div className="glass-card rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-md p-2 bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm font-semibold">Fatura Bilgilerim</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground leading-relaxed">
              Yeni faturalar bu bilgilerle üretilir. Boş bırakırsan "Bireysel Müşteri" olarak
              geçer. Geçmiş faturalar yeniden düzenlenmez.
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="font-mono text-[10px] text-muted-foreground">
                  ad soyad / şirket ünvanı
                </label>
                <Input
                  value={form.billing_name}
                  onChange={(e) => setForm({ ...form, billing_name: e.target.value })}
                  placeholder="Ör: Ahmet Yılmaz veya ACME Ltd. Şti."
                  className="font-mono mt-1"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] text-muted-foreground">
                  vkn / tckn (opsiyonel)
                </label>
                <Input
                  value={form.billing_tax_id}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      billing_tax_id: e.target.value.replace(/\D/g, "").slice(0, 11),
                    })
                  }
                  placeholder="12345678901"
                  className="font-mono mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <label className="font-mono text-[10px] text-muted-foreground">
                  adres (opsiyonel)
                </label>
                <Textarea
                  value={form.billing_address}
                  onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
                  placeholder="Fatura üzerine yazılacak açık adres"
                  className="font-mono mt-1"
                  rows={2}
                />
              </div>
            </div>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="mt-4 font-mono neon-glow"
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {save.isPending ? "kaydediliyor…" : "> kaydet"}
            </Button>
          </div>
        </div>
      </div>

      {/* fatura listesi */}
      <div className="glass-card rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-mono text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Fatura Listesi
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="fatura no / sipariş no"
              className="font-mono pl-7 h-8 text-xs"
            />
          </div>
        </div>

        {isLoading && (
          <div className="font-mono text-xs text-muted-foreground py-6 text-center">
            $ loading invoices<span className="terminal-caret" />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="font-mono text-xs text-muted-foreground py-8 text-center border border-dashed border-border/40 rounded">
            {invoices && invoices.length === 0
              ? "Henüz onaylı siparişin yok. İlk siparişin onaylandığında faturan burada oluşur."
              : "Aramaya uyan fatura bulunamadı."}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="divide-y divide-border/40">
            {filtered.map((i) => (
              <div
                key={i.id}
                className="grid grid-cols-1 md:grid-cols-[1fr,auto,auto] items-center gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm truncate">{i.invoice_number}</div>
                  <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                    {new Date(i.issued_at).toLocaleDateString("tr-TR", {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                    })}{" "}
                    · sipariş {i.order?.reference_code ?? "—"}
                  </div>
                </div>
                <div className="font-mono text-right">
                  <div className="text-sm text-primary">
                    ₺
                    {Number(i.total_try).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    kdv ₺
                    {Number(i.vat_amount_try).toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Link
                    to="/fatura/$orderId"
                    params={{ orderId: i.order_id }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs border border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <Download className="h-3 w-3" /> pdf
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card rounded-lg p-4 font-mono text-[11px] text-muted-foreground space-y-1">
        <div className="text-primary">// bilgi</div>
        <div>· Fatura numaraları <span className="text-primary">SP-YYYYAA-######</span> formatında sıralıdır.</div>
        <div>· KDV %20 tutara <span className="text-primary">dahildir</span>; matrah ve vergi ayrıca gösterilir.</div>
        <div>· Bu belgeler resmi e-fatura değildir; bilgi ve arşiv amaçlıdır.</div>
      </div>
    </div>
  );
}

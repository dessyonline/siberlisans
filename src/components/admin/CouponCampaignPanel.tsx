import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { adminIssueSegmentCoupons } from "@/lib/coupons.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Megaphone, Loader2 } from "lucide-react";

const SEGMENTS = [
  { value: "no_purchase", label: "hiç alışveriş yapmayanlar" },
  { value: "returning", label: "en az 1 alışveriş yapanlar" },
  { value: "inactive_30", label: "30+ gündür uyuyanlar" },
] as const;

export function CouponCampaignPanel() {
  const qc = useQueryClient();
  const issueFn = useServerFn(adminIssueSegmentCoupons);
  const [segment, setSegment] = useState<"no_purchase" | "returning" | "inactive_30">("inactive_30");
  const [type, setType] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("10");
  const [minOrder, setMinOrder] = useState("0");
  const [days, setDays] = useState("7");
  const [limit, setLimit] = useState("200");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await issueFn({
        data: {
          segment,
          discount_type: type,
          discount_value: Number(value),
          min_order_try: Number(minOrder || 0),
          days_valid: Number(days || 7),
          limit: Number(limit || 200),
        },
      });
      if (res.issued === 0) {
        toast.info("Bu segmentte kupon verilecek uygun kullanıcı bulunamadı");
      } else {
        toast.success(`${res.issued} kişisel kupon üretildi (örn. ${res.sampleCode})`);
      }
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-card corner-cut p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Megaphone className="h-4 w-4 text-primary" />
        <h2 className="font-mono text-sm text-primary">kampanya motoru · segmentli kupon</h2>
      </div>
      <p className="text-xs text-muted-foreground font-mono mb-4">
        Seçilen segmentteki her kullanıcıya tek kullanımlık kişisel kupon üretir ve bildirim gönderir.
        Aktif kuponu olanlar atlanır.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label className="font-mono text-xs">Segment</Label>
          <Select value={segment} onValueChange={(v) => setSegment(v as typeof segment)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEGMENTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="font-mono text-xs">İndirim tipi</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Yüzde (%)</SelectItem>
              <SelectItem value="amount">Tutar (TL)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="font-mono text-xs">İndirim değeri</Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label className="font-mono text-xs">Min. sepet (TL)</Label>
          <Input value={minOrder} onChange={(e) => setMinOrder(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label className="font-mono text-xs">Geçerlilik (gün)</Label>
          <Input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
        </div>
        <div>
          <Label className="font-mono text-xs">Maks. kişi</Label>
          <Input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" />
        </div>
      </div>
      <Button onClick={run} disabled={busy} className="font-mono mt-4">
        {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Megaphone className="h-4 w-4 mr-1" />}
        kampanyayı çalıştır
      </Button>
    </section>
  );
}

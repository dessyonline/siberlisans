import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { importLicenseKeys } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, AlertTriangle, CheckCircle2, Database, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/keyler")({
  component: KeysAdmin,
});

type PoolRow = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  price_try: number;
  license_keys: { status: string }[];
};

function KeysAdmin() {
  const qc = useQueryClient();
  const importFn = useServerFn(importLicenseKeys);
  const [productId, setProductId] = useState("");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["products", "for-keys"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name").order("name");
      return data;
    },
  });

  const { data: pool } = useQuery({
    queryKey: ["admin-pool"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, active, price_try, license_keys(status)")
        .order("name");
      if (error) throw error;
      return data as PoolRow[];
    },
    refetchInterval: 15000,
  });

  const totals = useMemo(() => {
    let avail = 0, assigned = 0, total = 0;
    (pool ?? []).forEach((p) => {
      p.license_keys.forEach((k) => {
        total++;
        if (k.status === "available") avail++;
        else if (k.status === "assigned") assigned++;
      });
    });
    return { avail, assigned, total };
  }, [pool]);

  const { data: keys } = useQuery({
    queryKey: ["license-keys", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("license_keys")
        .select("id, key_value, status, created_at")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const doImport = async () => {
    if (!productId) return toast.error("Ürün seçin");
    const list = raw.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return toast.error("En az bir key girin");
    setBusy(true);
    try {
      const r = await importFn({ data: { productId, keys: list } });
      toast.success(`${r.inserted} key eklendi`);
      setRaw("");
      qc.invalidateQueries({ queryKey: ["license-keys"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <h1 className="font-mono text-2xl neon-text">Key Havuzu</h1>

      <div className="mt-6 glass-card rounded-lg p-4">
        <div className="font-mono text-xs text-muted-foreground">$ ./import --keys</div>
        <div className="mt-2 grid gap-3">
          <div>
            <Label className="font-mono text-xs">ürün</Label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded border border-border bg-input px-3 py-2 font-mono text-sm"
            >
              <option value="">— seçin —</option>
              {(products ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="font-mono text-xs">key listesi (her satıra bir tane)</Label>
            <Textarea
              rows={8}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX&#10;YYYY-YYYY-YYYY-YYYY"
              className="font-mono"
            />
          </div>
          <Button disabled={busy} onClick={doImport} className="font-mono self-start">
            <Upload className="h-4 w-4 mr-1" />içe aktar
          </Button>
        </div>
      </div>

      {productId && (
        <div className="mt-6 glass-card rounded-lg p-4">
          <div className="font-mono text-xs text-muted-foreground mb-2">
            $ tail -200 license_keys.log
          </div>
          <div className="space-y-1 max-h-[500px] overflow-auto">
            {(keys ?? []).map((k) => (
              <div key={k.id} className="flex items-center justify-between font-mono text-xs border-b border-border/40 py-1.5">
                <code className="break-all">{k.key_value}</code>
                <span className={
                  k.status === "available" ? "text-primary"
                  : k.status === "assigned" ? "text-muted-foreground"
                  : "text-destructive"
                }>
                  {k.status}
                </span>
              </div>
            ))}
            {(keys ?? []).length === 0 && (
              <div className="text-center text-muted-foreground font-mono py-4">bu ürün için key yok</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

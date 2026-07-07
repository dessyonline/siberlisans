import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, X, Ban, RotateCcw, ShieldCheck, Clock, Cpu, CheckCircle2, Sparkles, Download, Copy } from "lucide-react";
import { toast } from "sonner";

const LOVABLE_PRODUCT_ID = "4f6d86cf-6a89-4940-90af-953cc3d6ab5f";

function genKey(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n: number) =>
    Array.from({ length: n }, () => abc[Math.floor(Math.random() * abc.length)]).join("");
  return `LVBL-${seg(4)}-${seg(4)}-${seg(4)}-${seg(4)}`;
}

function buildUserscript(licenseKey: string): string {
  return `// ==UserScript==
// @name         Lovable Sınırsız — Kredisiz
// @namespace    https://siberlisans.lovable.app
// @version      1.0.0
// @description  Lovable için lisanslı istemci
// @match        https://lovable.dev/*
// @match        https://*.lovable.dev/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  "use strict";
  const API = "https://siberlisans.lovable.app";
  const LICENSE_KEY = "${licenseKey}";

  function getHWID() {
    let h = GM_getValue("siber_hwid", null);
    if (!h) {
      h = crypto.randomUUID();
      GM_setValue("siber_hwid", h);
    }
    return h;
  }

  async function post(path, body) {
    const r = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  async function activate() {
    const r = await post("/api/activate", { license_key: LICENSE_KEY, hwid: getHWID() });
    if (!r.success) throw new Error(r.error || "Etkinleştirme başarısız");
    return r;
  }

  async function validate() {
    const r = await post("/api/validate", { license_key: LICENSE_KEY, hwid: getHWID() });
    if (!r.valid) throw new Error(r.error || "Lisans geçersiz");
    return r;
  }

  async function boot() {
    try {
      const last = Number(GM_getValue("siber_last_check", 0));
      const activated = GM_getValue("siber_activated", false);
      if (!activated) {
        const a = await activate();
        GM_setValue("siber_activated", true);
        GM_setValue("siber_last_check", Date.now());
        console.log("[SiberLisans] etkinleştirildi:", a);
      } else if (Date.now() - last > 6 * 60 * 60 * 1000) {
        const v = await validate();
        GM_setValue("siber_last_check", Date.now());
        console.log("[SiberLisans] doğrulandı:", v);
      }
      // TODO: buradan sonrası eklenti işlevleri
    } catch (e) {
      alert("Lisans hatası: " + e.message);
    }
  }

  boot();
})();
`;
}


export const Route = createFileRoute("/_authenticated/admin/lisanslar")({
  component: LicensesAdmin,
});

type Row = {
  id: string;
  key_value: string;
  status: string;
  hwid: string | null;
  activated_at: string | null;
  expires_at: string | null;
  duration_days: number | null;
  revoked: boolean;
  last_validated_at: string | null;
  product: { name: string; slug: string } | null;
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function daysLeft(exp: string | null): number | null {
  if (!exp) return null;
  const ms = new Date(exp).getTime() - Date.now();
  return Math.max(0, Math.round(ms / 86400000));
}

function LicensesAdmin() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "revoked" | "expired" | "unactivated">("all");

  const { data: rows } = useQuery({
    queryKey: ["licenses-manage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("license_keys")
        .select("id, key_value, status, hwid, activated_at, expires_at, duration_days, revoked, last_validated_at, product:products(name, slug)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Row[];
    },
    refetchInterval: 20000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (filter === "active" && (r.revoked || !r.hwid)) return false;
      if (filter === "revoked" && !r.revoked) return false;
      if (filter === "expired" && !(r.expires_at && new Date(r.expires_at) < new Date())) return false;
      if (filter === "unactivated" && r.hwid) return false;
      if (!q) return true;
      return (
        r.key_value.toLowerCase().includes(q) ||
        (r.hwid ?? "").toLowerCase().includes(q) ||
        (r.product?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  const call = async (id: string, action: string, valueInt?: number | null) => {
    const args: { _id: string; _action: string; _value_int?: number; _value_ts?: string } = {
      _id: id,
      _action: action,
    };
    if (valueInt !== null && valueInt !== undefined) args._value_int = valueInt;
    const { error } = await supabase.rpc("admin_set_license", args);
    if (error) return toast.error(error.message);
    toast.success("Güncellendi");
    qc.invalidateQueries({ queryKey: ["licenses-manage"] });
  };

  const setDuration = (id: string) => {
    const raw = prompt("Yeni süre (gün). Boş = süresiz:", "30");
    if (raw === null) return;
    const n = raw.trim() === "" ? null : parseInt(raw, 10);
    if (n !== null && (Number.isNaN(n) || n < 0)) return toast.error("Geçersiz sayı");
    call(id, "set_duration", n);
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-mono text-xl sm:text-2xl neon-text">Lisans Yönetimi</h1>
        <div className="font-mono text-[11px] text-muted-foreground">
          HWID kilidi · süre · iptal · sunucu doğrulama
        </div>
      </div>

      {/* API bilgi kutusu */}
      <div className="mt-4 glass-card rounded-lg p-4 font-mono text-[11px] leading-relaxed">
        <div className="text-primary mb-2">$ ./api --endpoints</div>
        <div className="grid gap-1 text-muted-foreground">
          <div><span className="text-cyan">POST</span> https://siberlisans.lovable.app<span className="text-primary">/api/activate</span> — {"{ license_key, hwid }"}</div>
          <div><span className="text-cyan">POST</span> https://siberlisans.lovable.app<span className="text-primary">/api/validate</span> — {"{ license_key, hwid }"}</div>
        </div>
      </div>

      {/* Filtre */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="key, hwid veya ürün ara…"
            className="pl-7 pr-7 h-8 font-mono text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="h-8 rounded border border-border bg-input px-2 font-mono text-xs"
        >
          <option value="all">tümü</option>
          <option value="active">aktif</option>
          <option value="unactivated">etkinleştirilmemiş</option>
          <option value="expired">süresi dolmuş</option>
          <option value="revoked">iptal</option>
        </select>
        <div className="font-mono text-[11px] text-muted-foreground ml-auto">
          {filtered.length}/{(rows ?? []).length}
        </div>
      </div>

      {/* Liste */}
      <div className="mt-3 space-y-2">
        {filtered.map((r) => {
          const expired = r.expires_at && new Date(r.expires_at) < new Date();
          const left = daysLeft(r.expires_at);
          return (
            <div key={r.id} className="glass-card rounded-lg p-3 font-mono text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="break-all text-sm">{r.key_value}</code>
                    {r.revoked && (
                      <span className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                        iptal
                      </span>
                    )}
                    {!r.revoked && expired && (
                      <span className="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] text-warn">
                        süresi dolmuş
                      </span>
                    )}
                    {!r.revoked && !expired && r.hwid && (
                      <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        <CheckCircle2 className="inline h-2.5 w-2.5 mr-0.5" /> aktif
                      </span>
                    )}
                    {!r.hwid && !r.revoked && (
                      <span className="rounded border border-border bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        beklemede
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {r.product?.name ?? "—"}
                  </div>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Cpu className="h-3 w-3 text-cyan" />
                      HWID: <span className="text-foreground break-all">{r.hwid ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3 w-3 text-cyan" />
                      Bitiş: <span className="text-foreground">{fmt(r.expires_at)}</span>
                      {left !== null && !r.revoked && !expired && (
                        <span className="text-primary">({left}g)</span>
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      Süre: <span className="text-foreground">{r.duration_days ?? "süresiz"}</span>
                    </div>
                    <div className="text-muted-foreground">
                      Son doğrulama: <span className="text-foreground">{fmt(r.last_validated_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" className="h-7 font-mono text-[11px]" onClick={() => setDuration(r.id)}>
                    <Clock className="h-3 w-3 mr-1" /> süre
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 font-mono text-[11px]" onClick={() => call(r.id, "reset_hwid")} disabled={!r.hwid}>
                    <RotateCcw className="h-3 w-3 mr-1" /> hwid sıfırla
                  </Button>
                  {r.revoked ? (
                    <Button size="sm" variant="outline" className="h-7 font-mono text-[11px]" onClick={() => call(r.id, "unrevoke")}>
                      <ShieldCheck className="h-3 w-3 mr-1" /> aç
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 font-mono text-[11px] text-destructive" onClick={() => call(r.id, "revoke")}>
                      <Ban className="h-3 w-3 mr-1" /> iptal
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground font-mono py-8 text-xs">
            eşleşen lisans yok
          </div>
        )}
      </div>
    </div>
  );
}

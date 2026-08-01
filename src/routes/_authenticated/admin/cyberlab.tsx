import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listAppAccess,
  searchUsersForAccess,
  grantAppAccess,
  revokeAppAccess,
} from "@/lib/admin-app-access.functions";
import { Search, Terminal, Trash2, Infinity as InfinityIcon, CalendarClock, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/cyberlab")({
  component: CyberlabAccessAdmin,
  head: () => ({ meta: [{ title: "CyberLab Erişimi — Admin" }] }),
});

const PRESETS = [7, 30, 90, 365];

function CyberlabAccessAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAppAccess);
  const searchFn = useServerFn(searchUsersForAccess);
  const grantFn = useServerFn(grantAppAccess);
  const revokeFn = useServerFn(revokeAppAccess);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; email: string | null; displayName: string | null }[]>([]);
  const [selected, setSelected] = useState<{ id: string; email: string | null; displayName: string | null } | null>(null);
  const [mode, setMode] = useState<"days" | "lifetime" | "until">("days");
  const [days, setDays] = useState(30);
  const [until, setUntil] = useState("");
  const [extend, setExtend] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-app-access"],
    queryFn: () => listFn(),
    refetchInterval: 60000,
  });

  const doSearch = async () => {
    if (q.trim().length < 2) return toast.error("En az 2 karakter yaz");
    try {
      const r = await searchFn({ data: { q: q.trim() } });
      setResults(r);
      if (r.length === 0) toast.info("Kullanıcı bulunamadı");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const submit = async () => {
    if (!selected) return toast.error("Önce kullanıcı seç");
    setBusy(true);
    try {
      const res = await grantFn({
        data: {
          userId: selected.id,
          mode,
          days: mode === "days" ? days : undefined,
          until: mode === "until" ? new Date(until).toISOString() : undefined,
          extend,
        },
      });
      toast.success(
        res.expiresAt
          ? `Erişim verildi — bitiş ${new Date(res.expiresAt).toLocaleString("tr-TR")}`
          : "Süresiz erişim verildi",
      );
      qc.invalidateQueries({ queryKey: ["admin-app-access"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (userId: string, label: string) => {
    if (!confirm(`${label} kullanıcısının CyberLab erişimi kaldırılsın mı?`)) return;
    try {
      await revokeFn({ data: { userId } });
      toast.success("Erişim kaldırıldı");
      qc.invalidateQueries({ queryKey: ["admin-app-access"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const active = (rows ?? []).filter((r) => r.active).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-mono text-xl sm:text-2xl neon-text">CyberLab Erişimi</h1>
        <div className="flex gap-2 font-mono text-xs">
          <span className="rounded border border-primary/30 bg-primary/5 px-2 py-1 text-primary">
            aktif {active}
          </span>
          <span className="rounded border border-border/60 bg-muted/20 px-2 py-1 text-muted-foreground">
            toplam {rows?.length ?? 0}
          </span>
        </div>
      </div>

      {/* Tek ekran erişim verme paneli */}
      <div className="glass-card rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <Terminal className="h-3.5 w-3.5 text-primary" />
          erişim tanımla
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="e-posta veya isim ile kullanıcı ara…"
              className="pl-7 h-9 font-mono text-xs"
            />
          </div>
          <Button onClick={doSearch} variant="outline" className="h-9 font-mono text-xs">
            ara
          </Button>
        </div>

        {results.length > 0 && (
          <div className="rounded border border-border/60 divide-y divide-border/40 max-h-52 overflow-auto">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSelected(r);
                  setResults([]);
                  setQ("");
                }}
                className="w-full text-left px-3 py-2 hover:bg-primary/5 flex items-center gap-2"
              >
                <UserPlus className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-sm truncate">{r.displayName || r.email || r.id}</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground truncate">
                  {r.email}
                </span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {selected.displayName || selected.email}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground truncate">
                  {selected.email}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="font-mono text-xs" onClick={() => setSelected(null)}>
                değiştir
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["days", "until", "lifetime"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded border px-2.5 py-1 font-mono text-xs ${
                    mode === m
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "days" ? "gün ekle" : m === "until" ? "tarihe kadar" : "süresiz"}
                </button>
              ))}
            </div>

            {mode === "days" && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDays(d)}
                      className={`rounded border px-2 py-1 font-mono text-xs ${
                        days === d
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground"
                      }`}
                    >
                      {d} gün
                    </button>
                  ))}
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    value={days}
                    onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                    className="h-8 w-24 font-mono text-xs"
                  />
                </div>
                <label className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={extend}
                    onChange={(e) => setExtend(e.target.checked)}
                    className="accent-primary"
                  />
                  mevcut süre varsa üzerine ekle (kapalıysa bugünden başlar)
                </label>
              </div>
            )}

            {mode === "until" && (
              <Input
                type="datetime-local"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className="h-9 w-full sm:w-64 font-mono text-xs"
              />
            )}

            {mode === "lifetime" && (
              <div className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                <InfinityIcon className="h-3.5 w-3.5 text-primary" /> bitiş tarihi olmadan sınırsız erişim
              </div>
            )}

            <Button
              onClick={submit}
              disabled={busy || (mode === "until" && !until)}
              className="font-mono text-xs neon-glow"
            >
              {busy ? "işleniyor…" : "erişimi kaydet"}
            </Button>
          </div>
        )}
      </div>

      {/* Erişim listesi */}
      <div className="glass-card rounded-lg p-4">
        <div className="font-mono text-xs text-muted-foreground mb-3">erişim listesi</div>
        {isLoading && <div className="py-6 text-center font-mono text-sm text-muted-foreground">yükleniyor…</div>}
        {!isLoading && (rows ?? []).length === 0 && (
          <div className="py-6 text-center font-mono text-sm text-muted-foreground">
            henüz erişim tanımlı kullanıcı yok
          </div>
        )}
        <div className="space-y-2">
          {(rows ?? []).map((r) => (
            <div
              key={r.userId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3"
            >
              <div className="min-w-0">
                <div className="text-sm truncate">{r.displayName || r.email || r.userId}</div>
                <div className="font-mono text-[11px] text-muted-foreground truncate">{r.email ?? "—"}</div>
              </div>
              <div className="shrink-0 text-right font-mono text-[11px]">
                {r.lifetime ? (
                  <span className="text-primary flex items-center gap-1">
                    <InfinityIcon className="h-3 w-3" /> süresiz
                  </span>
                ) : (
                  <span className={r.active ? "text-cyan" : "text-destructive"}>
                    <CalendarClock className="inline h-3 w-3 mr-1" />
                    {new Date(r.expiresAt as string).toLocaleDateString("tr-TR")}
                  </span>
                )}
                <div className="text-muted-foreground">{r.active ? "aktif" : "süresi dolmuş"}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 font-mono text-[11px]"
                  onClick={() => {
                    setSelected({ id: r.userId, email: r.email, displayName: r.displayName });
                    setMode("days");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  düzenle
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive"
                  onClick={() => revoke(r.userId, r.email ?? r.userId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

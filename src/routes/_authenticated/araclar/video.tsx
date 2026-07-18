import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createAiVideoJob,
  listMyAiJobs,
  getAiVideoPrices,
} from "@/lib/ai-tools.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Video,
  Loader2,
  Wallet,
  Download,
  Clock,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/video")({
  component: Page,
  head: () => ({ meta: [{ title: "AI Video Üretici — SiberPHP" }] }),
});

type Job = {
  id: string;
  prompt: string;
  params: { duration?: number; aspect?: string; tier?: string } | null;
  cost_try: number;
  status: string;
  result_url: string | null;
  error: string | null;
  created_at: string;
  expires_at?: string | null;
};

type Dur = 5 | 10;

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.max(1, Math.ceil(diff / 86400000));
}

async function triggerDownload(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  } catch {
    // Fallback: open in new tab
    window.open(url, "_blank", "noopener");
  }
}

function Page() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<Dur>(5);
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [prices, setPrices] = useState<Record<number, number>>({ 5: 15, 10: 30 });
  const autoDownloaded = useRef<Set<string>>(new Set());

  const refresh = async () => {
    const data = await listMyAiJobs();
    const list = data as unknown as Job[];
    setJobs(list);
    // Otomatik indirme: yeni tamamlanan işleri bir kez indir
    for (const j of list) {
      if (j.status === "done" && j.result_url && !autoDownloaded.current.has(j.id)) {
        autoDownloaded.current.add(j.id);
        // Sadece son 5 dk içinde tamamlananları otomatik indir
        const age = Date.now() - new Date(j.created_at).getTime();
        if (age < 60 * 60 * 1000) {
          triggerDownload(j.result_url, `siberphp-video-${j.id.slice(0, 8)}.mp4`);
          toast.success("Videon hazır — indiriliyor");
        }
      }
    }
  };

  useEffect(() => {
    (async () => {
      const [{ data: user }, priceMap] = await Promise.all([
        supabase.auth.getUser(),
        getAiVideoPrices().catch(() => ({ 5: 15, 10: 30 })),
      ]);
      setPrices(priceMap);
      if (!user.user) return;
      const { data: w } = await supabase
        .from("wallets")
        .select("balance_try")
        .eq("user_id", user.user.id)
        .maybeSingle();
      setBalance(Number(w?.balance_try ?? 0));
    })();
    refresh();
    // Realtime: yeni işler geldiğinde/status değiştiğinde otomatik yenile
    const channel = supabase
      .channel("ai_jobs_watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_jobs" }, () => {
        refresh();
      })
      .subscribe();
    // Fallback polling: bekleyen iş varsa 15sn'de bir yenile
    const iv = setInterval(() => {
      if (jobs.some((j) => j.status === "queued" || j.status === "processing")) {
        refresh();
      }
    }, 15000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (prompt.trim().length < 3) return toast.error("Prompt en az 3 karakter olmalı");
    setBusy(true);
    try {
      await createAiVideoJob({ data: { prompt: prompt.trim(), duration, aspect } });
      toast.success("Video kuyruğa alındı — hazır olunca otomatik indirilecek");
      setPrompt("");
      await refresh();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("insufficient_balance")) toast.error("Cüzdan bakiyen yetersiz");
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const cost = prices[duration] ?? 15;
  const isDiscount = (prices[5] ?? 15) < 15; // gold/platinum

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">
          $ ./ai-video --generate<span className="terminal-caret" />
        </div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Video className="h-5 w-5" /> AI Video Üretici
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Prompt yaz, süre ve oran seç — cüzdanından düşülür. Hazır olunca{" "}
          <span className="text-primary">otomatik indirilir</span>. Geçmiş 30 gün saklanır.
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs font-mono flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Wallet className="h-3 w-3 text-primary" />
            bakiye: <span className="text-primary">₺{balance?.toFixed(2) ?? "0.00"}</span>
          </span>
          {isDiscount && (
            <span className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2 py-0.5 text-primary">
              <Sparkles className="h-3 w-3" />
              GOLD tier — %33 indirim aktif
            </span>
          )}
        </div>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-3">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Örn: gece şehri üzerinde neon yeşil bir dijital yağmur, kamera yavaşça yukarı çıkıyor, sinematik"
          rows={4}
          className="font-mono"
          maxLength={1000}
        />
        <div className="flex flex-wrap gap-4">
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">süre</div>
            <div className="flex gap-1">
              {([5, 10] as Dur[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setDuration(s)}
                  className={`px-3 py-1.5 rounded font-mono text-xs border ${
                    duration === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {s}s · ₺{prices[s] ?? (s === 5 ? 15 : 30)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">oran</div>
            <div className="flex gap-1">
              {(["16:9", "9:16", "1:1"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAspect(a)}
                  className={`px-3 py-1.5 rounded font-mono text-xs border ${
                    aspect === a
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Button
          onClick={submit}
          disabled={busy || (balance ?? 0) < cost}
          className="font-mono neon-glow"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "> "}
          {busy ? "kuyruğa alınıyor..." : `üret · ₺${cost}`}
        </Button>
      </div>

      <div className="glass-card rounded-lg p-4">
        <h2 className="font-mono text-sm text-primary mb-3">$ ./videolarım (son 30 gün)</h2>
        {jobs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Henüz iş yok.</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((j) => {
              const days = daysUntil(j.expires_at);
              return (
                <div
                  key={j.id}
                  className="rounded border border-border/60 p-3 text-xs font-mono"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-muted-foreground">
                      {new Date(j.created_at).toLocaleString("tr-TR")} · {j.params?.duration}s ·{" "}
                      {j.params?.aspect}
                    </span>
                    <StatusPill status={j.status} />
                  </div>
                  <div className="mt-1 text-foreground/80 line-clamp-2">{j.prompt}</div>
                  <div className="mt-2 flex justify-between items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground">
                      ₺{Number(j.cost_try).toFixed(2)}
                      {j.status === "done" && days !== null && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {days > 0 ? `${days}g sonra silinir` : "süresi doldu"}
                        </span>
                      )}
                    </span>
                    {j.status === "done" && j.result_url && (
                      <button
                        onClick={() =>
                          triggerDownload(
                            j.result_url!,
                            `siberphp-video-${j.id.slice(0, 8)}.mp4`,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2 py-1 text-primary hover:bg-primary/10"
                      >
                        <Download className="h-3 w-3" />
                        indir
                      </button>
                    )}
                    {j.status === "failed" && j.error && (
                      <span className="text-red-400 max-w-full truncate" title={j.error}>
                        {j.error}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { c: string; t: string }> = {
    queued: { c: "text-yellow-400 border-yellow-400/40", t: "kuyrukta" },
    processing: { c: "text-blue-400 border-blue-400/40", t: "işleniyor" },
    done: { c: "text-primary border-primary/40", t: "tamamlandı" },
    failed: { c: "text-red-400 border-red-400/40", t: "başarısız" },
    refunded: { c: "text-orange-400 border-orange-400/40", t: "iade" },
  };
  const s = map[status] ?? { c: "text-muted-foreground border-border", t: status };
  return <span className={`px-2 py-0.5 rounded border ${s.c}`}>{s.t}</span>;
}

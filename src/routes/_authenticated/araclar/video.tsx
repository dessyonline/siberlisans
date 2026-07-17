import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createAiVideoJob, listMyAiJobs } from "@/lib/ai-tools.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Video, Loader2, Wallet, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/video")({
  component: Page,
  head: () => ({ meta: [{ title: "AI Video Üretici — SiberPHP" }] }),
});

type Job = {
  id: string;
  prompt: string;
  params: { duration?: number; aspect?: string } | null;
  cost_try: number;
  status: string;
  result_url: string | null;
  error: string | null;
  created_at: string;
};

const PRICE: Record<number, number> = { 3: 25, 5: 40, 8: 60 };

function Page() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<3 | 5 | 8>(5);
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const refresh = async () => {
    const data = await listMyAiJobs();
    setJobs(data as unknown as Job[]);
  };

  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data: w } = await supabase.from("wallets").select("balance_try").eq("user_id", user.user.id).maybeSingle();
      setBalance(Number(w?.balance_try ?? 0));
    })();
    refresh();
  }, []);

  const submit = async () => {
    if (prompt.trim().length < 3) return toast.error("Prompt en az 3 karakter olmalı");
    setBusy(true);
    try {
      await createAiVideoJob({ data: { prompt: prompt.trim(), duration, aspect } });
      toast.success("Video kuyruğa alındı — hazır olunca bildireceğiz");
      setPrompt("");
      await refresh();
      router.invalidate();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("insufficient_balance")) toast.error("Cüzdan bakiyen yetersiz");
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const cost = PRICE[duration];

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./ai-video --generate<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Video className="h-5 w-5" /> AI Video Üretici
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Prompt yaz, süre ve oran seç — cüzdanından düşülür. Hazır olunca bildirim + siparişler → geçmiş.
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs font-mono">
          <Wallet className="h-3 w-3 text-primary" />
          bakiye: <span className="text-primary">₺{balance?.toFixed(2) ?? "0.00"}</span>
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
              {[3, 5, 8].map((s) => (
                <button
                  key={s}
                  onClick={() => setDuration(s as 3 | 5 | 8)}
                  className={`px-3 py-1.5 rounded font-mono text-xs border ${
                    duration === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {s}s · ₺{PRICE[s]}
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
        <Button onClick={submit} disabled={busy || (balance ?? 0) < cost} className="font-mono neon-glow">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "> "}
          {busy ? "kuyruğa alınıyor..." : `üret · ₺${cost}`}
        </Button>
      </div>

      <div className="glass-card rounded-lg p-4">
        <h2 className="font-mono text-sm text-primary mb-3">$ ./geçmiş</h2>
        {jobs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Henüz iş yok.</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="rounded border border-border/60 p-3 text-xs font-mono">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-muted-foreground">
                    {new Date(j.created_at).toLocaleString("tr-TR")} · {j.params?.duration}s · {j.params?.aspect}
                  </span>
                  <StatusPill status={j.status} />
                </div>
                <div className="mt-1 text-foreground/80 line-clamp-2">{j.prompt}</div>
                <div className="mt-1 flex justify-between items-center">
                  <span className="text-muted-foreground">₺{Number(j.cost_try).toFixed(2)}</span>
                  {j.status === "done" && j.result_url && (
                    <a href={j.result_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                      izle / indir <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {j.status === "failed" && j.error && <span className="text-red-400">{j.error}</span>}
                </div>
              </div>
            ))}
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

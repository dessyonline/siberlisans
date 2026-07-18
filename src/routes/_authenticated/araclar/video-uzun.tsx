import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createAiVideoJob,
  getAiVideoPrices,
} from "@/lib/ai-tools.functions";
import { getFFmpeg, downloadBlob } from "@/lib/ffmpeg-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Film,
  Loader2,
  Wallet,
  Plus,
  Trash2,
  Zap,
  Award,
  Crown,
  Download,
  Layers,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/video-uzun")({
  component: Page,
  head: () => ({ meta: [{ title: "AI Uzun Video — Multi Sahne · SiberPHP" }] }),
});

type Quality = "fast" | "hd" | "cinematic";
type Dur = 5 | 10;

const DEFAULT_PRICES: Record<Quality, Record<number, number>> = {
  fast: { 5: 10, 10: 20 },
  hd: { 5: 25, 10: 50 },
  cinematic: { 5: 50, 10: 100 },
};

const QUALITY_META: Record<Quality, { label: string; desc: string; icon: typeof Zap }> = {
  fast: { label: "Hızlı", desc: "sosyal medya için", icon: Zap },
  hd: { label: "HD", desc: "yüksek kalite", icon: Award },
  cinematic: { label: "Sinematik", desc: "prodüksiyon", icon: Crown },
};

type Scene = {
  key: string;
  prompt: string;
  jobId?: string;
  status?: "idle" | "queued" | "processing" | "done" | "failed";
  resultUrl?: string;
  error?: string;
};

function newScene(): Scene {
  return { key: crypto.randomUUID(), prompt: "", status: "idle" };
}

function Page() {
  const [scenes, setScenes] = useState<Scene[]>([newScene(), newScene()]);
  const [quality, setQuality] = useState<Quality>("fast");
  const [duration, setDuration] = useState<Dur>(5);
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [busy, setBusy] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [prices, setPrices] = useState<Record<Quality, Record<number, number>>>(DEFAULT_PRICES);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: user }, p] = await Promise.all([
        supabase.auth.getUser(),
        getAiVideoPrices().catch(() => DEFAULT_PRICES),
      ]);
      setPrices(p as Record<Quality, Record<number, number>>);
      if (!user.user) return;
      const { data: w } = await supabase
        .from("wallets")
        .select("balance_try")
        .eq("user_id", user.user.id)
        .maybeSingle();
      setBalance(Number(w?.balance_try ?? 0));
    })();
    const ch = supabase
      .channel("ai_jobs_multi")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ai_jobs" },
        (payload) => {
          const row = payload.new as {
            id: string;
            status: string;
            result_url: string | null;
            error: string | null;
          };
          setScenes((prev) =>
            prev.map((s) =>
              s.jobId === row.id
                ? {
                    ...s,
                    status: row.status as Scene["status"],
                    resultUrl: row.result_url ?? undefined,
                    error: row.error ?? undefined,
                  }
                : s,
            ),
          );
        },
      )
      .subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const unitCost = prices[quality]?.[duration] ?? DEFAULT_PRICES[quality][duration];
  const validCount = scenes.filter((s) => s.prompt.trim().length >= 3).length;
  const totalCost = unitCost * validCount;
  const doneCount = scenes.filter((s) => s.status === "done" && s.resultUrl).length;
  const anyFailed = scenes.some((s) => s.status === "failed");
  const allDoneOrFailed =
    scenes.every((s) => s.status === "done" || s.status === "failed") && doneCount >= 2;

  function addScene() {
    if (scenes.length >= 6) return toast.error("Max 6 sahne");
    setScenes((s) => [...s, newScene()]);
  }
  function removeScene(key: string) {
    if (scenes.length <= 2) return toast.error("Min 2 sahne");
    setScenes((s) => s.filter((x) => x.key !== key));
  }
  function updatePrompt(key: string, prompt: string) {
    setScenes((s) => s.map((x) => (x.key === key ? { ...x, prompt } : x)));
  }

  async function generateAll() {
    const bad = scenes.some((s) => s.prompt.trim().length < 3);
    if (bad) return toast.error("Her sahne için en az 3 karakter prompt yaz");
    if ((balance ?? 0) < totalCost) return toast.error("Cüzdan bakiyen yetersiz");
    if (!confirm(`Toplam ₺${totalCost} düşülecek (${scenes.length} sahne × ₺${unitCost}). Onaylıyor musun?`))
      return;

    setBusy(true);
    try {
      // Sıralı gönder — RPC her seferinde ayrı bakiye düşer
      const next: Scene[] = [];
      for (const s of scenes) {
        try {
          const res = await createAiVideoJob({
            data: {
              prompt: s.prompt.trim(),
              duration,
              aspect,
              quality,
            },
          });
          next.push({ ...s, jobId: res.jobId, status: "queued", error: undefined });
        } catch (e) {
          next.push({ ...s, status: "failed", error: (e as Error).message });
        }
      }
      setScenes(next);
      toast.success(`${next.filter((n) => n.jobId).length} sahne kuyruğa alındı — 2-10 dk sürebilir`);
      // Bakiyeyi yenile
      const { data: user } = await supabase.auth.getUser();
      if (user.user) {
        const { data: w } = await supabase
          .from("wallets")
          .select("balance_try")
          .eq("user_id", user.user.id)
          .maybeSingle();
        setBalance(Number(w?.balance_try ?? 0));
      }
    } finally {
      setBusy(false);
    }
  }

  async function mergeAndDownload() {
    const clips = scenes.filter((s) => s.status === "done" && s.resultUrl);
    if (clips.length < 2) return toast.error("En az 2 tamamlanmış klip gerekli");
    setMerging(true);
    setMergeProgress(0);
    try {
      const ff = await getFFmpeg();
      const files: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        setMergeProgress(Math.round(((i + 0.3) / (clips.length + 1)) * 100));
        const buf = await fetch(clips[i].resultUrl!).then((r) => r.arrayBuffer());
        const name = `c${i}.mp4`;
        await ff.writeFile(name, new Uint8Array(buf));
        files.push(name);
      }
      const listTxt = files.map((f) => `file '${f}'`).join("\n");
      await ff.writeFile("list.txt", new TextEncoder().encode(listTxt));
      setMergeProgress(80);
      // Aynı kalite/oranda olduklarından `-c copy` yeterli. Sorun olursa re-encode fallback.
      try {
        await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "out.mp4"]);
      } catch {
        await ff.exec([
          "-f", "concat", "-safe", "0", "-i", "list.txt",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
          "-c:a", "aac", "-b:a", "128k",
          "out.mp4",
        ]);
      }
      const out = (await ff.readFile("out.mp4")) as Uint8Array;
      // Temizle
      for (const f of files) await ff.deleteFile(f).catch(() => {});
      await ff.deleteFile("list.txt").catch(() => {});
      await ff.deleteFile("out.mp4").catch(() => {});
      setMergeProgress(100);
      downloadBlob(out, `siberphp-uzun-${Date.now()}.mp4`, "video/mp4");
      toast.success(`Birleştirildi · ${clips.length} sahne`);
    } catch (e) {
      toast.error("Birleştirme hatası: " + (e as Error).message);
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">
          $ ./ai-video --stitch --scenes={scenes.length}
          <span className="terminal-caret" />
        </div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Layers className="h-5 w-5" /> AI Uzun Video · Multi-Sahne
        </h1>
        <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
          2-6 sahne yaz. Her sahne ayrı ayrı üretilir, tarayıcında{" "}
          <span className="text-primary">otomatik birleştirilir</span>. Aynı karakter/atmosfer için
          her sahnede benzer tarif kullan (renk, ışık, karakter).
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs font-mono flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Wallet className="h-3 w-3 text-primary" />
            bakiye: <span className="text-primary">₺{balance?.toFixed(2) ?? "0.00"}</span>
          </span>
          <span className="text-muted-foreground">
            {scenes.length} sahne × {duration}s = ~{scenes.length * duration}s toplam
          </span>
        </div>
      </div>

      {/* Ortak ayarlar */}
      <div className="glass-card rounded-lg p-4 space-y-4">
        <div>
          <div className="text-[11px] font-mono text-muted-foreground mb-2">kalite (tüm sahneler için)</div>
          <div className="grid grid-cols-3 gap-2">
            {(["fast", "hd", "cinematic"] as Quality[]).map((q) => {
              const m = QUALITY_META[q];
              const Icon = m.icon;
              const active = quality === q;
              const p5 = prices[q]?.[5] ?? DEFAULT_PRICES[q][5];
              return (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  className={`text-left rounded-lg border p-3 font-mono transition-all ${
                    active ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-semibold">{m.label}</span>
                  </div>
                  <div className="mt-1 text-[10px] opacity-80">{m.desc}</div>
                  <div className="mt-1 text-[11px] text-primary">5s ₺{p5}/klip</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">klip süresi</div>
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
                  {s}s
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
      </div>

      {/* Sahneler */}
      <div className="glass-card rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-mono text-sm text-primary">$ sahneler ({scenes.length}/6)</div>
          <button
            onClick={addScene}
            disabled={scenes.length >= 6 || busy}
            className="inline-flex items-center gap-1 text-xs font-mono rounded border border-primary/40 bg-primary/5 px-2 py-1 text-primary hover:bg-primary/10 disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> sahne ekle
          </button>
        </div>
        {scenes.map((s, i) => (
          <div key={s.key} className="rounded border border-border/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">// sahne {i + 1}</span>
              <div className="flex items-center gap-2">
                <SceneStatus status={s.status} />
                {scenes.length > 2 && (
                  <button
                    onClick={() => removeScene(s.key)}
                    disabled={busy}
                    className="text-muted-foreground hover:text-red-400 disabled:opacity-40"
                    title="Sahneyi sil"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <Textarea
              value={s.prompt}
              onChange={(e) => updatePrompt(s.key, e.target.value)}
              placeholder={
                i === 0
                  ? "Örn: karanlık şehir sokağında, neon yağmurun altında bir dedektif yürüyor"
                  : "Devam eden sahne — aynı karakter/atmosferi anlat"
              }
              rows={2}
              className="font-mono text-sm"
              maxLength={800}
              disabled={busy || s.status === "queued" || s.status === "processing"}
            />
            {s.error && <div className="text-[11px] text-red-400 font-mono">✗ {s.error}</div>}
          </div>
        ))}
      </div>

      {/* Aksiyon */}
      <div className="glass-card rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-mono">
            <span className="text-muted-foreground">toplam maliyet →</span>{" "}
            <span className="text-primary text-lg">₺{totalCost}</span>{" "}
            <span className="text-muted-foreground text-xs">
              ({scenes.length} × ₺{unitCost})
            </span>
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            hazır: {doneCount}/{scenes.length}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={generateAll}
            disabled={busy || (balance ?? 0) < totalCost || validCount < 2}
            className="font-mono neon-glow"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "> "}
            {busy ? "sahneler gönderiliyor..." : `Tüm sahneleri üret · ₺${totalCost}`}
          </Button>

          <Button
            onClick={mergeAndDownload}
            disabled={!allDoneOrFailed || merging || doneCount < 2}
            variant="outline"
            className="font-mono"
          >
            {merging ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                birleştiriliyor... %{mergeProgress}
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Birleştir & İndir ({doneCount} klip)
              </>
            )}
          </Button>
        </div>

        {anyFailed && allDoneOrFailed && (
          <div className="text-[11px] font-mono text-yellow-400">
            ⚠ Bazı sahneler başarısız oldu — hazır olanları yine birleştirebilirsin. Başarısız
            sahnelerin ücreti otomatik iade edilir.
          </div>
        )}

        {merging && (
          <div className="w-full bg-muted/30 rounded h-1.5 overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${mergeProgress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SceneStatus({ status }: { status?: Scene["status"] }) {
  if (!status || status === "idle")
    return <span className="text-[10px] font-mono text-muted-foreground">bekliyor</span>;
  if (status === "queued")
    return (
      <span className="text-[10px] font-mono text-yellow-400 inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> kuyrukta
      </span>
    );
  if (status === "processing")
    return (
      <span className="text-[10px] font-mono text-blue-400 inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> işleniyor
      </span>
    );
  if (status === "done")
    return (
      <span className="text-[10px] font-mono text-primary inline-flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" /> hazır
      </span>
    );
  if (status === "failed")
    return (
      <span className="text-[10px] font-mono text-red-400 inline-flex items-center gap-1">
        <XCircle className="h-3 w-3" /> başarısız
      </span>
    );
  return null;
}

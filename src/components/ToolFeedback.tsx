import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { saveToolFeedback } from "@/lib/tool-usage.functions";

export function ToolFeedback({ toolKey }: { toolKey: string }) {
  const save = useServerFn(saveToolFeedback);
  const [rating, setRating] = useState(0);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(value: number) {
    setRating(value);
    setBusy(true);
    try {
      await save({ data: { toolKey, rating: value } });
      setSaved(true);
      toast.success("Kalite puanın kaydedildi");
    } catch {
      toast.error("Puan kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-card rounded-lg border border-primary/15 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-primary">$ quality-check</div>
          <div className="mt-1 text-sm font-semibold">Bu AI aracının kalitesi nasıldı?</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Puanın, üretim kalitesini ve hataları iyileştirmemize yardımcı olur.</div>
        </div>
        <div className="flex items-center gap-1" aria-label="Araç kalitesi puanı">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => void submit(value)}
              disabled={busy}
              aria-label={`${value} yıldız`}
              className="rounded p-1 text-muted-foreground transition hover:bg-primary/10 hover:text-yellow-400 disabled:opacity-50"
            >
              <Star className={`h-5 w-5 ${value <= rating ? "fill-yellow-400 text-yellow-400" : ""}`} />
            </button>
          ))}
        </div>
      </div>
      {saved ? <div className="mt-2 font-mono text-[10px] text-primary">✓ geri bildirimin alındı</div> : null}
    </div>
  );
}

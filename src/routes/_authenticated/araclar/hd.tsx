import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Upload, Download, Sparkles, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { streamImage } from "@/lib/streamImage";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/araclar/hd")({
  component: HdPage,
  head: () => ({ meta: [{ title: "Resim HD Yap — AI Araçlar" }] }),
});

type Mode = "hd" | "restore" | "colorize" | "denoise";
const MODES: { id: Mode; label: string; desc: string; price: number }[] = [
  { id: "hd", label: "HD / Netleştir", desc: "Detayları keskinleştir, çözünürlük artır", price: 5 },
  { id: "restore", label: "Fotoğraf Onar", desc: "Eski/hasarlı fotoğrafı iyileştir", price: 8 },
  { id: "colorize", label: "Renklendir", desc: "Siyah-beyaz → renkli", price: 8 },
  { id: "denoise", label: "Gürültü Temizle", desc: "Grain / sıkıştırma izlerini kaldır", price: 4 },
];

function HdPage() {
  const [input, setInput] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("hd");
  const fileRef = useRef<HTMLInputElement>(null);

  function onPick(f: File | undefined) {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      toast.error("Maks 8 MB");
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      setInput(r.result as string);
      setOutput(null);
      setIsFinal(false);
    };
    r.readAsDataURL(f);
  }

  async function run() {
    if (!input) return;
    const price = MODES.find((m) => m.id === mode)?.price ?? 5;
    if (!confirm(`Cüzdanınızdan ₺${price} düşülecek. Onaylıyor musunuz?`)) return;
    setLoading(true);
    setOutput(null);
    setIsFinal(false);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Oturum bulunamadı");
      await streamImage(
        "/api/enhance-image",
        { imageDataUrl: input, mode },
        (dataUrl, final) => {
          setOutput(dataUrl);
          if (final) setIsFinal(true);
        },
        { Authorization: `Bearer ${token}` },
      );
      toast.success(`Tamamlandı · ₺${price} düşüldü`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!output) return;
    const a = document.createElement("a");
    a.href = output;
    a.download = `enhanced-${Date.now()}.png`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">
          $ ./enhance --mode={mode}
          <span className="terminal-caret" />
        </div>
        <h1 className="mt-2 font-mono text-2xl neon-text">Resim HD Yap</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Bulanık, düşük çözünürlüklü veya eski fotoğrafları AI ile netleştir.
          Gemini 3 Pro Image ile üretilir — birkaç saniye sürer.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`glass-card rounded-lg p-3 text-left transition-all ${
              mode === m.id ? "border-primary shadow-[0_0_18px_hsl(var(--primary)/0.35)]" : ""
            }`}
          >
            <div className="font-mono text-sm">{m.label}</div>
            <div className="text-xs text-muted-foreground mt-1">{m.desc}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass-card rounded-lg p-4">
          <div className="font-mono text-xs text-muted-foreground mb-2">// input</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          {input ? (
            <img src={input} alt="input" className="rounded-md w-full object-contain max-h-[420px]" />
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full h-64 rounded-md border border-dashed border-primary/40 hover:bg-primary/5 flex flex-col items-center justify-center gap-2 text-muted-foreground"
            >
              <Upload className="h-8 w-8" />
              <span className="font-mono text-sm">Resim seç (maks 8 MB)</span>
            </button>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex-1 rounded-md border border-primary/30 py-2 font-mono text-sm hover:bg-primary/10"
            >
              Değiştir
            </button>
            <button
              onClick={run}
              disabled={!input || loading}
              className="flex-1 rounded-md bg-primary text-primary-foreground py-2 font-mono text-sm neon-glow disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "İşleniyor…" : "İyileştir"}
            </button>
          </div>
        </div>

        <div className="glass-card rounded-lg p-4">
          <div className="font-mono text-xs text-muted-foreground mb-2">// output</div>
          {output ? (
            <>
              <img
                src={output}
                alt="output"
                className={`rounded-md w-full object-contain max-h-[420px] transition-[filter] duration-300 ${
                  isFinal ? "blur-0" : "blur-md"
                }`}
              />
              <button
                onClick={download}
                disabled={!isFinal}
                className="mt-3 w-full rounded-md bg-primary text-primary-foreground py-2 font-mono text-sm neon-glow disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" /> İndir
              </button>
            </>
          ) : (
            <div className="w-full h-64 rounded-md border border-dashed border-muted flex items-center justify-center text-muted-foreground font-mono text-sm">
              {loading ? "AI çalışıyor…" : "Sonuç burada görünecek"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

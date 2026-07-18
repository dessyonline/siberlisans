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

type Mode = "hd" | "restore" | "colorize" | "denoise" | "custom";
const MODES: { id: Mode; label: string; desc: string; price: number }[] = [
  { id: "hd", label: "HD / Netleştir", desc: "Detayları keskinleştir, çözünürlük artır", price: 5 },
  { id: "restore", label: "Fotoğraf Onar", desc: "Eski/hasarlı fotoğrafı iyileştir", price: 8 },
  { id: "colorize", label: "Renklendir", desc: "Siyah-beyaz → renkli", price: 8 },
  { id: "denoise", label: "Gürültü Temizle", desc: "Grain / sıkıştırma izlerini kaldır", price: 4 },
  { id: "custom", label: "Özel Prompt", desc: "Kendi isteğini yaz — AI istediğini uygulasın", price: 6 },
];


function HdPage() {
  const [input, setInput] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("hd");
  const [prompt, setPrompt] = useState("");
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
    if (mode === "custom" && prompt.trim().length < 3) {
      toast.error("Özel modda prompt yaz (min 3 karakter)");
      return;
    }
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
        { imageDataUrl: input, mode, prompt: prompt.trim() || undefined },
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
        <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-mono text-primary">
          <Wallet className="h-3.5 w-3.5" /> Cüzdandan düşer · HD ₺5 · Onar/Renklendir ₺8 · Gürültü ₺4 · Özel ₺6
        </div>

        {/* Hızlı seçim (dropdown) */}
        <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <label className="font-mono text-xs text-muted-foreground shrink-0">
            $ mode →
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="w-full sm:w-auto rounded-md border border-primary/30 bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · ₺{m.price}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`glass-card rounded-lg p-3 text-left transition-all ${
              mode === m.id ? "border-primary shadow-[0_0_18px_hsl(var(--primary)/0.35)]" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="font-mono text-sm">{m.label}</div>
              <span className="text-xs font-mono text-yellow-400">₺{m.price}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{m.desc}</div>
          </button>
        ))}
      </div>

      {/* Prompt alanı — her modda opsiyonel, custom modda zorunlu */}
      <div className="glass-card rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-mono text-xs text-muted-foreground">
            // prompt {mode === "custom" ? "(zorunlu)" : "(opsiyonel · ek istek)"}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">{prompt.length}/800</div>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, 800))}
          placeholder={
            mode === "custom"
              ? "Örn: Bu fotoğrafı stüdyo ışığında profesyonel portre gibi göster, arka planı bulanıklaştır"
              : "Ek istek yaz (örn: cilt tonunu koru, gözleri belirginleştir) — boş bırakabilirsin"
          }
          rows={3}
          className="w-full rounded-md border border-primary/20 bg-background/50 p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
        />
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

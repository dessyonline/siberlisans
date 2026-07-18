import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Palette, Upload, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/palet")({
  component: Page,
  head: () => ({ meta: [{ title: "Renk Paleti Çıkarıcı — SiberPHP" }] }),
});

type Swatch = { hex: string; count: number };

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

async function extractPalette(file: File, k = 8): Promise<Swatch[]> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 200 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    // Quantize to 5 bits per channel to cluster similar colors
    const r = data[i] & 0xf8;
    const g = data[i + 1] & 0xf8;
    const b = data[i + 2] & 0xf8;
    const key = `${r},${g},${b}`;
    const cur = buckets.get(key);
    if (cur) cur.count++;
    else buckets.set(key, { r, g, b, count: 1 });
  }
  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, k)
    .map((s) => ({ hex: rgbToHex(s.r, s.g, s.b), count: s.count }));
}

function Page() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [palette, setPalette] = useState<Swatch[]>([]);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Sadece resim");
    setImgUrl(URL.createObjectURL(file));
    setBusy(true);
    try {
      const p = await extractPalette(file, 10);
      setPalette(p);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = (hex: string) => {
    navigator.clipboard.writeText(hex);
    toast.success(`${hex} kopyalandı`);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">
          $ ./palette --extract<span className="terminal-caret" />
        </div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Palette className="h-5 w-5" /> Renk Paleti Çıkarıcı
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Bir resimden hakim renkleri çıkar. Tarayıcıda çalışır, ücretsiz.
        </p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={busy} className="font-mono neon-glow">
          <Upload className="h-4 w-4 mr-2" />
          {busy ? "çıkarılıyor..." : "resim seç"}
        </Button>

        {imgUrl && (
          <div className="grid gap-4 md:grid-cols-2">
            <img src={imgUrl} alt="src" className="rounded border border-border/60 w-full" />
            <div className="space-y-2">
              {palette.map((s) => (
                <button
                  key={s.hex}
                  onClick={() => copy(s.hex)}
                  className="w-full flex items-center gap-3 rounded border border-border/60 p-2 hover:border-primary/40 transition"
                >
                  <div className="h-10 w-10 rounded" style={{ background: s.hex }} />
                  <span className="font-mono text-sm text-foreground">{s.hex}</span>
                  <span className="ml-auto text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                    <Copy className="h-3 w-3" />
                    kopyala
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

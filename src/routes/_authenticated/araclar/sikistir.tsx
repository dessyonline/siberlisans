import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Minimize2, Download, Loader2, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/sikistir")({
  component: Page,
  head: () => ({ meta: [{ title: "Resim Sıkıştırıcı — SiberPHP" }] }),
});

type Fmt = "jpeg" | "png" | "webp";

function bytesToKb(b: number) {
  return (b / 1024).toFixed(1);
}

async function processImage(
  file: File,
  opts: { quality: number; maxSize: number; format: Fmt },
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  let w = bitmap.width;
  let h = bitmap.height;
  const max = Math.max(w, h);
  if (opts.maxSize > 0 && max > opts.maxSize) {
    const s = opts.maxSize / max;
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const mime = opts.format === "png" ? "image/png" : opts.format === "webp" ? "image/webp" : "image/jpeg";
  const q = opts.format === "png" ? undefined : opts.quality;
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode fail"))), mime, q),
  );
  return { blob, width: w, height: h };
}

function Page() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState<{ file: File; url: string } | null>(null);
  const [out, setOut] = useState<{ url: string; size: number; w: number; h: number } | null>(null);
  const [quality, setQuality] = useState(80);
  const [maxSize, setMaxSize] = useState(1920);
  const [format, setFormat] = useState<Fmt>("jpeg");

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Sadece resim");
    if (file.size > 25 * 1024 * 1024) return toast.error("Max 25 MB");
    setSrc({ file, url: URL.createObjectURL(file) });
    setOut(null);
  };

  const run = async () => {
    if (!src) return;
    setBusy(true);
    try {
      const { blob, width, height } = await processImage(src.file, { quality: quality / 100, maxSize, format });
      setOut({ url: URL.createObjectURL(blob), size: blob.size, w: width, h: height });
      toast.success(`${bytesToKb(src.file.size)}KB → ${bytesToKb(blob.size)}KB`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ext = format === "jpeg" ? "jpg" : format;

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">
          $ ./compress --local<span className="terminal-caret" />
        </div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Minimize2 className="h-5 w-5" /> Resim Sıkıştır & Boyutlandır
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Tarayıcıda işlenir — resim sunucuya <span className="text-primary">yüklenmez</span>. Sınırsız ücretsiz.
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
        <div className="flex flex-wrap gap-3 items-end">
          <Button onClick={() => inputRef.current?.click()} variant="outline" className="font-mono">
            <Upload className="h-4 w-4 mr-2" />
            resim seç
          </Button>
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">format</div>
            <div className="flex gap-1">
              {(["jpeg", "webp", "png"] as Fmt[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-3 py-1.5 rounded font-mono text-xs border ${
                    format === f
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">kalite {format === "png" ? "(png yok)" : `${quality}%`}</div>
            <input
              type="range"
              min={30}
              max={100}
              value={quality}
              disabled={format === "png"}
              onChange={(e) => setQuality(parseInt(e.target.value))}
              className="w-40 accent-primary"
            />
          </div>
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">max boyut {maxSize}px</div>
            <input
              type="range"
              min={480}
              max={4000}
              step={80}
              value={maxSize}
              onChange={(e) => setMaxSize(parseInt(e.target.value))}
              className="w-40 accent-primary"
            />
          </div>
          <Button onClick={run} disabled={!src || busy} className="font-mono neon-glow">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "> "}
            {busy ? "işleniyor..." : "sıkıştır"}
          </Button>
        </div>

        {src && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-mono text-muted-foreground mb-1">
                orijinal · {bytesToKb(src.file.size)} KB
              </div>
              <img src={src.url} alt="Sıkıştırılacak kaynak görsel" className="rounded border border-border/60 w-full" />
            </div>
            {out && (
              <div>
                <div className="text-[11px] font-mono text-primary mb-1">
                  çıktı · {bytesToKb(out.size)} KB · {out.w}×{out.h} ·{" "}
                  {(((src.file.size - out.size) / src.file.size) * 100).toFixed(0)}% küçüldü
                </div>
                <img src={out.url} alt="Sıkıştırılmış çıktı görseli" className="rounded border border-primary/40 w-full" />
                <a
                  href={out.url}
                  download={`siberphp-compressed.${ext}`}
                  className="mt-2 inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-mono text-primary hover:bg-primary/10"
                >
                  <Download className="h-3 w-3" />
                  indir (.{ext})
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

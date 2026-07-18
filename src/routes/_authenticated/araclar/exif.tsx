import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck, Download, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/exif")({
  component: Page,
  head: () => ({ meta: [{ title: "EXIF Temizle — SiberPHP" }] }),
});

function Page() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState<{ file: File; url: string } | null>(null);
  const [out, setOut] = useState<{ url: string; size: number } | null>(null);
  const [origSize, setOrigSize] = useState(0);

  const handle = async (f: File) => {
    if (!f.type.startsWith("image/")) return toast.error("Sadece resim");
    if (f.size > 25 * 1024 * 1024) return toast.error("Max 25 MB");
    setSrc({ file: f, url: URL.createObjectURL(f) });
    setOrigSize(f.size);
    setOut(null);
    setBusy(true);
    try {
      const bmp = await createImageBitmap(f);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      const isPng = f.type === "image/png";
      const blob = await new Promise<Blob>((res, rej) =>
        c.toBlob((b) => (b ? res(b) : rej(new Error("encode fail"))), isPng ? "image/png" : "image/jpeg", isPng ? undefined : 0.95),
      );
      setOut({ url: URL.createObjectURL(blob), size: blob.size });
      toast.success("Tüm EXIF/GPS metadata silindi");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./exif-strip --local<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> EXIF & GPS Temizleyici
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Fotoğrafın <span className="text-primary">konum, kamera modeli, tarih</span> gibi gizli verilerini siler. Sosyal medyada paylaşmadan önce çalıştır.
        </p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-3">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
        <Button onClick={() => inputRef.current?.click()} disabled={busy} className="font-mono neon-glow">
          <Upload className="h-4 w-4 mr-2" /> {busy ? "işleniyor..." : "resim seç"}
        </Button>

        {src && out && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-mono text-muted-foreground mb-1">
                orijinal · {(origSize / 1024).toFixed(1)} KB · EXIF olabilir
              </div>
              <img src={src.url} alt="orig" className="rounded border border-border/60 w-full" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-primary mb-1">
                temizlenmiş · {(out.size / 1024).toFixed(1)} KB · 0 metadata
              </div>
              <img src={out.url} alt="clean" className="rounded border border-primary/40 w-full" />
              <a
                href={out.url}
                download={`siberphp-clean-${src.file.name.replace(/\.[^.]+$/, "")}.${src.file.type === "image/png" ? "png" : "jpg"}`}
                className="mt-2 inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-mono text-primary hover:bg-primary/10"
              >
                <Download className="h-3 w-3" /> temiz indir
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

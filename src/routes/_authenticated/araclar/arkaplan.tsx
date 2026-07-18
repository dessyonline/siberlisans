import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { removeBackground } from "@imgly/background-removal";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Eraser, Download, Loader2, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/arkaplan")({
  component: Page,
  head: () => ({ meta: [{ title: "Arkaplan Kaldırıcı — SiberPHP" }] }),
});

function Page() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Lütfen bir resim dosyası seç");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Dosya 15 MB'dan büyük olamaz");
      return;
    }
    setSrcUrl(URL.createObjectURL(file));
    setOutUrl(null);
    setBusy(true);
    setProgress(0);
    try {
      const blob = await removeBackground(file, {
        progress: (_key, current, total) => {
          if (total) setProgress(Math.round((current / total) * 100));
        },
      });
      setOutUrl(URL.createObjectURL(blob));
      toast.success("Arkaplan kaldırıldı");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">
          $ ./bg-remove --local<span className="terminal-caret" />
        </div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Eraser className="h-5 w-5" /> Arkaplan Kaldırıcı
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Tamamen tarayıcında çalışır — resmin sunucuya <span className="text-primary">yüklenmez</span>. 100% ücretsiz, sınırsız.
        </p>
      </div>

      <div className="glass-card rounded-lg p-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="font-mono neon-glow"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
          {busy ? `işleniyor ${progress}%` : "resim seç"}
        </Button>
        {busy && (
          <div className="mt-3 h-1.5 rounded bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {(srcUrl || outUrl) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {srcUrl && (
              <div>
                <div className="text-[11px] font-mono text-muted-foreground mb-1">orijinal</div>
                <img src={srcUrl} alt="orijinal" className="rounded border border-border/60 w-full" />
              </div>
            )}
            {outUrl && (
              <div>
                <div className="text-[11px] font-mono text-muted-foreground mb-1">arkaplansız (PNG)</div>
                <div
                  className="rounded border border-border/60 overflow-hidden"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%), linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%)",
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0, 8px 8px",
                  }}
                >
                  <img src={outUrl} alt="arkaplansız" className="w-full" />
                </div>
                <a
                  href={outUrl}
                  download="arkaplansiz.png"
                  className="mt-2 inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-mono text-primary hover:bg-primary/10"
                >
                  <Download className="h-3 w-3" />
                  PNG indir
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

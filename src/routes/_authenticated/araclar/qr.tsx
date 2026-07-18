import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { QrCode, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/qr")({
  component: Page,
  head: () => ({ meta: [{ title: "QR Kod Üretici — SiberPHP" }] }),
});

function Page() {
  const [text, setText] = useState("https://siberlisans.lovable.app");
  const [size, setSize] = useState(512);
  const [dark, setDark] = useState("#000000");
  const [light, setLight] = useState("#ffffff");
  const [level, setLevel] = useState<"L" | "M" | "Q" | "H">("M");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !text) return;
    QRCode.toCanvas(canvasRef.current, text, {
      width: size,
      margin: 2,
      errorCorrectionLevel: level,
      color: { dark, light },
    }).catch(() => toast.error("QR üretilemedi"));
  }, [text, size, dark, light, level]);

  const download = () => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "qr.png";
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">
          $ ./qr --gen<span className="terminal-caret" />
        </div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <QrCode className="h-5 w-5" /> QR Kod Üretici
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          URL, metin, WiFi, iletişim — sınırsız ücretsiz.
        </p>
      </div>

      <div className="glass-card rounded-lg p-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">içerik</div>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="URL veya metin"
              className="font-mono"
            />
          </div>
          <div className="flex gap-3">
            <div>
              <div className="text-[11px] font-mono text-muted-foreground mb-1">koyu</div>
              <input type="color" value={dark} onChange={(e) => setDark(e.target.value)} className="h-9 w-16 rounded border border-border bg-transparent" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-muted-foreground mb-1">açık</div>
              <input type="color" value={light} onChange={(e) => setLight(e.target.value)} className="h-9 w-16 rounded border border-border bg-transparent" />
            </div>
            <div>
              <div className="text-[11px] font-mono text-muted-foreground mb-1">hata düz.</div>
              <div className="flex gap-1">
                {(["L", "M", "Q", "H"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`px-2 py-1.5 rounded font-mono text-xs border ${
                      level === l ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">boyut {size}px</div>
            <input
              type="range"
              min={128}
              max={1024}
              step={32}
              value={size}
              onChange={(e) => setSize(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <Button onClick={download} className="font-mono neon-glow">
            <Download className="h-4 w-4 mr-2" />
            PNG indir
          </Button>
        </div>
        <div className="flex items-center justify-center rounded border border-border/60 bg-muted/20 p-4">
          <canvas ref={canvasRef} className="max-w-full h-auto" />
        </div>
      </div>
    </div>
  );
}

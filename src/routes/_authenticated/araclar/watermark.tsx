import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Stamp, Download, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/watermark")({
  component: Page,
  head: () => ({ meta: [{ title: "Watermark — SiberPHP" }] }),
});

type Pos = "tl" | "tr" | "bl" | "br" | "center" | "tile";

function Page() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [text, setText] = useState("© siberphp.com");
  const [size, setSize] = useState(48);
  const [opacity, setOpacity] = useState(60);
  const [color, setColor] = useState("#ffffff");
  const [pos, setPos] = useState<Pos>("br");
  const [outUrl, setOutUrl] = useState<string | null>(null);

  const load = (f: File) => {
    if (!f.type.startsWith("image/")) return toast.error("Sadece resim");
    if (f.size > 25 * 1024 * 1024) return toast.error("Max 25 MB");
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => { setImg(im); setOutUrl(null); };
    im.src = url;
  };

  const apply = () => {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    ctx.globalAlpha = opacity / 100;
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textBaseline = "middle";
    const pad = size * 0.6;
    const m = ctx.measureText(text);
    const tw = m.width;
    const th = size;

    const drawAt = (x: number, y: number, align: CanvasTextAlign) => {
      ctx.textAlign = align;
      // shadow for legibility
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      ctx.fillText(text, x, y);
      ctx.shadowBlur = 0;
    };

    if (pos === "tile") {
      ctx.save();
      ctx.rotate(-Math.PI / 8);
      ctx.textAlign = "center";
      const step = Math.max(tw, th) * 2.2;
      for (let y = -c.height; y < c.height * 2; y += step) {
        for (let x = -c.width; x < c.width * 2; x += step) {
          ctx.fillText(text, x, y);
        }
      }
      ctx.restore();
    } else {
      const map: Record<Exclude<Pos, "tile">, [number, number, CanvasTextAlign]> = {
        tl: [pad, pad + th / 2, "left"],
        tr: [c.width - pad, pad + th / 2, "right"],
        bl: [pad, c.height - pad - th / 2, "left"],
        br: [c.width - pad, c.height - pad - th / 2, "right"],
        center: [c.width / 2, c.height / 2, "center"],
      };
      const [x, y, a] = map[pos];
      drawAt(x, y, a);
    }

    c.toBlob((b) => {
      if (b) { setOutUrl(URL.createObjectURL(b)); toast.success("filigran uygulandı"); }
    }, "image/png");
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./watermark --local<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Stamp className="h-5 w-5" /> Metin Watermark
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Tarayıcıda — resim sunucuya gitmez.</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-4">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        <div className="flex flex-wrap gap-2 items-end">
          <Button onClick={() => inputRef.current?.click()} variant="outline" className="font-mono">
            <Upload className="h-4 w-4 mr-1" /> resim seç
          </Button>
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">metin</div>
            <Input value={text} onChange={(e) => setText(e.target.value)} className="w-56 font-mono text-xs" />
          </div>
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">boyut {size}px</div>
            <input type="range" min={12} max={160} value={size} onChange={(e) => setSize(+e.target.value)} className="w-36 accent-primary" />
          </div>
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">opaklık {opacity}%</div>
            <input type="range" min={10} max={100} value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="w-36 accent-primary" />
          </div>
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">renk</div>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 rounded cursor-pointer bg-transparent border border-border" />
          </div>
          <div>
            <div className="text-[11px] font-mono text-muted-foreground mb-1">konum</div>
            <div className="flex gap-1 flex-wrap">
              {(["tl", "tr", "bl", "br", "center", "tile"] as Pos[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPos(p)}
                  className={`px-2 py-1 rounded font-mono text-[10px] border ${pos === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={apply} disabled={!img} className="font-mono neon-glow">{"> "}uygula</Button>
        </div>

        {outUrl && (
          <div>
            <div className="text-[11px] font-mono text-primary mb-1">çıktı</div>
            <img src={outUrl} alt="Filigran eklenmiş çıktı görseli" className="rounded border border-primary/40 max-w-full" />
            <a
              href={outUrl}
              download="siberphp-watermark.png"
              className="mt-2 inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-mono text-primary hover:bg-primary/10"
            >
              <Download className="h-3 w-3" /> PNG indir
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

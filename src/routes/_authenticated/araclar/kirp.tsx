import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Crop, Download, Upload, RotateCw, FlipHorizontal, FlipVertical } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/kirp")({
  component: Page,
  head: () => ({ meta: [{ title: "Resim Kırp & Döndür — SiberPHP" }] }),
});

function Page() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rot, setRot] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [dragging, setDragging] = useState<null | { sx: number; sy: number; ox: number; oy: number }>(null);
  const [outUrl, setOutUrl] = useState<string | null>(null);

  const load = (f: File) => {
    if (!f.type.startsWith("image/")) return toast.error("Sadece resim");
    if (f.size > 25 * 1024 * 1024) return toast.error("Max 25 MB");
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      setImg(im);
      setCrop({ x: 0, y: 0, w: im.width, h: im.height });
      setOutUrl(null);
    };
    im.src = url;
  };

  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const c = canvasRef.current;
    const maxW = 800;
    const scale = Math.min(1, maxW / img.width);
    c.width = img.width * scale;
    c.height = img.height * scale;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // crop overlay
    const rx = (crop.x / img.width) * c.width;
    const ry = (crop.y / img.height) * c.height;
    const rw = (crop.w / img.width) * c.width;
    const rh = (crop.h / img.height) * c.height;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, c.width, ry);
    ctx.fillRect(0, ry + rh, c.width, c.height - ry - rh);
    ctx.fillRect(0, ry, rx, rh);
    ctx.fillRect(rx + rw, ry, c.width - rx - rw, rh);
    ctx.strokeStyle = "#00ff9d";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
  }, [img, crop]);

  const onDown = (e: React.MouseEvent) => {
    if (!img || !canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    setDragging({ sx: e.clientX - r.left, sy: e.clientY - r.top, ox: e.clientX - r.left, oy: e.clientY - r.top });
  };
  const onMove = (e: React.MouseEvent) => {
    if (!dragging || !img || !canvasRef.current) return;
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const sx = Math.min(dragging.sx, x);
    const sy = Math.min(dragging.sy, y);
    const w = Math.abs(x - dragging.sx);
    const h = Math.abs(y - dragging.sy);
    setCrop({
      x: Math.round((sx / c.width) * img.width),
      y: Math.round((sy / c.height) * img.height),
      w: Math.max(10, Math.round((w / c.width) * img.width)),
      h: Math.max(10, Math.round((h / c.height) * img.height)),
    });
  };
  const onUp = () => setDragging(null);

  const apply = () => {
    if (!img) return;
    // crop first
    const c = document.createElement("canvas");
    c.width = crop.w;
    c.height = crop.h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

    // then rotate + flip
    const angle = ((rot % 360) + 360) % 360;
    const rad = (angle * Math.PI) / 180;
    const swap = angle === 90 || angle === 270;
    const outC = document.createElement("canvas");
    outC.width = swap ? c.height : c.width;
    outC.height = swap ? c.width : c.height;
    const octx = outC.getContext("2d")!;
    octx.translate(outC.width / 2, outC.height / 2);
    octx.rotate(rad);
    octx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    octx.drawImage(c, -c.width / 2, -c.height / 2);

    outC.toBlob((b) => {
      if (b) {
        setOutUrl(URL.createObjectURL(b));
        toast.success(`${outC.width}×${outC.height}`);
      }
    }, "image/png");
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./crop --local<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Crop className="h-5 w-5" /> Resim Kırp & Döndür
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Tarayıcıda çalışır. Fare ile alan seç, çevir/döndür.</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-3">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => inputRef.current?.click()} variant="outline" className="font-mono">
            <Upload className="h-4 w-4 mr-1" /> resim seç
          </Button>
          <Button onClick={() => setRot((r) => r + 90)} disabled={!img} variant="outline" className="font-mono">
            <RotateCw className="h-4 w-4 mr-1" /> döndür 90°
          </Button>
          <Button onClick={() => setFlipH((v) => !v)} disabled={!img} variant={flipH ? "default" : "outline"} className="font-mono">
            <FlipHorizontal className="h-4 w-4 mr-1" /> yatay çevir
          </Button>
          <Button onClick={() => setFlipV((v) => !v)} disabled={!img} variant={flipV ? "default" : "outline"} className="font-mono">
            <FlipVertical className="h-4 w-4 mr-1" /> dikey çevir
          </Button>
          <Button onClick={apply} disabled={!img} className="font-mono neon-glow">{"> "}uygula</Button>
        </div>

        {img && (
          <div className="flex flex-wrap gap-4">
            <div>
              <div className="text-[11px] font-mono text-muted-foreground mb-1">
                orijinal · {img.width}×{img.height} · alan seç (fare ile sürükle)
              </div>
              <canvas
                ref={canvasRef}
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={onUp}
                onMouseLeave={onUp}
                className="rounded border border-border/60 cursor-crosshair max-w-full"
              />
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                seçim: {crop.x},{crop.y} · {crop.w}×{crop.h}
              </div>
            </div>
            {outUrl && (
              <div>
                <div className="text-[11px] font-mono text-primary mb-1">çıktı</div>
                <img src={outUrl} alt="çıktı" className="rounded border border-primary/40 max-w-[400px]" />
                <a
                  href={outUrl}
                  download="siberphp-crop.png"
                  className="mt-2 inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-mono text-primary hover:bg-primary/10"
                >
                  <Download className="h-3 w-3" /> PNG indir
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

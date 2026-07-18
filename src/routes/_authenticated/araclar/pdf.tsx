import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileText, Download, Upload, X, Loader2 } from "lucide-react";
import jsPDF from "jspdf";

export const Route = createFileRoute("/_authenticated/araclar/pdf")({
  component: Page,
  head: () => ({ meta: [{ title: "Resim → PDF — SiberPHP" }] }),
});

type Item = { id: string; file: File; url: string };

async function loadImageSize(url: string): Promise<{ w: number; h: number; dataUrl: string }> {
  const im = new Image();
  await new Promise<void>((res, rej) => {
    im.onload = () => res();
    im.onerror = () => rej(new Error("load fail"));
    im.src = url;
  });
  const c = document.createElement("canvas");
  c.width = im.width;
  c.height = im.height;
  c.getContext("2d")!.drawImage(im, 0, 0);
  return { w: im.width, h: im.height, dataUrl: c.toDataURL("image/jpeg", 0.92) };
}

function Page() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [pageMode, setPageMode] = useState<"fit" | "a4" | "letter">("fit");

  const add = (files: FileList) => {
    const arr: Item[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 25 * 1024 * 1024) continue;
      arr.push({ id: crypto.randomUUID(), file: f, url: URL.createObjectURL(f) });
    }
    setItems((prev) => [...prev, ...arr]);
  };

  const remove = (id: string) => setItems((p) => p.filter((x) => x.id !== id));
  const move = (id: string, dir: -1 | 1) => {
    setItems((p) => {
      const i = p.findIndex((x) => x.id === id);
      if (i < 0) return p;
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const c = [...p];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  };

  const build = async () => {
    if (!items.length) return;
    setBusy(true);
    try {
      let doc: jsPDF | null = null;
      for (let i = 0; i < items.length; i++) {
        const { w, h, dataUrl } = await loadImageSize(items[i].url);
        if (!doc) {
          if (pageMode === "fit") {
            doc = new jsPDF({ orientation: w > h ? "l" : "p", unit: "px", format: [w, h] });
          } else {
            doc = new jsPDF({ orientation: "p", unit: "mm", format: pageMode });
          }
        } else {
          if (pageMode === "fit") {
            doc.addPage([w, h], w > h ? "l" : "p");
          } else {
            doc.addPage(pageMode, "p");
          }
        }
        if (pageMode === "fit") {
          doc.addImage(dataUrl, "JPEG", 0, 0, w, h);
        } else {
          const pw = doc.internal.pageSize.getWidth();
          const ph = doc.internal.pageSize.getHeight();
          const r = Math.min(pw / w, ph / h);
          const dw = w * r;
          const dh = h * r;
          doc.addImage(dataUrl, "JPEG", (pw - dw) / 2, (ph - dh) / 2, dw, dh);
        }
      }
      doc!.save(`siberphp-${items.length}-resim.pdf`);
      toast.success(`${items.length} sayfalık PDF indirildi`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./img2pdf --local<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <FileText className="h-5 w-5" /> Resim → PDF
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Birden fazla resmi tek PDF'e birleştir. Sürükleyerek sırala. Tarayıcıda çalışır.
        </p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && add(e.target.files)}
        />
        <div className="flex flex-wrap gap-2 items-center">
          <Button onClick={() => inputRef.current?.click()} variant="outline" className="font-mono">
            <Upload className="h-4 w-4 mr-1" /> resim ekle
          </Button>
          <div className="flex gap-1">
            {(["fit", "a4", "letter"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPageMode(m)}
                className={`px-3 py-1.5 rounded font-mono text-xs border ${
                  pageMode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {m === "fit" ? "resme uydur" : m.toUpperCase()}
              </button>
            ))}
          </div>
          <Button onClick={build} disabled={busy || !items.length} className="font-mono neon-glow">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
            PDF indir ({items.length})
          </Button>
        </div>

        {items.length > 0 && (
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
            {items.map((it, i) => (
              <div key={it.id} className="rounded border border-border/60 overflow-hidden group relative">
                <img src={it.url} alt={it.file.name} className="w-full h-32 object-cover" />
                <div className="absolute top-1 right-1 flex gap-1">
                  <button onClick={() => remove(it.id)} className="rounded bg-black/70 p-1 hover:bg-red-500/80">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="absolute bottom-0 inset-x-0 bg-black/70 p-1 flex items-center justify-between font-mono text-[10px]">
                  <span className="text-primary">#{i + 1}</span>
                  <div className="flex gap-1">
                    <button onClick={() => move(it.id, -1)} className="px-1 hover:text-primary" disabled={i === 0}>↑</button>
                    <button onClick={() => move(it.id, 1)} className="px-1 hover:text-primary" disabled={i === items.length - 1}>↓</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

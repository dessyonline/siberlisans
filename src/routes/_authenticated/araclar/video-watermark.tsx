import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { getFFmpeg, downloadBlob } from "@/lib/ffmpeg-client";

export const Route = createFileRoute("/_authenticated/araclar/video-watermark")({
  component: Page,
  head: () => ({ meta: [{ title: "Video Watermark — SiberPHP" }] }),
});

const POSITIONS: Record<string, string> = {
  "sol-üst": "x=20:y=20",
  "sağ-üst": "x=w-tw-20:y=20",
  "sol-alt": "x=20:y=h-th-20",
  "sağ-alt": "x=w-tw-20:y=h-th-20",
  "orta": "x=(w-tw)/2:y=(h-th)/2",
  "alt-orta": "x=(w-tw)/2:y=h-th-20",
};

function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("© SiberPHP");
  const [pos, setPos] = useState("sağ-alt");
  const [size, setSize] = useState("28");
  const [opacity, setOpacity] = useState("0.7");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [outName, setOutName] = useState("");
  const [err, setErr] = useState("");
  const outRef = useRef<Uint8Array | null>(null);

  async function run() {
    if (!file || !text.trim()) return;
    setBusy(true); setProgress(0); setErr(""); setOutUrl(null);
    try {
      const ff = await getFFmpeg();
      const ext = file.name.split(".").pop() || "mp4";
      const inputName = `in.${ext}`;
      await ff.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
      // Escape special chars for drawtext
      const safe = text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
      const alpha = Math.max(0, Math.min(1, parseFloat(opacity) || 0.7));
      const filter = `drawtext=text='${safe}':fontcolor=white@${alpha}:fontsize=${parseInt(size) || 28}:box=1:boxcolor=black@${alpha * 0.4}:boxborderw=6:${POSITIONS[pos]}`;
      const onProgress = ({ progress }: { progress: number }) => setProgress(Math.round(Math.min(1, Math.max(0, progress)) * 100));
      ff.on("progress", onProgress);
      try {
        await ff.exec(["-i", inputName, "-vf", filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "copy", "out.mp4"]);
      } finally {
        ff.off("progress", onProgress);
      }
      const data = (await ff.readFile("out.mp4")) as Uint8Array;
      outRef.current = data;
      setOutUrl(URL.createObjectURL(new Blob([data as BlobPart], { type: "video/mp4" })));
      setOutName(file.name.replace(/\.[^.]+$/, "") + "-watermark.mp4");
      await ff.deleteFile(inputName).catch(() => {});
      await ff.deleteFile("out.mp4").catch(() => {});
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/araclar" className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> araçlar
      </Link>
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <h1 className="font-mono text-2xl neon-text">Video Watermark</h1>
        <p className="mt-1 text-sm text-muted-foreground">Videoya metin filigranı ekle — 6 pozisyon, boyut ve şeffaflık kontrolü.</p>
        <p className="mt-1 text-[11px] font-mono text-primary/70">✓ Tarayıcıda · ücretsiz · sunucusuz</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-4">
        <label className="flex items-center gap-2 rounded-md border border-dashed border-primary/40 p-4 cursor-pointer hover:border-primary/70">
          <Upload className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs text-muted-foreground">{file ? file.name : "Video seç"}</span>
          <input type="file" accept="video/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setOutUrl(null); }} />
        </label>

        <label className="block space-y-1">
          <div className="font-mono text-xs text-muted-foreground">Filigran metni</div>
          <input value={text} onChange={(e) => setText(e.target.value)}
            className="w-full rounded-md bg-black/40 border border-primary/30 px-3 py-2 font-mono text-sm" />
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.keys(POSITIONS).map((p) => (
            <button key={p} type="button" onClick={() => setPos(p)}
              className={`rounded border px-3 py-2 font-mono text-xs ${pos === p ? "border-primary text-primary" : "border-primary/30 text-muted-foreground"}`}>
              {p}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="font-mono text-xs text-muted-foreground">Punto</div>
            <input type="number" min="10" max="120" value={size} onChange={(e) => setSize(e.target.value)}
              className="w-full rounded-md bg-black/40 border border-primary/30 px-3 py-2 font-mono text-sm" />
          </label>
          <label className="space-y-1">
            <div className="font-mono text-xs text-muted-foreground">Şeffaflık (0-1)</div>
            <input type="number" min="0.1" max="1" step="0.1" value={opacity} onChange={(e) => setOpacity(e.target.value)}
              className="w-full rounded-md bg-black/40 border border-primary/30 px-3 py-2 font-mono text-sm" />
          </label>
        </div>

        <button type="button" onClick={run} disabled={!file || busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 font-mono text-sm neon-glow disabled:opacity-40">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? `İşleniyor ${progress}%` : "Filigranı Uygula"}
        </button>

        {busy && <div className="h-1.5 rounded-full bg-primary/10"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div>}
        {err && <pre className="max-h-24 overflow-auto rounded bg-black/40 p-2 text-[10px] text-red-400">{err}</pre>}

        {outUrl && (
          <div className="space-y-2 border-t border-primary/20 pt-4">
            <div className="font-mono text-xs text-primary">✓ Hazır</div>
            <video src={outUrl} controls className="w-full max-h-96 rounded-md bg-black" />
            <button type="button" onClick={() => outRef.current && downloadBlob(outRef.current, outName, "video/mp4")}
              className="w-full rounded-md border border-primary/50 px-4 py-2 font-mono text-sm text-primary hover:bg-primary/10">
              ⬇ İndir ({outName})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

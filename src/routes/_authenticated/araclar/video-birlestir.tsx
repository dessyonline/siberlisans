import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, Loader2, Upload, X } from "lucide-react";
import { getFFmpeg, downloadBlob } from "@/lib/ffmpeg-client";

export const Route = createFileRoute("/_authenticated/araclar/video-birlestir")({
  component: Page,
  head: () => ({ meta: [{ title: "Video Birleştir — SiberPHP" }] }),
});

function Page() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState("");
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [outName, setOutName] = useState("");
  const outRef = useRef<Uint8Array | null>(null);

  async function run() {
    if (files.length < 2) return;
    setBusy(true); setProgress(0); setErr(""); setOutUrl(null);
    try {
      const ff = await getFFmpeg();
      const names: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = f.name.split(".").pop() || "mp4";
        const n = `in${i}.${ext}`;
        await ff.writeFile(n, new Uint8Array(await f.arrayBuffer()));
        names.push(n);
      }
      // Re-encode each to same params via concat filter (safer than concat demuxer for mixed sources)
      const inputs: string[] = [];
      names.forEach((n) => { inputs.push("-i", n); });
      const filter = names.map((_, i) => `[${i}:v:0][${i}:a:0]`).join("") + `concat=n=${names.length}:v=1:a=1[v][a]`;
      const onProgress = ({ progress }: { progress: number }) => setProgress(Math.round(Math.min(1, Math.max(0, progress)) * 100));
      ff.on("progress", onProgress);
      try {
        await ff.exec([...inputs, "-filter_complex", filter, "-map", "[v]", "-map", "[a]",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "out.mp4"]);
      } finally { ff.off("progress", onProgress); }
      const data = (await ff.readFile("out.mp4")) as Uint8Array;
      outRef.current = data;
      setOutUrl(URL.createObjectURL(new Blob([data as BlobPart], { type: "video/mp4" })));
      setOutName("birlesik.mp4");
      for (const n of names) await ff.deleteFile(n).catch(() => {});
      await ff.deleteFile("out.mp4").catch(() => {});
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Link to="/araclar" className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> araçlar
      </Link>
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <h1 className="font-mono text-2xl neon-text">Video Birleştir</h1>
        <p className="mt-1 text-sm text-muted-foreground">2 veya daha fazla video klibini sırayla birleştir. Ses + görüntü yeniden kodlanır.</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-4">
        <label className="flex items-center gap-2 rounded-md border border-dashed border-primary/40 p-4 cursor-pointer hover:border-primary/70">
          <Upload className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs text-muted-foreground">Video(lar) ekle — çoklu seçim destekli</span>
          <input type="file" accept="video/*" multiple className="hidden"
            onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])} />
        </label>

        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between rounded bg-black/30 px-3 py-2 font-mono text-xs">
                <span>{i + 1}. {f.name}</span>
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button type="button" onClick={run} disabled={files.length < 2 || busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 font-mono text-sm neon-glow disabled:opacity-40">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? `Birleştiriliyor ${progress}%` : "Birleştir"}
        </button>

        {busy && <div className="h-1.5 rounded-full bg-primary/10"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div>}
        {err && <pre className="max-h-24 overflow-auto rounded bg-black/40 p-2 text-[10px] text-red-400">{err}</pre>}

        {outUrl && (
          <div className="space-y-2 border-t border-primary/20 pt-4">
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

import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { runFFmpeg, downloadBlob } from "@/lib/ffmpeg-client";

export type BuildArgs = (input: string, output: string, file: File) => {
  args: string[];
  outputName: string;
  outMime: string;
  outExt: string;
};

interface Props {
  title: string;
  desc: string;
  accept?: string;
  buildArgs: BuildArgs;
  children?: React.ReactNode; // options UI (rendered above button)
  outputPreviewKind?: "video" | "image" | "audio" | "none";
}

export function VideoToolShell({ title, desc, accept = "video/*", buildArgs, children, outputPreviewKind = "video" }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState("");
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [outMime, setOutMime] = useState("");
  const [outName, setOutName] = useState("");
  const outRef = useRef<Uint8Array | null>(null);

  async function run() {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    setLog("");
    setOutUrl(null);
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const inputName = `in.${ext}`;
      const { args, outputName, outMime, outExt } = buildArgs(inputName, "out", file);
      const buf = new Uint8Array(await file.arrayBuffer());
      const out = await runFFmpeg(inputName, buf, args, outputName, (p) => setProgress(Math.round(p * 100)));
      outRef.current = out;
      const blob = new Blob([out as BlobPart], { type: outMime });
      setOutUrl(URL.createObjectURL(blob));
      setOutMime(outMime);
      const baseName = file.name.replace(/\.[^.]+$/, "");
      setOutName(`${baseName}-${title.toLowerCase().replace(/\s+/g, "-")}.${outExt}`);
    } catch (e: unknown) {
      setLog(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  function saveOut() {
    if (!outRef.current) return;
    downloadBlob(outRef.current, outName, outMime);
  }

  return (
    <div className="space-y-4">
      <Link to="/araclar" className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> araçlar
      </Link>
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <h1 className="font-mono text-2xl neon-text">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        <p className="mt-1 text-[11px] font-mono text-primary/70">✓ Tarayıcında çalışır · sunucuya yüklenmez · ücretsiz</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-4">
        <label className="flex items-center gap-2 rounded-md border border-dashed border-primary/40 p-4 cursor-pointer hover:border-primary/70 transition">
          <Upload className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs text-muted-foreground">
            {file ? file.name : `Dosya seç (${accept})`}
          </span>
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setOutUrl(null);
            }}
          />
        </label>

        {children}

        <button
          type="button"
          onClick={run}
          disabled={!file || busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 font-mono text-sm neon-glow disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? `İşleniyor ${progress}%` : "Çalıştır"}
        </button>

        {busy && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        {log && <pre className="max-h-24 overflow-auto rounded bg-black/40 p-2 text-[10px] font-mono text-red-400 whitespace-pre-wrap">{log}</pre>}

        {outUrl && (
          <div className="space-y-2 border-t border-primary/20 pt-4">
            <div className="font-mono text-xs text-primary">✓ Hazır</div>
            {outputPreviewKind === "video" && <video src={outUrl} controls className="w-full max-h-96 rounded-md bg-black" />}
            {outputPreviewKind === "image" && <img src={outUrl} alt="output" className="w-full max-h-96 object-contain rounded-md bg-black" />}
            {outputPreviewKind === "audio" && <audio src={outUrl} controls className="w-full" />}
            <button
              type="button"
              onClick={saveOut}
              className="w-full rounded-md border border-primary/50 px-4 py-2 font-mono text-sm text-primary hover:bg-primary/10"
            >
              ⬇ İndir ({outName})
            </button>
          </div>
        )}
      </div>

      <div className="glass-card rounded-lg p-4 text-[11px] text-muted-foreground font-mono">
        Not: İlk çalıştırmada ~30MB ffmpeg motoru indirilir (sonraki kullanımlarda cache'lidir). Büyük dosyalar tarayıcı belleğine sığmalı (~1GB altı).
      </div>
    </div>
  );
}

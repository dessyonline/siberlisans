import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { VideoToolShell } from "@/components/VideoToolShell";

export const Route = createFileRoute("/_authenticated/araclar/video-sikistir")({
  component: Page,
  head: () => ({ meta: [{ title: "Video Sıkıştır — SiberPHP" }] }),
});

function Page() {
  const [crf, setCrf] = useState("28");
  const [preset, setPreset] = useState("veryfast");

  return (
    <VideoToolShell
      title="Video Sıkıştır"
      desc="H.264 ile boyutu düşür. CRF ne kadar yüksekse dosya o kadar küçük (18=yüksek kalite, 30=küçük)."
      buildArgs={(input) => ({
        args: ["-i", input, "-c:v", "libx264", "-preset", preset, "-crf", crf, "-c:a", "aac", "-b:a", "128k", "out.mp4"],
        outputName: "out.mp4",
        outMime: "video/mp4",
        outExt: "mp4",
      })}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <div className="font-mono text-xs text-muted-foreground">CRF (18–32)</div>
          <input type="number" min="18" max="35" value={crf} onChange={(e) => setCrf(e.target.value)}
            className="w-full rounded-md bg-black/40 border border-primary/30 px-3 py-2 font-mono text-sm" />
        </label>
        <label className="space-y-1">
          <div className="font-mono text-xs text-muted-foreground">Preset</div>
          <select value={preset} onChange={(e) => setPreset(e.target.value)}
            className="w-full rounded-md bg-black/40 border border-primary/30 px-3 py-2 font-mono text-sm">
            {["ultrafast", "veryfast", "fast", "medium", "slow"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
    </VideoToolShell>
  );
}

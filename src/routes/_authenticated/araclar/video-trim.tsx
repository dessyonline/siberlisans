import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { VideoToolShell } from "@/components/VideoToolShell";

export const Route = createFileRoute("/_authenticated/araclar/video-trim")({
  component: Page,
  head: () => ({ meta: [{ title: "Video Kırp/Kes — SiberPHP" }] }),
});

function Page() {
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("10");

  return (
    <VideoToolShell
      title="Video Kırp/Kes"
      desc="Başlangıç ve bitiş saniyesi vererek videoyu keser — yeniden kodlamaz, çok hızlıdır."
      buildArgs={(input) => {
        const s = Math.max(0, parseFloat(start) || 0);
        const e = Math.max(s + 0.1, parseFloat(end) || s + 1);
        return {
          args: ["-ss", String(s), "-to", String(e), "-i", input, "-c", "copy", "out.mp4"],
          outputName: "out.mp4",
          outMime: "video/mp4",
          outExt: "mp4",
        };
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <div className="font-mono text-xs text-muted-foreground">Başlangıç (sn)</div>
          <input type="number" min="0" step="0.1" value={start} onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-md bg-black/40 border border-primary/30 px-3 py-2 font-mono text-sm" />
        </label>
        <label className="space-y-1">
          <div className="font-mono text-xs text-muted-foreground">Bitiş (sn)</div>
          <input type="number" min="0" step="0.1" value={end} onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-md bg-black/40 border border-primary/30 px-3 py-2 font-mono text-sm" />
        </label>
      </div>
    </VideoToolShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { VideoToolShell } from "@/components/VideoToolShell";

export const Route = createFileRoute("/_authenticated/araclar/video-hiz")({
  component: Page,
  head: () => ({ meta: [{ title: "Video Hız Değiştir — SiberPHP" }] }),
});

function Page() {
  const [speed, setSpeed] = useState("2");

  return (
    <VideoToolShell
      title="Video Hız Değiştir"
      desc="0.5x yavaşlatma, 2x/4x hızlandırma. Ses de senkron kalır."
      buildArgs={(input) => {
        const s = Math.max(0.25, Math.min(4, parseFloat(speed) || 1));
        // video PTS = 1/s ; audio atempo supports 0.5-2, chain when needed
        const atempo: string[] = [];
        let remain = s;
        while (remain > 2) { atempo.push("atempo=2.0"); remain /= 2; }
        while (remain < 0.5) { atempo.push("atempo=0.5"); remain /= 0.5; }
        atempo.push(`atempo=${remain.toFixed(3)}`);
        return {
          args: [
            "-i", input,
            "-filter_complex", `[0:v]setpts=${(1 / s).toFixed(4)}*PTS[v];[0:a]${atempo.join(",")}[a]`,
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "out.mp4",
          ],
          outputName: "out.mp4",
          outMime: "video/mp4",
          outExt: "mp4",
        };
      }}
    >
      <label className="block space-y-1">
        <div className="font-mono text-xs text-muted-foreground">Hız çarpanı (0.25 – 4)</div>
        <div className="flex gap-2">
          {["0.5", "1.5", "2", "3", "4"].map((v) => (
            <button key={v} type="button" onClick={() => setSpeed(v)}
              className={`rounded border px-3 py-1 font-mono text-xs ${speed === v ? "border-primary text-primary" : "border-primary/30 text-muted-foreground"}`}>
              {v}x
            </button>
          ))}
        </div>
        <input type="number" min="0.25" max="4" step="0.25" value={speed} onChange={(e) => setSpeed(e.target.value)}
          className="w-full rounded-md bg-black/40 border border-primary/30 px-3 py-2 font-mono text-sm mt-2" />
      </label>
    </VideoToolShell>
  );
}

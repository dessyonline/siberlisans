import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { VideoToolShell } from "@/components/VideoToolShell";

export const Route = createFileRoute("/_authenticated/araclar/video-gif")({
  component: Page,
  head: () => ({ meta: [{ title: "Video → GIF — SiberPHP" }] }),
});

function Page() {
  const [start, setStart] = useState("0");
  const [dur, setDur] = useState("3");
  const [fps, setFps] = useState("15");
  const [width, setWidth] = useState("480");

  return (
    <VideoToolShell
      title="Video → GIF"
      desc="Video parçasını GIF'e dönüştür. Süre + FPS + genişlik ayarlanabilir."
      outputPreviewKind="image"
      buildArgs={(input) => ({
        args: [
          "-ss", start, "-t", dur, "-i", input,
          "-vf", `fps=${parseInt(fps) || 15},scale=${parseInt(width) || 480}:-1:flags=lanczos`,
          "-loop", "0", "out.gif",
        ],
        outputName: "out.gif",
        outMime: "image/gif",
        outExt: "gif",
      })}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Başlangıç (sn)", start, setStart],
          ["Süre (sn)", dur, setDur],
          ["FPS", fps, setFps],
          ["Genişlik (px)", width, setWidth],
        ].map(([label, val, set]) => (
          <label key={label as string} className="space-y-1">
            <div className="font-mono text-xs text-muted-foreground">{label as string}</div>
            <input type="number" value={val as string}
              onChange={(e) => (set as (v: string) => void)(e.target.value)}
              className="w-full rounded-md bg-black/40 border border-primary/30 px-3 py-2 font-mono text-sm" />
          </label>
        ))}
      </div>
    </VideoToolShell>
  );
}

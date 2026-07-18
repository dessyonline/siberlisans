import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { VideoToolShell } from "@/components/VideoToolShell";

export const Route = createFileRoute("/_authenticated/araclar/video-thumbnail")({
  component: Page,
  head: () => ({ meta: [{ title: "Video Thumbnail — SiberPHP" }] }),
});

function Page() {
  const [at, setAt] = useState("1");
  return (
    <VideoToolShell
      title="Video Thumbnail"
      desc="Belirlenen saniyeden bir kare al ve JPG kapak olarak indir."
      outputPreviewKind="image"
      buildArgs={(input) => ({
        args: ["-ss", at, "-i", input, "-frames:v", "1", "-q:v", "2", "out.jpg"],
        outputName: "out.jpg",
        outMime: "image/jpeg",
        outExt: "jpg",
      })}
    >
      <label className="block space-y-1">
        <div className="font-mono text-xs text-muted-foreground">Kare zamanı (sn)</div>
        <input type="number" min="0" step="0.1" value={at} onChange={(e) => setAt(e.target.value)}
          className="w-full rounded-md bg-black/40 border border-primary/30 px-3 py-2 font-mono text-sm" />
      </label>
    </VideoToolShell>
  );
}

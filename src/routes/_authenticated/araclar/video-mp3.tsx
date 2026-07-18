import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { VideoToolShell } from "@/components/VideoToolShell";

export const Route = createFileRoute("/_authenticated/araclar/video-mp3")({
  component: Page,
  head: () => ({ meta: [{ title: "Video → MP3 — SiberPHP" }] }),
});

function Page() {
  const [bitrate, setBitrate] = useState("192");
  return (
    <VideoToolShell
      title="Video → MP3"
      desc="Videodan ses kanalını çıkar ve MP3 olarak indir."
      outputPreviewKind="audio"
      buildArgs={(input) => ({
        args: ["-i", input, "-vn", "-c:a", "libmp3lame", "-b:a", `${bitrate}k`, "out.mp3"],
        outputName: "out.mp3",
        outMime: "audio/mpeg",
        outExt: "mp3",
      })}
    >
      <label className="block space-y-1">
        <div className="font-mono text-xs text-muted-foreground">Bitrate (kbps)</div>
        <select value={bitrate} onChange={(e) => setBitrate(e.target.value)}
          className="w-full rounded-md bg-black/40 border border-primary/30 px-3 py-2 font-mono text-sm">
          {["96", "128", "192", "256", "320"].map((b) => <option key={b} value={b}>{b} kbps</option>)}
        </select>
      </label>
    </VideoToolShell>
  );
}

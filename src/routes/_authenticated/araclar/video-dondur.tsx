import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { VideoToolShell } from "@/components/VideoToolShell";

export const Route = createFileRoute("/_authenticated/araclar/video-dondur")({
  component: Page,
  head: () => ({ meta: [{ title: "Video Döndür/Çevir — SiberPHP" }] }),
});

function Page() {
  const [op, setOp] = useState("transpose=1"); // 90 CW

  return (
    <VideoToolShell
      title="Video Döndür/Çevir"
      desc="90°/180°/270° döndür veya yatay/dikey çevir."
      buildArgs={(input) => ({
        args: ["-i", input, "-vf", op, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "copy", "out.mp4"],
        outputName: "out.mp4",
        outMime: "video/mp4",
        outExt: "mp4",
      })}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          ["90° sağa", "transpose=1"],
          ["90° sola", "transpose=2"],
          ["180°", "transpose=1,transpose=1"],
          ["Yatay çevir", "hflip"],
          ["Dikey çevir", "vflip"],
        ].map(([label, val]) => (
          <button key={val} type="button" onClick={() => setOp(val)}
            className={`rounded border px-3 py-2 font-mono text-xs ${op === val ? "border-primary text-primary" : "border-primary/30 text-muted-foreground"}`}>
            {label}
          </button>
        ))}
      </div>
    </VideoToolShell>
  );
}

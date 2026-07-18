import { createFileRoute } from "@tanstack/react-router";
import { VideoToolShell } from "@/components/VideoToolShell";

export const Route = createFileRoute("/_authenticated/araclar/video-sessiz")({
  component: Page,
  head: () => ({ meta: [{ title: "Video Sessizleştir — SiberPHP" }] }),
});

function Page() {
  return (
    <VideoToolShell
      title="Video Sessizleştir"
      desc="Ses kanalını tamamen sil. Görüntü aynen kalır."
      buildArgs={(input) => ({
        args: ["-i", input, "-c:v", "copy", "-an", "out.mp4"],
        outputName: "out.mp4",
        outMime: "video/mp4",
        outExt: "mp4",
      })}
    />
  );
}

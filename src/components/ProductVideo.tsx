import { useMemo, useState } from "react";
import { PlayCircle } from "lucide-react";

function toEmbed(url: string): { kind: "iframe" | "video"; src: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") ?? u.pathname.split("/").pop();
      return id ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id ? { kind: "iframe", src: `https://player.vimeo.com/video/${id}` } : null;
    }
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return { kind: "video", src: url };
    return { kind: "iframe", src: url };
  } catch {
    return null;
  }
}

export function ProductVideo({ url, title }: { url?: string | null; title?: string }) {
  const [play, setPlay] = useState(false);
  const embed = useMemo(() => (url ? toEmbed(url) : null), [url]);
  if (!embed) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-muted-foreground">
        <PlayCircle className="h-4 w-4 text-primary" /> tanıtım videosu
      </h2>
      <div className="glass-card overflow-hidden rounded-xl border border-primary/25">
        <div className="relative aspect-video w-full bg-background/70">
          {embed.kind === "video" ? (
            <video src={embed.src} controls preload="none" className="h-full w-full" />
          ) : play ? (
            <iframe
              src={`${embed.src}${embed.src.includes("?") ? "&" : "?"}autoplay=1`}
              title={title ? `${title} tanıtım videosu` : "Tanıtım videosu"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
              className="h-full w-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlay(true)}
              className="group flex h-full w-full items-center justify-center gap-2 font-mono text-sm text-primary"
            >
              <PlayCircle className="h-10 w-10 transition-transform group-hover:scale-110" />
              videoyu oynat
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

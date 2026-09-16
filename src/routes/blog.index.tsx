import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBlogPosts } from "@/lib/blog-public.functions";
import { BookOpen, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/blog/")({
  component: BlogList,
  head: () => ({
    meta: [
      { title: "Blog — SiberPHP" },
      { name: "description", content: "Yazılım lisansları, güvenlik ve dijital ürünler hakkında rehberler." },
      { property: "og:title", content: "SiberPHP Blog" },
      { property: "og:description", content: "Yazılım lisansları ve güvenlik hakkında rehberler." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/blog" }],
  }),
});

type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_url: string | null;
  tags: string[];
  published_at: string;
};

function BlogList() {
  const fetchPosts = useServerFn(listBlogPosts);
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["blog-posts-public"],
    queryFn: async () => (await fetchPosts()) as unknown as Post[],
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:py-16">
      <div>
        <div className="font-mono text-xs text-muted-foreground">$ cat /var/log/blog.log</div>
        <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight flex items-center gap-3">
          <BookOpen className="h-7 w-7 text-primary" /> <span className="neon-text">Blog</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Yazılım lisansları, dijital ürünler ve güvenlik hakkında rehberler.
        </p>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card rounded-xl h-64 animate-pulse" />
          ))}
        {!isLoading && posts.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground font-mono text-sm">
            henüz yayınlanan yazı yok
          </div>
        )}
        {posts.map((p) => (
          <Link
            key={p.id}
            to="/blog/$slug"
            params={{ slug: p.slug }}
            className="glass-card rounded-xl overflow-hidden group hover:border-primary/40 transition"
          >
            {p.cover_url && (
              <div
                className="h-40 bg-cover bg-center border-b border-border/40"
                style={{ backgroundImage: `url(${p.cover_url})` }}
              />
            )}
            <div className="p-4">
              <div className="flex flex-wrap gap-1 mb-2">
                {p.tags.slice(0, 3).map((t) => (
                  <span key={t} className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 font-mono text-[10px] text-primary">
                    #{t}
                  </span>
                ))}
              </div>
              <h2 className="text-lg font-semibold leading-snug group-hover:text-primary transition">
                {p.title}
              </h2>
              {p.excerpt && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{p.excerpt}</p>
              )}
              <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                <span>{new Date(p.published_at).toLocaleDateString("tr-TR")}</span>
                <span className="inline-flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition">
                  oku <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

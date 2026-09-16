import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBlogPost } from "@/lib/blog-public.functions";
import { ArrowLeft, Calendar } from "lucide-react";

export const Route = createFileRoute("/blog/$slug")({
  component: BlogPost,
  head: ({ params, loaderData }) => {
    const p = loaderData as
      | { title?: string; excerpt?: string | null; cover_url?: string | null; published_at?: string | null }
      | undefined;
    const url = `https://siberlisans.lovable.app/blog/${params.slug}`;
    const title = p?.title ? `${p.title} — SiberPHP Blog` : "Blog — SiberPHP";
    const desc = p?.excerpt ?? "SiberPHP blog yazısı.";
    const meta = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: p?.title ?? "SiberPHP Blog" },
      { property: "og:description", content: desc },
      { property: "og:type", content: "article" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: p?.title ?? "SiberPHP Blog" },
      { name: "twitter:description", content: desc },
    ];
    if (p?.cover_url) {
      meta.push({ property: "og:image", content: p.cover_url });
      meta.push({ name: "twitter:image", content: p.cover_url });
    }
    const scripts = p?.title
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Article",
              headline: p.title,
              description: desc,
              image: p.cover_url || undefined,
              datePublished: p.published_at || undefined,
              author: { "@type": "Organization", name: "SiberPHP" },
              publisher: {
                "@type": "Organization",
                name: "SiberPHP",
                logo: { "@type": "ImageObject", url: "https://siberlisans.lovable.app/favicon.ico" },
              },
              mainEntityOfPage: { "@type": "WebPage", "@id": url },
            }),
          },
        ]
      : undefined;
    return {
      meta,
      links: [{ rel: "canonical", href: url }],
      scripts,
    };
  },
  loader: async ({ params }) => {
    const post = await getBlogPost({ data: { slug: params.slug } }).catch(() => null);
    if (!post) throw notFound();
    return post;
  },
});


type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_url: string | null;
  content: string;
  tags: string[];
  published_at: string;
};

function BlogPost() {
  const { slug } = Route.useParams();
  const fetchPost = useServerFn(getBlogPost);
  const { data: post, isLoading } = useQuery({
    queryKey: ["blog-post", slug],
    queryFn: async () => ((await fetchPost({ data: { slug } })) as unknown as Post) ?? null,
  });

  if (isLoading) {
    return <div className="mx-auto max-w-3xl px-4 py-16 font-mono text-muted-foreground">yükleniyor…</div>;
  }
  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="font-mono text-muted-foreground">yazı bulunamadı</div>
        <Link to="/blog" className="mt-4 inline-block text-primary font-mono text-sm">← bloga dön</Link>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 md:py-14">
      <Link to="/blog" className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary mb-6">
        <ArrowLeft className="h-3 w-3" /> tüm yazılar
      </Link>

      {post.cover_url && (
        <img
          src={post.cover_url}
          alt={post.title}
          className="w-full h-64 md:h-80 object-cover rounded-xl mb-8 border border-border/60"
        />
      )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        {post.tags.map((t) => (
          <span key={t} className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 font-mono text-[10px] text-primary">
            #{t}
          </span>
        ))}
      </div>

      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight">
        {post.title}
      </h1>

      <div className="mt-3 flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <Calendar className="h-3 w-3" />
        {new Date(post.published_at).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
      </div>

      {post.excerpt && (
        <p className="mt-6 text-lg text-muted-foreground leading-relaxed border-l-2 border-primary/40 pl-4">
          {post.excerpt}
        </p>
      )}

      <div className="prose prose-invert prose-neutral mt-8 max-w-none prose-headings:tracking-tight prose-a:text-primary prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:before:content-none prose-code:after:content-none prose-pre:bg-background/60 prose-pre:border prose-pre:border-border/60">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
      </div>
    </article>
  );
}

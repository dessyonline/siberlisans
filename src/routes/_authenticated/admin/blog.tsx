import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminUpsertBlogPost, adminDeleteBlogPost } from "@/lib/blog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, BookOpen, Eye } from "lucide-react";
import { BlogAiPanel } from "@/components/admin/BlogAiPanel";

export const Route = createFileRoute("/_authenticated/admin/blog")({
  component: AdminBlogPage,
  head: () => ({ meta: [{ title: "Blog — Admin" }, { name: "robots", content: "noindex" }] }),
});

type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_url: string | null;
  tags: string[];
  published_at: string | null;
  created_at: string;
};

function AdminBlogPage() {
  const qc = useQueryClient();
  const upsertFn = useServerFn(adminUpsertBlogPost);
  const deleteFn = useServerFn(adminDeleteBlogPost);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);

  const { data: posts = [] } = useQuery({
    queryKey: ["admin-blog-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: new table
        .from("blog_posts" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Post[];
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Sil?")) return;
    await deleteFn({ data: { id } });
    toast.success("silindi");
    qc.invalidateQueries({ queryKey: ["admin-blog-posts"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-muted-foreground">./admin/blog</div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" /> Blog Yazıları
          </h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono neon-glow" onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4 mr-1" /> yeni yazı
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-mono">{editing ? "Yazı düzenle" : "Yeni yazı"}</DialogTitle>
            </DialogHeader>
            <BlogForm
              initial={editing}
              onSubmit={async (v) => {
                await upsertFn({ data: { ...v, id: editing?.id } });
                toast.success("kaydedildi");
                qc.invalidateQueries({ queryKey: ["admin-blog-posts"] });
                setOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <BlogAiPanel />

      <div className="glass-card rounded-lg overflow-hidden">
        {posts.length === 0 ? (
          <div className="p-10 text-center font-mono text-sm text-muted-foreground">yazı yok</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 font-mono text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">başlık</th>
                <th className="text-left p-3">slug</th>
                <th className="text-left p-3">durum</th>
                <th className="text-left p-3">tarih</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-b border-border/40">
                  <td className="p-3 font-medium">{p.title}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">/{p.slug}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border ${
                        p.published_at
                          ? "text-primary border-primary/40 bg-primary/10"
                          : "text-muted-foreground border-border bg-muted/30"
                      }`}
                    >
                      {p.published_at ? "yayında" : "taslak"}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs">
                    {new Date(p.created_at).toLocaleDateString("tr-TR")}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      {p.published_at && (
                        <Button asChild size="sm" variant="ghost">
                          <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer">
                            <Eye className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function BlogForm({
  initial,
  onSubmit,
}: {
  initial: Post | null;
  onSubmit: (v: {
    slug: string;
    title: string;
    excerpt: string | null;
    content: string;
    cover_url: string | null;
    tags: string[];
    published_at: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [coverUrl, setCoverUrl] = useState(initial?.cover_url ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [publish, setPublish] = useState(!!initial?.published_at);
  const [busy, setBusy] = useState(false);

  const autoSlug = () => {
    if (!title || slug) return;
    setSlug(
      title.toLowerCase()
        .replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g")
        .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ü/g, "u")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100),
    );
  };

  const submit = async () => {
    if (title.length < 2 || slug.length < 2) return toast.error("başlık & slug zorunlu");
    setBusy(true);
    try {
      await onSubmit({
        title,
        slug,
        excerpt: excerpt.trim() || null,
        content,
        cover_url: coverUrl.trim() || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        published_at: publish ? (initial?.published_at ?? new Date().toISOString()) : null,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="font-mono text-xs">başlık</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={autoSlug} />
      </div>
      <div>
        <Label className="font-mono text-xs">slug</Label>
        <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="font-mono" />
      </div>
      <div>
        <Label className="font-mono text-xs">kapak URL (opsiyonel)</Label>
        <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div>
        <Label className="font-mono text-xs">özet (opsiyonel, ~160 karakter)</Label>
        <Textarea rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
      </div>
      <div>
        <Label className="font-mono text-xs">içerik (markdown)</Label>
        <Textarea
          rows={14}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="font-mono text-xs"
          placeholder="## Başlık&#10;Markdown içeriği…"
        />
      </div>
      <div>
        <Label className="font-mono text-xs">etiketler (virgülle)</Label>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="güvenlik, lisans" />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={publish} onCheckedChange={setPublish} />
        <Label className="font-mono text-xs">yayında</Label>
      </div>
      <Button className="w-full font-mono neon-glow" onClick={submit} disabled={busy}>
        {busy ? "kaydediliyor…" : "kaydet"}
      </Button>
    </div>
  );
}

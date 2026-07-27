import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { adminSuggestBlogTopics, adminGenerateBlogPost } from "@/lib/blog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Sparkles, Loader2, Lightbulb } from "lucide-react";

type Topic = { title: string; keyword: string; angle: string };

export function BlogAiPanel() {
  const qc = useQueryClient();
  const suggestFn = useServerFn(adminSuggestBlogTopics);
  const generateFn = useServerFn(adminGenerateBlogPost);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [topic, setTopic] = useState("");
  const [keyword, setKeyword] = useState("");
  const [publish, setPublish] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function suggest() {
    setLoadingTopics(true);
    try {
      const res = await suggestFn();
      setTopics(res.topics ?? []);
      if (!res.topics?.length) toast.info("Konu önerisi üretilemedi");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingTopics(false);
    }
  }

  async function generate() {
    if (topic.trim().length < 3) return toast.error("Konu gir");
    setGenerating(true);
    try {
      const post = await generateFn({ data: { topic: topic.trim(), keyword: keyword.trim() || undefined, publish } });
      toast.success(`"${post.title}" ${publish ? "yayınlandı" : "taslak olarak kaydedildi"}`);
      setTopic("");
      setKeyword("");
      qc.invalidateQueries({ queryKey: ["admin-blog-posts"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="glass-card corner-cut p-4">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-mono text-sm text-primary">seo blog motoru</h2>
      </div>
      <p className="font-mono text-[11px] text-muted-foreground mb-4">
        Katalogdan besleniyor: konu önerir, Türkçe SEO yazısı üretir ve ürün sayfalarına iç link verir.
      </p>

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <Label className="font-mono text-xs">Konu / başlık</Label>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Örn: Yapay zekâ video araçları nasıl seçilir?"
          />
        </div>
        <div>
          <Label className="font-mono text-xs">Ana anahtar kelime (ops.)</Label>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="ai video aracı" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <Button onClick={generate} disabled={generating} className="font-mono neon-glow">
          {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          yazı üret
        </Button>
        <Button onClick={suggest} disabled={loadingTopics} variant="outline" className="font-mono">
          {loadingTopics ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Lightbulb className="h-4 w-4 mr-1" />}
          konu öner
        </Button>
        <div className="flex items-center gap-2">
          <Switch checked={publish} onCheckedChange={setPublish} />
          <Label className="font-mono text-xs">hemen yayınla</Label>
        </div>
      </div>

      {topics.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {topics.map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={() => {
                setTopic(t.title);
                setKeyword(t.keyword ?? "");
              }}
              className="text-left rounded-md border border-border/60 bg-muted/20 p-3 hover:border-primary/50 transition-colors"
            >
              <div className="text-xs font-medium">{t.title}</div>
              <div className="font-mono text-[10px] text-muted-foreground mt-1">
                {t.keyword} · {t.angle}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { upsertBankAccount, listBankAccounts, type BankAccountRow } from "@/lib/orders.functions";
import { getSiteSettings, updateSiteSettings, type SiteSettings } from "@/lib/settings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ayarlar")({
  component: SettingsAdmin,
});

type Bank = { id?: string; bank_name: string; iban: string; holder_name: string; active: boolean };

function SettingsAdmin() {
  return (
    <div>
      <h1 className="font-mono text-xl sm:text-2xl neon-text break-words mb-4">Genel Ayarlar</h1>
      <Tabs defaultValue="site" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="site" className="font-mono text-xs">Site Ayarları</TabsTrigger>
          <TabsTrigger value="banks" className="font-mono text-xs">Banka Hesapları</TabsTrigger>
        </TabsList>
        <TabsContent value="site">
          <SiteSettingsTab />
        </TabsContent>
        <TabsContent value="banks">
          <BankSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SiteSettingsTab() {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateSiteSettings);
  const [saving, setSaving] = useState(false);
  
  const { data: settings, isLoading } = useQuery({
    queryKey: ["site-settings-admin"],
    queryFn: async (): Promise<SiteSettings> => useServerFn(getSiteSettings)(),
  });

  const [form, setForm] = useState<Partial<SiteSettings>>({});
  const [activeTab, setActiveTab] = useState("genel");

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      await updateFn({
        data: form
      });
      toast.success("Site ayarları güncellendi");
      qc.invalidateQueries({ queryKey: ["site-settings-admin"] });
    } catch (e) {
      toast.error("Ayarlar kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="p-5 font-mono text-xs">Yükleniyor...</div>;

  return (
    <div className="flex flex-col md:flex-row gap-6 items-start">
      <div className="w-full md:w-48 shrink-0 flex flex-col gap-1 border-r border-border/40 pr-4">
        {[
          { id: "genel", label: "Genel" },
          { id: "iletisim", label: "İletişim & Sosyal" },
          { id: "smtp", label: "E-Posta (SMTP)" },
          { id: "sozlesmeler", label: "Sözleşmeler" },
          { id: "gelismis", label: "Gelişmiş & Ekstra" }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`text-left px-3 py-2 rounded-md font-mono text-sm transition-colors ${activeTab === t.id ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 w-full max-w-3xl glass-card rounded-lg p-5 space-y-6">
        
        {activeTab === "genel" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="font-mono text-base neon-text mb-4 border-b border-border/40 pb-2">Genel Ayarlar</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-xs">Site Başlığı</Label>
                <Input value={form.site_name ?? ""} onChange={(e) => setForm({ ...form, site_name: e.target.value })} className="font-mono" />
              </div>
              <div className="md:col-span-2">
                <Label className="font-mono text-xs">Site Açıklaması (SEO Description)</Label>
                <Textarea value={form.site_description ?? ""} onChange={(e) => setForm({ ...form, site_description: e.target.value })} className="font-mono min-h-[80px]" />
              </div>
              <div className="md:col-span-2">
                <Label className="font-mono text-xs">Anahtar Kelimeler (SEO Keywords)</Label>
                <Input value={form.seo_keywords ?? ""} onChange={(e) => setForm({ ...form, seo_keywords: e.target.value })} placeholder="örn: oyun, lisans, key, ucuz" className="font-mono" />
              </div>
              <div>
                <Label className="font-mono text-xs">Logo URL</Label>
                <Input value={form.logo_url ?? ""} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." className="font-mono" />
              </div>
              <div>
                <Label className="font-mono text-xs">Favicon URL</Label>
                <Input value={form.favicon_url ?? ""} onChange={(e) => setForm({ ...form, favicon_url: e.target.value })} placeholder="https://..." className="font-mono" />
              </div>
            </div>
          </div>
        )}

        {activeTab === "iletisim" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="font-mono text-base neon-text mb-4 border-b border-border/40 pb-2">İletişim ve Sosyal Medya</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-xs">İletişim Email Adresi</Label>
                <Input value={form.contact_email ?? ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="destek@siberlisans.com" className="font-mono" />
              </div>
              <div>
                <Label className="font-mono text-xs">WhatsApp Numarası</Label>
                <Input value={form.whatsapp_number ?? ""} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} placeholder="Örn: 905554443322" className="font-mono" />
              </div>
              <div>
                <Label className="font-mono text-xs">Telegram Linki</Label>
                <Input value={form.telegram_url ?? ""} onChange={(e) => setForm({ ...form, telegram_url: e.target.value })} placeholder="https://t.me/SeninBot" className="font-mono" />
              </div>
              <div>
                <Label className="font-mono text-xs">Instagram Linki</Label>
                <Input value={form.instagram_url ?? ""} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} placeholder="https://instagram.com/..." className="font-mono" />
              </div>
            </div>
          </div>
        )}

        {activeTab === "smtp" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="font-mono text-base neon-text mb-4 border-b border-border/40 pb-2">E-Posta (SMTP) Ayarları</h3>
            <p className="text-xs text-muted-foreground font-mono mb-4">Sistem e-postalarının (örn. şifre sıfırlama, sipariş bildirimi) hangi adresten gönderileceğini belirleyin.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-xs">SMTP Sunucu (Host)</Label>
                <Input value={form.smtp_host ?? ""} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} placeholder="smtp.hostinger.com" className="font-mono" />
              </div>
              <div>
                <Label className="font-mono text-xs">SMTP Port</Label>
                <Input type="number" value={form.smtp_port ?? ""} onChange={(e) => setForm({ ...form, smtp_port: e.target.value ? Number(e.target.value) : null })} placeholder="465 veya 587" className="font-mono" />
              </div>
              <div>
                <Label className="font-mono text-xs">Kullanıcı Adı (Email)</Label>
                <Input value={form.smtp_user ?? ""} onChange={(e) => setForm({ ...form, smtp_user: e.target.value })} placeholder="iletisim@siberlisans.com" className="font-mono" />
              </div>
              <div>
                <Label className="font-mono text-xs">Şifre</Label>
                <Input type="password" value={form.smtp_pass ?? ""} onChange={(e) => setForm({ ...form, smtp_pass: e.target.value })} placeholder="********" className="font-mono" />
              </div>
              <div className="md:col-span-2">
                <Label className="font-mono text-xs">Gönderen Adresi (From)</Label>
                <Input value={form.smtp_from ?? ""} onChange={(e) => setForm({ ...form, smtp_from: e.target.value })} placeholder="SiberLisans <iletisim@siberlisans.com>" className="font-mono" />
              </div>
            </div>
          </div>
        )}

        {activeTab === "sozlesmeler" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="font-mono text-base neon-text mb-4 border-b border-border/40 pb-2">Kurumsal Sözleşmeler (HTML Destekli)</h3>
            <div className="space-y-6">
              <div>
                <Label className="font-mono text-xs">Hizmet/Kullanım Koşulları (TOS)</Label>
                <Textarea value={form.tos_content ?? ""} onChange={(e) => setForm({ ...form, tos_content: e.target.value })} className="font-mono min-h-[150px]" />
              </div>
              <div>
                <Label className="font-mono text-xs">Gizlilik Politikası</Label>
                <Textarea value={form.privacy_policy_content ?? ""} onChange={(e) => setForm({ ...form, privacy_policy_content: e.target.value })} className="font-mono min-h-[150px]" />
              </div>
            </div>
          </div>
        )}

        {activeTab === "gelismis" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="font-mono text-base neon-text mb-4 border-b border-border/40 pb-2">Gelişmiş Ayarlar</h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <Label className="font-mono text-xs">Duyuru Metni (Banner)</Label>
                <Textarea value={form.announcement_text ?? ""} onChange={(e) => setForm({ ...form, announcement_text: e.target.value })} placeholder="Örn: Hafta sonuna özel %20 indirim!" className="font-mono min-h-[60px] mb-2" />
                <div className="flex items-center gap-2 font-mono text-sm">
                  <Switch checked={form.announcement_active ?? false} onCheckedChange={(v) => setForm({ ...form, announcement_active: v })} />
                  <span>Duyuruyu Sitede Göster</span>
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <Label className="font-mono text-xs">Canlı Destek Scripti (Tawk.to / Crisp vb.)</Label>
                <Textarea value={form.live_support_script ?? ""} onChange={(e) => setForm({ ...form, live_support_script: e.target.value })} placeholder="<script>...</script>" className="font-mono min-h-[100px]" />
                <p className="text-xs text-muted-foreground mt-1">Bu kod, sitenin <b>&lt;body&gt;</b> kısmına eklenir. Sadece güvenilir kaynaklardan aldığınız kodları girin.</p>
              </div>
            </div>

            <div className="pt-4 border-t border-border/40">
              <h3 className="font-mono text-sm text-destructive mb-3">Kritik Alan</h3>
              <div className="flex items-center gap-2 font-mono text-sm bg-destructive/10 p-3 rounded border border-destructive/20">
                <Switch checked={form.maintenance_mode ?? false} onCheckedChange={(v) => setForm({ ...form, maintenance_mode: v })} />
                <span className="text-destructive font-semibold">Bakım Modu (Sadece Adminler Girebilir)</span>
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-border/40 flex justify-end">
          <Button onClick={save} disabled={saving} className="font-mono neon-glow min-w-[150px]">
            <Save className="h-4 w-4 mr-2" /> {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BankSettingsTab() {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertBankAccount);
  const listFn = useServerFn(listBankAccounts);
  const [editing, setEditing] = useState<Bank | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: banks, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["banks-admin"],
    queryFn: async (): Promise<BankAccountRow[]> => listFn(),
    staleTime: 30_000,
  });

  const save = async () => {
    if (!editing) return;
    const iban = editing.iban.replace(/\s+/g, "").toUpperCase();
    if (editing.bank_name.trim().length < 2 || editing.holder_name.trim().length < 2 || iban.length < 10) {
      toast.error("Banka adı, alıcı adı ve geçerli bir IBAN girin");
      return;
    }
    setSaving(true);
    try {
      await upsertFn({ data: { ...editing, bank_name: editing.bank_name.trim(), holder_name: editing.holder_name.trim(), iban } });
      toast.success("Kaydedildi");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["banks-admin"] });
    } catch (e) {
      toast.error((e as Error).message || "Banka hesabı kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="mt-1 font-mono text-xs text-muted-foreground mb-4">
        Sadece <span className="text-primary">aktif</span> banka hesabı müşterilere gösterilir.
      </p>

      <div className="flex justify-end">
        <Button onClick={() => setEditing({ bank_name: "", iban: "", holder_name: "", active: true })} className="font-mono">
          <Plus className="h-4 w-4 mr-1" />yeni hesap
        </Button>
        <Dialog open={!!editing} onOpenChange={(v) => !v && !saving && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-mono">{editing?.id ? "düzenle" : "yeni hesap"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <F label="banka adı" value={editing?.bank_name ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, bank_name: v }))} />
              <F label="alıcı adı" value={editing?.holder_name ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, holder_name: v }))} />
              <F label="IBAN" value={editing?.iban ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, iban: v }))} />
              <div className="flex items-center gap-2 font-mono text-sm">
                <Switch checked={editing?.active ?? true} onCheckedChange={(v) => setEditing((p) => ({ ...p!, active: v }))} />
                <span>aktif</span>
              </div>
            </div>
            <DialogFooter><Button onClick={save} disabled={saving} className="font-mono">{saving ? "kaydediliyor…" : "kaydet"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-4 space-y-3">
        {isLoading && <div className="glass-card rounded-lg p-5 font-mono text-xs text-muted-foreground">banka hesapları yükleniyor…</div>}
        {isError && (
          <div className="glass-card rounded-lg border border-destructive/40 p-5 text-sm">
            <div className="font-mono text-destructive">Banka hesapları yüklenemedi</div>
            <p className="mt-1 text-xs text-muted-foreground">{error instanceof Error ? error.message : "Bağlantıyı kontrol edip tekrar deneyin."}</p>
            <Button size="sm" variant="outline" className="mt-3 font-mono" onClick={() => refetch()}>tekrar dene</Button>
          </div>
        )}
        {(banks ?? []).map((b) => (
          <div key={b.id} className="glass-card rounded-lg p-4 font-mono text-sm flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{b.bank_name}</div>
              <div className="text-xs text-muted-foreground break-all">{b.holder_name} · {b.iban}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className={`text-xs ${b.active ? "text-primary" : "text-muted-foreground"}`}>
                {b.active ? "aktif" : "pasif"}
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(b)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {!isLoading && !isError && (banks ?? []).length === 0 && (
          <div className="glass-card rounded-lg border border-dashed border-border/60 p-6 text-center font-mono text-xs text-muted-foreground">
            Henüz banka hesabı yok. Ödeme sayfasında gösterilecek ilk hesabı ekleyin.
          </div>
        )}
      </div>
    </div>
  );
}

function F({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="font-mono text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
    </div>
  );
}

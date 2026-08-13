import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Terminal, Gift, MailCheck, Send, Info } from "lucide-react";
import { MfaChallenge } from "@/components/security/MfaChallenge";

const authSearch = z.object({ ref: z.string().max(20).optional() });

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: authSearch,
  head: () => ({ meta: [{ title: "Giriş / Kayıt — SiberPHP" }] }),
});

// Sık kullanılan geçici / disposable mail sağlayıcıları
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","10minutemail.com","10minutemail.net","guerrillamail.com","guerrillamail.info",
  "guerrillamail.biz","guerrillamail.de","guerrillamail.net","guerrillamail.org","sharklasers.com",
  "grr.la","tempmail.com","temp-mail.org","temp-mail.io","tempmail.net","tempmailo.com",
  "tempinbox.com","dispostable.com","fakeinbox.com","yopmail.com","yopmail.fr","maildrop.cc",
  "getnada.com","nada.email","trashmail.com","trashmail.de","throwawaymail.com","mytemp.email",
  "moakt.com","emailondeck.com","mohmal.com","tempail.com","tempmailaddress.com","spambog.com",
  "spam4.me","emailsensei.com","boximail.com","boxtemp.com.br","mail-temp.com","mailtemp.info",
  "burnermail.io","mailcatch.com","tempr.email","discard.email","33mail.com","anonaddy.me",
  "mail.tm","internxt.com","tempmail.plus","tempmailer.com","emlpro.com","emlhub.com",
  "linshiyou.com","fakemail.net","fake-mail.net","tempinbox.co.uk","harakirimail.com",
  "wegwerfemail.de","trbvm.com","1secmail.com","1secmail.org","1secmail.net","muellmail.com",
  "einrot.com","emailfake.com","email-fake.com","fakemailgenerator.com","proxymail.eu",
  "byom.de","spambox.us","tempmail.dev","tempmail.us.com",
]);

function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}

function newCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const search = useSearch({ from: "/auth" });
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [captcha, setCaptcha] = useState(() => newCaptcha());
  const [captchaInput, setCaptchaInput] = useState("");
  const [signupSent, setSignupSent] = useState<string | null>(null);
  const [telegram, setTelegram] = useState("");
  const [mfaMode, setMfaMode] = useState(false);
  const [manualRef, setManualRef] = useState("");
  const urlRef = search.ref?.toUpperCase() ?? "";
  const refCode = (urlRef || manualRef.trim().toUpperCase()).slice(0, 20);

  useEffect(() => {
    if (user && !mfaMode) navigate({ to: "/hesabim" });
  }, [user, mfaMode, navigate]);

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email]);

  const signIn = async () => {
    setLoading(true);
    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    // 2FA gerekli mi?
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setLoading(false);
    if (aal?.nextLevel === "aal2" && aal.currentLevel === "aal1") {
      // Kullanıcı bu tarayıcıyı daha önce "hatırla" olarak işaretlemişse challenge'ı atla
      const { isDeviceTrusted } = await import("@/lib/trusted-device");
      if (isDeviceTrusted(signInData.user?.id)) {
        toast.success("Giriş başarılı · güvenilir cihaz");
        navigate({ to: "/hesabim" });
        return;
      }
      setMfaMode(true);
      return;
    }
    toast.success("Giriş başarılı");
    navigate({ to: "/hesabim" });
  };


  const signUp = async () => {
    const em = email.trim().toLowerCase();
    if (!emailValid) return toast.error("[!] geçerli bir e-posta gir");
    if (isDisposableEmail(em)) {
      return toast.error("[!] geçici / disposable e-posta adresleri kabul edilmiyor");
    }
    if (password.length < 6) return toast.error("[!] şifre en az 6 karakter olmalı");
    if (!telegram.trim()) return toast.error("[!] telegram adresi zorunludur (yoksa 'yok' yazın)");
    if (parseInt(captchaInput, 10) !== captcha.answer) {
      setCaptcha(newCaptcha());
      setCaptchaInput("");
      return toast.error("[!] güvenlik doğrulaması hatalı");
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: em,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/hesabim`,
        data: {
          display_name: displayName || em.split("@")[0],
          ...(refCode ? { ref: refCode } : {}),
        },
      },
    });
    setLoading(false);
    if (error) {
      setCaptcha(newCaptcha());
      setCaptchaInput("");
      return toast.error(error.message);
    }
    setSignupSent(em);
    toast.success("[✓] doğrulama e-postası gönderildi");
  };

  const signInGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      return toast.error(result.error.message ?? "Google girişi başarısız");
    }
    if (result.redirected) return; // Tarayıcı yönleniyor
    setLoading(false);
    navigate({ to: "/hesabim" });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="glass-card rounded-lg p-6 sm:p-8">
        <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
          <Terminal className="h-4 w-4 text-primary" />
          $ ./auth --secure
        </div>
        <h1 className="mt-2 font-mono text-2xl neon-text">Hesabına Giriş</h1>

        {mfaMode ? (
          <div className="mt-6">
            <MfaChallenge
              title="iki adımlı doğrulama"
              onCancel={async () => {
                await supabase.auth.signOut();
                setMfaMode(false);
              }}
              onSuccess={() => {
                toast.success("[✓] doğrulandı");
                navigate({ to: "/hesabim" });
              }}
            />
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                setMfaMode(false);
              }}
              className="mt-3 font-mono text-[10px] text-muted-foreground hover:text-primary"
            >
              ← farklı hesapla giriş yap
            </button>
          </div>
        ) : signupSent ? (
          <div className="mt-6 space-y-3 rounded-md border border-primary/40 bg-primary/5 p-4 font-mono text-sm">
            <div className="flex items-center gap-2 text-primary">
              <MailCheck className="h-4 w-4" /> doğrulama e-postası gönderildi
            </div>
            <div className="text-muted-foreground text-xs leading-relaxed">
              <span className="text-foreground">{signupSent}</span> adresine gelen bağlantıya tıklayarak
              hesabını doğrula. Doğrulamayı tamamlamadan giriş yapamazsın.
              <br />
              <br />
              spam/gereksiz klasörünü kontrol etmeyi unutma.
            </div>
            <Button variant="outline" size="sm" onClick={() => setSignupSent(null)} className="font-mono">
              &lt; geri dön
            </Button>
          </div>
        ) : (
          <>
            <Button
              onClick={signInGoogle}
              disabled={loading}
              variant="outline"
              className="mt-6 w-full font-mono border-primary/30 hover:bg-primary/10"
            >
              <GoogleIcon /> <span className="ml-2">google ile devam et</span>
            </Button>
            <div className="my-4 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
              <span className="h-px flex-1 bg-border/60" />
              <span>veya e-posta ile</span>
              <span className="h-px flex-1 bg-border/60" />
            </div>

            <Tabs defaultValue="signin">
              <TabsList className="w-full font-mono">
                <TabsTrigger value="signin" className="flex-1">giriş</TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">kayıt</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="space-y-4 mt-4">
                <Field label="e-posta" value={email} onChange={setEmail} type="email" autoComplete="email" />
                <Field label="şifre" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
                <Button disabled={loading} onClick={signIn} className="w-full font-mono neon-glow">
                  {"> "}giriş yap
                </Button>
              </TabsContent>
              <TabsContent value="signup" className="space-y-4 mt-4">
                {refCode ? (
                  <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2.5 text-xs font-mono text-primary">
                    <Gift className="h-4 w-4 shrink-0" />
                    <span>
                      Davet kodu: <span className="font-bold">{refCode}</span> · 300₺+ ilk siparişinde ikinize de ₺10 bakiye
                    </span>
                  </div>
                ) : null}
                <Field label="görünen ad" value={displayName} onChange={setDisplayName} />
                <Field label="e-posta" value={email} onChange={setEmail} type="email" autoComplete="email" />
                <Field label="şifre (min 6)" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
                {!urlRef && (
                  <div className="space-y-1.5">
                    <Label className="font-mono text-xs text-muted-foreground flex items-center gap-1.5">
                      <Gift className="h-3 w-3 text-primary" />
                      davet kodu <span className="text-muted-foreground/60">(opsiyonel)</span>
                    </Label>
                    <Input
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value.toUpperCase())}
                      placeholder="örn: SIBER123"
                      maxLength={20}
                      className="font-mono uppercase tracking-wider"
                    />
                  </div>
                )}

                {/* CAPTCHA */}
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs text-muted-foreground">güvenlik doğrulaması</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md border border-border/60 bg-background/50 px-3 py-2 font-mono text-sm">
                      <span className="text-muted-foreground">$</span>{" "}
                      <span className="text-primary">{captcha.a} + {captcha.b}</span>{" "}
                      <span className="text-muted-foreground">=</span>
                    </div>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={captchaInput}
                      onChange={(e) => setCaptchaInput(e.target.value)}
                      className="w-20 font-mono text-center"
                      placeholder="?"
                    />
                    <button
                      type="button"
                      onClick={() => { setCaptcha(newCaptcha()); setCaptchaInput(""); }}
                      className="font-mono text-[10px] text-muted-foreground hover:text-primary"
                    >
                      yenile
                    </button>
                  </div>
                </div>

                <div className="rounded-md border border-border/40 bg-background/30 p-2 font-mono text-[10px] text-muted-foreground leading-relaxed">
                  · doğrulama linki e-postana gönderilir<br />
                  · geçici / disposable mailler kabul edilmez
                </div>

                <Button disabled={loading} onClick={signUp} className="w-full font-mono neon-glow">
                  {"> "}hesap oluştur
                </Button>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
        autoComplete={autoComplete}
      />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.1z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.9l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41 34.8 44 29.9 44 24c0-1.3-.1-2.3-.4-3.5z"/>
    </svg>
  );
}

import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { signIn as signInFn, signUp as signUpFn, verifyEmailCode as verifyEmailCodeFn } from "@/lib/auth.functions";
import { requestPasswordReset as requestPasswordResetFn } from "@/lib/password-reset.functions";
import { getMe } from "@/lib/auth.functions";
import { redirect } from "@tanstack/react-router";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Terminal, Gift, MailCheck, Send, Info } from "lucide-react";
import { MfaChallenge } from "@/components/security/MfaChallenge";
import { MIN_PASSWORD_LENGTH, passwordConfirmationError, passwordError } from "@/lib/password-policy";

const authSearch = z.object({
  ref: z.string().max(20).optional(),
  google: z.enum(["unconfigured", "state", "identity", "account"]).optional(),
  apple: z.enum(["unconfigured", "state", "identity", "account"]).optional(),
});

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: authSearch,
  beforeLoad: async () => {
    const session = await getMe();
    if (session.status === "authenticated") {
      throw redirect({ to: "/hesabim" });
    }
  },
  head: () => ({
    meta: [
      { title: "Giriş / Kayıt — SiberPHP" },
      { name: "description", content: "SiberPHP hesabınıza giriş yapın veya yeni hesap oluşturun." },
      { property: "og:title", content: "Giriş / Kayıt — SiberPHP" },
      { property: "og:description", content: "SiberPHP hesabınıza güvenli şekilde erişin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
  const localPart = email.slice(0, at);
  const domain = email.slice(at + 1).trim().toLowerCase();
  
  // 1. Bilinen tek kullanımlık servisleri engelle
  if (!domain || DISPOSABLE_DOMAINS.has(domain)) return true;
  
  // 2. Gmail / Outlook "plus alias" (+ işareti) kullanımını engelle 
  // Örn: kullanici+spam@gmail.com
  if (localPart.includes("+")) return true;

  return false;
}

function newCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

function AuthPage() {
  const navigate = useNavigate();
  const { user, acceptUser, signOut: ctxSignOut } = useAuth();
  const doSignIn = useServerFn(signInFn);
  const doSignUp = useServerFn(signUpFn);
  const doVerifyEmail = useServerFn(verifyEmailCodeFn);
  const doReset = useServerFn(requestPasswordResetFn);
  const [resetInfo, setResetInfo] = useState<{ message: string } | null>(null);

  const search = useSearch({ from: "/auth" });
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [captcha, setCaptcha] = useState(() => newCaptcha());
  const [captchaInput, setCaptchaInput] = useState("");
  const [signupSent, setSignupSent] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [telegram, setTelegram] = useState("");
  const [mfaMode, setMfaMode] = useState(false);
  const [manualRef, setManualRef] = useState("");
  const urlRef = search.ref?.toUpperCase() ?? "";
  const refCode = (urlRef || manualRef.trim().toUpperCase()).slice(0, 20);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const signupEmailTrim = email.trim().toLowerCase();
  const signupEmailHint = !signupEmailTrim
    ? null
    : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(signupEmailTrim)
      ? "geçerli bir e-posta adresi gir"
      : isDisposableEmail(signupEmailTrim)
        ? "geçici mailler kabul edilmiyor"
        : null;

  useEffect(() => {
    if (!search.google) return;
    const messages: Record<string, string> = {
      unconfigured: "Google girişi henüz yapılandırılmadı.",
      state: "Google girişi doğrulanamadı, tekrar deneyin.",
      identity: "Google hesabında doğrulanmış e-posta bulunamadı.",
      account: "Hesap oluşturulamadı, tekrar deneyin.",
    };
    toast.error(messages[search.google] ?? "Google girişi başarısız");
  }, [search.google]);

  useEffect(() => {
    if (!search.apple) return;
    const messages: Record<string, string> = {
      unconfigured: "Apple girişi henüz yapılandırılmadı.",
      state: "Apple girişi doğrulanamadı, tekrar deneyin.",
      identity: "Apple hesabında doğrulanmış e-posta bulunamadı.",
      account: "Hesap oluşturulamadı, tekrar deneyin.",
    };
    toast.error(messages[search.apple] ?? "Apple girişi başarısız");
  }, [search.apple]);

  useEffect(() => {
    if (user && !mfaMode) navigate({ to: "/hesabim" });
  }, [user, mfaMode, navigate]);

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email]);

  const signIn = async () => {
    if (!emailValid) return toast.error("[!] geçerli bir e-posta gir");
    if (!password) return toast.error("[!] şifreni gir");
    setLoading(true);
    try {
      const res = await doSignIn({ data: { email: email.trim(), password } });
      if (!res.ok) {
        setLoading(false);
        return toast.error(res.error);
      }
      acceptUser(res.user);
      setLoading(false);
    } catch {
      setLoading(false);
      toast.error("Giriş yapılamadı, tekrar deneyin.");
    }
  };

  const verifyEmail = async () => {
    if (!signupSent) return;
    if (!/^\d{6}$/.test(verificationCode)) return toast.error("[!] 6 haneli doğrulama kodunu gir");
    setLoading(true);
    try {
      const res = await doVerifyEmail({ data: { email: signupSent, code: verificationCode } });
      if (!res.ok) return toast.error(res.error ?? "Doğrulama yapılamadı.");
      toast.success("[✓] e-posta doğrulandı, şimdi giriş yapabilirsin");
      setSignupSent(null);
      setPassword("");
      setConfirmPassword("");
    } catch {
      toast.error("Doğrulama yapılamadı, tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return toast.error("[!] önce e-posta adresini gir");
    setLoading(true);
    try {
      const res = await doReset({ data: { email: em } });
      setResetInfo({ message: res.message });
      if (!res.ok) return toast.error(res.message);
      toast.success("[✓] talebin alındı");
    } catch {
      toast.error("İşlem tamamlanamadı, tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };




  const signUp = async () => {
    const em = email.trim().toLowerCase();
    if (!emailValid) return toast.error("[!] geçerli bir e-posta gir");
    if (isDisposableEmail(em)) {
      return toast.error("[!] geçici mailler veya alias (kullanici+spam@...) kabul edilmiyor");
    }
    const passwordProblem = passwordError(password);
    if (passwordProblem) return toast.error(`[!] ${passwordProblem}`);
    const confirmationProblem = passwordConfirmationError(password, confirmPassword);
    if (confirmationProblem) return toast.error(`[!] ${confirmationProblem}`);
    if (!acceptTerms) return toast.error("[!] devam etmek için koşulları kabul etmelisin");
    if (parseInt(captchaInput, 10) !== captcha.answer) {
      setCaptcha(newCaptcha());
      setCaptchaInput("");
      return toast.error("[!] güvenlik doğrulaması hatalı");
    }

    setLoading(true);
    try {
      const res = await doSignUp({
        data: {
          email: em,
          password,
          confirmPassword,
          displayName: displayName || em.split("@")[0],
          telegramUsername: telegram.trim(),
          ...(refCode ? { referralCode: refCode } : {}),
        },
      });
      setLoading(false);
      if (!res.ok) {
        setCaptcha(newCaptcha());
        setCaptchaInput("");
        return toast.error(res.error);
      }
      setSignupSent(em);
      setVerificationCode("");
    } catch {
      setLoading(false);
      setCaptcha(newCaptcha());
      setCaptchaInput("");
      toast.error("Kayıt tamamlanamadı, tekrar deneyin.");
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="glass-card rounded-lg p-6 sm:p-8">
        <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
          <Terminal className="h-4 w-4 text-primary" />
          $ ./auth --secure
        </div>
        <YetiAvatar />
        <h1 className="mt-2 font-mono text-2xl neon-text">Hesabına Giriş</h1>

        {mfaMode ? (
          <div className="mt-6">
            <MfaChallenge
              title="iki adımlı doğrulama"
              onCancel={async () => {
                await ctxSignOut();
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
                await ctxSignOut();
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
              <span className="text-foreground">{signupSent}</span> adresine gönderilen 6 haneli kodu girerek
              hesabını doğrula. Doğrulamayı tamamlamadan giriş yapamazsın.
              <br />
              <br />
              spam/gereksiz klasörünü kontrol etmeyi unutma.
            </div>
            <Input
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="font-mono text-center tracking-[0.5em]"
            />
            <Button disabled={loading} onClick={verifyEmail} className="w-full font-mono neon-glow">
              {"> "}kodu doğrula
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSignupSent(null)} className="font-mono">
              &lt; geri dön
            </Button>
          </div>
        ) : (
          <>
            <Tabs defaultValue="signin">
              <TabsList className="w-full font-mono">
                <TabsTrigger value="signin" className="flex-1">giriş</TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">kayıt</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="space-y-4 mt-4">
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void signIn();
                  }}
                >
                  <Field id="signin-email" label="e-posta" value={email} onChange={setEmail} type="email" autoComplete="email" />
                  <Field id="signin-password" label="şifre" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
                  <Button type="submit" disabled={loading} className="w-full font-mono neon-glow">
                    {loading ? "… giriş yapılıyor" : "> giriş yap"}
                  </Button>
                </form>
                <button
                  type="button"
                  onClick={forgotPassword}
                  disabled={loading}
                  className="w-full text-center font-mono text-[11px] text-muted-foreground hover:text-primary"
                >
                  şifremi unuttum / ilk şifremi belirle
                </button>
                <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                  <span className="h-px flex-1 bg-border/60" />
                  <span>veya şunlarla giriş yap</span>
                  <span className="h-px flex-1 bg-border/60" />
                </div>
                <Button
                  asChild
                  variant="outline"
                  className="w-full font-mono border-primary/30 hover:bg-primary/10"
                >
                  <a href="https://siberlisans.com/api/public/auth/google/start">
                    <GoogleIcon /> <span className="ml-2">google ile devam et</span>
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="w-full font-mono border-primary/30 hover:bg-primary/10"
                >
                  <a href="https://siberlisans.com/api/public/auth/apple/start">
                    <AppleIcon /> <span className="ml-2">apple ile devam et</span>
                  </a>
                </Button>
                {resetInfo ? (
                  <div className="rounded-md border border-primary/40 bg-primary/5 p-3 font-mono text-[11px] leading-relaxed">
                    <div className="text-muted-foreground">{resetInfo.message}</div>
                  </div>
                ) : null}
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
                <Field id="signup-name" label="görünen ad" value={displayName} onChange={setDisplayName} />
                <Field id="signup-email" label="e-posta" value={email} onChange={setEmail} type="email" autoComplete="email" />
                {signupEmailHint ? <FieldHint text={signupEmailHint} /> : null}
                <Field id="signup-password" label={`şifre (min ${MIN_PASSWORD_LENGTH})`} value={password} onChange={setPassword} type="password" autoComplete="new-password" />
                {password ? <StrengthMeter password={password} /> : null}
                <Field id="signup-confirm-password" label="şifre (tekrar)" value={confirmPassword} onChange={setConfirmPassword} type="password" autoComplete="new-password" />
                {confirmPassword && confirmPassword !== password ? <FieldHint text="şifreler uyuşmuyor" /> : null}
                {confirmPassword && confirmPassword === password ? <FieldHint ok text="şifreler uyuşuyor" /> : null}

                <details className="group rounded-md border border-border/50 bg-background/30 p-2.5">
                  <summary className="cursor-pointer list-none font-mono text-[11px] text-muted-foreground hover:text-primary flex items-center justify-between">
                    <span>+ ek bilgiler (telegram, davet kodu)</span>
                    <span className="text-[10px] text-primary/70">opsiyonel</span>
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="font-mono text-xs text-muted-foreground flex items-center gap-1.5">
                        <Send className="h-3 w-3 text-primary" /> telegram adresi
                      </Label>
                      <Input
                        value={telegram}
                        onChange={(e) => setTelegram(e.target.value)}
                        placeholder="@kullaniciadi"
                        className="font-mono"
                      />
                      <div className="flex items-start gap-1.5 rounded bg-primary/5 p-2 border border-primary/20">
                        <Info className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                        <p className="font-mono text-[9px] text-muted-foreground leading-tight">
                          Sipariş teslimatları ve destek mesajları anında Telegram'dan gelir. Sonradan hesabından da ekleyebilirsin.
                        </p>
                      </div>
                    </div>
                    {!urlRef && (
                      <div className="space-y-1.5">
                        <Label className="font-mono text-xs text-muted-foreground flex items-center gap-1.5">
                          <Gift className="h-3 w-3 text-primary" /> davet kodu
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
                  </div>
                </details>

                <label className="flex items-start gap-2 font-mono text-[11px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-primary"
                  />
                  <span>
                    <a href="/kosullar" target="_blank" rel="noreferrer" className="text-primary hover:underline">kullanım koşulları</a>,{" "}
                    <a href="/gizlilik" target="_blank" rel="noreferrer" className="text-primary hover:underline">gizlilik</a> ve{" "}
                    <a href="/kvkk" target="_blank" rel="noreferrer" className="text-primary hover:underline">KVKK</a> metinlerini okudum, kabul ediyorum.
                  </span>
                </label>

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
                <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                  <span className="h-px flex-1 bg-border/60" />
                  <span>veya şunlarla kayıt ol</span>
                  <span className="h-px flex-1 bg-border/60" />
                </div>
                <Button asChild variant="outline" className="w-full font-mono border-primary/30 hover:bg-primary/10">
                  <a href="https://siberlisans.com/api/public/auth/google/start">
                    <GoogleIcon /> <span className="ml-2">google ile devam et</span>
                  </a>
                </Button>
                <Button asChild variant="outline" className="w-full font-mono border-primary/30 hover:bg-primary/10">
                  <a href="https://siberlisans.com/api/public/auth/apple/start">
                    <AppleIcon /> <span className="ml-2">apple ile devam et</span>
                  </a>
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
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  const inputId = id ?? `auth-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const masked = isPassword && !reveal;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId} className="font-mono text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          id={inputId}
          type={isPassword ? (reveal ? "text" : "password") : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`font-mono ${isPassword ? "pr-10" : ""} ${masked ? "text-transparent caret-primary" : ""}`}
          autoComplete={autoComplete}
        />
        {masked && value ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-3 right-10 flex items-center overflow-hidden whitespace-nowrap font-mono text-sm text-primary neon-text-glow tracking-[0.15em]"
          >
            {Array.from(value).map((_, i) => (i % 2 === 0 ? "✦" : "✧")).join("")}
          </span>
        ) : null}
        {isPassword ? (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "şifreyi gizle" : "şifreyi göster"}
            className="absolute inset-y-0 right-2 flex items-center px-1 font-mono text-[10px] text-muted-foreground hover:text-primary"
          >
            {reveal ? "gizle" : "göster"}
          </button>
        ) : null}
      </div>
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

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  );
}

function YetiAvatar() {
  const ref = useRef<HTMLDivElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [hide, setHide] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (!el) return;
      const p = "touches" in e ? e.touches[0] : e;
      if (!p) return;
      const r = el.getBoundingClientRect();
      const dx = p.clientX - (r.left + r.width / 2);
      const dy = p.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const m = Math.min(1, d / 200) * 4;
      setLook({ x: (dx / d) * m, y: (dy / d) * m });
    };
    const onFocus = () => {
      const a = document.activeElement as HTMLInputElement | null;
      const isInput = !!a && a.tagName === "INPUT";
      setHide(isInput && a!.type === "password");
      if (isInput && a!.type !== "password") {
        const len = Math.min(a!.value.length, 30);
        setLook({ x: -4 + (len / 30) * 8, y: 3 });
      }
    };
    const onBlur = () => setTimeout(onFocus, 0);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("input", onFocus);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("input", onFocus);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="mx-auto mt-3 mb-1 grid h-[86px] w-[86px] place-items-center rounded-full border border-primary/35 bg-primary/10 text-primary shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_12%,transparent)]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 120" fill="none" className="h-[76px] w-[76px] overflow-visible" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="55" fill="currentColor" opacity="0.12" />
        <path d="M28 94C31 77 41 69 60 69C79 69 89 77 92 94" className="fill-foreground" stroke="currentColor" strokeWidth="3" />
        <path d="M37 57C35 42 44 25 60 25C76 25 85 42 83 57C81 72 72 81 60 81C48 81 39 72 37 57Z" className="fill-foreground" stroke="currentColor" strokeWidth="3" />
        <path d="M42 37L48 25L53 34L60 22L66 34L73 25L78 38" className="fill-foreground" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
        <path d="M34 51C28 48 26 54 31 58M86 51C92 48 94 54 89 58" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        {hide ? (
          <g stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M45 54C48 57 52 57 55 54" />
            <path d="M65 54C68 57 72 57 75 54" />
          </g>
        ) : (
          <g style={{ transform: `translate(${look.x}px, ${look.y}px)`, transition: "transform 120ms ease-out" }}>
            <circle cx="50" cy="53" r="3" fill="currentColor" />
            <circle cx="70" cy="53" r="3" fill="currentColor" />
          </g>
        )}
        <path d="M53 64C57 68 63 68 67 64" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <g
          style={{ transform: hide ? "translateY(0)" : "translateY(40px)", opacity: hide ? 1 : 0, transition: "transform 250ms ease, opacity 200ms ease" }}
          className="fill-foreground"
          stroke="currentColor"
          strokeWidth="3"
        >
          <ellipse cx="47" cy="55" rx="11" ry="9" />
          <ellipse cx="73" cy="55" rx="11" ry="9" />
        </g>
        <path d="M45 87C51 91 69 91 75 87" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      </svg>
    </div>
  );
}

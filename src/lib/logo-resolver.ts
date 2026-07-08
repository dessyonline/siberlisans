// Ürün adından marka domainini tahmin edip Clearbit logo URL'i üretir.
// Clearbit Logo API key gerektirmez ve transparan PNG döner.
// Bulamazsa Google favicon (sz=256) fallback URL üretir.

const BRAND_MAP: Record<string, string> = {
  netflix: "netflix.com",
  spotify: "spotify.com",
  disney: "disneyplus.com",
  "disney+": "disneyplus.com",
  disneyplus: "disneyplus.com",
  hbo: "max.com",
  max: "max.com",
  hulu: "hulu.com",
  prime: "primevideo.com",
  amazon: "amazon.com",
  youtube: "youtube.com",
  google: "google.com",
  gmail: "gmail.com",
  microsoft: "microsoft.com",
  office: "office.com",
  office365: "office.com",
  windows: "microsoft.com",
  xbox: "xbox.com",
  playstation: "playstation.com",
  psn: "playstation.com",
  steam: "steampowered.com",
  epic: "epicgames.com",
  origin: "ea.com",
  ea: "ea.com",
  ubisoft: "ubisoft.com",
  riot: "riotgames.com",
  valorant: "playvalorant.com",
  lol: "leagueoflegends.com",
  discord: "discord.com",
  nitro: "discord.com",
  telegram: "telegram.org",
  whatsapp: "whatsapp.com",
  chatgpt: "openai.com",
  openai: "openai.com",
  gpt: "openai.com",
  claude: "anthropic.com",
  anthropic: "anthropic.com",
  gemini: "gemini.google.com",
  canva: "canva.com",
  figma: "figma.com",
  adobe: "adobe.com",
  photoshop: "adobe.com",
  illustrator: "adobe.com",
  premiere: "adobe.com",
  creative: "adobe.com",
  autocad: "autodesk.com",
  autodesk: "autodesk.com",
  jetbrains: "jetbrains.com",
  github: "github.com",
  copilot: "github.com",
  cursor: "cursor.com",
  lovable: "lovable.dev",
  vercel: "vercel.com",
  cloudflare: "cloudflare.com",
  notion: "notion.so",
  slack: "slack.com",
  zoom: "zoom.us",
  duolingo: "duolingo.com",
  grammarly: "grammarly.com",
  crunchyroll: "crunchyroll.com",
  bein: "beinconnect.com.tr",
  exxen: "exxen.com",
  blutv: "blutv.com",
  gain: "gain.tv",
  tabii: "tabii.com",
  todtv: "todtv.com",
  tivibu: "tivibu.com",
  puhutv: "puhutv.com",
  spotifyfamily: "spotify.com",
  youtubemusic: "music.youtube.com",
  applemusic: "music.apple.com",
  apple: "apple.com",
  icloud: "icloud.com",
  itunes: "apple.com",
  tinder: "tinder.com",
  bumble: "bumble.com",
  wolt: "wolt.com",
  getir: "getir.com",
  yemeksepeti: "yemeksepeti.com",
  trendyol: "trendyol.com",
  hepsiburada: "hepsiburada.com",
  n11: "n11.com",
  binance: "binance.com",
  coinbase: "coinbase.com",
  paribu: "paribu.com",
  btcturk: "btcturk.com",
  nordvpn: "nordvpn.com",
  expressvpn: "expressvpn.com",
  surfshark: "surfshark.com",
  ivacy: "ivacy.com",
  malwarebytes: "malwarebytes.com",
  kaspersky: "kaspersky.com",
  norton: "norton.com",
  eset: "eset.com",
  bitdefender: "bitdefender.com",
  avast: "avast.com",
  mcafee: "mcafee.com",
  idm: "internetdownloadmanager.com",
  winrar: "win-rar.com",
  ccleaner: "ccleaner.com",
  parasut: "parasut.com",
  logo: "logo.com.tr",
  mikro: "mikro.com.tr",
  turkcell: "turkcell.com.tr",
  vodafone: "vodafone.com.tr",
  ttnet: "turktelekom.com.tr",
};

// Ürün adından anlamsız kelimeleri temizler.
const STOPWORDS = new Set([
  "premium","pro","plus","ultra","basic","standard","standart","aile","family",
  "aylik","aylık","yillik","yıllık","haftalik","haftalık","gunluk","günlük",
  "lisans","license","key","hesap","account","abonelik","subscription",
  "1","2","3","4","5","6","7","8","9","10","11","12",
  "ay","yil","yıl","gun","gün","adet","paket","new","yeni","türk","turk","tr",
  "orijinal","original","garantili","hediyeli",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, "i").replace(/ç/g, "c").replace(/ğ/g, "g")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function guessBrandDomain(name: string): string | null {
  if (!name) return null;
  const norm = normalize(name);
  if (!norm) return null;

  // 1) Tam eşleşme: en uzun map anahtarı önce
  const keys = Object.keys(BRAND_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (norm === k || norm.startsWith(k + " ") || norm.includes(" " + k + " ") || norm.endsWith(" " + k)) {
      return BRAND_MAP[k];
    }
  }

  // 2) İlk anlamlı token
  const tokens = norm.split(" ").filter((t) => t && !STOPWORDS.has(t));
  if (tokens.length === 0) return null;
  const first = tokens[0].replace(/\+$/, "");
  if (first.length < 2) return null;
  return `${first}.com`;
}

/** Marka logosu için tercih edilen URL (Clearbit). */
export function resolveLogoUrl(name: string): string | null {
  const domain = guessBrandDomain(name);
  if (!domain) return null;
  return `https://logo.clearbit.com/${domain}`;
}

/** Clearbit yüklenmezse fallback (Google favicon 256px). */
export function fallbackLogoUrl(name: string): string | null {
  const domain = guessBrandDomain(name);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
}

// Telegram Mini App (WebApp) integration helper.
// When the site is opened inside Telegram (via bot menu button / inline button),
// window.Telegram.WebApp is injected by the Telegram client.
// Docs: https://core.telegram.org/bots/webapps

type TgWebApp = {
  ready: () => void;
  expand: () => void;
  close: () => void;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  enableClosingConfirmation?: () => void;
  disableVerticalSwipes?: () => void;
  initData: string;
  initDataUnsafe?: {
    user?: { id: number; first_name?: string; last_name?: string; username?: string };
    start_param?: string;
  };
  platform: string;
  version: string;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function isTelegramWebApp(): boolean {
  return typeof window !== "undefined" && !!window.Telegram?.WebApp?.initData;
}

export function initTelegramWebApp(): void {
  if (typeof window === "undefined") return;
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  try {
    tg.ready();
    tg.expand();
    // Match site's neon-green cyber theme
    tg.setHeaderColor("#0a0f0a");
    tg.setBackgroundColor("#0a0f0a");
    tg.disableVerticalSwipes?.();
    // Add a css hook so we can style tweaks for Telegram context
    document.documentElement.dataset.telegram = "1";
  } catch (e) {
    console.warn("[telegram-webapp] init failed", (e as Error).message);
  }
}

export function getTelegramStartParam(): string | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? null;
}

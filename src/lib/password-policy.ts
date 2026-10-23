export const MIN_PASSWORD_LENGTH = 6;

/** Yeni şifrelerde ortak ve kolay tahmin edilen kalıpları engeller. */
export function passwordError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`;
  }
  if (password.length > 200) return "Şifre en fazla 200 karakter olabilir.";
  if (/^(.)\1+$/.test(password)) return "Şifre tek bir karakterin tekrarından oluşamaz.";

  const normalized = password.toLocaleLowerCase("tr-TR");
  const common = new Set([
    "passwordpassword",
    "1234567890",
    "qwertyuiop",
    "siberlisans",
    "siberphp123",
  ]);
  if (common.has(normalized)) return "Daha güçlü ve tahmin edilmesi zor bir şifre seç.";
  return null;
}

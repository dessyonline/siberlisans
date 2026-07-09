import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ImageIcon } from "lucide-react";
import {
  fallbackLogoUrl,
  guessBrandDomain,
  isLegacyClearbitLogo,
  resolveLogoUrl,
} from "@/lib/logo-resolver";

type ProductLogoProps = {
  name: string;
  src?: string | null;
  className?: string;
  imgClassName?: string;
  fallback?: ReactNode;
  loading?: "eager" | "lazy";
  decorative?: boolean;
};

function unique(values: Array<string | null | undefined>) {
  return values.filter((value, index, array): value is string => {
    if (!value) return false;
    return array.indexOf(value) === index;
  });
}

function logoDevUrl(name: string) {
  const token = import.meta.env.VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY as string | undefined;
  const domain = guessBrandDomain(name);
  if (!token || !domain) return null;
  return `https://img.logo.dev/${domain}?token=${encodeURIComponent(token)}&size=256&format=png`;
}

export function ProductLogo({
  name,
  src,
  className = "h-10 w-10 rounded-md border border-border/50 bg-background/60",
  imgClassName = "h-full w-full object-contain p-1",
  fallback,
  loading = "lazy",
  decorative = false,
}: ProductLogoProps) {
  const candidates = useMemo(() => {
    const stored = src && !isLegacyClearbitLogo(src) ? src : null;
    return unique([stored, logoDevUrl(name), resolveLogoUrl(name), fallbackLogoUrl(name)]);
  }, [name, src]);
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [name, src]);

  const current = candidates[index];

  return (
    <div className={`shrink-0 overflow-hidden flex items-center justify-center ${className}`}>
      {current ? (
        <img
          key={current}
          src={current}
          alt={decorative ? "" : `${name} logosu`}
          loading={loading}
          decoding="async"
          width={256}
          height={256}
          className={imgClassName}
          onError={() => setIndex((next) => next + 1)}
        />
      ) : (
        fallback ?? <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
      )}
    </div>
  );
}
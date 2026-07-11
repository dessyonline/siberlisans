import { Clock, Tag, TrendingDown } from "lucide-react";

type Props = {
  currentPrice: number;
  retailPrice?: number | null;
  durationLabel?: string | null;
  sourceUrl?: string | null;
  size?: "sm" | "md" | "hero";
};

/**
 * Resmi satıcının orijinal fiyatını çizgili gösterir + kaç TL / % tasarruf.
 * Müşteri sayfalarında öne çıkacak şekilde tasarlandı.
 * Sadece retail > current olduğunda görünür.
 */
export function RetailPriceBadge({
  currentPrice,
  retailPrice,
  durationLabel,
  sourceUrl,
  size = "sm",
}: Props) {
  const retail = Number(retailPrice ?? 0);
  const current = Number(currentPrice ?? 0);
  const hasRetail = retail > current && current > 0;
  if (!hasRetail && !durationLabel) return null;

  const saved = hasRetail ? retail - current : 0;
  const pct = hasRetail ? Math.round((saved / retail) * 100) : 0;

  // HERO: ürün detay sayfasında büyük, göz alıcı gösterim
  if (size === "hero") {
    return (
      <div className="space-y-2">
        {hasRetail && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Resmi satıcı fiyatı
              </span>
              <span className="text-2xl md:text-3xl font-mono text-muted-foreground/70 line-through decoration-destructive/60 decoration-2">
                ₺{retail.toLocaleString("tr-TR")}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="px-3 py-1.5 rounded-lg border border-primary/60 bg-primary/15 text-primary text-sm font-bold uppercase tracking-wider inline-flex items-center gap-1.5 neon-glow">
                <TrendingDown className="h-4 w-4" />%{pct} indirim
              </span>
              <span className="text-xs font-mono text-primary/80">
                ₺{saved.toLocaleString("tr-TR")} tasarruf
              </span>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {durationLabel && (
            <span className="px-2 py-1 rounded border border-cyan/40 bg-cyan/10 text-cyan text-xs font-mono inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {durationLabel}
            </span>
          )}
          {hasRetail && sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title="Resmi satıcı sayfası"
              className="text-[11px] font-mono text-muted-foreground/70 hover:text-primary underline decoration-dotted inline-flex items-center gap-1"
            >
              <Tag className="h-3 w-3" /> kaynağı gör
            </a>
          )}
        </div>
      </div>
    );
  }

  const textSize = size === "md" ? "text-sm" : "text-xs";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${textSize} font-mono`}>
      {hasRetail && (
        <>
          <span className="text-muted-foreground/70 line-through decoration-destructive/50">
            ₺{retail.toLocaleString("tr-TR")}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-primary/50 bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-wider">
            %{pct} indirim
          </span>
        </>
      )}
      {durationLabel && (
        <span className="px-1.5 py-0.5 rounded border border-cyan/30 bg-cyan/10 text-cyan text-[10px] inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {durationLabel}
        </span>
      )}
      {hasRetail && sourceUrl && size === "md" && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title="Resmi satıcı sayfası"
          className="text-[10px] text-muted-foreground/60 hover:text-primary underline decoration-dotted inline-flex items-center gap-1"
        >
          <Tag className="h-2.5 w-2.5" /> kaynak
        </a>
      )}
    </div>
  );
}

import { Clock, Tag } from "lucide-react";

type Props = {
  currentPrice: number;
  retailPrice?: number | null;
  durationLabel?: string | null;
  sourceUrl?: string | null;
  size?: "sm" | "md";
};

/**
 * Resmi satıcının orijinal fiyatını çizgili gösterir + kaç TL / % tasarruf.
 * Sadece retail > current olduğunda görünür.
 */
export function RetailPriceBadge({ currentPrice, retailPrice, durationLabel, sourceUrl, size = "sm" }: Props) {
  const retail = Number(retailPrice ?? 0);
  const current = Number(currentPrice ?? 0);
  const hasRetail = retail > current && current > 0;
  if (!hasRetail && !durationLabel) return null;

  const saved = hasRetail ? retail - current : 0;
  const pct = hasRetail ? Math.round((saved / retail) * 100) : 0;
  const textSize = size === "md" ? "text-sm" : "text-xs";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${textSize} font-mono`}>
      {hasRetail && (
        <>
          <span className="text-muted-foreground/70 line-through">
            ₺{retail.toLocaleString("tr-TR")}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider">
            %{pct} tasarruf
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

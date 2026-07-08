import { Star } from "lucide-react";

export function StarRating({
  value,
  size = 14,
  interactive = false,
  onChange,
}: {
  value: number;
  size?: number;
  interactive?: boolean;
  onChange?: (v: number) => void;
}) {
  const rounded = Math.round(value);
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= rounded;
        const Cmp = interactive ? "button" : "span";
        return (
          <Cmp
            key={n}
            type={interactive ? "button" : undefined}
            onClick={interactive ? () => onChange?.(n) : undefined}
            className={interactive ? "cursor-pointer hover:scale-110 transition" : ""}
            aria-label={interactive ? `${n} yıldız` : undefined}
          >
            <Star
              width={size}
              height={size}
              className={filled ? "fill-warn text-warn" : "text-muted-foreground/40"}
            />
          </Cmp>
        );
      })}
    </div>
  );
}

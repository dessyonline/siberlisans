import { computeProductTags, tagClass, type TagInput } from "@/lib/product-tags";

export function ProductTags({ product, max = 3, className = "" }: { product: TagInput; max?: number; className?: string }) {
  const tags = computeProductTags(product, max);
  if (tags.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider ${className}`}>
      {tags.map((t) => (
        <span key={t.key} className={`rounded-full border px-2 py-0.5 ${tagClass(t.tone)}`}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

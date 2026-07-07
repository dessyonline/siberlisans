export function ProductCardSkeleton() {
  return (
    <div className="glass-card rounded-xl p-5 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-16 rounded bg-muted/40" />
          <div className="h-5 w-3/4 rounded bg-muted/40" />
        </div>
        <div className="h-5 w-5 rounded bg-muted/40" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-muted/30" />
        <div className="h-3 w-5/6 rounded bg-muted/30" />
      </div>
      <div className="mt-4 flex gap-1.5">
        <div className="h-5 w-14 rounded bg-muted/30" />
        <div className="h-5 w-16 rounded bg-muted/30" />
      </div>
      <div className="mt-6 flex items-end justify-between">
        <div className="space-y-1.5">
          <div className="h-2 w-10 rounded bg-muted/30" />
          <div className="h-7 w-24 rounded bg-muted/40" />
        </div>
        <div className="h-8 w-20 rounded bg-muted/40" />
      </div>
    </div>
  );
}

export function LineSkeleton({ className = "" }: { className?: string }) {
  return <div className={`h-4 rounded bg-muted/40 animate-pulse ${className}`} />;
}

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Handshake } from "lucide-react";
import { isDealer as isDealerFn } from "@/lib/dealer.functions";

export function useIsDealer(userId?: string | null) {
  const fn = useServerFn(isDealerFn);
  const { data } = useQuery({
    queryKey: ["is-dealer", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: () => fn(),
  });
  return !!data?.active;
}

/** Header link to the dealer panel — only rendered for approved & active dealers. */
export function DealerNavLink({
  userId,
  className,
  mobile,
}: {
  userId?: string | null;
  className?: string;
  mobile?: boolean;
}) {
  const isDealer = useIsDealer(userId);
  if (!isDealer) return null;
  return (
    <Link
      to="/bayi"
      {...(mobile ? { "data-mobile-menu-close": "" } : {})}
      className={className}
    >
      {mobile ? (
        <>
          <Handshake className="h-4 w-4" />
          bayi paneli
        </>
      ) : (
        "./bayi-paneli"
      )}
    </Link>
  );
}

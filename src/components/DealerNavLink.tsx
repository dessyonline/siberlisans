import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Handshake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function useIsDealer(userId?: string | null) {
  const { data } = useQuery({
    queryKey: ["is-dealer", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("dealers")
        .select("code, active")
        .eq("user_id", userId!)
        .maybeSingle();
      return data ?? null;
    },
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

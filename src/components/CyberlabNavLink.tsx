import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Kullanıcının CyberLab erişimi var mı? (RLS: sadece kendi kaydını görür) */
export function useHasCyberlab(userId?: string | null) {
  const { data } = useQuery({
    queryKey: ["cyberlab-access", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_access")
        .select("expires_at")
        .eq("user_id", userId!)
        .eq("app_slug", "cyberlab")
        .maybeSingle();
      return data ?? null;
    },
  });
  if (!data) return false;
  return !data.expires_at || new Date(data.expires_at).getTime() > Date.now();
}

/** Sadece erişimi olan kullanıcılara görünen header linki. */
export function CyberlabNavLink({
  userId,
  className,
  mobile,
}: {
  userId?: string | null;
  className?: string;
  mobile?: boolean;
}) {
  const has = useHasCyberlab(userId);
  if (!has) return null;
  return (
    <Link
      to="/cyberlab"
      {...(mobile ? { "data-mobile-menu-close": "" } : {})}
      className={className}
    >
      {mobile ? (
        <>
          <FlaskConical className="h-4 w-4" />
          cyberlab
        </>
      ) : (
        "./cyberlab"
      )}
    </Link>
  );
}

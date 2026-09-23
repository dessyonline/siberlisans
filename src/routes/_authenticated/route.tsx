import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { getMe } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = await getMe();
    if (session.status === "unauthenticated") throw redirect({ to: "/auth" });
    return { user: session.user };
  },
  component: AuthenticatedLayout,
  errorComponent: AuthServiceError,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const { acceptUser } = useAuth();

  useEffect(() => {
    acceptUser(user);
  }, [acceptUser, user]);

  return <Outlet />;
}

function AuthServiceError() {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center px-4 text-center">
      <div className="w-full font-mono">
        <h1 className="text-lg text-primary">Oturum servisine geçici olarak ulaşılamıyor</h1>
        <p className="mt-2 text-sm text-muted-foreground">Oturumunuz kapatılmadı. Kısa süre sonra yeniden deneyin.</p>
        <Button className="mt-5 font-mono" onClick={() => void router.invalidate()}>
          yeniden dene
        </Button>
      </div>
    </div>
  );
}

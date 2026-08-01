import { Link } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";

/** Her zaman görünen CyberLab header linki. */
export function CyberlabNavLink({
  className,
  mobile,
}: {
  className?: string;
  mobile?: boolean;
}) {
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

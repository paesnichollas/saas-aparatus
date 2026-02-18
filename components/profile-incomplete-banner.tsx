import { CircleAlert } from "lucide-react";
import Link from "next/link";

interface ProfileIncompleteBannerProps {
  profileComplete: boolean;
}

const ProfileIncompleteBanner = ({
  profileComplete,
}: ProfileIncompleteBannerProps) => {
  if (profileComplete) {
    return null;
  }

  return (
    <div className="px-5 pt-4">
      <Link
        href="/profile"
        className="bg-accent text-accent-foreground border-border hover:bg-accent/80 flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors"
      >
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <p className="text-sm font-medium">
          Seu cadastro esta incompleto.{" "}
          <span className="underline">Clique aqui para finalizar.</span>
        </p>
      </Link>
    </div>
  );
};

export default ProfileIncompleteBanner;

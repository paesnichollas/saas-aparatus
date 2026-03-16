import { BotMessageSquare } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { SHOW_CHATBOT_ENTRYPOINTS } from "@/constants/feature-flags";
import { getSessionUser } from "@/lib/rbac";
import { Button } from "./ui/button";
import HeaderDesktopNav from "./header-desktop-nav";
import MenuSheet from "./menu-sheet";
import ThemeToggle from "./theme-toggle";

interface HeaderProps {
  homeHref?: string;
  chatHref?: string;
}

const Header = async ({ homeHref = "/", chatHref = "/chat" }: HeaderProps) => {
  const sessionUser = await getSessionUser();
  const userRole = sessionUser?.role ?? null;
  const userSummary = sessionUser
    ? {
        name: sessionUser.name,
        image: sessionUser.image,
        phone: sessionUser.phone,
        provider: sessionUser.provider,
        email: sessionUser.email,
        contactEmail: sessionUser.contactEmail,
      }
    : null;

  return (
    <header className="bg-background flex items-center justify-between gap-4 px-5 py-6 lg:px-8">
      <Link href={homeHref} className="shrink-0">
        <Image
          src="/logo.svg"
          alt="Aparon"
          width={91}
          height={24}
          className="dark:brightness-0 dark:invert"
        />
      </Link>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 lg:justify-between">
        <div className="hidden lg:block">
          <HeaderDesktopNav
            homeHref={homeHref}
            userRole={userRole}
            userSummary={userSummary}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          {SHOW_CHATBOT_ENTRYPOINTS ? (
            <Link href={chatHref}>
              <Button variant="outline" size="icon">
                <BotMessageSquare className="size-5" />
              </Button>
            </Link>
          ) : null}
          <div className="lg:hidden">
            <MenuSheet
              homeHref={homeHref}
              userRole={userRole}
              userSummary={userSummary}
            />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

import { BotMessageSquare } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { SHOW_CHATBOT_ENTRYPOINTS } from "@/constants/feature-flags";
import { getUserRoleFromSession } from "@/lib/rbac";
import { Button } from "./ui/button";
import MenuSheet from "./menu-sheet";
import ThemeToggle from "./theme-toggle";

interface HeaderProps {
  homeHref?: string;
  chatHref?: string;
}

const Header = async ({ homeHref = "/", chatHref = "/chat" }: HeaderProps) => {
  const userRole = await getUserRoleFromSession();

  return (
    <header className="bg-background flex items-center justify-between px-5 py-6">
      <Link href={homeHref}>
        <Image
          src="/logo.svg"
          alt="Aparatus"
          width={91}
          height={24}
          className="dark:brightness-0 dark:invert"
        />
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {SHOW_CHATBOT_ENTRYPOINTS ? (
          <Link href={chatHref}>
            <Button variant="outline" size="icon">
              <BotMessageSquare className="size-5" />
            </Button>
          </Link>
        ) : null}
        <MenuSheet
          homeHref={homeHref}
          userRole={userRole}
        />
      </div>
    </header>
  );
};

export default Header;

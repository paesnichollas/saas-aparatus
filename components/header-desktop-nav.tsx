"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  Home,
  LogIn,
  LogOut,
  Shield,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { type UserRole } from "@/generated/prisma/client";
import { authClient } from "@/lib/auth-client";
import { type UserProvider } from "@/lib/user-provider";
import { Button } from "./ui/button";

interface HeaderDesktopNavUserSummary {
  name: string;
  image: string | null;
  phone: string | null;
  provider: UserProvider;
  email: string;
  contactEmail: string | null;
}

interface HeaderDesktopNavProps {
  homeHref?: string;
  userRole?: UserRole | null;
  userSummary?: HeaderDesktopNavUserSummary | null;
}

const HeaderDesktopNav = ({
  homeHref = "/",
  userRole = null,
  userSummary = null,
}: HeaderDesktopNavProps) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    queryClient.clear();
    router.replace("/auth?forceLogin=1");

    void authClient
      .signOut()
      .then(({ error }) => {
        if (error && process.env.NODE_ENV !== "production") {
          console.error("[header-desktop-nav] signOut failed", error);
        }
      })
      .catch((error: unknown) => {
        if (process.env.NODE_ENV !== "production") {
          console.error("[header-desktop-nav] signOut threw", error);
        }
      });
  };

  const isLoggedIn = Boolean(userSummary);
  const canAccessOwnerPanel = userRole === "OWNER";
  const canAccessAdminPanel = userRole === "ADMIN";

  const linkClassName =
    "text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm font-medium transition-colors";

  return (
    <nav className="flex flex-wrap items-center gap-4 lg:gap-6" aria-label="Navegação principal">
      <Link
        href={homeHref}
        className={linkClassName}
        data-testid="menu-link-home"
      >
        <Home className="size-4 shrink-0" />
        Início
      </Link>
      <Link
        href="/bookings"
        className={linkClassName}
        data-testid="menu-link-bookings"
      >
        <CalendarDays className="size-4 shrink-0" />
        Agendamentos
      </Link>
      {isLoggedIn ? (
        <Link
          href="/profile"
          className={linkClassName}
          data-testid="menu-link-profile"
        >
          <UserRound className="size-4 shrink-0" />
          Perfil
        </Link>
      ) : (
        <Link href="/auth">
          <Button size="sm" className="gap-2">
            <LogIn className="size-4" />
            Login
          </Button>
        </Link>
      )}
      {isLoggedIn && canAccessOwnerPanel && (
        <>
          <Link
            href="/owner"
            className={linkClassName}
            data-testid="menu-link-owner"
          >
            <ShieldCheck className="size-4 shrink-0" />
            Painel
          </Link>
          <Link
            href="/owner/reports"
            className={linkClassName}
            data-testid="menu-link-owner-reports"
          >
            <BarChart3 className="size-4 shrink-0" />
            Relatório
          </Link>
        </>
      )}
      {isLoggedIn && canAccessAdminPanel && (
        <Link
          href="/admin"
          className={linkClassName}
          data-testid="menu-link-admin"
        >
          <Shield className="size-4 shrink-0" />
          Admin
        </Link>
      )}
      {isLoggedIn && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground gap-2"
          onClick={handleLogout}
          disabled={isLoggingOut}
          data-testid="menu-logout"
        >
          <LogOut className="size-4" />
          Sair
        </Button>
      )}
    </nav>
  );
};

export default HeaderDesktopNav;

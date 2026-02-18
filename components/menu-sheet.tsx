"use client";

import {
  BarChart3,
  CalendarDays,
  Home,
  LogIn,
  LogOut,
  MenuIcon,
  Shield,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { type UserRole } from "@/generated/prisma/client";
import { authClient } from "@/lib/auth-client";
import { type UserProvider } from "@/lib/user-provider";
import { formatPhoneBR } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

interface MenuSheetUserSummary {
  name: string;
  image: string | null;
  phone: string | null;
  provider: UserProvider;
  email: string;
  contactEmail: string | null;
}

interface MenuSheetProps {
  homeHref?: string;
  userRole?: UserRole | null;
  userSummary?: MenuSheetUserSummary | null;
}

const MenuSheet = ({
  homeHref = "/",
  userRole = null,
  userSummary = null,
}: MenuSheetProps) => {
  const router = useRouter();

  const handleLogout = async () => {
    const { error } = await authClient.signOut();

    if (error) {
      toast.error(error.message);
      return;
    }

    router.replace("/auth");
    router.refresh();
  };

  const displayPhone = userSummary?.phone
    ? formatPhoneBR(userSummary.phone) || null
    : null;
  const displayEmail =
    userSummary?.provider === "phone"
      ? userSummary.contactEmail
      : (userSummary?.email ?? null);
  const isLoggedIn = Boolean(userSummary);
  const canAccessOwnerPanel = userRole === "OWNER";
  const canAccessAdminPanel = userRole === "ADMIN";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <SheetHeader className="border-border border-b px-5 py-6 text-left">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-6 py-6">
          <div className="flex items-center justify-between px-5">
            {userSummary ? (
              <div className="flex items-center gap-3">
                <Avatar className="size-12">
                  <AvatarImage src={userSummary.image ?? ""} alt={userSummary.name} />
                  <AvatarFallback>
                    {userSummary.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-semibold">{userSummary.name}</span>
                  {displayPhone ? (
                    <span className="text-muted-foreground text-sm">{displayPhone}</span>
                  ) : null}
                  {displayEmail ? (
                    <span className="text-muted-foreground text-sm">{displayEmail}</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <p className="font-semibold">Ola. Faca seu login!</p>
                <Button asChild className="gap-3 rounded-full">
                  <Link href="/auth">
                    Login
                    <LogIn className="size-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>

          <div className="flex flex-col">
            <SheetClose asChild>
              <Link
                href={homeHref}
                className="flex items-center gap-3 px-5 py-3 text-sm font-medium"
              >
                <Home className="size-4" />
                Inicio
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link
                href="/bookings"
                className="flex items-center gap-3 px-5 py-3 text-sm font-medium"
              >
                <CalendarDays className="size-4" />
                Agendamentos
              </Link>
            </SheetClose>
            {isLoggedIn && canAccessOwnerPanel && (
              <>
                <SheetClose asChild>
                  <Link
                    href="/owner"
                    className="flex items-center gap-3 px-5 py-3 text-sm font-medium"
                  >
                    <ShieldCheck className="size-4" />
                    Painel Administrativo
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    href="/owner/reports"
                    className="flex items-center gap-3 px-5 py-3 text-sm font-medium"
                  >
                    <BarChart3 className="size-4" />
                    Relatório
                  </Link>
                </SheetClose>
              </>
            )}
            {isLoggedIn && canAccessAdminPanel && (
              <SheetClose asChild>
                <Link
                  href="/admin"
                  className="flex items-center gap-3 px-5 py-3 text-sm font-medium"
                >
                  <Shield className="size-4" />
                  Painel admin
                </Link>
              </SheetClose>
            )}
          </div>

          {isLoggedIn && (
            <>
              <div className="border-border border-b" />
              <Button
                variant="ghost"
                className="justify-left w-fit text-left"
                onClick={handleLogout}
              >
                <LogOut className="size-4" />
                Sair da conta
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MenuSheet;

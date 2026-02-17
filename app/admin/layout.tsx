import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminWithCompleteProfile } from "@/lib/rbac";

const adminNavigationItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/barbershops", label: "Barbearias" },
  { href: "/admin/owners", label: "Owners e usuarios" },
  { href: "/admin/bookings", label: "Reservas" },
];

const AdminLayout = async ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  await requireAdminWithCompleteProfile("/admin");

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Admin</h1>
            <Badge variant="secondary">Acesso total</Badge>
          </div>
          <Link href="/" className="text-sm font-medium underline-offset-4 hover:underline">
            Voltar para inicio
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-5 md:flex-row md:items-start">
        <aside className="w-full md:max-w-56">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Navegacao</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {adminNavigationItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground block text-sm font-medium"
                >
                  {item.label}
                </Link>
              ))}
            </CardContent>
          </Card>
        </aside>

        <main className="w-full space-y-4">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;

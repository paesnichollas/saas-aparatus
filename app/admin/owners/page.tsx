import { type UserRole } from "@/generated/prisma/client";

import OwnersManagementTableClient from "@/components/admin/owners-management-table-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminListBarbershops } from "@/data/admin/barbershops";
import { adminListUsers } from "@/data/admin/users";
import Link from "next/link";

interface AdminOwnersPageProps {
  searchParams: Promise<{
    q?: string | string[];
    role?: string | string[];
    page?: string | string[];
  }>;
}

const parseStringParam = (value: string | string[] | undefined) => {
  if (!value) {
    return "";
  }

  return Array.isArray(value) ? value[0] ?? "" : value;
};

const parsePageParam = (value: string | string[] | undefined) => {
  const rawValue = parseStringParam(value);
  const parsedPage = Number(rawValue);

  if (!Number.isFinite(parsedPage) || parsedPage < 1) {
    return 1;
  }

  return Math.floor(parsedPage);
};

const roleFilterValues = new Set<UserRole | "ALL">([
  "ALL",
  "CUSTOMER",
  "OWNER",
  "ADMIN",
]);

const parseRoleFilter = (value: string | string[] | undefined) => {
  const normalizedValue = parseStringParam(value).toUpperCase();

  if (roleFilterValues.has(normalizedValue as UserRole | "ALL")) {
    return normalizedValue as UserRole | "ALL";
  }

  return "ALL";
};

const AdminOwnersPage = async ({ searchParams }: AdminOwnersPageProps) => {
  const resolvedSearchParams = await searchParams;
  const search = parseStringParam(resolvedSearchParams.q);
  const role = parseRoleFilter(resolvedSearchParams.role);
  const page = parsePageParam(resolvedSearchParams.page);

  const [usersResult, barbershopsResult] = await Promise.all([
    adminListUsers({
      search,
      role,
      page,
    }),
    adminListBarbershops({
      page: 1,
      pageSize: 200,
    }),
  ]);

  const createPageHref = (nextPage: number) => {
    const params = new URLSearchParams();

    if (search) {
      params.set("q", search);
    }

    if (role !== "ALL") {
      params.set("role", role);
    }

    params.set("page", String(nextPage));

    return `/admin/owners?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Owners e usuarios</CardTitle>
          <CardDescription>
            Filtre usuarios por papel e controle promocoes/rebaixamentos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-center gap-2">
            <Input
              name="q"
              defaultValue={search}
              placeholder="Buscar por nome ou email"
              className="w-full md:max-w-sm"
            />

            <select
              name="role"
              defaultValue={role}
              className="bg-background border-input h-9 rounded-md border px-3 text-sm"
            >
              <option value="ALL">Todos os papeis</option>
              <option value="CUSTOMER">CUSTOMER</option>
              <option value="OWNER">OWNER</option>
              <option value="ADMIN">ADMIN</option>
            </select>

            <Button type="submit">Filtrar</Button>
          </form>

          <OwnersManagementTableClient
            users={usersResult.items}
            barbershopOptions={barbershopsResult.items.map((barbershop) => ({
              id: barbershop.id,
              name: barbershop.name,
            }))}
          />

          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              Pagina {usersResult.page} de {usersResult.totalPages} ({usersResult.totalCount}{" "}
              resultados)
            </p>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" disabled={usersResult.page <= 1}>
                <Link href={createPageHref(Math.max(1, usersResult.page - 1))}>
                  Anterior
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                disabled={usersResult.page >= usersResult.totalPages}
              >
                <Link
                  href={createPageHref(
                    Math.min(usersResult.totalPages, usersResult.page + 1),
                  )}
                >
                  Proxima
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminOwnersPage;

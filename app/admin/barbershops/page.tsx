import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import BarbershopStatusToggle from "@/components/admin/barbershop-status-toggle";
import { adminListBarbershops } from "@/data/admin/barbershops";

interface AdminBarbershopsPageProps {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    status?: string | string[];
    exclusive?: string | string[];
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

const statusFilterValues = new Set(["ALL", "ACTIVE", "INACTIVE"]);
const exclusiveFilterValues = new Set(["ALL", "EXCLUSIVE", "NON_EXCLUSIVE"]);

const parseStatusFilter = (value: string | string[] | undefined) => {
  const normalizedValue = parseStringParam(value).toUpperCase();

  if (statusFilterValues.has(normalizedValue)) {
    return normalizedValue as "ALL" | "ACTIVE" | "INACTIVE";
  }

  return "ALL";
};

const parseExclusiveFilter = (value: string | string[] | undefined) => {
  const normalizedValue = parseStringParam(value).toUpperCase();

  if (exclusiveFilterValues.has(normalizedValue)) {
    return normalizedValue as "ALL" | "EXCLUSIVE" | "NON_EXCLUSIVE";
  }

  return "ALL";
};

const AdminBarbershopsPage = async ({
  searchParams,
}: AdminBarbershopsPageProps) => {
  const resolvedSearchParams = await searchParams;
  const search = parseStringParam(resolvedSearchParams.q);
  const page = parsePageParam(resolvedSearchParams.page);
  const status = parseStatusFilter(resolvedSearchParams.status);
  const exclusive = parseExclusiveFilter(resolvedSearchParams.exclusive);

  const result = await adminListBarbershops({
    search,
    page,
    status,
    exclusive,
  });

  const createPageHref = (nextPage: number) => {
    const params = new URLSearchParams();

    if (search) {
      params.set("q", search);
    }

    if (status !== "ALL") {
      params.set("status", status);
    }

    if (exclusive !== "ALL") {
      params.set("exclusive", exclusive);
    }

    params.set("page", String(nextPage));
    return `/admin/barbershops?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle>Barbearias</CardTitle>
              <CardDescription>
                Busque e gerencie dados principais das barbearias.
              </CardDescription>
            </div>
            <Button asChild>
              <Link href="/admin/barbershops/new">Nova barbearia</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-center gap-2">
            <Input
              name="q"
              defaultValue={search}
              placeholder="Buscar por nome, slug, public slug ou owner"
              className="w-full md:max-w-md"
            />
            <select
              name="status"
              defaultValue={status}
              className="bg-background border-input h-9 rounded-md border px-3 text-sm"
            >
              <option value="ALL">Todas</option>
              <option value="ACTIVE">Ativas</option>
              <option value="INACTIVE">Inativas</option>
            </select>
            <select
              name="exclusive"
              defaultValue={exclusive}
              className="bg-background border-input h-9 rounded-md border px-3 text-sm"
            >
              <option value="ALL">Exclusivas e nao exclusivas</option>
              <option value="EXCLUSIVE">Somente exclusivas</option>
              <option value="NON_EXCLUSIVE">Somente nao exclusivas</option>
            </select>
            <Button type="submit">Buscar</Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Telefones</TableHead>
                <TableHead>Stripe</TableHead>
                <TableHead>Exclusiva</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.length > 0 ? (
                result.items.map((barbershop) => (
                  <TableRow key={barbershop.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{barbershop.name}</p>
                        <p className="text-muted-foreground text-xs">
                          Slug interno: {barbershop.slug}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Compartilhamento: {barbershop.publicSlug}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {barbershop.owner
                        ? `${barbershop.owner.name} (${barbershop.owner.email})`
                        : "Sem owner"}
                    </TableCell>
                    <TableCell>{barbershop.phones.join(", ")}</TableCell>
                    <TableCell>{barbershop.stripeEnabled ? "Ativo" : "Inativo"}</TableCell>
                    <TableCell>
                      {barbershop.exclusiveBarber ? "Sim" : "Nao"}
                    </TableCell>
                    <TableCell>
                      {barbershop.plan === "PRO"
                        ? `PRO (${barbershop.whatsappEnabled ? "WhatsApp on" : "WhatsApp off"})`
                        : "BASIC"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={barbershop.isActive ? "secondary" : "destructive"}>
                        {barbershop.isActive ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <BarbershopStatusToggle
                          barbershopId={barbershop.id}
                          isActive={barbershop.isActive}
                        />
                        <Link
                          href={`/admin/barbershops/${barbershop.id}`}
                          className="text-sm font-medium underline-offset-4 hover:underline"
                        >
                          Ver detalhes
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground text-sm">
                    Nenhuma barbearia encontrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              Pagina {result.page} de {result.totalPages} ({result.totalCount} resultados)
            </p>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" disabled={result.page <= 1}>
                <Link href={createPageHref(Math.max(1, result.page - 1))}>
                  Anterior
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                disabled={result.page >= result.totalPages}
              >
                <Link
                  href={createPageHref(
                    Math.min(result.totalPages, result.page + 1),
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

export default AdminBarbershopsPage;

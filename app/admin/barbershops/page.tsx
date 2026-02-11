import Link from "next/link";

import { Button } from "@/components/ui/button";
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
import { adminListBarbershops } from "@/data/admin/barbershops";

interface AdminBarbershopsPageProps {
  searchParams: Promise<{
    q?: string | string[];
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

const AdminBarbershopsPage = async ({
  searchParams,
}: AdminBarbershopsPageProps) => {
  const resolvedSearchParams = await searchParams;
  const search = parseStringParam(resolvedSearchParams.q);
  const page = parsePageParam(resolvedSearchParams.page);

  const result = await adminListBarbershops({
    search,
    page,
  });

  const createPageHref = (nextPage: number) => {
    const params = new URLSearchParams();

    if (search) {
      params.set("q", search);
    }

    params.set("page", String(nextPage));
    return `/admin/barbershops?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Barbearias</CardTitle>
          <CardDescription>
            Busque e gerencie dados principais das barbearias.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-center gap-2">
            <Input
              name="q"
              defaultValue={search}
              placeholder="Buscar por nome, slug, public slug ou owner"
              className="w-full md:max-w-md"
            />
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
                      <Link
                        href={`/admin/barbershops/${barbershop.id}`}
                        className="text-sm font-medium underline-offset-4 hover:underline"
                      >
                        Ver detalhes
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-sm">
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

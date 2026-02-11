import OwnerReportsCard from "@/components/owner/reports-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageSectionContent, PageSectionTitle } from "@/components/ui/page";
import { SHOW_CHATBOT_ENTRYPOINTS } from "@/constants/feature-flags";
import { adminListBarbershops } from "@/data/admin/barbershops";
import { getOwnerBarbershopIdByUserId } from "@/data/barbershops";
import { isAdmin, requireOwnerOrAdmin } from "@/lib/rbac";
import Link from "next/link";

type ReportRange = "WEEK" | "MONTH";

interface OwnerReportsPageProps {
  searchParams: Promise<{
    range?: string | string[];
    barbershopId?: string | string[];
  }>;
}

const parseStringParam = (value: string | string[] | undefined) => {
  if (!value) {
    return "";
  }

  return Array.isArray(value) ? value[0] ?? "" : value;
};

const parseRangeParam = (value: string | string[] | undefined): ReportRange => {
  const normalizedValue = parseStringParam(value).toUpperCase();

  if (normalizedValue === "MONTH") {
    return "MONTH";
  }

  return "WEEK";
};

const OwnerReportsPage = async ({ searchParams }: OwnerReportsPageProps) => {
  const user = await requireOwnerOrAdmin();
  const resolvedSearchParams = await searchParams;
  const initialRange = parseRangeParam(resolvedSearchParams.range);
  const requestedBarbershopId = parseStringParam(resolvedSearchParams.barbershopId);

  if (isAdmin(user.role)) {
    const barbershopsResult = await adminListBarbershops({
      page: 1,
      pageSize: 200,
    });

    const barbershopOptions = barbershopsResult.items.map((barbershop) => ({
      id: barbershop.id,
      name: barbershop.name,
    }));

    if (barbershopOptions.length === 0) {
      return (
        <PageSectionContent>
          <PageSectionTitle>Relatorio</PageSectionTitle>
          <Card>
            <CardHeader>
              <CardTitle>Nenhuma barbearia cadastrada</CardTitle>
              <CardDescription>
                Cadastre uma barbearia para gerar relatorios no painel.
              </CardDescription>
            </CardHeader>
          </Card>
        </PageSectionContent>
      );
    }

    const hasRequestedBarbershop = barbershopOptions.some(
      (barbershop) => barbershop.id === requestedBarbershopId,
    );
    const initialBarbershopId = hasRequestedBarbershop
      ? requestedBarbershopId
      : barbershopOptions[0]?.id ?? null;

    return (
      <PageSectionContent>
        <PageSectionTitle>Relatorio</PageSectionTitle>
        <OwnerReportsCard
          initialRange={initialRange}
          isAdmin
          initialBarbershopId={initialBarbershopId}
          barbershopOptions={barbershopOptions}
        />
      </PageSectionContent>
    );
  }

  const ownerBarbershop = await getOwnerBarbershopIdByUserId(user.id);
  const ownerBarbershopId = ownerBarbershop?.id ?? user.barbershopId;

  if (!ownerBarbershopId) {
    return (
      <PageSectionContent>
        <PageSectionTitle>Relatorio</PageSectionTitle>
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma barbearia vinculada</CardTitle>
            <CardDescription>
              Vincule sua conta a uma barbearia para visualizar pedidos e
              faturamento.
            </CardDescription>
          </CardHeader>
          {SHOW_CHATBOT_ENTRYPOINTS ? (
            <CardContent>
              <Button asChild className="gap-2">
                <Link href="/chat">Falar com o suporte</Link>
              </Button>
            </CardContent>
          ) : null}
        </Card>
      </PageSectionContent>
    );
  }

  return (
    <PageSectionContent>
      <PageSectionTitle>Relatorio</PageSectionTitle>
      <OwnerReportsCard
        initialRange={initialRange}
        isAdmin={false}
        initialBarbershopId={ownerBarbershopId}
        barbershopOptions={[]}
      />
    </PageSectionContent>
  );
};

export default OwnerReportsPage;

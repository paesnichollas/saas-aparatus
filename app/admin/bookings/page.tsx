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
import {
  type AdminBookingStatusFilter,
  adminListBookings,
} from "@/data/admin/bookings";
import { adminListBarbershops } from "@/data/admin/barbershops";

interface AdminBookingsPageProps {
  searchParams: Promise<{
    barbershopId?: string | string[];
    status?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
    page?: string | string[];
  }>;
}

const statusValues = new Set<AdminBookingStatusFilter>([
  "ALL",
  "UPCOMING",
  "PAST",
  "CANCELLED",
  "FAILED",
]);

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

const parseDateParam = (value: string | string[] | undefined) => {
  const rawValue = parseStringParam(value);

  if (!rawValue) {
    return null;
  }

  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
};

const parseStatusParam = (value: string | string[] | undefined) => {
  const normalizedValue = parseStringParam(value).toUpperCase();

  if (statusValues.has(normalizedValue as AdminBookingStatusFilter)) {
    return normalizedValue as AdminBookingStatusFilter;
  }

  return "ALL";
};

const toDateInputValue = (value: string | string[] | undefined) => {
  return parseStringParam(value);
};

const getBookingStatusLabel = ({
  cancelledAt,
  date,
  paymentStatus,
}: {
  cancelledAt: Date | null;
  date: Date;
  paymentStatus: string;
}) => {
  if (cancelledAt) {
    return "Cancelado";
  }

  if (paymentStatus === "FAILED") {
    return "Falha";
  }

  if (date < new Date()) {
    return "Passado";
  }

  return "Próximo";
};

const AdminBookingsPage = async ({ searchParams }: AdminBookingsPageProps) => {
  const resolvedSearchParams = await searchParams;
  const barbershopId = parseStringParam(resolvedSearchParams.barbershopId);
  const status = parseStatusParam(resolvedSearchParams.status);
  const startDate = parseDateParam(resolvedSearchParams.startDate);
  const endDate = parseDateParam(resolvedSearchParams.endDate);
  const page = parsePageParam(resolvedSearchParams.page);

  const [bookingsResult, barbershopsResult] = await Promise.all([
    adminListBookings({
      barbershopId: barbershopId || undefined,
      status,
      startDate,
      endDate,
      page,
    }),
    adminListBarbershops({
      page: 1,
      pageSize: 200,
    }),
  ]);

  const createPageHref = (nextPage: number) => {
    const params = new URLSearchParams();

    if (barbershopId) {
      params.set("barbershopId", barbershopId);
    }

    if (status !== "ALL") {
      params.set("status", status);
    }

    if (startDate) {
      params.set("startDate", toDateInputValue(resolvedSearchParams.startDate));
    }

    if (endDate) {
      params.set("endDate", toDateInputValue(resolvedSearchParams.endDate));
    }

    params.set("page", String(nextPage));
    return `/admin/bookings?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Agendamentos</CardTitle>
          <CardDescription>
            Lista global de agendamentos com filtros por barbearia, período e status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-center gap-2">
            <select
              name="barbershopId"
              defaultValue={barbershopId}
              className="bg-background border-input h-9 rounded-md border px-3 text-sm"
            >
              <option value="">Todas as barbearias</option>
              {barbershopsResult.items.map((barbershop) => (
                <option key={barbershop.id} value={barbershop.id}>
                  {barbershop.name}
                </option>
              ))}
            </select>

            <select
              name="status"
              defaultValue={status}
              className="bg-background border-input h-9 rounded-md border px-3 text-sm"
            >
              <option value="ALL">Todos os status</option>
              <option value="UPCOMING">UPCOMING</option>
              <option value="PAST">PAST</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="FAILED">FAILED</option>
            </select>

            <Input
              type="date"
              name="startDate"
              defaultValue={toDateInputValue(resolvedSearchParams.startDate)}
              className="w-full md:max-w-44"
            />
            <Input
              type="date"
              name="endDate"
              defaultValue={toDateInputValue(resolvedSearchParams.endDate)}
              className="w-full md:max-w-44"
            />

            <Button type="submit">Filtrar</Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Barbearia</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookingsResult.items.length > 0 ? (
                bookingsResult.items.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell>
                      {booking.date.toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>{booking.barbershop.name}</TableCell>
                    <TableCell>{booking.user.name}</TableCell>
                    <TableCell>{booking.service.name}</TableCell>
                    <TableCell>
                      {getBookingStatusLabel({
                        cancelledAt: booking.cancelledAt,
                        date: booking.date,
                        paymentStatus: booking.paymentStatus,
                      })}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-sm">
                    Nenhum agendamento encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              Página {bookingsResult.page} de {bookingsResult.totalPages} (
              {bookingsResult.totalCount} resultados)
            </p>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" disabled={bookingsResult.page <= 1}>
                <Link href={createPageHref(Math.max(1, bookingsResult.page - 1))}>
                  Anterior
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                disabled={bookingsResult.page >= bookingsResult.totalPages}
              >
                <Link
                  href={createPageHref(
                    Math.min(bookingsResult.totalPages, bookingsResult.page + 1),
                  )}
                >
                  Próximo
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminBookingsPage;

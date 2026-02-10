import Footer from "@/components/footer";
import Header from "@/components/header";
import ScheduleSettingsForm from "@/components/admin/schedule-settings-form";
import ServicesDurationForm from "@/components/admin/services-duration-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PageContainer,
  PageSectionContent,
  PageSectionTitle,
} from "@/components/ui/page";
import { getAdminBarbershopByUserId } from "@/data/barbershops";
import { getBookingStatus } from "@/lib/booking-status";
import { auth } from "@/lib/auth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  MessageCircleMore,
  Phone,
  Scissors,
  UserRound,
} from "lucide-react";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const getStatusBadgeVariant = (
  status: ReturnType<typeof getBookingStatus>,
): "default" | "secondary" | "destructive" => {
  if (status === "cancelled") {
    return "destructive";
  }
  if (status === "finished") {
    return "secondary";
  }
  return "default";
};

const getStatusLabel = (status: ReturnType<typeof getBookingStatus>) => {
  if (status === "cancelled") {
    return "Cancelado";
  }
  if (status === "finished") {
    return "Finalizado";
  }
  return "Confirmado";
};

const AdminPage = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/");
  }

  const barbershop = await getAdminBarbershopByUserId(session.user.id);

  if (!barbershop) {
    return (
      <div>
        <Header />
        <PageContainer>
          <PageSectionContent>
            <PageSectionTitle>Painel administrativo</PageSectionTitle>
            <Card>
              <CardHeader>
                <CardTitle>Nenhuma barbearia vinculada</CardTitle>
                <CardDescription>
                  Fale com o suporte para vincular sua barbearia a sua conta.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="gap-2">
                  <Link href="/chat">
                    <MessageCircleMore className="size-4" />
                    Falar com o suporte
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </PageSectionContent>
        </PageContainer>
        <Footer />
      </div>
    );
  }

  const now = new Date();
  const futureBookings = barbershop.bookings
    .filter((booking) => booking.date >= now)
    .sort((firstBooking, secondBooking) => {
      return firstBooking.date.getTime() - secondBooking.date.getTime();
    });
  const pastBookings = barbershop.bookings
    .filter((booking) => booking.date < now)
    .sort((firstBooking, secondBooking) => {
      return secondBooking.date.getTime() - firstBooking.date.getTime();
    });

  return (
    <div>
      <Header />
      <PageContainer>
        <PageSectionContent>
          <PageSectionTitle>Painel administrativo</PageSectionTitle>
          <Card>
            <CardHeader>
              <CardTitle>{barbershop.name}</CardTitle>
              <CardDescription>{barbershop.address}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border">
                <Image
                  src={barbershop.imageUrl}
                  alt={barbershop.name}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="space-y-2">
                {barbershop.phones.map((phone, index) => (
                  <Badge
                    key={`${phone}-${index}`}
                    variant="secondary"
                    className="mr-2 gap-1"
                  >
                    <Phone className="size-3" />
                    {phone}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </PageSectionContent>

        <PageSectionContent>
          <PageSectionTitle>Servicos</PageSectionTitle>
          {barbershop.services.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {barbershop.services.map((service) => (
                <Card key={service.id}>
                  <CardContent className="flex items-center gap-3">
                    <div className="relative size-16 overflow-hidden rounded-md border">
                      <Image
                        src={service.imageUrl}
                        alt={service.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold">{service.name}</p>
                      <p className="text-muted-foreground text-sm line-clamp-2">
                        {service.description}
                      </p>
                      <Badge variant="outline">
                        {currencyFormatter.format(service.priceInCents / 100)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Nenhum servico cadastrado.
                </p>
              </CardContent>
            </Card>
          )}
        </PageSectionContent>

        <PageSectionContent>
          <PageSectionTitle>Configurações de agenda</PageSectionTitle>
          <ScheduleSettingsForm
            barbershopId={barbershop.id}
            bookingIntervalMinutes={barbershop.bookingIntervalMinutes}
            openingHours={barbershop.openingHours.map((openingHour) => ({
              dayOfWeek: openingHour.dayOfWeek,
              openMinute: openingHour.openMinute,
              closeMinute: openingHour.closeMinute,
              closed: openingHour.closed,
            }))}
          />
          <ServicesDurationForm
            barbershopId={barbershop.id}
            services={barbershop.services.map((service) => ({
              id: service.id,
              name: service.name,
              durationInMinutes: service.durationInMinutes,
            }))}
          />
        </PageSectionContent>

        <PageSectionContent>
          <PageSectionTitle>Agendamentos futuros</PageSectionTitle>
          {futureBookings.length > 0 ? (
            <div className="space-y-3">
              {futureBookings.map((booking) => {
                const status = getBookingStatus(booking.date, booking.cancelledAt);
                return (
                  <Card key={booking.id}>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={getStatusBadgeVariant(status)}
                          className="capitalize"
                        >
                          {getStatusLabel(status)}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <CalendarDays className="size-3" />
                          {format(booking.date, "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <Scissors className="size-4" />
                          {booking.service.name}
                        </p>
                        <p className="text-muted-foreground flex items-center gap-2 text-sm">
                          <UserRound className="size-4" />
                          {booking.user.name}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Nenhum agendamento futuro.
                </p>
              </CardContent>
            </Card>
          )}
        </PageSectionContent>

        <PageSectionContent>
          <PageSectionTitle>Agendamentos passados</PageSectionTitle>
          {pastBookings.length > 0 ? (
            <div className="space-y-3">
              {pastBookings.map((booking) => {
                const status = getBookingStatus(booking.date, booking.cancelledAt);
                return (
                  <Card key={booking.id}>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={getStatusBadgeVariant(status)}
                          className="capitalize"
                        >
                          {getStatusLabel(status)}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <CalendarDays className="size-3" />
                          {format(booking.date, "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <Scissors className="size-4" />
                          {booking.service.name}
                        </p>
                        <p className="text-muted-foreground flex items-center gap-2 text-sm">
                          <UserRound className="size-4" />
                          {booking.user.name}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Nenhum agendamento passado.
                </p>
              </CardContent>
            </Card>
          )}
        </PageSectionContent>
      </PageContainer>
      <Footer />
    </div>
  );
};

export default AdminPage;

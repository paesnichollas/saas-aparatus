import Header from "@/components/header";
import Footer from "@/components/footer";
import BookingItem from "@/components/booking-item";
import OwnerCreateBookingSheet from "@/components/bookings/owner-create-booking-sheet";
import OwnerBookingsList from "@/components/bookings/owner-bookings-list";
import WaitlistFulfillmentBanner from "@/components/bookings/waitlist-fulfillment-banner";
import WaitlistList from "@/components/bookings/waitlist-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getOwnerTodayBarbershopBookingGroups, getUserBookings } from "@/data/bookings";
import { getBarbersByBarbershopId } from "@/data/barbers";
import { getOwnerBarbershopClientsByBookingHistory } from "@/data/owner/owner-barbershop-clients";
import { getServicesByBarbershopId } from "@/data/services";
import {
  getUserUnseenFulfilledWaitlistEntries,
  getUserWaitlistEntries,
} from "@/data/waitlist";
import { requireAuthenticatedUser } from "@/lib/rbac";
import {
  PageContainer,
  PageSectionContent,
  PageSectionTitle,
} from "@/components/ui/page";
import Link from "next/link";

interface BookingsPageProps {
  searchParams: Promise<{
    session_id?: string | string[];
  }>;
}

const BookingsPage = async ({ searchParams }: BookingsPageProps) => {
  const user = await requireAuthenticatedUser();

  if (user.role === "OWNER") {
    let ownerBookingGroups: Awaited<
      ReturnType<typeof getOwnerTodayBarbershopBookingGroups>
    > = [];
    let barbers: Awaited<ReturnType<typeof getBarbersByBarbershopId>> = [];
    let services: Awaited<ReturnType<typeof getServicesByBarbershopId>> = [];
    let clients: Awaited<
      ReturnType<typeof getOwnerBarbershopClientsByBookingHistory>
    > = [];

    if (user.barbershopId) {
      [ownerBookingGroups, barbers, services, clients] = await Promise.all([
        getOwnerTodayBarbershopBookingGroups(user.barbershopId),
        getBarbersByBarbershopId(user.barbershopId),
        getServicesByBarbershopId(user.barbershopId),
        getOwnerBarbershopClientsByBookingHistory(user.barbershopId),
      ]);
    }
    const barbershopName =
      ownerBookingGroups[0]?.bookings[0]?.barbershop.name ?? "Barbearia";

    return (
      <div>
        <Header />
        <PageContainer>
          <h1 className="text-xl font-bold">Agendamentos da barbearia</h1>

          {!user.barbershopId ? (
            <PageSectionContent>
              <Card>
                <CardHeader>
                  <CardTitle>Nenhuma barbearia vinculada</CardTitle>
                  <CardDescription>
                    Vincule sua conta de dono a uma barbearia para visualizar as
                    informações de agendamento.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Se o problema persistir, entre em contato com o suporte.
                  </p>
                </CardContent>
              </Card>
            </PageSectionContent>
          ) : (
            <PageSectionContent>
              <div className="flex justify-end">
                <OwnerCreateBookingSheet
                  barbershopId={user.barbershopId}
                  barbershopName={barbershopName}
                  barbers={barbers.map((barber) => ({
                    id: barber.id,
                    name: barber.name,
                  }))}
                  services={services.map((service) => ({
                    id: service.id,
                    name: service.name,
                    priceInCents: service.priceInCents,
                    durationInMinutes: service.durationInMinutes,
                  }))}
                  clients={clients}
                />
              </div>

              {ownerBookingGroups.length > 0 ? (
                <div className="space-y-4">
                  {ownerBookingGroups.map((group) => (
                    <div
                      key={group.status}
                      className="space-y-3"
                      data-testid={`owner-bookings-group-${group.status}`}
                    >
                      <PageSectionTitle>{group.label}</PageSectionTitle>
                      <OwnerBookingsList
                        bookings={group.bookings}
                        emptyMessage="Nenhum agendamento para este status."
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <OwnerBookingsList
                  bookings={[]}
                  emptyMessage="Nenhum agendamento para hoje."
                />
              )}

              <Button asChild variant="outline" className="w-fit">
                <Link href="/owner">Ver outros dias</Link>
              </Button>
            </PageSectionContent>
          )}
        </PageContainer>
        <Footer />
      </div>
    );
  }

  const resolvedSearchParams = await searchParams;
  const stripeSessionId = Array.isArray(resolvedSearchParams.session_id)
    ? resolvedSearchParams.session_id[0]
    : resolvedSearchParams.session_id;
  const [
    { confirmedBookings, finishedBookings },
    waitlistEntries,
    unseenFulfilledWaitlistEntries,
  ] = await Promise.all([
    getUserBookings({
      stripeSessionId,
    }),
    getUserWaitlistEntries(),
    getUserUnseenFulfilledWaitlistEntries(),
  ]);

  return (
    <div>
      <Header />
      <PageContainer>
        <h1 className="text-xl font-bold">Meus agendamentos</h1>

        {unseenFulfilledWaitlistEntries.length > 0 ? (
          <PageSectionContent>
            <WaitlistFulfillmentBanner entries={unseenFulfilledWaitlistEntries} />
          </PageSectionContent>
        ) : null}

        <PageSectionContent>
          <PageSectionTitle>Confirmados</PageSectionTitle>
          {confirmedBookings.length > 0 ? (
            <div className="flex flex-col gap-3">
              {confirmedBookings.map((booking) => (
                <BookingItem key={booking.id} booking={booking} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nenhum agendamento confirmado.
            </p>
          )}
        </PageSectionContent>

        <PageSectionContent>
          <PageSectionTitle>Finalizados</PageSectionTitle>
          {finishedBookings.length > 0 ? (
            <div className="flex flex-col gap-3">
              {finishedBookings.map((booking) => (
                <BookingItem key={booking.id} booking={booking} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nenhum agendamento finalizado.
            </p>
          )}
        </PageSectionContent>

        <PageSectionContent>
          <PageSectionTitle>Fila de espera</PageSectionTitle>
          <WaitlistList
            entries={waitlistEntries}
            emptyMessage="Você não possui entradas na fila de espera."
          />
        </PageSectionContent>
      </PageContainer>
      <Footer />
    </div>
  );
};

export default BookingsPage;

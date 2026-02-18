import BarbersManagementCard from "@/components/owner/barbers-management-card";
import BrandingSettingsForm from "@/components/owner/branding-settings-form";
import ExclusiveHomeCustomizationCard from "@/components/owner/exclusive-home-customization-card";
import PaymentSettingsForm from "@/components/owner/payment-settings-form";
import ScheduleSettingsForm from "@/components/owner/schedule-settings-form";
import ServicesManagementCard from "@/components/owner/services-management-card";
import WhatsAppAutomationSettingsCard from "@/components/owner/whatsapp-automation-settings-card";
import OwnerBookingsList from "@/components/bookings/owner-bookings-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageSectionContent, PageSectionTitle } from "@/components/ui/page";
import {
  getBarbershopShareLink,
  getOwnerBarbershopByUserId,
} from "@/data/barbershops";
import { getServicesByBarbershopId } from "@/data/services";
import { SHOW_CHATBOT_ENTRYPOINTS } from "@/constants/feature-flags";
import { getBookingStartDate } from "@/lib/booking-calculations";
import { requireOwnerOrAdmin } from "@/lib/rbac";
import { BarChart3, MessageCircleMore, Phone } from "lucide-react";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";

const getRequestOrigin = (requestHeaders: Headers) => {
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!host) {
    return null;
  }

  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
};

const OwnerPage = async () => {
  const requestHeaders = await headers();
  const user = await requireOwnerOrAdmin();

  const barbershop = await getOwnerBarbershopByUserId(user.id);

  if (!barbershop) {
    return (
      <PageSectionContent>
        <PageSectionTitle>Painel Administrativo</PageSectionTitle>
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma barbearia vinculada</CardTitle>
            <CardDescription>
              Fale com o suporte para vincular sua barbearia a sua conta.
            </CardDescription>
          </CardHeader>
          {SHOW_CHATBOT_ENTRYPOINTS ? (
            <CardContent>
              <Button asChild className="gap-2">
                <Link href="/chat">
                  <MessageCircleMore className="size-4" />
                  Falar com o suporte
                </Link>
              </Button>
            </CardContent>
          ) : null}
        </Card>
      </PageSectionContent>
    );
  }

  const services = await getServicesByBarbershopId(barbershop.id);
  const shareLink = await getBarbershopShareLink(
    barbershop.id,
    getRequestOrigin(requestHeaders),
  );

  const now = new Date();
  const futureBookings = barbershop.bookings
    .filter((booking) => getBookingStartDate(booking) >= now)
    .sort((firstBooking, secondBooking) => {
      return (
        getBookingStartDate(firstBooking).getTime() -
        getBookingStartDate(secondBooking).getTime()
      );
    });
  const pastBookings = barbershop.bookings
    .filter((booking) => getBookingStartDate(booking) < now)
    .sort((firstBooking, secondBooking) => {
      return (
        getBookingStartDate(secondBooking).getTime() -
        getBookingStartDate(firstBooking).getTime()
      );
    });

  return (
    <>
      <PageSectionContent>
        <div className="flex items-center justify-between gap-3">
          <PageSectionTitle>Painel Administrativo</PageSectionTitle>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/owner/reports">
              <BarChart3 className="size-4" />
              Relatório
            </Link>
          </Button>
        </div>
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
                sizes="(max-width: 48rem) 100vw, 72rem"
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
        <PageSectionTitle>Barbeiros</PageSectionTitle>
        <BarbersManagementCard
          barbershopId={barbershop.id}
          barbers={barbershop.barbers.map((barber) => ({
            id: barber.id,
            name: barber.name,
            imageUrl: barber.imageUrl,
          }))}
        />
      </PageSectionContent>

      <PageSectionContent>
        <PageSectionTitle>Servicos</PageSectionTitle>
        <ServicesManagementCard
          barbershopId={barbershop.id}
          services={services.map((service) => ({
            id: service.id,
            name: service.name,
            description: service.description,
            imageUrl: service.imageUrl,
            priceInCents: service.priceInCents,
            durationInMinutes: service.durationInMinutes,
          }))}
        />
      </PageSectionContent>

      <PageSectionContent>
        <PageSectionTitle>Configuracoes</PageSectionTitle>
        <BrandingSettingsForm
          barbershopId={barbershop.id}
          name={barbershop.name}
          description={barbershop.description}
          address={barbershop.address}
          phones={barbershop.phones}
          imageUrl={barbershop.imageUrl}
          slug={barbershop.slug}
          shareLink={shareLink}
        />
        <PaymentSettingsForm
          barbershopId={barbershop.id}
          stripeEnabled={barbershop.stripeEnabled}
        />
        <WhatsAppAutomationSettingsCard
          plan={barbershop.plan}
          initialSettings={
            barbershop.whatsappSettings
              ? {
                  sendBookingConfirmation:
                    barbershop.whatsappSettings.sendBookingConfirmation,
                  sendReminder24h: barbershop.whatsappSettings.sendReminder24h,
                  sendReminder1h: barbershop.whatsappSettings.sendReminder1h,
                }
              : null
          }
        />
        <ScheduleSettingsForm
          barbershopId={barbershop.id}
          openingHours={barbershop.openingHours.map((openingHour) => ({
            dayOfWeek: openingHour.dayOfWeek,
            openMinute: openingHour.openMinute,
            closeMinute: openingHour.closeMinute,
            closed: openingHour.closed,
          }))}
        />
        {barbershop.exclusiveBarber ? (
          <ExclusiveHomeCustomizationCard
            homePremiumTitle={barbershop.homePremiumTitle}
            homePremiumDescription={barbershop.homePremiumDescription}
            homePremiumChips={barbershop.homePremiumChips}
            services={services.map((service) => ({
              id: service.id,
              name: service.name,
              isFeatured: service.isFeatured,
            }))}
          />
        ) : null}
      </PageSectionContent>

      <PageSectionContent>
        <PageSectionTitle>Agendamentos futuros</PageSectionTitle>
        <OwnerBookingsList
          bookings={futureBookings}
          emptyMessage="Nenhum agendamento futuro."
        />
      </PageSectionContent>

      <PageSectionContent>
        <PageSectionTitle>Agendamentos passados</PageSectionTitle>
        <OwnerBookingsList
          bookings={pastBookings}
          emptyMessage="Nenhum agendamento passado."
        />
      </PageSectionContent>
    </>
  );
};

export default OwnerPage;

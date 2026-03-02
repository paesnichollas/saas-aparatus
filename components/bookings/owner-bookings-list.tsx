import { type PaymentMethod, type PaymentStatus } from "@/generated/prisma/client";
import { getBookingStartDate } from "@/lib/booking-calculations";
import { canOwnerMarkBookingAsPaid } from "@/lib/booking-payment";
import {
  getBookingDisplayStatus,
  getBookingDisplayStatusLabel,
  getBookingDisplayStatusVariant,
} from "@/lib/booking-status";
import { formatPhoneBRDisplay } from "@/lib/phone";
import { buildWhatsAppDeepLink } from "@/lib/whatsapp";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Phone, Scissors, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import OwnerMarkBookingPaidButton from "./owner-mark-booking-paid-button";
import OwnerBookingReminderButton from "./owner-booking-reminder-button";

type OwnerBookingListItem = {
  id: string;
  date: Date;
  startAt: Date | null;
  cancelledAt: Date | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  stripeChargeId: string | null;
  totalPriceInCents: number | null;
  barber: {
    name: string;
    imageUrl?: string | null;
  } | null;
  service?: {
    name: string;
  } | null;
  services?: Array<{
    service?: {
      name: string;
    } | null;
  }> | null;
  user: {
    name: string;
    phone?: string | null;
  };
};

interface OwnerBookingsListProps {
  bookings: OwnerBookingListItem[];
  emptyMessage: string;
}

interface OwnerBookingCardProps {
  booking: OwnerBookingListItem;
}

const getBookingTotalLabel = (totalPriceInCents: number | null) => {
  if (typeof totalPriceInCents === "number") {
    return `Total: ${formatCurrency(totalPriceInCents)}`;
  }

  return "Total indisponível";
};

const getBookingServiceNames = (booking: OwnerBookingListItem) => {
  const servicesNames = (booking.services ?? [])
    .map((bookingService) => bookingService.service?.name?.trim())
    .filter((serviceName): serviceName is string => Boolean(serviceName));

  if (servicesNames.length > 0) {
    return servicesNames;
  }

  const fallbackServiceName = booking.service?.name?.trim();

  if (fallbackServiceName) {
    return [fallbackServiceName];
  }

  return ["Serviço não informado"];
};

const getPaymentStatusLabel = (paymentStatus: PaymentStatus) => {
  if (paymentStatus === "PAID") {
    return "Pago";
  }

  return "Não pago";
};

const getBookingTotalReminderLabel = (totalPriceInCents: number | null) => {
  if (typeof totalPriceInCents === "number") {
    return formatCurrency(totalPriceInCents);
  }

  return "valor indisponível";
};

const getOwnerReminderMessage = ({
  bookingDateLabel,
  bookingTimeLabel,
  serviceNamesLabel,
  bookingTotalLabel,
}: {
  bookingDateLabel: string;
  bookingTimeLabel: string;
  serviceNamesLabel: string;
  bookingTotalLabel: string;
}) => {
  return [
    "Lembrete de Agendamento",
    "",
    `- Data: ${bookingDateLabel}`,
    `- Horário: ${bookingTimeLabel}`,
    `- Serviço: ${serviceNamesLabel}`,
    `- Valor: ${bookingTotalLabel}`,
    "",
    "Posso confirmar seu atendimento?",
  ].join("\n");
};

const OwnerBookingCard = ({ booking }: OwnerBookingCardProps) => {
  const bookingStartAt = getBookingStartDate(booking);
  const bookingDateTimeLabel = format(bookingStartAt, "dd/MM/yyyy HH:mm", {
    locale: ptBR,
  });
  const bookingDateLabel = format(bookingStartAt, "dd/MM/yyyy", { locale: ptBR });
  const bookingTimeLabel = format(bookingStartAt, "HH:mm", { locale: ptBR });
  const displayStatus = getBookingDisplayStatus({
    date: bookingStartAt,
    cancelledAt: booking.cancelledAt,
    paymentMethod: booking.paymentMethod,
    paymentStatus: booking.paymentStatus,
    stripeChargeId: booking.stripeChargeId,
  });
  const bookingTotalLabel = getBookingTotalLabel(booking.totalPriceInCents);
  const serviceNames = getBookingServiceNames(booking);
  const bookingUserPhone = formatPhoneBRDisplay(booking.user.phone?.trim());
  const canMarkAsPaid = canOwnerMarkBookingAsPaid(booking);
  const paymentStatusLabel = getPaymentStatusLabel(booking.paymentStatus);
  const paymentStatusVariant =
    booking.paymentStatus === "PAID" ? "default" : "destructive";
  const bookingServiceNamesLabel = serviceNames.join(", ");
  const bookingTotalReminderLabel = getBookingTotalReminderLabel(
    booking.totalPriceInCents,
  );
  const reminderMessage = getOwnerReminderMessage({
    bookingDateLabel,
    bookingTimeLabel,
    serviceNamesLabel: bookingServiceNamesLabel,
    bookingTotalLabel: bookingTotalReminderLabel,
  });
  const reminderLink = booking.user.phone
    ? buildWhatsAppDeepLink({
        phone: booking.user.phone,
        message: reminderMessage,
      })
    : null;

  return (
    <Card data-testid={`owner-booking-${booking.id}`}>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getBookingDisplayStatusVariant(displayStatus)}>
            {getBookingDisplayStatusLabel(displayStatus)}
          </Badge>
          <Badge variant={paymentStatusVariant}>{paymentStatusLabel}</Badge>
          <Badge variant="secondary" className="gap-1">
            <CalendarDays className="size-3" />
            {bookingDateTimeLabel}
          </Badge>
        </div>

        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Scissors className="size-4" />
            {serviceNames.join(" + ")}
          </p>
          <p className="text-muted-foreground text-sm">
            Barbeiro: {booking.barber?.name ?? "Não informado"}
          </p>
          <p className="text-muted-foreground text-sm">{bookingTotalLabel}</p>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <UserRound className="size-4" />
            {booking.user.name}
          </p>
          {bookingUserPhone.length > 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Phone className="size-4" />
              {bookingUserPhone}
            </p>
          ) : null}
          {canMarkAsPaid || reminderLink ? (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {reminderLink ? <OwnerBookingReminderButton url={reminderLink} /> : null}
              {canMarkAsPaid ? (
                <OwnerMarkBookingPaidButton bookingId={booking.id} />
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

const OwnerBookingsList = ({
  bookings,
  emptyMessage,
}: OwnerBookingsListProps) => {
  if (bookings.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground text-sm">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <OwnerBookingCard key={booking.id} booking={booking} />
      ))}
    </div>
  );
};

export default OwnerBookingsList;

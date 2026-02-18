import { type PaymentMethod, type PaymentStatus } from "@/generated/prisma/client";
import { getBookingStartDate } from "@/lib/booking-calculations";
import {
  getBookingDisplayStatus,
  getBookingDisplayStatusLabel,
  getBookingDisplayStatusVariant,
} from "@/lib/booking-status";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Phone, Scissors, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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

const MAX_PHONE_LENGTH = 11;

const normalizePhoneNumber = (phoneNumber: string) => {
  return phoneNumber.replace(/\D/g, "");
};

const formatPhoneBR = (phoneNumber: string) => {
  const digits = normalizePhoneNumber(phoneNumber).slice(0, MAX_PHONE_LENGTH);

  if (digits.length === 0) {
    return "";
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const getBookingTotalLabel = (totalPriceInCents: number | null) => {
  if (typeof totalPriceInCents === "number") {
    return `Total: ${formatCurrency(totalPriceInCents)}`;
  }

  return "Total indisponivel";
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

  return ["Servico nao informado"];
};

const OwnerBookingCard = ({ booking }: OwnerBookingCardProps) => {
  const bookingStartAt = getBookingStartDate(booking);
  const displayStatus = getBookingDisplayStatus({
    date: bookingStartAt,
    cancelledAt: booking.cancelledAt,
    paymentMethod: booking.paymentMethod,
    paymentStatus: booking.paymentStatus,
    stripeChargeId: booking.stripeChargeId,
  });
  const bookingTotalLabel = getBookingTotalLabel(booking.totalPriceInCents);
  const serviceNames = getBookingServiceNames(booking);
  const bookingUserPhone = booking.user.phone?.trim();

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getBookingDisplayStatusVariant(displayStatus)}>
            {getBookingDisplayStatusLabel(displayStatus)}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <CalendarDays className="size-3" />
            {format(bookingStartAt, "dd/MM/yyyy HH:mm", {
              locale: ptBR,
            })}
          </Badge>
        </div>

        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Scissors className="size-4" />
            {serviceNames.join(" + ")}
          </p>
          <p className="text-muted-foreground text-sm">
            Barbeiro: {booking.barber?.name ?? "Nao informado"}
          </p>
          <p className="text-muted-foreground text-sm">{bookingTotalLabel}</p>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <UserRound className="size-4" />
            {booking.user.name}
          </p>
          {bookingUserPhone ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Phone className="size-4" />
              {formatPhoneBR(bookingUserPhone)}
            </p>
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

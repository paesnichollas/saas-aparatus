import { type PaymentMethod, type PaymentStatus } from "@/generated/prisma/client";
import { getBookingStartDate } from "@/lib/booking-calculations";
import {
  getBookingDisplayStatus,
  getBookingDisplayStatusLabel,
  getBookingDisplayStatusVariant,
} from "@/lib/booking-status";
import { formatCurrency, formatPhoneBR } from "@/lib/utils";
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
  } | null;
  service: {
    name: string;
  };
  services: Array<{
    service: {
      name: string;
    };
  }>;
  user: {
    name: string;
    phone: string | null;
  };
};

interface OwnerBookingsListProps {
  bookings: OwnerBookingListItem[];
  emptyMessage: string;
}

const getBookingTotalLabel = (totalPriceInCents: number | null) => {
  if (typeof totalPriceInCents === "number") {
    return `Total: ${formatCurrency(totalPriceInCents)}`;
  }

  return "Total indisponivel";
};

const getBookingServiceNames = (booking: OwnerBookingListItem) => {
  if (booking.services.length > 0) {
    return booking.services.map((bookingService) => bookingService.service.name);
  }

  return [booking.service.name];
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
      {bookings.map((booking) => {
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

        return (
          <Card key={booking.id}>
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
                {booking.user.phone && (
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Phone className="size-4" />
                    {formatPhoneBR(booking.user.phone)}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default OwnerBookingsList;

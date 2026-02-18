"use client";

import { useState } from "react";
import { Avatar, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Sheet, SheetTrigger } from "./ui/sheet";
import { BookingWithRelations } from "@/data/bookings";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getBookingStartDate } from "@/lib/booking-calculations";
import { getBookingStatus } from "@/lib/booking-status";
import { formatCurrency } from "@/lib/utils";
import { resolveBarbershopImageUrl } from "@/lib/image-fallback";
import BookingInfoSheet from "./booking-info-sheet";

interface BookingItemProps {
  booking: BookingWithRelations;
}

const BookingItem = ({ booking }: BookingItemProps) => {
  const [sheetIsOpen, setSheetIsOpen] = useState(false);
  const bookingStartAt = getBookingStartDate(booking);
  const barbershopImageUrl = resolveBarbershopImageUrl(booking.barbershop.imageUrl);
  const status = getBookingStatus(bookingStartAt, booking.cancelledAt);
  const bookingServiceNames =
    booking.services.length > 0
      ? booking.services.map((bookingService) => bookingService.service.name)
      : [booking.service.name];
  const bookingTotalLabel =
    typeof booking.totalPriceInCents === "number"
      ? `Total: ${formatCurrency(booking.totalPriceInCents)}`
      : "Total indisponivel";

  return (
    <Sheet open={sheetIsOpen} onOpenChange={setSheetIsOpen}>
      <SheetTrigger asChild>
        <Card className="flex h-full w-full min-w-full cursor-pointer flex-row items-center justify-between p-0">
          <div className="flex flex-1 flex-col gap-4 p-4">
            {status === "cancelled" ? (
              <Badge variant="destructive">CANCELADO</Badge>
            ) : status === "confirmed" ? (
              <Badge>CONFIRMADO</Badge>
            ) : (
              <Badge variant="secondary">FINALIZADO</Badge>
            )}
            <div className="flex flex-col gap-2">
              <p className="font-bold">{bookingServiceNames.join(" + ")}</p>
              <p className="text-muted-foreground text-sm">{bookingTotalLabel}</p>
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={barbershopImageUrl} />
                </Avatar>
                <p className="text-sm font-medium">{booking.barbershop.name}</p>
              </div>
            </div>
          </div>

          <div className="flex h-full w-[6.625rem] flex-col items-center justify-center border-l py-3">
            <p className="text-xs capitalize">
              {format(bookingStartAt, "MMMM", { locale: ptBR })}
            </p>
            <p className="text-2xl">{format(bookingStartAt, "dd")}</p>
            <p className="text-xs">{format(bookingStartAt, "HH:mm")}</p>
          </div>
        </Card>
      </SheetTrigger>

      <BookingInfoSheet
        booking={booking}
        onClose={() => setSheetIsOpen(false)}
      />
    </Sheet>
  );
};

export default BookingItem;

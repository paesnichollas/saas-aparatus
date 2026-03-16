"use client";

import Image from "next/image";
import { SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { BookingWithRelations } from "@/data/bookings";
import {
  getBookingDurationMinutes,
  getBookingStartDate,
} from "@/lib/booking-calculations";
import { getBookingStatus } from "@/lib/booking-status";
import { getReviewEligibility } from "@/lib/review";
import { buildBookingReceiptWhatsAppLink } from "@/lib/whatsapp";
import BookingSummary from "./booking-summary";
import CopyButton from "@/app/barbershops/[id]/_components/copy-button";
import { Avatar, AvatarImage } from "./ui/avatar";
import { Loader2, MessageCircle, Smartphone } from "lucide-react";
import { cancelBooking } from "@/actions/cancel-booking";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { resolveBarbershopImageUrl } from "@/lib/image-fallback";
import { formatPhoneBRDisplay } from "@/lib/phone";
import { useState } from "react";
import BookingReviewDialog from "./booking-review-dialog";
import { authClient } from "@/lib/auth-client";

interface BookingInfoSheetProps {
  booking: BookingWithRelations;
  onClose: () => void;
}

const BookingInfoSheet = ({ booking, onClose }: BookingInfoSheetProps) => {
  const bookingStartAt = getBookingStartDate(booking);
  const barbershopImageUrl = resolveBarbershopImageUrl(booking.barbershop.imageUrl);
  const status = getBookingStatus(bookingStartAt, booking.cancelledAt);
  const [hasReview, setHasReview] = useState(Boolean(booking.review));
  const { data: sessionData } = authClient.useSession();
  const reviewEligibility = getReviewEligibility({
    actorUserId: sessionData?.user.id ?? "",
    bookingUserId: booking.userId,
    cancelledAt: booking.cancelledAt,
    date: bookingStartAt,
    paymentStatus: booking.paymentStatus,
    hasReview,
    now: new Date(),
  });
  const canCreateReview = reviewEligibility.canReview;
  const { executeAsync: executeCancelBooking, isPending: isCancelling } =
    useAction(cancelBooking);
  const bookingServices =
    booking.services.length > 0
      ? booking.services.map((bookingService) => ({
          id: bookingService.service.id,
          name: bookingService.service.name,
          priceInCents: bookingService.service.priceInCents,
        }))
      : [
          {
            id: booking.service.id,
            name: booking.service.name,
            priceInCents: booking.service.priceInCents,
          },
        ];
  const totalPriceInCents =
    booking.totalPriceInCents ??
    bookingServices.reduce((accumulator, service) => {
      return accumulator + service.priceInCents;
    }, 0);
  const totalDurationMinutes = getBookingDurationMinutes(booking);
  const displayPhones = booking.barbershop.phones
    .map((phone) => formatPhoneBRDisplay(phone))
    .filter((phone) => phone.length > 0);
  const canDisplayBookingReceiptButton =
    status === "confirmed" || status === "finished";
  const ownerPhone = booking.barbershop.owner?.phone?.trim() ?? null;
  const barbershopPrimaryPhone =
    ownerPhone ??
    booking.barbershop.phones
      .map((phone) => phone.trim())
      .find((phone) => phone.length > 0) ?? null;
  const bookingReceiptLink =
    canDisplayBookingReceiptButton && barbershopPrimaryPhone
      ? buildBookingReceiptWhatsAppLink({
          phone: barbershopPrimaryPhone,
          customerName: sessionData?.user.name,
          barberName: booking.barber?.name,
          bookingStartAt,
          serviceNames: bookingServices.map((service) => service.name),
          totalPriceInCents: booking.totalPriceInCents,
        })
      : null;

  const handleCancelBooking = async () => {
    const result = await executeCancelBooking({ bookingId: booking.id });

    if (result?.validationErrors) {
      return toast.error(result.validationErrors._errors?.[0]);
    }

    if (result?.serverError) {
      return toast.error(
        "Erro ao cancelar agendamento. Por favor, tente novamente.",
      );
    }

    toast.success("Agendamento cancelado com sucesso!");
    onClose();
  };

  const handleSendBookingReceipt = () => {
    if (!bookingReceiptLink) {
      return;
    }

    window.open(bookingReceiptLink, "_blank", "noopener,noreferrer");
  };

  return (
    <SheetContent className="flex flex-col overflow-y-auto p-0 lg:max-w-lg">
      <SheetHeader className="flex flex-row items-center justify-between border-b px-5 py-6">
        <SheetTitle>Informações do Agendamento</SheetTitle>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-6 px-5 py-6">
        <div className="relative h-45 w-full overflow-hidden rounded-lg">
          <Image
            src="/map.png"
            alt="Mapa"
            fill
            className="object-cover"
            sizes="(max-width: 48rem) 100vw, 28rem"
          />
          <div className="bg-background absolute right-5 bottom-5 left-5 flex items-center gap-3 rounded-lg px-5 py-3">
            <Avatar className="size-12">
              <AvatarImage src={barbershopImageUrl} />
            </Avatar>
            <div className="flex flex-1 flex-col overflow-hidden">
              <p className="font-bold">{booking.barbershop.name}</p>
              <p className="text-muted-foreground truncate text-xs">
                {booking.barbershop.address}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {status === "cancelled" ? (
            <Badge variant="destructive" className="w-fit">
              CANCELADO
            </Badge>
          ) : status === "confirmed" ? (
            <Badge className="w-fit">CONFIRMADO</Badge>
          ) : (
            <Badge variant="secondary" className="w-fit">
              FINALIZADO
            </Badge>
          )}

          <BookingSummary
            services={bookingServices}
            barbershopName={booking.barbershop.name}
            barberName={booking.barber?.name}
            date={bookingStartAt}
            totalDurationMinutes={totalDurationMinutes}
            totalPriceInCents={totalPriceInCents}
          />
        </div>

        {displayPhones.length > 0 && (
          <div className="flex flex-col gap-3">
            {displayPhones.map((phone, index) => (
              <div
                key={`${phone}-${index}`}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <Smartphone className="size-6" />
                  <p className="text-sm">{phone}</p>
                </div>
                <CopyButton text={phone} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 border-t px-5 py-6">
        <Button
          variant="outline"
          className="flex-1 rounded-full"
          onClick={onClose}
          data-testid="booking-info-close"
        >
          Voltar
        </Button>

        {bookingReceiptLink ? (
          <Button
            type="button"
            variant="outline"
            className="flex-1 gap-2 rounded-full"
            onClick={handleSendBookingReceipt}
            data-testid="booking-send-receipt-whatsapp"
          >
            <MessageCircle className="size-4" />
            Enviar comprovante
          </Button>
        ) : null}

        {status === "confirmed" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="flex-1 rounded-full"
                data-testid="booking-cancel-open"
              >
                Cancelar Agendamento
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar Agendamento</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja cancelar este agendamento? Esta ação não
                  pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Não, manter agendamento</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleCancelBooking}
                  disabled={isCancelling}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="booking-cancel-confirm"
                >
                  {isCancelling ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Sim, cancelar"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {hasReview && (
          <Button
            type="button"
            variant="secondary"
            className="flex-1 rounded-full"
            disabled
          >
            Avaliado
          </Button>
        )}

        {!hasReview && canCreateReview && (
          <BookingReviewDialog
            bookingId={booking.id}
            onReviewed={() => setHasReview(true)}
          />
        )}
      </div>
    </SheetContent>
  );
};

export default BookingInfoSheet;

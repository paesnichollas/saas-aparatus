"use client";

import { createBookingCheckoutSession } from "@/actions/create-booking-checkout-session";
import { joinWaitlist } from "@/actions/join-waitlist";
import { leaveWaitlist } from "@/actions/leave-waitlist";
import { queryKeys } from "@/constants/query-keys";
import {
  Barber,
  Barbershop,
  BarbershopService,
  PaymentMethod,
} from "@/generated/prisma/client";
import { useGetDateAvailableTimeSlots } from "@/hooks/data/use-get-date-availabe-time-slots";
import { useGetWaitlistStatusForDay } from "@/hooks/data/use-get-waitlist-status-for-day";
import { getBookingDateKey } from "@/lib/booking-time";
import {
  buildCompleteProfileUrl,
  isProfileIncompleteCode,
} from "@/lib/profile-completion";
import { buildBookingReceiptWhatsAppLink } from "@/lib/whatsapp";
import { cn, formatCurrency } from "@/lib/utils";
import { loadStripe } from "@stripe/stripe-js";
import { useQueryClient } from "@tanstack/react-query";
import { ptBR } from "date-fns/locale";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import BookingSummary from "./booking-summary";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

interface BookingSheetProps {
  barbershop: Barbershop;
  barbers: Barber[];
  services: BarbershopService[];
}

interface CreatedBookingReceipt {
  bookingId: string;
  status: "confirmed";
  customerName: string | null;
  barbershopName: string;
  barberName: string;
  barbershopPhone: string | null;
  bookingStartAt: string;
  serviceNames: string[];
  totalPriceInCents: number | null;
}

const getDefaultPaymentMethod = (stripeEnabled: boolean): PaymentMethod => {
  return stripeEnabled ? "STRIPE" : "IN_PERSON";
};

const BookingSheet = ({ barbershop, barbers, services }: BookingSheetProps) => {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sheetIsOpen, setSheetIsOpen] = useState(false);
  const [selectedBarberId, setSelectedBarberId] = useState<string | undefined>(
    barbers[0]?.id,
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | undefined>(undefined);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>(
    () => getDefaultPaymentMethod(barbershop.stripeEnabled),
  );
  const [createdBookingReceipt, setCreatedBookingReceipt] =
    useState<CreatedBookingReceipt | null>(null);

  const { executeAsync: executeCreateBooking, isPending: isCreatingBooking } =
    useAction(createBookingCheckoutSession);
  const { executeAsync: executeJoinWaitlist, isPending: isJoiningWaitlist } =
    useAction(joinWaitlist);
  const { executeAsync: executeLeaveWaitlist, isPending: isLeavingWaitlist } =
    useAction(leaveWaitlist);

  const { data: availableTimeSlots, isPending: isLoadingTimeSlots } =
    useGetDateAvailableTimeSlots({
      barbershopId: barbershop.id,
      barberId: selectedBarberId,
      serviceIds: selectedServiceIds,
      date: selectedDate,
    });

  const selectedSingleServiceId =
    selectedServiceIds.length === 1 ? selectedServiceIds[0] : undefined;
  const selectedDateDay = useMemo(() => {
    if (!selectedDate) {
      return undefined;
    }

    return getBookingDateKey(selectedDate);
  }, [selectedDate]);

  const { data: waitlistStatusResult, isPending: isLoadingWaitlistStatus } =
    useGetWaitlistStatusForDay({
      barbershopId: barbershop.id,
      barberId: selectedBarberId,
      serviceId: selectedSingleServiceId,
      dateDay: selectedDateDay,
    });

  const selectedBarber = useMemo(() => {
    return barbers.find((barber) => barber.id === selectedBarberId);
  }, [barbers, selectedBarberId]);

  const selectedServices = useMemo(() => {
    const selectedServiceIdSet = new Set(selectedServiceIds);
    return services.filter((service) => selectedServiceIdSet.has(service.id));
  }, [selectedServiceIds, services]);

  const totalDurationMinutes = useMemo(() => {
    return selectedServices.reduce((accumulator, service) => {
      return accumulator + service.durationInMinutes;
    }, 0);
  }, [selectedServices]);

  const totalPriceInCents = useMemo(() => {
    return selectedServices.reduce((accumulator, service) => {
      return accumulator + service.priceInCents;
    }, 0);
  }, [selectedServices]);

  const currentReturnToPath = useMemo(() => {
    const search = searchParams.toString();

    if (!search) {
      return pathname;
    }

    return `${pathname}?${search}`;
  }, [pathname, searchParams]);

  const canConfirmBooking = Boolean(
    selectedBarberId &&
      selectedDate &&
      selectedTime &&
      selectedServiceIds.length > 0 &&
      totalDurationMinutes > 0,
  );
  const hasAvailableTimeSlots = Boolean(availableTimeSlots?.data?.length);
  const waitlistStatus =
    selectedSingleServiceId && selectedDateDay
      ? waitlistStatusResult?.data ?? null
      : null;
  const isWaitlistActionPending = isJoiningWaitlist || isLeavingWaitlist;

  const handleBarberSelect = (barberId: string) => {
    setSelectedBarberId(barberId);
    setSelectedTime(undefined);
  };

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedTime(undefined);
  };

  const handleServiceToggle = (serviceId: string) => {
    setSelectedServiceIds((previousServiceIds) => {
      if (previousServiceIds.includes(serviceId)) {
        return previousServiceIds.filter((id) => id !== serviceId);
      }

      return [...previousServiceIds, serviceId];
    });
    setSelectedTime(undefined);
  };

  const resetBookingForm = () => {
    setCreatedBookingReceipt(null);
    setSheetIsOpen(false);
    setSelectedDate(undefined);
    setSelectedTime(undefined);
    setSelectedServiceIds([]);
    setSelectedPaymentMethod(getDefaultPaymentMethod(barbershop.stripeEnabled));
  };

  const createdBookingReceiptLink =
    createdBookingReceipt?.barbershopPhone && createdBookingReceipt.bookingStartAt
      ? buildBookingReceiptWhatsAppLink({
          phone: createdBookingReceipt.barbershopPhone,
          customerName: createdBookingReceipt.customerName,
          barberName: createdBookingReceipt.barberName,
          bookingStartAt: new Date(createdBookingReceipt.bookingStartAt),
          serviceNames: createdBookingReceipt.serviceNames,
          totalPriceInCents: createdBookingReceipt.totalPriceInCents,
        })
      : null;

  const handleSendBookingReceipt = () => {
    if (!createdBookingReceiptLink) {
      return;
    }

    window.open(createdBookingReceiptLink, "_blank", "noopener,noreferrer");
  };

  const handleSheetOpenChange = (open: boolean) => {
    setSheetIsOpen(open);

    if (!open) {
      setCreatedBookingReceipt(null);
    }
  };

  const invalidateWaitlistStatus = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.getWaitlistStatusForDay(
        barbershop.id,
        selectedBarberId,
        selectedSingleServiceId,
        selectedDateDay,
      ),
    });
  };

  const handleJoinWaitlist = async () => {
    if (!selectedBarberId || !selectedSingleServiceId || !selectedDateDay) {
      return;
    }

    const result = await executeJoinWaitlist({
      barbershopId: barbershop.id,
      barberId: selectedBarberId,
      serviceId: selectedSingleServiceId,
      dateDay: selectedDateDay,
      paymentMethod: selectedPaymentMethod,
    });

    if (result.validationErrors) {
      return toast.error(
        result.validationErrors._errors?.[0] ??
          "Não foi possível entrar na fila de espera.",
      );
    }

    if (result.serverError) {
      return toast.error("Não foi possível entrar na fila de espera.");
    }

    toast.success("Você entrou na fila de espera.");
    await invalidateWaitlistStatus();
  };

  const handleLeaveWaitlist = async () => {
    if (!waitlistStatus?.entryId) {
      return;
    }

    const result = await executeLeaveWaitlist({
      entryId: waitlistStatus.entryId,
    });

    if (result.validationErrors) {
      return toast.error(
        result.validationErrors._errors?.[0] ??
          "Não foi possível sair da fila de espera.",
      );
    }

    if (result.serverError) {
      return toast.error("Não foi possível sair da fila de espera.");
    }

    toast.success("Você saiu da fila de espera.");
    await invalidateWaitlistStatus();
  };

  const handleConfirmBooking = async () => {
    if (!canConfirmBooking || !selectedDate || !selectedTime || !selectedBarberId) {
      return;
    }

    const [hours, minutes] = selectedTime.split(":").map(Number);
    const startAt = new Date(selectedDate);
    startAt.setHours(hours, minutes, 0, 0);

    const result = await executeCreateBooking({
      barbershopId: barbershop.id,
      barberId: selectedBarberId,
      serviceIds: selectedServiceIds,
      startAt,
      paymentMethod: selectedPaymentMethod,
    });

    if (result.validationErrors) {
      return toast.error(result.validationErrors._errors?.[0]);
    }

    if (isProfileIncompleteCode(result.serverError)) {
      window.location.href = buildCompleteProfileUrl(currentReturnToPath);
      return;
    }

    if (result.serverError) {
      return toast.error("Erro ao criar agendamento. Por favor, tente novamente.");
    }

    const checkoutResult = result.data;
    if (!checkoutResult) {
      return toast.error("Erro ao criar agendamento. Por favor, tente novamente.");
    }

    if (checkoutResult.kind === "created") {
      toast.success("Agendamento confirmado com sucesso.");
      setCreatedBookingReceipt(checkoutResult.receipt);
      return;
    }

    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      return toast.error("Erro ao iniciar pagamento. Tente novamente.");
    }

    const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
    if (!stripe) {
      return toast.error("Erro ao iniciar pagamento. Tente novamente.");
    }

    toast.info("Redirecionando para o pagamento no Stripe.");
    await stripe.redirectToCheckout({
      sessionId: checkoutResult.sessionId,
    });
    resetBookingForm();
  };

  return (
    <Sheet open={sheetIsOpen} onOpenChange={handleSheetOpenChange}>
      <SheetTrigger asChild>
        <Button className="w-full rounded-full" data-testid="booking-open-sheet">
          Reservar
        </Button>
      </SheetTrigger>

      <SheetContent
        className="overflow-y-auto px-0 pb-0 lg:max-w-lg"
        data-testid="booking-sheet"
      >
        <SheetHeader className="border-border border-b px-5 py-6">
          <SheetTitle>Fazer Agendamento</SheetTitle>
        </SheetHeader>

        {createdBookingReceipt ? (
          <>
            <div className="flex flex-col gap-3 px-5 py-6">
              <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
                <Check className="size-5" />
              </div>
              <p className="text-lg font-semibold">Agendamento confirmado</p>
              <p className="text-muted-foreground text-sm">
                Seu agendamento foi confirmado com sucesso.
              </p>
            </div>

            <SheetFooter className="border-border border-t px-5 py-6">
              <div className="flex w-full gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-full"
                  onClick={resetBookingForm}
                  data-testid="booking-confirmed-close"
                >
                  Fechar
                </Button>

                {createdBookingReceiptLink ? (
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
              </div>
            </SheetFooter>
          </>
        ) : (
          <>
            <div className="space-y-6 px-5 py-6">
          <div className="space-y-3">
            <p className="text-sm font-semibold">1. Escolha o barbeiro</p>
            <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              {barbers.map((barber) => (
                <Button
                  key={barber.id}
                  variant={selectedBarberId === barber.id ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => handleBarberSelect(barber.id)}
                  data-testid={`booking-barber-${barber.id}`}
                >
                  {barber.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">2. Escolha o dia</p>
            <div data-testid="booking-calendar">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                locale={ptBR}
                className="w-full p-0"
                disabled={{ before: new Date() }}
                classNames={{
                  cell: "w-full",
                  day: "mx-auto h-9 w-9 rounded-full bg-transparent text-sm hover:bg-muted data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground",
                  head_cell:
                    "w-full text-xs font-normal text-muted-foreground capitalize",
                  caption: "capitalize",
                  caption_label: "text-base font-bold",
                  nav: "absolute right-0 top-0 z-10 flex gap-1",
                  nav_button_previous:
                    "h-7 w-7 rounded-lg border border-border bg-transparent hover:bg-transparent hover:opacity-100",
                  nav_button_next:
                    "h-7 w-7 rounded-lg bg-muted text-muted-foreground hover:bg-muted hover:opacity-100",
                  month_caption:
                    "relative flex w-full items-center justify-start px-0 pt-1",
                }}
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">3. Escolha os serviços</p>
            <div className="space-y-2">
              {services.map((service) => {
                const isSelected = selectedServiceIds.includes(service.id);

                return (
                  <button
                    key={service.id}
                    type="button"
                    className={cn(
                      "border-border bg-card flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors",
                      isSelected ? "border-primary bg-primary/5" : undefined,
                    )}
                    onClick={() => handleServiceToggle(service.id)}
                    data-testid={`booking-service-${service.id}`}
                  >
                    <div>
                      <p className="text-sm font-semibold">{service.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {service.durationInMinutes} min
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">
                        {formatCurrency(service.priceInCents)}
                      </p>
                      {isSelected ? (
                        <span className="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full">
                          <Check className="size-3" />
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ativar para dar opção de pagamento */}

          {/* <div className="space-y-3">
            <p className="text-sm font-semibold">4. Forma de pagamento</p>
            {barbershop.stripeEnabled ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={selectedPaymentMethod === "STRIPE" ? "default" : "outline"}
                  className="w-full"
                  onClick={() => setSelectedPaymentMethod("STRIPE")}
                  data-testid="booking-payment-method-stripe"
                >
                  Pagar Agora
                </Button>
                <Button
                  type="button"
                  variant={selectedPaymentMethod === "IN_PERSON" ? "default" : "outline"}
                  className="w-full"
                  onClick={() => setSelectedPaymentMethod("IN_PERSON")}
                  data-testid="booking-payment-method-in-person"
                >
                  Pagar no atendimento
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Pagamento no atendimento.
              </p>
            )}
          </div> */}

          {selectedDate && selectedBarberId && selectedServiceIds.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold">5. Escolha o horário</p>
              {isLoadingTimeSlots ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Carregando horários...
                </div>
              ) : hasAvailableTimeSlots ? (
                <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  {availableTimeSlots?.data?.map((time) => (
                    <Button
                      key={time}
                      variant={selectedTime === time ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => setSelectedTime(time)}
                      data-testid={`booking-time-${time}`}
                    >
                      {time}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-muted-foreground text-sm">
                    Nenhum horário disponível para esta combinação.
                  </p>

                  {selectedServiceIds.length !== 1 ? (
                    <p className="text-muted-foreground text-xs">
                      Para entrar na fila de espera, selecione apenas um serviço.
                    </p>
                  ) : isLoadingWaitlistStatus ? (
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                      <Loader2 className="size-4 animate-spin" />
                      Carregando status da fila...
                    </div>
                  ) : waitlistStatus?.isInQueue ? (
                    <div className="bg-card border-border space-y-3 rounded-xl border p-3">
                      <p className="text-sm">
                        Você está na fila de espera (posição {waitlistStatus.position} de{" "}
                        {waitlistStatus.queueLength}).
                      </p>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={isWaitlistActionPending}
                        onClick={handleLeaveWaitlist}
                        data-testid="booking-waitlist-leave"
                      >
                        {isLeavingWaitlist ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          "Sair da fila"
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-card border-border space-y-3 rounded-xl border p-3">
                      <p className="text-sm">
                        Não há vagas para este dia. Entre na fila e seja avisado quando
                        uma vaga abrir.
                      </p>
                      <Button
                        className="w-full"
                        disabled={isWaitlistActionPending}
                        onClick={handleJoinWaitlist}
                        data-testid="booking-waitlist-join"
                      >
                        {isJoiningWaitlist ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          "Entrar na fila de espera"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {selectedDate &&
          selectedTime &&
          selectedServices.length > 0 &&
          selectedBarber ? (
            <BookingSummary
              services={selectedServices.map((service) => ({
                id: service.id,
                name: service.name,
                priceInCents: service.priceInCents,
              }))}
              barbershopName={barbershop.name}
              barberName={selectedBarber.name}
              date={selectedDate}
              time={selectedTime}
              totalDurationMinutes={totalDurationMinutes}
              totalPriceInCents={totalPriceInCents}
            />
          ) : null}
            </div>

            <SheetFooter className="px-5 pb-6">
              <Button
                className="w-full"
                disabled={!canConfirmBooking || isCreatingBooking}
                onClick={handleConfirmBooking}
                data-testid="booking-confirm"
              >
                {isCreatingBooking ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Confirmar"
                )}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default BookingSheet;

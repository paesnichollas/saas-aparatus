"use client";

import { createBookingCheckoutSession } from "@/actions/create-booking-checkout-session";
import { useGetDateAvailableTimeSlots } from "@/hooks/data/use-get-date-availabe-time-slots";
import {
  buildCompleteProfileUrl,
  isProfileIncompleteCode,
} from "@/lib/profile-completion";
import { cn, formatCurrency } from "@/lib/utils";
import { Barber, Barbershop, BarbershopService } from "@/generated/prisma/client";
import { loadStripe } from "@stripe/stripe-js";
import { ptBR } from "date-fns/locale";
import { Check, Loader2 } from "lucide-react";
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

const BookingSheet = ({ barbershop, barbers, services }: BookingSheetProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sheetIsOpen, setSheetIsOpen] = useState(false);
  const [selectedBarberId, setSelectedBarberId] = useState<string | undefined>(
    barbers[0]?.id,
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | undefined>(undefined);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const { executeAsync: executeCreateBooking, isPending: isCreatingBooking } =
    useAction(createBookingCheckoutSession);

  const { data: availableTimeSlots, isPending: isLoadingTimeSlots } =
    useGetDateAvailableTimeSlots({
      barbershopId: barbershop.id,
      barberId: selectedBarberId,
      serviceIds: selectedServiceIds,
      date: selectedDate,
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
      toast.success("Reserva confirmada com sucesso.");
      setSheetIsOpen(false);
      setSelectedDate(undefined);
      setSelectedTime(undefined);
      setSelectedServiceIds([]);
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
    setSheetIsOpen(false);
    setSelectedDate(undefined);
    setSelectedTime(undefined);
    setSelectedServiceIds([]);
  };

  return (
    <Sheet open={sheetIsOpen} onOpenChange={setSheetIsOpen}>
      <SheetTrigger asChild>
        <Button className="w-full rounded-full">Reservar</Button>
      </SheetTrigger>

      <SheetContent className="overflow-y-auto px-0 pb-0">
        <SheetHeader className="border-border border-b px-5 py-6">
          <SheetTitle>Fazer Reserva</SheetTitle>
        </SheetHeader>

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
                >
                  {barber.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">2. Escolha o dia</p>
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

          <div className="space-y-3">
            <p className="text-sm font-semibold">3. Escolha os servicos</p>
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

          {selectedDate && selectedBarberId && selectedServiceIds.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold">4. Escolha o horario</p>
              {isLoadingTimeSlots ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Carregando horarios...
                </div>
              ) : availableTimeSlots?.data?.length ? (
                <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  {availableTimeSlots.data.map((time) => (
                    <Button
                      key={time}
                      variant={selectedTime === time ? "default" : "outline"}
                      className="rounded-full"
                      onClick={() => setSelectedTime(time)}
                    >
                      {time}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nenhum horario disponivel para esta combinacao.
                </p>
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
          >
            {isCreatingBooking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Confirmar"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default BookingSheet;

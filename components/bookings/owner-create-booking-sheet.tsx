"use client";

import { createOwnerBooking } from "@/actions/create-owner-booking";
import BookingSummary from "@/components/booking-summary";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useGetDateAvailableTimeSlots } from "@/hooks/data/use-get-date-availabe-time-slots";
import { buildWhatsAppDeepLink } from "@/lib/whatsapp";
import { cn, formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Check,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface OwnerCreateBookingSheetProps {
  barbershopId: string;
  barbershopName: string;
  barbers: Array<{
    id: string;
    name: string;
  }>;
  services: Array<{
    id: string;
    name: string;
    priceInCents: number;
    durationInMinutes: number;
  }>;
  clients: Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  }>;
}

interface CreatedOwnerBooking {
  id: string;
  status: "confirmed";
  date: Date | string;
  totalPriceInCents: number | null;
  barber: {
    name: string;
  } | null;
  services: Array<{
    service: {
      name: string;
      priceInCents: number;
      durationInMinutes: number;
    } | null;
  }>;
  barbershop: {
    name: string;
    phones: string[];
  };
  user: {
    name: string;
    phone: string | null;
  };
}

const getNormalizedSearch = (value: string) => {
  return value.trim().toLowerCase();
};

const getClientDescription = (client: {
  email: string | null;
  phone: string | null;
}) => {
  const hasEmail = client.email?.trim().length;
  const hasPhone = client.phone?.trim().length;

  if (hasEmail && hasPhone) {
    return `${client.email} - ${client.phone}`;
  }

  if (hasEmail) {
    return client.email!;
  }

  if (hasPhone) {
    return client.phone!;
  }

  return "Sem contato cadastrado";
};

const getReminderMessage = ({
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

const toDate = (value: Date | string) => {
  if (value instanceof Date) {
    return value;
  }

  return new Date(value);
};

const OwnerCreateBookingSheet = ({
  barbershopId,
  barbershopName,
  barbers,
  services,
  clients,
}: OwnerCreateBookingSheetProps) => {
  const router = useRouter();
  const [sheetIsOpen, setSheetIsOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientUserId, setSelectedClientUserId] = useState<
    string | undefined
  >(undefined);
  const [selectedBarberId, setSelectedBarberId] = useState<string | undefined>(
    barbers[0]?.id,
  );
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | undefined>(undefined);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [createdBooking, setCreatedBooking] = useState<CreatedOwnerBooking | null>(
    null,
  );

  const { executeAsync: executeCreateOwnerBooking, isPending: isCreatingBooking } =
    useAction(createOwnerBooking);

  const { data: availableTimeSlots, isPending: isLoadingTimeSlots } =
    useGetDateAvailableTimeSlots({
      barbershopId,
      barberId: selectedBarberId,
      serviceIds: selectedServiceIds,
      date: selectedDate,
    });

  const filteredClients = useMemo(() => {
    const normalizedSearch = getNormalizedSearch(clientSearch);

    if (!normalizedSearch) {
      return clients;
    }

    return clients.filter((client) => {
      const searchableValue = [
        client.name,
        client.email ?? "",
        client.phone ?? "",
      ].join(" ");

      return searchableValue.toLowerCase().includes(normalizedSearch);
    });
  }, [clientSearch, clients]);

  const selectedClient = useMemo(() => {
    return clients.find((client) => client.id === selectedClientUserId);
  }, [clients, selectedClientUserId]);

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

  const canConfirmBooking = Boolean(
    selectedClientUserId &&
      selectedBarberId &&
      selectedDate &&
      selectedTime &&
      selectedServiceIds.length > 0 &&
      totalDurationMinutes > 0,
  );
  const hasAvailableTimeSlots = Boolean(availableTimeSlots?.data?.length);

  const createdBookingDate = useMemo(() => {
    if (!createdBooking) {
      return null;
    }

    return toDate(createdBooking.date);
  }, [createdBooking]);

  const createdBookingServiceNames = useMemo(() => {
    if (!createdBooking) {
      return [];
    }

    return createdBooking.services
      .map((bookingService) => bookingService.service?.name?.trim())
      .filter((serviceName): serviceName is string => Boolean(serviceName));
  }, [createdBooking]);

  const createdBookingTotalLabel = useMemo(() => {
    if (
      createdBooking &&
      typeof createdBooking.totalPriceInCents === "number" &&
      createdBooking.totalPriceInCents >= 0
    ) {
      return formatCurrency(createdBooking.totalPriceInCents);
    }

    return "valor indisponível";
  }, [createdBooking]);

  const reminderLink = useMemo(() => {
    if (!createdBooking || !createdBookingDate || !createdBooking.user.phone) {
      return null;
    }

    const bookingDateLabel = format(createdBookingDate, "dd/MM/yyyy", {
      locale: ptBR,
    });
    const bookingTimeLabel = format(createdBookingDate, "HH:mm", {
      locale: ptBR,
    });
    const serviceNamesLabel =
      createdBookingServiceNames.length > 0
        ? createdBookingServiceNames.join(", ")
        : "Serviço não informado";

    return buildWhatsAppDeepLink({
      phone: createdBooking.user.phone,
      message: getReminderMessage({
        bookingDateLabel,
        bookingTimeLabel,
        serviceNamesLabel,
        bookingTotalLabel: createdBookingTotalLabel,
      }),
    });
  }, [
    createdBooking,
    createdBookingDate,
    createdBookingServiceNames,
    createdBookingTotalLabel,
  ]);

  const resetFormState = () => {
    setClientSearch("");
    setSelectedClientUserId(undefined);
    setSelectedBarberId(barbers[0]?.id);
    setSelectedDate(undefined);
    setSelectedTime(undefined);
    setSelectedServiceIds([]);
    setCreatedBooking(null);
  };

  const handleSheetOpenChange = (open: boolean) => {
    setSheetIsOpen(open);

    if (!open) {
      resetFormState();
    }
  };

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
    if (
      !canConfirmBooking ||
      !selectedDate ||
      !selectedTime ||
      !selectedBarberId ||
      !selectedClientUserId
    ) {
      return;
    }

    const [hours, minutes] = selectedTime.split(":").map(Number);
    const startAt = new Date(selectedDate);
    startAt.setHours(hours, minutes, 0, 0);

    const result = await executeCreateOwnerBooking({
      clientUserId: selectedClientUserId,
      barberId: selectedBarberId,
      serviceIds: selectedServiceIds,
      date: startAt,
    });

    if (result.validationErrors) {
      console.error(
        "[owner-create-booking-sheet] createOwnerBooking validationErrors.",
        result.validationErrors,
      );

      return toast.error(
        result.validationErrors._errors?.[0] ??
          result.validationErrors.clientUserId?._errors?.[0] ??
          result.validationErrors.barberId?._errors?.[0] ??
          result.validationErrors.serviceIds?._errors?.[0] ??
          result.validationErrors.date?._errors?.[0] ??
          "Não foi possível criar o agendamento.",
      );
    }

    if (result.serverError || !result.data) {
      if (result.serverError) {
        console.error(
          "[owner-create-booking-sheet] createOwnerBooking serverError.",
          result.serverError,
        );
      } else {
        console.error(
          "[owner-create-booking-sheet] createOwnerBooking sem dados na resposta.",
        );
      }

      if (
        typeof result.serverError === "string" &&
        result.serverError.trim().length > 0
      ) {
        return toast.error(result.serverError);
      }

      return toast.error("Não foi possível criar o agendamento.");
    }

    setCreatedBooking(result.data as CreatedOwnerBooking);
    toast.success("Agendamento confirmado com sucesso.");
    router.refresh();
  };

  const handleClose = () => {
    setSheetIsOpen(false);
    resetFormState();
  };

  const handleSendReminder = () => {
    if (!reminderLink) {
      return;
    }

    window.open(reminderLink, "_blank", "noopener,noreferrer");
  };

  return (
    <Sheet open={sheetIsOpen} onOpenChange={handleSheetOpenChange}>
      <SheetTrigger asChild>
        <Button className="gap-2 rounded-full" data-testid="owner-create-booking-open">
          <Plus className="size-4" />
          Criar agendamento
        </Button>
      </SheetTrigger>

      <SheetContent
        className="overflow-y-auto px-0 pb-0 sm:max-w-xl"
        data-testid="owner-create-booking-sheet"
      >
        <SheetHeader className="border-border border-b px-5 py-6">
          <SheetTitle>Criar agendamento manual</SheetTitle>
        </SheetHeader>

        {createdBooking ? (
          <>
            <div className="flex flex-col gap-3 px-5 py-6">
              <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
                <Check className="size-5" />
              </div>
              <p className="text-lg font-semibold">Agendamento confirmado</p>
              <p className="text-muted-foreground text-sm">
                O agendamento foi criado e a agenda do dia já foi atualizada.
              </p>
            </div>

            <SheetFooter className="border-border border-t px-5 py-6">
              <div className="flex w-full gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-full"
                  onClick={handleClose}
                  data-testid="owner-create-booking-close"
                >
                  Fechar
                </Button>

                {reminderLink ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-2 rounded-full"
                    onClick={handleSendReminder}
                    data-testid="owner-create-booking-reminder"
                  >
                    <MessageCircle className="size-4" />
                    Enviar lembrete
                  </Button>
                ) : null}
              </div>
            </SheetFooter>
          </>
        ) : (
          <>
            <div className="space-y-6 px-5 py-6">
              <div className="space-y-3">
                <p className="text-sm font-semibold">1. Selecione o cliente</p>

                {clients.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Nenhum cliente com histórico encontrado para esta barbearia.
                  </p>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                      <Input
                        value={clientSearch}
                        onChange={(event) => setClientSearch(event.target.value)}
                        placeholder="Buscar por nome, email ou telefone"
                        className="pl-9"
                        data-testid="owner-create-booking-client-search"
                      />
                    </div>

                    {filteredClients.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        Nenhum cliente encontrado para essa busca.
                      </p>
                    ) : (
                      <div className="border-border max-h-48 space-y-1 overflow-y-auto rounded-xl border p-1">
                        {filteredClients.map((client) => {
                          const isSelected = selectedClientUserId === client.id;

                          return (
                            <button
                              key={client.id}
                              type="button"
                              className={cn(
                                "hover:bg-muted/60 w-full rounded-lg px-3 py-2 text-left transition-colors",
                                isSelected ? "bg-primary/10 text-primary" : undefined,
                              )}
                              onClick={() => setSelectedClientUserId(client.id)}
                              data-testid={`owner-create-booking-client-${client.id}`}
                            >
                              <p className="text-sm font-medium">{client.name}</p>
                              <p className="text-muted-foreground text-xs">
                                {getClientDescription(client)}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold">2. Selecione o barbeiro</p>

                {barbers.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Nenhum barbeiro disponível no momento.
                  </p>
                ) : (
                  <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                    {barbers.map((barber) => (
                      <Button
                        key={barber.id}
                        type="button"
                        variant={selectedBarberId === barber.id ? "default" : "outline"}
                        className="rounded-full"
                        onClick={() => handleBarberSelect(barber.id)}
                        data-testid={`owner-create-booking-barber-${barber.id}`}
                      >
                        {barber.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold">3. Selecione o dia</p>
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
                <p className="text-sm font-semibold">4. Selecione os serviços</p>

                {services.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Nenhum serviço disponível para agendamento.
                  </p>
                ) : (
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
                          data-testid={`owner-create-booking-service-${service.id}`}
                        >
                          <div>
                            <p className="text-sm font-semibold">{service.name}</p>
                            <p className="text-muted-foreground text-xs">
                              {service.durationInMinutes} min
                            </p>
                          </div>
                          <p className="text-sm font-semibold">
                            {formatCurrency(service.priceInCents)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedDate && selectedBarberId && selectedServiceIds.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold">5. Selecione o horário</p>

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
                          type="button"
                          variant={selectedTime === time ? "default" : "outline"}
                          className="rounded-full"
                          onClick={() => setSelectedTime(time)}
                          data-testid={`owner-create-booking-time-${time}`}
                        >
                          {time}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Nenhum horário disponível para esta combinação.
                    </p>
                  )}
                </div>
              ) : null}

              {selectedClient &&
              selectedDate &&
              selectedTime &&
              selectedServices.length > 0 &&
              selectedBarber ? (
                <div className="space-y-3">
                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <UserRound className="size-4" />
                    Cliente: <span className="text-foreground">{selectedClient.name}</span>
                  </div>

                  <BookingSummary
                    services={selectedServices.map((service) => ({
                      id: service.id,
                      name: service.name,
                      priceInCents: service.priceInCents,
                    }))}
                    barbershopName={barbershopName}
                    barberName={selectedBarber.name}
                    date={selectedDate}
                    time={selectedTime}
                    totalDurationMinutes={totalDurationMinutes}
                    totalPriceInCents={totalPriceInCents}
                  />
                </div>
              ) : null}
            </div>

            <SheetFooter className="px-5 pb-6">
              <Button
                type="button"
                className="w-full"
                disabled={!canConfirmBooking || isCreatingBooking}
                onClick={handleConfirmBooking}
                data-testid="owner-create-booking-confirm"
              >
                {isCreatingBooking ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Confirmar agendamento"
                )}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default OwnerCreateBookingSheet;

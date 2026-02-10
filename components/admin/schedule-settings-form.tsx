"use client";

import { updateBarbershopSchedule } from "@/actions/update-barbershop-schedule";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";

type OpeningHourFormValue = {
  dayOfWeek: number;
  openMinute: number;
  closeMinute: number;
  closed: boolean;
};

type ScheduleSettingsFormProps = {
  barbershopId: string;
  bookingIntervalMinutes: number;
  openingHours: OpeningHourFormValue[];
};

const dayLabels: Record<number, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};

const toTimeInputValue = (minute: number) => {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const toMinuteValue = (timeValue: string) => {
  const [hoursString, minutesString] = timeValue.split(":");
  const hours = Number(hoursString);
  const minutes = Number(minutesString);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
};

const getDefaultOpeningHours = () =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openMinute: 9 * 60,
    closeMinute: 18 * 60,
    closed: false,
  }));

const mergeOpeningHours = (openingHours: OpeningHourFormValue[]) =>
  getDefaultOpeningHours().map((defaultOpeningHour) => {
    const existingOpeningHour = openingHours.find(
      (openingHour) => openingHour.dayOfWeek === defaultOpeningHour.dayOfWeek,
    );

    if (!existingOpeningHour) {
      return defaultOpeningHour;
    }

    return existingOpeningHour;
  });

const ScheduleSettingsForm = ({
  barbershopId,
  bookingIntervalMinutes,
  openingHours,
}: ScheduleSettingsFormProps) => {
  const [intervalInput, setIntervalInput] = useState(
    String(bookingIntervalMinutes),
  );
  const [hoursInput, setHoursInput] = useState<OpeningHourFormValue[]>(
    mergeOpeningHours(openingHours),
  );

  const { executeAsync: executeUpdateSchedule, isPending } =
    useAction(updateBarbershopSchedule);

  const handleTimeChange = (
    dayOfWeek: number,
    field: "openMinute" | "closeMinute",
    timeValue: string,
  ) => {
    const minuteValue = toMinuteValue(timeValue);

    if (minuteValue === null) {
      return;
    }

    setHoursInput((currentHours) =>
      currentHours.map((openingHour) => {
        if (openingHour.dayOfWeek !== dayOfWeek) {
          return openingHour;
        }

        return {
          ...openingHour,
          [field]: minuteValue,
        };
      }),
    );
  };

  const handleClosedToggle = (dayOfWeek: number) => {
    setHoursInput((currentHours) =>
      currentHours.map((openingHour) => {
        if (openingHour.dayOfWeek !== dayOfWeek) {
          return openingHour;
        }

        return {
          ...openingHour,
          closed: !openingHour.closed,
        };
      }),
    );
  };

  const handleSubmit = async () => {
    const parsedIntervalInput = Number(intervalInput);

    if (Number.isNaN(parsedIntervalInput)) {
      toast.error("Informe um intervalo de agenda válido.");
      return;
    }

    const result = await executeUpdateSchedule({
      barbershopId,
      bookingIntervalMinutes: parsedIntervalInput,
      openingHours: hoursInput,
    });

    if (result.validationErrors) {
      toast.error(result.validationErrors._errors?.[0] ?? "Dados inválidos.");
      return;
    }

    if (result.serverError) {
      toast.error(
        "Erro ao salvar agenda da barbearia. Por favor, tente novamente.",
      );
      return;
    }

    toast.success("Agenda da barbearia atualizada com sucesso.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações da agenda</CardTitle>
        <CardDescription>
          Defina intervalo de agenda e horário de funcionamento por dia da
          semana.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs space-y-2">
          <label htmlFor="booking-interval" className="text-sm font-medium">
            Intervalo da agenda (minutos)
          </label>
          <Input
            id="booking-interval"
            type="number"
            min={5}
            step={5}
            value={intervalInput}
            onChange={(event) => setIntervalInput(event.target.value)}
            disabled={isPending}
          />
        </div>

        <div className="space-y-3">
          {hoursInput.map((openingHour) => (
            <div
              key={openingHour.dayOfWeek}
              className="grid items-end gap-3 rounded-lg border p-3 md:grid-cols-[9rem_1fr_1fr_auto]"
            >
              <div>
                <p className="text-sm font-semibold">
                  {dayLabels[openingHour.dayOfWeek]}
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor={`opening-${openingHour.dayOfWeek}`}
                  className="text-muted-foreground text-xs font-medium"
                >
                  Abertura
                </label>
                <Input
                  id={`opening-${openingHour.dayOfWeek}`}
                  type="time"
                  value={toTimeInputValue(openingHour.openMinute)}
                  onChange={(event) =>
                    handleTimeChange(
                      openingHour.dayOfWeek,
                      "openMinute",
                      event.target.value,
                    )
                  }
                  disabled={isPending || openingHour.closed}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor={`closing-${openingHour.dayOfWeek}`}
                  className="text-muted-foreground text-xs font-medium"
                >
                  Fechamento
                </label>
                <Input
                  id={`closing-${openingHour.dayOfWeek}`}
                  type="time"
                  value={toTimeInputValue(openingHour.closeMinute)}
                  onChange={(event) =>
                    handleTimeChange(
                      openingHour.dayOfWeek,
                      "closeMinute",
                      event.target.value,
                    )
                  }
                  disabled={isPending || openingHour.closed}
                />
              </div>

              <Button
                type="button"
                variant={openingHour.closed ? "secondary" : "outline"}
                onClick={() => handleClosedToggle(openingHour.dayOfWeek)}
                disabled={isPending}
              >
                {openingHour.closed ? "Fechado" : "Aberto"}
              </Button>
            </div>
          ))}
        </div>

        <Button onClick={handleSubmit} disabled={isPending}>
          Salvar agenda
        </Button>
      </CardContent>
    </Card>
  );
};

export default ScheduleSettingsForm;

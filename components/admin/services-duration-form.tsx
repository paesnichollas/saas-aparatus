"use client";

import { updateBarbershopServicesDuration } from "@/actions/update-barbershop-services-duration";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";

type ServiceDurationFormValue = {
  id: string;
  name: string;
  durationInMinutes: number;
};

type ServicesDurationFormProps = {
  barbershopId: string;
  services: ServiceDurationFormValue[];
};

const ServicesDurationForm = ({
  barbershopId,
  services,
}: ServicesDurationFormProps) => {
  const [serviceDurations, setServiceDurations] =
    useState<ServiceDurationFormValue[]>(services);

  const { executeAsync: executeUpdateDurations, isPending } = useAction(
    updateBarbershopServicesDuration,
  );

  const handleDurationChange = (serviceId: string, durationInput: string) => {
    const parsedDurationInput = Number(durationInput);

    if (Number.isNaN(parsedDurationInput)) {
      return;
    }

    setServiceDurations((currentServices) =>
      currentServices.map((service) => {
        if (service.id !== serviceId) {
          return service;
        }

        return {
          ...service,
          durationInMinutes: parsedDurationInput,
        };
      }),
    );
  };

  const handleSubmit = async () => {
    const result = await executeUpdateDurations({
      barbershopId,
      services: serviceDurations.map((service) => ({
        id: service.id,
        durationInMinutes: service.durationInMinutes,
      })),
    });

    if (result.validationErrors) {
      toast.error(result.validationErrors._errors?.[0] ?? "Dados inválidos.");
      return;
    }

    if (result.serverError) {
      toast.error(
        "Erro ao salvar duração dos serviços. Por favor, tente novamente.",
      );
      return;
    }

    toast.success("Duração dos serviços atualizada com sucesso.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Duração dos serviços</CardTitle>
        <CardDescription>
          Defina em minutos o tempo de execução de cada serviço.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {serviceDurations.length > 0 ? (
          <div className="space-y-3">
            {serviceDurations.map((service) => (
              <div
                key={service.id}
                className="grid items-end gap-3 rounded-lg border p-3 md:grid-cols-[1fr_10rem]"
              >
                <p className="text-sm font-semibold">{service.name}</p>
                <div className="space-y-2">
                  <label
                    htmlFor={`duration-${service.id}`}
                    className="text-muted-foreground text-xs font-medium"
                  >
                    Duração (min)
                  </label>
                  <Input
                    id={`duration-${service.id}`}
                    type="number"
                    min={5}
                    max={240}
                    step={5}
                    value={String(service.durationInMinutes)}
                    onChange={(event) =>
                      handleDurationChange(service.id, event.target.value)
                    }
                    disabled={isPending}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Nenhum serviço disponível para atualização.
          </p>
        )}

        <Button
          onClick={handleSubmit}
          disabled={isPending || serviceDurations.length === 0}
        >
          Salvar durações
        </Button>
      </CardContent>
    </Card>
  );
};

export default ServicesDurationForm;

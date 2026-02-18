"use client";

import { BarbershopService } from "@/generated/prisma/client";
import { formatCurrency } from "@/lib/utils";
import Image from "next/image";

interface ServiceItemProps {
  service: BarbershopService;
  fallbackImageUrl: string;
}

const ServiceItem = ({ service, fallbackImageUrl }: ServiceItemProps) => {
  const serviceImageUrl = service.imageUrl ?? fallbackImageUrl;
  const serviceDescription = service.description?.trim() || "Sem descrição.";

  return (
    <div className="border-border bg-card flex gap-3 rounded-2xl border p-3">
      <div className="relative h-[6.875rem] w-[6.875rem] shrink-0">
        <Image
          src={serviceImageUrl}
          alt={service.name}
          fill
          className="rounded-xl object-cover"
          sizes="6.875rem"
        />
      </div>

      <div className="flex flex-1 flex-col justify-between">
        <div className="space-y-1">
          <p className="text-sm font-bold">{service.name}</p>
          <p className="text-muted-foreground text-sm">{serviceDescription}</p>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">{formatCurrency(service.priceInCents)}</p>
          <p className="text-muted-foreground text-xs">
            {service.durationInMinutes} min
          </p>
        </div>
      </div>
    </div>
  );
};

export default ServiceItem;

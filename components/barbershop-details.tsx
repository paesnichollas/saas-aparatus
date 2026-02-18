import { Barber, Barbershop, BarbershopService } from "@/generated/prisma/client";
import { Smartphone } from "lucide-react";
import Image from "next/image";
import BackButton from "@/app/barbershops/[id]/_components/back-button";
import CopyButton from "@/app/barbershops/[id]/_components/copy-button";
import BookingSheet from "@/components/booking-sheet";
import ServiceItem from "@/components/service-item";
import { PageSectionTitle } from "@/components/ui/page";

type BarbershopWithRelations = Barbershop & {
  barbers: Barber[];
  services: BarbershopService[];
};

interface BarbershopDetailsProps {
  barbershop: BarbershopWithRelations;
  showBackButton?: boolean;
}

const BarbershopDetails = ({
  barbershop,
  showBackButton = true,
}: BarbershopDetailsProps) => {
  return (
    <>
      <div className="relative h-[18.5625rem] w-full">
        <Image
          src={barbershop.imageUrl}
          alt={barbershop.name}
          fill
          className="object-cover"
          sizes="(max-width: 48rem) 100vw, 64rem"
        />
        {showBackButton ? <BackButton /> : null}
      </div>

      <div className="bg-background relative z-10 -mt-9 rounded-t-3xl">
        <div className="flex flex-col gap-1 px-5 pt-6">
          <div className="flex items-center gap-1.5">
            <div className="relative size-[1.875rem] shrink-0">
              <Image
                src={barbershop.imageUrl}
                alt={barbershop.name}
                fill
                className="rounded-full object-cover"
                sizes="1.875rem"
              />
            </div>
            <h1 className="text-xl font-bold">{barbershop.name}</h1>
          </div>
          <p className="text-muted-foreground text-sm">{barbershop.address}</p>
        </div>

        <div className="py-6">
          <div className="bg-border h-px w-full" />
        </div>

        <div className="flex flex-col gap-3 px-5">
          <PageSectionTitle>Sobre Nos</PageSectionTitle>
          <p className="text-sm">{barbershop.description}</p>
        </div>

        <div className="py-6">
          <div className="bg-border h-px w-full" />
        </div>

        <div className="flex flex-col gap-3 px-5">
          <PageSectionTitle>Reserva</PageSectionTitle>
          {barbershop.barbers.length > 0 ? (
            <BookingSheet
              barbershop={barbershop}
              barbers={barbershop.barbers}
              services={barbershop.services}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              Nenhum barbeiro cadastrado para esta barbearia.
            </p>
          )}
        </div>

        <div className="py-6">
          <div className="bg-border h-px w-full" />
        </div>

        <div className="flex flex-col gap-3 px-5">
          <PageSectionTitle>Servicos</PageSectionTitle>
          <div className="flex flex-col gap-3">
            {barbershop.services.map((service) => (
              <ServiceItem
                key={service.id}
                service={service}
                fallbackImageUrl={barbershop.imageUrl}
              />
            ))}
          </div>
        </div>

        <div className="py-6">
          <div className="bg-border h-px w-full" />
        </div>

        <div className="flex flex-col gap-3 px-5">
          <PageSectionTitle>Contato</PageSectionTitle>
          {barbershop.phones.map((phone, index) => (
            <div key={`${phone}-${index}`} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Smartphone className="size-6" />
                <p className="text-sm">{phone}</p>
              </div>
              <CopyButton text={phone} />
            </div>
          ))}
        </div>

        <div className="pt-[3.75rem]" />
      </div>
    </>
  );
};

export default BarbershopDetails;

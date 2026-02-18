import CopyButton from "@/app/barbershops/[id]/_components/copy-button";
import {
  Barber,
  Barbershop,
  BarbershopOpeningHours,
  BarbershopService,
} from "@/generated/prisma/client";
import { formatCurrency } from "@/lib/utils";
import { Clock3, MapPin, Phone, Scissors, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import BookingSheet from "@/components/booking-sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PageContainer,
  PageSectionContent,
  PageSectionTitle,
} from "@/components/ui/page";
import { Separator } from "@/components/ui/separator";

type BarbershopWithRelations = Barbershop & {
  barbers: Barber[];
  services: BarbershopService[];
  openingHours: BarbershopOpeningHours[];
};

interface ExclusiveBarbershopLandingProps {
  barbershop: BarbershopWithRelations;
}

const dayLabels = [
  "Domingo",
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado",
];

const DEFAULT_HOME_PREMIUM_TITLE = "Experiencia premium na home";
const DEFAULT_HOME_PREMIUM_DESCRIPTION =
  "Sua barbearia fica em destaque para todos os acessos em modo exclusivo.";
const DEFAULT_HOME_PREMIUM_CHIPS = [
  "Atendimento personalizado",
  "Reserva em poucos passos",
  "Visual profissional",
];

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
};

const ExclusiveBarbershopLanding = ({
  barbershop,
}: ExclusiveBarbershopLandingProps) => {
  const startingPriceInCents =
    barbershop.services.length > 0
      ? Math.min(...barbershop.services.map((service) => service.priceInCents))
      : null;
  const homePremiumTitle =
    barbershop.homePremiumTitle.trim() || DEFAULT_HOME_PREMIUM_TITLE;
  const homePremiumDescription =
    barbershop.homePremiumDescription.trim() || DEFAULT_HOME_PREMIUM_DESCRIPTION;
  const homePremiumChips = barbershop.homePremiumChips.filter(
    (chip) => chip.trim().length > 0,
  );
  const displayedHomePremiumChips =
    homePremiumChips.length > 0 ? homePremiumChips : DEFAULT_HOME_PREMIUM_CHIPS;
  const featuredServices = barbershop.services.filter(
    (service) => service.isFeatured,
  );
  const openingHoursMap = new Map(
    barbershop.openingHours.map((openingHour) => [
      openingHour.dayOfWeek,
      openingHour,
    ]),
  );

  return (
    <PageContainer>
      <section className="bg-card relative overflow-hidden rounded-3xl border shadow-lg">
        <div className="relative h-[23rem] w-full md:h-[26rem]">
          <Image
            src={barbershop.imageUrl}
            alt={barbershop.name}
            fill
            priority
            className="object-cover"
            sizes="(max-width: 48rem) 100vw, 80rem"
          />
          <div className="absolute inset-0 bg-gradient-to-t to-transparent pointer-events-none" />
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5 md:p-8">
          <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4 text-primary-foreground duration-500">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight md:text-4xl">
                {barbershop.name}
              </h1>
              <div className="text-primary-foreground/85 flex items-center gap-2 text-sm">
                <MapPin className="size-4" />
                <span>{barbershop.address}</span>
              </div>
              <p className="max-w-3xl text-sm text-primary-foreground/90 md:text-base">
                {barbershop.description}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {barbershop.barbers.length > 0 &&
              barbershop.services.length > 0 ? (
                <div className="w-full sm:w-[14rem]">
                  <BookingSheet
                    barbershop={barbershop}
                    barbers={barbershop.barbers}
                    services={barbershop.services}
                  />
                </div>
              ) : (
                <Button disabled className="w-full rounded-full sm:w-[14rem]">
                  Reservas indisponíveis
                </Button>
              )}
              <Button
                asChild
                variant="outline"
                className="rounded-full bg-background text-foreground hover:bg-accent dark:bg-background dark:hover:bg-background"
              >
                <Link href="#servicos">Ver Serviços</Link>
              </Button>
              <Button asChild variant="secondary" className="rounded-full">
                <Link href="#contato">Contato Rápido</Link>
              </Button>
              {/* <Button
                asChild
                variant="ghost"
                className="rounded-full text-primary-foreground"
              >
                <Link href="/home">Voltar para inicio</Link>
              </Button> */}
            </div>
          </div>
        </div>
      </section>

      <PageSectionContent>
        <PageSectionTitle>Destaques da barbearia</PageSectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="border-accent bg-accent/40 py-4">
            <CardContent className="flex items-center justify-between px-4">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Servicos ativos</p>
                <p className="text-xl font-bold">
                  {barbershop.services.length}
                </p>
              </div>
              <Scissors className="text-primary size-5" />
            </CardContent>
          </Card>

          <Card className="border-accent bg-accent/40 py-4">
            <CardContent className="flex items-center justify-between px-4">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">
                  Barbeiros disponiveis
                </p>
                <p className="text-xl font-bold">{barbershop.barbers.length}</p>
              </div>
              <UsersRound className="text-primary size-5" />
            </CardContent>
          </Card>

          <Card className="border-accent bg-accent/40 py-4 sm:col-span-2 lg:col-span-1">
            <CardContent className="flex items-center justify-between px-4">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">
                  Agendamentos a partir de
                </p>
                <p className="text-xl font-bold">
                  {startingPriceInCents
                    ? formatCurrency(startingPriceInCents)
                    : "Sem servicos"}
                </p>
              </div>
              <Clock3 className="text-primary size-5" />
            </CardContent>
          </Card>
        </div>
      </PageSectionContent>

      <div className="grid gap-3 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{homePremiumTitle}</CardTitle>
            <CardDescription>{homePremiumDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              {displayedHomePremiumChips.map((chip) => (
                <Badge key={chip} variant="outline">
                  {chip}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Horario semanal</CardTitle>
            <CardDescription>
              Horarios visiveis para facilitar o agendamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {dayLabels.map((dayLabel, dayOfWeek) => {
              const openingHour = openingHoursMap.get(dayOfWeek);
              const isClosed = !openingHour || openingHour.closed;
              const scheduleLabel = isClosed
                ? "Fechado"
                : `${formatMinutes(openingHour.openMinute)} - ${formatMinutes(openingHour.closeMinute)}`;

              return (
                <div
                  key={dayLabel}
                  className="flex items-center justify-between text-sm"
                >
                  <p className="text-muted-foreground">{dayLabel}</p>
                  <p className="font-medium">{scheduleLabel}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {featuredServices.length > 0 ? (
        <PageSectionContent>
          <PageSectionTitle>Servicos em destaque</PageSectionTitle>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {featuredServices.map((service) => {
              const serviceImageUrl = service.imageUrl ?? barbershop.imageUrl;

              return (
                <Card
                  key={service.id}
                  className="animate-in fade-in slide-in-from-bottom-2 border-accent bg-card py-4 duration-500"
                >
                  <CardContent className="space-y-3 px-4">
                    <div className="relative h-[10rem] w-full overflow-hidden rounded-2xl border">
                      <Image
                        src={serviceImageUrl}
                        alt={service.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 64rem) 100vw, 33vw"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold">{service.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {service.description?.trim() || "Sem descrição"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">
                        {formatCurrency(service.priceInCents)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {service.durationInMinutes} min
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </PageSectionContent>
      ) : null}

      <section id="servicos">
        <PageSectionContent>
          <PageSectionTitle>Todos os servicos</PageSectionTitle>
          {barbershop.services.length > 0 ? (
            <Accordion type="single" collapsible className="rounded-2xl border px-3">
              {barbershop.services.map((service) => {
                const serviceImageUrl = service.imageUrl ?? barbershop.imageUrl;
                const serviceDescription =
                  service.description?.trim() || "Sem descrição.";
                const firstPhone = barbershop.phones[0];

                return (
                  <AccordionItem key={service.id} value={`service-${service.id}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <p className="truncate text-sm font-medium">{service.name}</p>
                        <div className="ml-auto flex shrink-0 items-center gap-2">
                          <p className="text-sm font-semibold">
                            {formatCurrency(service.priceInCents)}
                          </p>
                          <Badge variant="secondary" className="text-xs">
                            {service.durationInMinutes} min
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>

                    <AccordionContent>
                      <div className="space-y-3">
                        <div className="relative h-[10rem] w-full overflow-hidden rounded-2xl border sm:h-[12rem]">
                          <Image
                            src={serviceImageUrl}
                            alt={service.name}
                            fill
                            className="object-cover"
                            sizes="(max-width: 48rem) 100vw, 50vw"
                          />
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {serviceDescription}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {firstPhone ? (
                            <Button asChild size="sm" className="rounded-full">
                              <Link
                                href={`tel:${firstPhone.replace(/[^\d+]/g, "")}`}
                              >
                                Ligar agora
                              </Link>
                            </Button>
                          ) : null}
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                          >
                            <Link href="#contato">Ver contato</Link>
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          ) : (
            <Card>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Nenhum servico cadastrado no momento.
                </p>
              </CardContent>
            </Card>
          )}
        </PageSectionContent>
      </section>

      <section id="contato">
        <PageSectionContent>
          <PageSectionTitle>Contato</PageSectionTitle>
          <Card>
            <CardContent className="space-y-3">
              {barbershop.phones.length > 0 ? (
                barbershop.phones.map((phone, index) => (
                  <div
                    key={`${phone}-${index}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <Link
                      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                      className="flex items-center gap-2 text-sm font-medium"
                    >
                      <Phone className="size-4" />
                      <span>{phone}</span>
                    </Link>
                    <CopyButton text={phone} />
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nenhum telefone cadastrado.
                </p>
              )}
            </CardContent>
          </Card>
        </PageSectionContent>
      </section>
    </PageContainer>
  );
};

export default ExclusiveBarbershopLanding;


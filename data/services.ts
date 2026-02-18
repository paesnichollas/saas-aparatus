import { prisma } from "@/lib/prisma";

export const getServicesByBarbershopId = async (barbershopId: string) => {
  const services = await prisma.barbershopService.findMany({
    where: {
      barbershopId,
      deletedAt: null,
    },
    orderBy: {
      name: "asc",
    },
  });

  return services;
};

export const getServiceById = async (serviceId: string) => {
  const service = await prisma.barbershopService.findFirst({
    where: {
      id: serviceId,
      deletedAt: null,
    },
    select: {
      id: true,
      barbershopId: true,
      barbershop: {
        select: {
          id: true,
          slug: true,
          publicSlug: true,
        },
      },
    },
  });

  return service;
};

type UpdateServiceInput = {
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceInCents: number;
  durationInMinutes: number;
};

export const updateServiceById = async (
  serviceId: string,
  input: UpdateServiceInput,
) => {
  const updatedService = await prisma.barbershopService.update({
    where: {
      id: serviceId,
    },
    data: {
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      priceInCents: input.priceInCents,
      durationInMinutes: input.durationInMinutes,
    },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      priceInCents: true,
      durationInMinutes: true,
    },
  });

  return updatedService;
};

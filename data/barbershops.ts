// Data Access Layer
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export type AdminBarbershopWithRelations = Prisma.BarbershopGetPayload<{
  include: {
    services: true;
    openingHours: true;
    bookings: {
      include: {
        service: true;
        user: true;
      };
    };
  };
}>;

export const getBarbershops = async () => {
  const barbershops = await prisma.barbershop.findMany();
  return barbershops;
};

export const getPopularBarbershops = async () => {
  const popularBarbershops = await prisma.barbershop.findMany({
    orderBy: {
      name: "desc",
    },
  });
  return popularBarbershops;
};

export const getBarbershopById = async (id: string) => {
  const barbershop = await prisma.barbershop.findUnique({
    where: { id },
    include: { services: true },
  });
  return barbershop;
};

export const getBarbershopsByServiceName = async (serviceName: string) => {
  const barbershops = await prisma.barbershop.findMany({
    where: {
      services: {
        some: {
          name: {
            contains: serviceName,
            mode: "insensitive",
          },
        },
      },
    },
  });
  return barbershops;
};

export const getAdminBarbershopByUserId = async (userId: string) => {
  const barbershop = await prisma.barbershop.findFirst({
    where: {
      ownerId: userId,
    },
    include: {
      services: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          name: "asc",
        },
      },
      openingHours: {
        orderBy: {
          dayOfWeek: "asc",
        },
      },
      bookings: {
        include: {
          service: true,
          user: true,
        },
        orderBy: {
          date: "desc",
        },
      },
    },
  });
  return barbershop;
};

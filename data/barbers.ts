import { prisma } from "@/lib/prisma";

export const getBarbersByBarbershopId = async (barbershopId: string) => {
  return prisma.barber.findMany({
    where: {
      barbershopId,
    },
    orderBy: {
      name: "asc",
    },
  });
};

export const listBarbersByBarbershop = async (barbershopId: string) => {
  const barbers = await prisma.barber.findMany({
    where: {
      barbershopId,
    },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      imageUrl: true,
    },
  });

  return barbers.map((barber) => ({
    id: barber.id,
    name: barber.name,
    avatar: barber.imageUrl,
    isActive: true,
  }));
};

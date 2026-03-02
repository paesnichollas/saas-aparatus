import { prisma } from "@/lib/prisma";

export interface OwnerBarbershopClient {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export const getOwnerBarbershopClientsByBookingHistory = async (
  barbershopId: string,
): Promise<OwnerBarbershopClient[]> => {
  const normalizedBarbershopId = barbershopId.trim();

  if (!normalizedBarbershopId) {
    return [];
  }

  const bookingHistoryByUser = await prisma.booking.groupBy({
    by: ["userId"],
    where: {
      barbershopId: normalizedBarbershopId,
    },
    _max: {
      date: true,
    },
    orderBy: {
      _max: {
        date: "desc",
      },
    },
  });

  if (bookingHistoryByUser.length === 0) {
    return [];
  }

  const userIds = bookingHistoryByUser.map((item) => item.userId);
  const users = await prisma.user.findMany({
    where: {
      id: {
        in: userIds,
      },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  });

  const usersById = new Map(users.map((user) => [user.id, user]));

  return userIds.flatMap((userId) => {
    const user = usersById.get(userId);

    if (!user) {
      return [];
    }

    return [
      {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
      },
    ];
  });
};

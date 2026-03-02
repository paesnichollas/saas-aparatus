import type {
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from "@/generated/prisma/client";
import { parseBookingDateOnly } from "@/lib/booking-time";
import { prisma } from "@/lib/prisma";
import { TEST_IDS } from "./test-data";

const normalizePhoneDigits = (phoneDigits: string) => {
  return phoneDigits.replace(/\D/g, "");
};

export const findUserIdByPhone = async (phoneDigits: string) => {
  const normalizedPhoneDigits = normalizePhoneDigits(phoneDigits);

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        {
          phone: `+55${normalizedPhoneDigits}`,
        },
        {
          email: `${normalizedPhoneDigits}@phone.local`,
        },
      ],
    },
    select: {
      id: true,
    },
  });

  if (!user) {
    throw new Error(`User with phone '${normalizedPhoneDigits}' not found.`);
  }

  return user.id;
};

export const setUserRoleByPhone = async ({
  phoneDigits,
  role,
  barbershopId,
}: {
  phoneDigits: string;
  role: UserRole;
  barbershopId?: string | null;
}) => {
  const userId = await findUserIdByPhone(phoneDigits);

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      role,
      barbershopId,
      currentBarbershopId: barbershopId,
    },
    select: {
      id: true,
    },
  });

  return userId;
};

export const assignOwnerByPhone = async ({
  phoneDigits,
  barbershopId,
}: {
  phoneDigits: string;
  barbershopId: string;
}) => {
  const userId = await findUserIdByPhone(phoneDigits);

  await prisma.$transaction(async (tx) => {
    await tx.barbershop.updateMany({
      where: {
        ownerId: userId,
      },
      data: {
        ownerId: null,
      },
    });

    await tx.barbershop.update({
      where: {
        id: barbershopId,
      },
      data: {
        ownerId: userId,
      },
      select: {
        id: true,
      },
    });

    await tx.user.update({
      where: {
        id: userId,
      },
      data: {
        role: "OWNER",
        barbershopId,
        currentBarbershopId: barbershopId,
      },
      select: {
        id: true,
      },
    });
  });

  return userId;
};

export const createFinishedBookingForUser = async ({
  userId,
  startAt,
  endAt,
}: {
  userId: string;
  startAt: Date;
  endAt: Date;
}) => {
  return createTestBookingForUser({
    userId,
    startAt,
    endAt,
    paymentMethod: "IN_PERSON",
    paymentStatus: "PAID",
  });
};

interface CreateTestBookingForUserInput {
  userId: string;
  startAt: Date;
  endAt?: Date;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  stripeChargeId?: string | null;
  cancelledAt?: Date | null;
}

export const createTestBookingForUser = async ({
  userId,
  startAt,
  endAt,
  paymentMethod = "IN_PERSON",
  paymentStatus = "PENDING",
  stripeChargeId = null,
  cancelledAt = null,
}: CreateTestBookingForUserInput) => {
  const resolvedEndAt = endAt ?? new Date(startAt.getTime() + 30 * 60_000);
  const totalDurationMinutes = Math.max(
    1,
    Math.round((resolvedEndAt.getTime() - startAt.getTime()) / 60_000),
  );

  const booking = await prisma.booking.create({
    data: {
      barbershopId: TEST_IDS.barbershopPublic,
      barberId: TEST_IDS.barberPublicPrimary,
      serviceId: TEST_IDS.serviceCut,
      userId,
      paymentMethod,
      paymentStatus,
      stripeChargeId,
      totalDurationMinutes,
      totalPriceInCents: 5000,
      date: startAt,
      startAt,
      endAt: resolvedEndAt,
      paymentConfirmedAt: paymentStatus === "PAID" ? resolvedEndAt : null,
      cancelledAt,
      services: {
        create: {
          serviceId: TEST_IDS.serviceCut,
        },
      },
    },
    select: {
      id: true,
    },
  });

  return booking.id;
};

export const createWaitlistEntryForUser = async ({
  userId,
  dateDay,
}: {
  userId: string;
  dateDay: Date;
}) => {
  const entry = await prisma.waitlistEntry.create({
    data: {
      barbershopId: TEST_IDS.barbershopPublic,
      userId,
      serviceId: TEST_IDS.serviceCut,
      barberId: TEST_IDS.barberPublicPrimary,
      dateDay,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  return entry.id;
};

export const hasCustomerBarbershopLink = async ({
  userId,
  barbershopId,
}: {
  userId: string;
  barbershopId: string;
}) => {
  const linkedRecord = await prisma.customerBarbershop.findUnique({
    where: {
      customerId_barbershopId: {
        customerId: userId,
        barbershopId,
      },
    },
    select: {
      customerId: true,
    },
  });

  return Boolean(linkedRecord);
};

export const getCurrentBarbershopIdByUserId = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      currentBarbershopId: true,
    },
  });

  return user?.currentBarbershopId ?? null;
};

export const countActiveWaitlistEntriesForUser = async ({
  userId,
  dateDay,
  barbershopId = TEST_IDS.barbershopPublic,
  barberId = TEST_IDS.barberPublicPrimary,
  serviceId = TEST_IDS.serviceCut,
}: {
  userId: string;
  dateDay: string;
  barbershopId?: string;
  barberId?: string;
  serviceId?: string;
}) => {
  const parsedDateDay = parseBookingDateOnly(dateDay);

  if (!parsedDateDay) {
    throw new Error(`Invalid booking date key '${dateDay}'.`);
  }

  return prisma.waitlistEntry.count({
    where: {
      userId,
      barbershopId,
      barberId,
      serviceId,
      dateDay: parsedDateDay,
      status: "ACTIVE",
    },
  });
};

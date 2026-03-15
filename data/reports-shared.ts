import type { Prisma, UserRole } from "@/generated/prisma/client";
import { PAID_BOOKING_PAYMENT_WHERE } from "@/lib/booking-payment";
import { getBookingStartDate } from "@/lib/booking-calculations";
import {
  getBookingCurrentMonth,
  getBookingCurrentYear,
  getBookingDayBounds,
  getBookingYearBounds,
  parseBookingDateOnly,
} from "@/lib/booking-time";
import { prisma } from "@/lib/prisma";
import { subDays } from "date-fns";

export type ReportDateRange = {
  start: Date;
  endExclusive: Date;
};

export type ReportMetrics = {
  totalBookings: number;
  revenue: number;
  avgTicket: number;
};

export type ReportPeriod = "week" | "month" | "year";

export type ReportBarbershopAccessResult =
  | {
      ok: true;
      barbershopId: string;
    }
  | {
      ok: false;
      status: 400 | 403 | 404;
      error: string;
    };

const toDateKey = (year: number, month: number, day: number) => {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
    day,
  ).padStart(2, "0")}`;
};

const createMonthRange = (year: number, month: number): ReportDateRange | null => {
  if (!Number.isInteger(year) || year < 1 || year > 9_998) {
    return null;
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const start = parseBookingDateOnly(toDateKey(year, month, 1));
  const endExclusive = parseBookingDateOnly(toDateKey(nextMonthYear, nextMonth, 1));

  if (!start || !endExclusive) {
    return null;
  }

  return {
    start,
    endExclusive,
  };
};

export const parseReportYear = (rawYear: string | undefined) => {
  if (!rawYear) {
    return getBookingCurrentYear();
  }

  const parsedYear = Number(rawYear);

  if (
    Number.isNaN(parsedYear) ||
    !Number.isInteger(parsedYear) ||
    parsedYear < 1 ||
    parsedYear > 9_998
  ) {
    return null;
  }

  return parsedYear;
};

export const parseReportMonth = (rawMonth: string | undefined) => {
  if (!rawMonth) {
    return null;
  }

  const parsedMonth = Number(rawMonth);

  if (
    Number.isNaN(parsedMonth) ||
    !Number.isInteger(parsedMonth) ||
    parsedMonth < 1 ||
    parsedMonth > 12
  ) {
    return null;
  }

  return parsedMonth;
};

export const getDefaultReportMonth = (year: number, now = new Date()) => {
  const currentYear = getBookingCurrentYear(now);

  if (year === currentYear) {
    return getBookingCurrentMonth(now);
  }

  return 1;
};

export const getWeeklyReportRanges = (now = new Date()) => {
  const currentDayBounds = getBookingDayBounds(now);
  const currentStart = getBookingDayBounds(subDays(now, 6)).start;
  const previousStart = getBookingDayBounds(subDays(now, 13)).start;

  return {
    current: {
      start: currentStart,
      endExclusive: currentDayBounds.endExclusive,
    },
    previous: {
      start: previousStart,
      endExclusive: currentStart,
    },
  };
};

export const getMonthlyReportRanges = (year: number, month: number) => {
  const current = createMonthRange(year, month);

  if (!current) {
    return null;
  }

  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  const previous = createMonthRange(previousYear, previousMonth);

  if (!previous) {
    return null;
  }

  return {
    current,
    previous,
  };
};

export const getYearlyReportRanges = (year: number) => {
  if (year <= 1) {
    return null;
  }

  return {
    current: getBookingYearBounds(year),
    previous: getBookingYearBounds(year - 1),
  };
};

export const getReportServiceDate = (booking: {
  startAt: Date | null;
  date: Date;
}) => {
  return getBookingStartDate(booking);
};

export const buildServiceDateRangeWhere = ({
  start,
  endExclusive,
}: ReportDateRange): Prisma.BookingWhereInput => {
  return {
    OR: [
      {
        startAt: {
          gte: start,
          lt: endExclusive,
        },
      },
      {
        startAt: null,
        date: {
          gte: start,
          lt: endExclusive,
        },
      },
    ],
  };
};

export const buildReportRevenueEligibilityWhere = (): Prisma.BookingWhereInput => {
  return {
    cancelledAt: null,
    AND: [PAID_BOOKING_PAYMENT_WHERE],
  };
};

export const buildReportBookingWhere = ({
  barbershopId,
  range,
}: {
  barbershopId: string;
  range: ReportDateRange;
}): Prisma.BookingWhereInput => {
  return {
    barbershopId,
    ...buildReportRevenueEligibilityWhere(),
    ...buildServiceDateRangeWhere(range),
  };
};

export const calculateAverageTicket = (revenue: number, totalBookings: number) => {
  if (totalBookings <= 0) {
    return 0;
  }

  return Math.round(revenue / totalBookings);
};

export const aggregateReportMetrics = async ({
  barbershopId,
  range,
}: {
  barbershopId: string;
  range: ReportDateRange;
}): Promise<ReportMetrics> => {
  const aggregate = await prisma.booking.aggregate({
    where: buildReportBookingWhere({
      barbershopId,
      range,
    }),
    _count: {
      _all: true,
    },
    _sum: {
      totalPriceInCents: true,
    },
  });

  const totalBookings = aggregate._count._all;
  const revenue = aggregate._sum.totalPriceInCents ?? 0;

  return {
    totalBookings,
    revenue,
    avgTicket: calculateAverageTicket(revenue, totalBookings),
  };
};

const getOwnerBarbershopWhere = (userId: string): Prisma.BarbershopWhereInput => {
  return {
    OR: [
      {
        ownerId: userId,
      },
      {
        users: {
          some: {
            id: userId,
          },
        },
      },
    ],
  };
};

export const resolveReportBarbershopIdForRole = async ({
  userId,
  role,
  requestedBarbershopId,
}: {
  userId: string;
  role: UserRole;
  requestedBarbershopId?: string;
}): Promise<ReportBarbershopAccessResult> => {
  if (role === "ADMIN") {
    if (!requestedBarbershopId) {
      return {
        ok: false,
        status: 400,
        error: "Selecione uma barbearia.",
      };
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: {
        id: requestedBarbershopId,
      },
      select: {
        id: true,
      },
    });

    if (!barbershop) {
      return {
        ok: false,
        status: 404,
        error: "Barbearia não encontrada.",
      };
    }

    return {
      ok: true,
      barbershopId: barbershop.id,
    };
  }

  if (role !== "OWNER") {
    return {
      ok: false,
      status: 403,
      error: "Acesso negado.",
    };
  }

  const ownerBarbershop = await prisma.barbershop.findFirst({
    where: getOwnerBarbershopWhere(userId),
    select: {
      id: true,
    },
  });

  if (!ownerBarbershop) {
    return {
      ok: false,
      status: 403,
      error: "Barbearia não encontrada ou sem permissão para visualizar.",
    };
  }

  return {
    ok: true,
    barbershopId: ownerBarbershop.id,
  };
};

export const resolveSummaryMonth = ({
  year,
  requestedMonth,
  now = new Date(),
}: {
  year: number;
  requestedMonth: number | null;
  now?: Date;
}) => {
  if (requestedMonth !== null) {
    return requestedMonth;
  }

  return getDefaultReportMonth(year, now);
};

export const toRangeResponse = (range: ReportDateRange) => {
  const inclusiveEnd = new Date(range.endExclusive.getTime() - 1);

  return {
    rangeStart: range.start.toISOString(),
    rangeEnd: inclusiveEnd.toISOString(),
  };
};

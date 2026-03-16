import { unstable_cache } from "next/cache";

import {
  getBookingCurrentMonth,
  getBookingCurrentYear,
  getBookingYearBounds,
} from "@/lib/booking-time";
import { BOOKING_TIMEZONE } from "@/lib/booking-time";
import { prisma } from "@/lib/prisma";
import { reportDashboardTag } from "@/lib/cache-tags";
import { CACHE_REVALIDATE_SECONDS } from "@/lib/cache-tags";
import {
  aggregateReportMetrics,
  calculateAverageTicket,
  toRangeResponse,
  type ReportDateRange,
} from "./reports-shared";

const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

export type MonthlySummaryItem = {
  month: number;
  label: (typeof MONTH_LABELS)[number];
  totalBookings: number;
  revenue: number;
  avgTicket: number;
};

interface GetBarbershopMonthlySummaryInput {
  barbershopId: string;
  year: number;
}

const createEmptyMonthlySummary = (): MonthlySummaryItem[] => {
  return MONTH_LABELS.map((label, index) => ({
    month: index + 1,
    label,
    totalBookings: 0,
    revenue: 0,
    avgTicket: 0,
  }));
};

type MonthlyAggregateRow = {
  month: number;
  total_bookings: bigint;
  revenue: bigint;
};

export const getBarbershopMonthlySummary = async ({
  barbershopId,
  year,
}: GetBarbershopMonthlySummaryInput): Promise<MonthlySummaryItem[]> => {
  const { start, endExclusive } = getBookingYearBounds(year);

  const rows = await prisma.$queryRaw<MonthlyAggregateRow[]>`
    SELECT
      EXTRACT(MONTH FROM (
        COALESCE("startAt", "date") AT TIME ZONE ${BOOKING_TIMEZONE}
      ))::int AS month,
      COUNT(*)::bigint AS total_bookings,
      COALESCE(SUM("totalPriceInCents"), 0)::bigint AS revenue
    FROM "Booking"
    WHERE "barbershopId" = ${barbershopId}
      AND "cancelledAt" IS NULL
      AND "paymentStatus" = 'PAID'
      AND COALESCE("startAt", "date") >= ${start}
      AND COALESCE("startAt", "date") < ${endExclusive}
    GROUP BY 1
    ORDER BY 1
  `;

  const monthlySummary = createEmptyMonthlySummary();

  for (const row of rows) {
    const month = Number(row.month);
    if (Number.isNaN(month) || month < 1 || month > 12) {
      continue;
    }

    const targetMonth = monthlySummary[month - 1];
    if (!targetMonth) {
      continue;
    }

    targetMonth.totalBookings = Number(row.total_bookings);
    targetMonth.revenue = Number(row.revenue);
  }

  const now = new Date();
  if (year === getBookingCurrentYear(now)) {
    const currentMonth = getBookingCurrentMonth(now);

    for (const monthSummary of monthlySummary) {
      if (monthSummary.month <= currentMonth) {
        continue;
      }

      monthSummary.totalBookings = 0;
      monthSummary.revenue = 0;
    }
  }

  for (const monthSummary of monthlySummary) {
    monthSummary.avgTicket = calculateAverageTicket(
      monthSummary.revenue,
      monthSummary.totalBookings,
    );
  }

  return monthlySummary;
};

const calculateDeltaPercent = (current: number, previous: number) => {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return Number((((current - previous) / previous) * 100).toFixed(1));
};

const buildReportSummary = async ({
  barbershopId,
  ranges,
}: {
  barbershopId: string;
  ranges: {
    current: ReportDateRange;
    previous: ReportDateRange;
  };
}) => {
  const [current, previous] = await Promise.all([
    aggregateReportMetrics({
      barbershopId,
      range: ranges.current,
    }),
    aggregateReportMetrics({
      barbershopId,
      range: ranges.previous,
    }),
  ]);

  return {
    current: {
      ...current,
      ...toRangeResponse(ranges.current),
    },
    previous: {
      ...previous,
      ...toRangeResponse(ranges.previous),
    },
    delta: {
      bookingsPercent: calculateDeltaPercent(
        current.totalBookings,
        previous.totalBookings,
      ),
      revenuePercent: calculateDeltaPercent(current.revenue, previous.revenue),
      ticketPercent: calculateDeltaPercent(current.avgTicket, previous.avgTicket),
    },
  };
};

export type ReportDashboardResult = {
  monthlySummary: {
    year: number;
    barbershopId: string;
    months: MonthlySummaryItem[];
    totals: {
      totalBookings: number;
      revenue: number;
      averageTicket: number;
    };
  };
  summaries: {
    week: Awaited<ReturnType<typeof buildReportSummary>>;
    month: Awaited<ReturnType<typeof buildReportSummary>>;
    year: Awaited<ReturnType<typeof buildReportSummary>>;
  };
};

export const buildReportDashboard = async ({
  barbershopId,
  year,
  summaryMonth,
}: {
  barbershopId: string;
  year: number;
  summaryMonth: number;
}): Promise<ReportDashboardResult> => {
  const {
    getMonthlyReportRanges,
    getWeeklyReportRanges,
    getYearlyReportRanges,
  } = await import("./reports-shared");

  const monthlyRanges = getMonthlyReportRanges(year, summaryMonth);
  const yearlyRanges = getYearlyReportRanges(year);

  if (!monthlyRanges || !yearlyRanges) {
    throw new Error("Período inválido para gerar o relatório.");
  }

  const weeklyRanges = getWeeklyReportRanges();

  const [months, weekSummary, monthSummary, yearSummary] = await Promise.all([
    getBarbershopMonthlySummary({
      barbershopId,
      year,
    }),
    buildReportSummary({
      barbershopId,
      ranges: weeklyRanges,
    }),
    buildReportSummary({
      barbershopId,
      ranges: monthlyRanges,
    }),
    buildReportSummary({
      barbershopId,
      ranges: yearlyRanges,
    }),
  ]);

  const totalBookings = months.reduce(
    (sum, month) => sum + month.totalBookings,
    0,
  );
  const revenue = months.reduce((sum, month) => sum + month.revenue, 0);
  const averageTicket = calculateAverageTicket(revenue, totalBookings);

  return {
    monthlySummary: {
      year,
      barbershopId,
      months,
      totals: {
        totalBookings,
        revenue,
        averageTicket,
      },
    },
    summaries: {
      week: weekSummary,
      month: monthSummary,
      year: yearSummary,
    },
  };
};

export const getReportDashboardCached = ({
  barbershopId,
  year,
  summaryMonth,
}: {
  barbershopId: string;
  year: number;
  summaryMonth: number;
}) => {
  return unstable_cache(
    () => buildReportDashboard({ barbershopId, year, summaryMonth }),
    ["report-dashboard", barbershopId, String(year), String(summaryMonth)],
    {
      revalidate: CACHE_REVALIDATE_SECONDS,
      tags: [reportDashboardTag(barbershopId, year, summaryMonth)],
    },
  )();
};

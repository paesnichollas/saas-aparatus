import { queryKeys } from "@/constants/query-keys";
import { useQuery } from "@tanstack/react-query";

export type MonthlySummaryMonth = {
  month: number;
  label: string;
  totalBookings: number;
  revenue: number;
  avgTicket?: number;
};

export type MonthlySummaryTotals = {
  totalBookings: number;
  revenue: number;
  averageTicket: number;
};

export type MonthlySummaryData = {
  year: number;
  barbershopId: string;
  months: MonthlySummaryMonth[];
  totals: MonthlySummaryTotals;
};

export type ReportSummaryMetric = {
  totalBookings: number;
  revenue: number;
  avgTicket: number;
  rangeStart: string;
  rangeEnd: string;
};

export type ReportSummaryData = {
  current: ReportSummaryMetric;
  previous: ReportSummaryMetric;
  delta: {
    bookingsPercent: number | null;
    revenuePercent: number | null;
    ticketPercent: number | null;
  };
};

export type ReportDashboardData = {
  monthlySummary: MonthlySummaryData;
  summaries: {
    week: ReportSummaryData;
    month: ReportSummaryData;
    year: ReportSummaryData;
  };
};

const hasMonthlySummaryShape = (value: unknown): value is MonthlySummaryData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const parsedValue = value as Partial<MonthlySummaryData>;

  return (
    typeof parsedValue.year === "number" &&
    typeof parsedValue.barbershopId === "string" &&
    Array.isArray(parsedValue.months) &&
    parsedValue.months.length === 12 &&
    parsedValue.months.every(
      (month) =>
        typeof month.month === "number" &&
        typeof month.label === "string" &&
        typeof month.totalBookings === "number" &&
        typeof month.revenue === "number" &&
        (typeof month.avgTicket === "number" || typeof month.avgTicket === "undefined"),
    ) &&
    typeof parsedValue.totals?.totalBookings === "number" &&
    typeof parsedValue.totals?.revenue === "number" &&
    typeof parsedValue.totals?.averageTicket === "number"
  );
};

const hasSummaryShape = (value: unknown): value is ReportSummaryData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const parsedValue = value as Partial<ReportSummaryData>;

  return (
    typeof parsedValue.current?.totalBookings === "number" &&
    typeof parsedValue.current?.revenue === "number" &&
    typeof parsedValue.current?.avgTicket === "number" &&
    typeof parsedValue.current?.rangeStart === "string" &&
    typeof parsedValue.current?.rangeEnd === "string" &&
    typeof parsedValue.previous?.totalBookings === "number" &&
    typeof parsedValue.previous?.revenue === "number" &&
    typeof parsedValue.previous?.avgTicket === "number" &&
    typeof parsedValue.previous?.rangeStart === "string" &&
    typeof parsedValue.previous?.rangeEnd === "string" &&
    (typeof parsedValue.delta?.bookingsPercent === "number" ||
      parsedValue.delta?.bookingsPercent === null) &&
    (typeof parsedValue.delta?.revenuePercent === "number" ||
      parsedValue.delta?.revenuePercent === null) &&
    (typeof parsedValue.delta?.ticketPercent === "number" ||
      parsedValue.delta?.ticketPercent === null)
  );
};

const hasDashboardShape = (value: unknown): value is ReportDashboardData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const parsedValue = value as Partial<ReportDashboardData>;

  return (
    hasMonthlySummaryShape(parsedValue.monthlySummary) &&
    hasSummaryShape(parsedValue.summaries?.week) &&
    hasSummaryShape(parsedValue.summaries?.month) &&
    hasSummaryShape(parsedValue.summaries?.year)
  );
};

const getApiErrorMessage = (value: unknown) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const error = (value as { error?: unknown }).error;
  if (typeof error !== "string") {
    return null;
  }

  return error;
};

export const useGetOwnerReportDashboard = ({
  barbershopId,
  year,
  month,
  enabled = true,
}: {
  barbershopId: string | null;
  year: number;
  month: number;
  enabled?: boolean;
}) => {
  const effectiveBarbershopId = barbershopId ?? "";
  return useQuery({
    queryKey: queryKeys.ownerReportDashboard(effectiveBarbershopId, year, month),
    queryFn: async (): Promise<ReportDashboardData> => {
      const queryParams = new URLSearchParams({
        year: String(year),
        month: String(month),
      });

      if (effectiveBarbershopId) {
        queryParams.set("barbershopId", effectiveBarbershopId);
      }

      const response = await fetch(
        `/api/reports/dashboard?${queryParams.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      let responseData: unknown = null;
      try {
        const text = await response.text();
        responseData = text ? (JSON.parse(text) as unknown) : null;
      } catch {
        responseData = null;
      }

      if (!response.ok) {
        const errorMessage =
          getApiErrorMessage(responseData) ??
          "Não foi possível carregar o relatório.";
        throw new Error(errorMessage);
      }

      if (!hasDashboardShape(responseData)) {
        throw new Error("Relatório inválido.");
      }

      return responseData;
    },
    enabled,
    retry: false,
    staleTime: 60 * 1000,
  });
};

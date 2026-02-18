"use client";

import { getOwnerReport } from "@/actions/get-owner-report";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";

type ReportRange = "WEEK" | "MONTH";
type KpiPeriod = ReportRange | "YEAR";

type OwnerReportData = {
  barbershopId: string;
  range: ReportRange;
  from: string;
  to: string;
  totalOrders: number;
  revenueInCents: number;
  averageTicketInCents: number;
};

type ReportWindow = {
  from: Date;
  to: Date;
};

type ReportMetrics = {
  from: string;
  to: string;
  totalBookings: number;
  revenue: number;
  avgTicket: number;
};

type ReportSummaryData = {
  current: ReportMetrics;
  previous: ReportMetrics;
  delta: {
    bookingsAbsolute: number;
    bookingsPercent: number;
    revenueAbsolute: number;
    revenuePercent: number;
    ticketAbsolute: number;
    ticketPercent: number;
  };
};

type ChartPoint = {
  month: number;
  label: string;
  totalBookings: number;
  revenue: number;
  avgTicket: number;
  isFutureMonth: boolean;
  revenuePast: number | null;
  revenueFuture: number | null;
};

type BarbershopOption = {
  id: string;
  name: string;
};

type OwnerReportsCardProps = {
  initialRange: ReportRange;
  isAdmin: boolean;
  initialBarbershopId: string | null;
  barbershopOptions: BarbershopOption[];
};

type DeltaLabelProps = {
  label: string;
  percent: number;
  absolute: number;
  formatAbsolute: (value: number) => string;
};

type KpiCardProps = {
  title: string;
  summary: ReportSummaryData | null;
  isPending: boolean;
  comparisonLabel: string;
};

const ReportsAnnualChart = dynamic<{ chartData: ChartPoint[] }>(
  () => import("@/components/owner/reports-annual-chart"),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-[18rem] animate-pulse rounded-md" />,
  },
);

const rangeOptions: Array<{ label: string; value: ReportRange }> = [
  {
    label: "Semanal (ultimos 7 dias)",
    value: "WEEK",
  },
  {
    label: "Mensal (ultimos 30 dias)",
    value: "MONTH",
  },
];

const kpiComparisonLabels: Record<KpiPeriod, string> = {
  WEEK: "Comparado aos 7 dias anteriores",
  MONTH: "Comparado aos 30 dias anteriores",
  YEAR: "Comparado ao mesmo periodo do ano anterior",
};

const monthLabels = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

const buildYearOptions = (currentYear: number) => [currentYear, currentYear - 1];

const warnInDevelopment = (message: string, details?: unknown) => {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[owner-reports-card]", message, details);
  }
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const calculateAverageTicket = (revenue: number, totalBookings: number) => {
  if (totalBookings <= 0) {
    return 0;
  }

  return Math.round(revenue / totalBookings);
};

const calculatePercentDelta = (currentValue: number, previousValue: number) => {
  if (previousValue === 0) {
    return currentValue === 0 ? 0 : 100;
  }

  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
};

const startOfDay = (date: Date) => {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
};

const subtractDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() - days);
  return nextDate;
};

const shiftWindowByDays = (window: ReportWindow, days: number): ReportWindow => ({
  from: subtractDays(window.from, days),
  to: subtractDays(window.to, days),
});

const shiftWindowByYears = (window: ReportWindow, years: number): ReportWindow => {
  const nextFrom = new Date(window.from);
  const nextTo = new Date(window.to);
  nextFrom.setFullYear(nextFrom.getFullYear() - years);
  nextTo.setFullYear(nextTo.getFullYear() - years);

  return {
    from: nextFrom,
    to: nextTo,
  };
};

const buildRollingWindow = (now: Date, days: number): ReportWindow => ({
  from: startOfDay(subtractDays(now, days - 1)),
  to: now,
});

const buildYearToDateWindow = (now: Date): ReportWindow => ({
  from: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
  to: now,
});

const hasOwnerReportDataShape = (value: unknown): value is OwnerReportData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const recordValue = value as Record<string, unknown>;

  return (
    typeof recordValue.barbershopId === "string" &&
    (recordValue.range === "WEEK" || recordValue.range === "MONTH") &&
    typeof recordValue.from === "string" &&
    typeof recordValue.to === "string" &&
    isFiniteNumber(recordValue.totalOrders) &&
    isFiniteNumber(recordValue.revenueInCents) &&
    isFiniteNumber(recordValue.averageTicketInCents)
  );
};

const normalizeReportMetrics = (
  report: OwnerReportData | null,
  fallbackWindow: ReportWindow,
): ReportMetrics => {
  if (!report) {
    return {
      from: fallbackWindow.from.toISOString(),
      to: fallbackWindow.to.toISOString(),
      totalBookings: 0,
      revenue: 0,
      avgTicket: 0,
    };
  }

  const totalBookings = isFiniteNumber(report.totalOrders) ? report.totalOrders : 0;
  const revenue = isFiniteNumber(report.revenueInCents) ? report.revenueInCents : 0;
  const avgTicket = isFiniteNumber(report.averageTicketInCents)
    ? report.averageTicketInCents
    : calculateAverageTicket(revenue, totalBookings);

  return {
    from: report.from || fallbackWindow.from.toISOString(),
    to: report.to || fallbackWindow.to.toISOString(),
    totalBookings,
    revenue,
    avgTicket,
  };
};

const buildSummary = ({
  currentReport,
  previousReport,
  currentWindow,
  previousWindow,
}: {
  currentReport: OwnerReportData | null;
  previousReport: OwnerReportData | null;
  currentWindow: ReportWindow;
  previousWindow: ReportWindow;
}): ReportSummaryData => {
  const current = normalizeReportMetrics(currentReport, currentWindow);
  const previous = normalizeReportMetrics(previousReport, previousWindow);

  const bookingsAbsolute = current.totalBookings - previous.totalBookings;
  const revenueAbsolute = current.revenue - previous.revenue;
  const ticketAbsolute = current.avgTicket - previous.avgTicket;

  return {
    current,
    previous,
    delta: {
      bookingsAbsolute,
      bookingsPercent: calculatePercentDelta(current.totalBookings, previous.totalBookings),
      revenueAbsolute,
      revenuePercent: calculatePercentDelta(current.revenue, previous.revenue),
      ticketAbsolute,
      ticketPercent: calculatePercentDelta(current.avgTicket, previous.avgTicket),
    },
  };
};

const getValidationErrorMessage = (validationErrors: unknown) => {
  const getFirstErrorFromNode = (value: unknown): string | null => {
    if (!value || typeof value !== "object") {
      return null;
    }

    const errors = (value as { _errors?: unknown })._errors;

    if (Array.isArray(errors)) {
      const firstError = errors.find(
        (errorItem): errorItem is string =>
          typeof errorItem === "string" && errorItem.trim().length > 0,
      );

      if (firstError) {
        return firstError;
      }
    }

    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      const nestedError = getFirstErrorFromNode(nestedValue);

      if (nestedError) {
        return nestedError;
      }
    }

    return null;
  };

  return getFirstErrorFromNode(validationErrors);
};

const formatDateLabel = (isoDate: string) => {
  const parsedDate = new Date(isoDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return parsedDate.toLocaleDateString("pt-BR");
};

const formatSignedPercent = (value: number) => {
  const normalizedValue = Number.isFinite(value) ? value : 0;
  const roundedValue = Number(normalizedValue.toFixed(1));
  const prefix = roundedValue > 0 ? "+" : "";
  return `${prefix}${roundedValue.toFixed(1)}%`;
};

const formatSignedInteger = (value: number) => {
  const normalizedValue = Number.isFinite(value) ? Math.round(value) : 0;
  const prefix = normalizedValue > 0 ? "+" : "";
  return `${prefix}${normalizedValue.toLocaleString("pt-BR")}`;
};

const formatSignedCurrency = (value: number) => {
  const normalizedValue = Number.isFinite(value) ? Math.round(value) : 0;

  if (normalizedValue === 0) {
    return formatCurrency(0);
  }

  const prefix = normalizedValue > 0 ? "+" : "-";
  return `${prefix}${formatCurrency(Math.abs(normalizedValue))}`;
};

const createChartFallbackData = (year: number): ChartPoint[] => {
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();

  return monthLabels.map((label, index) => {
    const isFutureMonth = isCurrentYear && index > now.getMonth();

    return {
      month: index + 1,
      label,
      totalBookings: 0,
      revenue: 0,
      avgTicket: 0,
      isFutureMonth,
      revenuePast: isFutureMonth ? null : 0,
      revenueFuture: isFutureMonth ? 0 : null,
    };
  });
};

const DeltaLabel = ({ label, percent, absolute, formatAbsolute }: DeltaLabelProps) => {
  const normalizedPercent = Number.isFinite(percent) ? percent : 0;

  const Icon = normalizedPercent > 0 ? ArrowUpRight : normalizedPercent < 0 ? ArrowDownRight : ArrowRight;
  const toneClassName =
    normalizedPercent > 0
      ? "text-primary"
      : normalizedPercent < 0
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className={`flex items-center justify-between text-xs ${toneClassName}`}>
      <span>{label}</span>
      <span className="inline-flex items-center gap-1 font-medium">
        <Icon className="size-3" />
        {formatSignedPercent(normalizedPercent)} ({formatAbsolute(absolute)})
      </span>
    </div>
  );
};

const KpiCard = ({ title, summary, isPending, comparisonLabel }: KpiCardProps) => {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending && !summary ? (
          <div className="space-y-2">
            <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
            <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
            <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Reservas</p>
              <p className="text-xl font-semibold">
                {(summary?.current.totalBookings ?? 0).toLocaleString("pt-BR")}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Faturamento</p>
              <p className="text-xl font-semibold">
                {formatCurrency(summary?.current.revenue ?? 0)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Ticket medio</p>
              <p className="text-xl font-semibold">
                {formatCurrency(summary?.current.avgTicket ?? 0)}
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-muted-foreground text-xs">{comparisonLabel}</p>
              <DeltaLabel
                label="Reservas"
                percent={summary?.delta.bookingsPercent ?? 0}
                absolute={summary?.delta.bookingsAbsolute ?? 0}
                formatAbsolute={formatSignedInteger}
              />
              <DeltaLabel
                label="Faturamento"
                percent={summary?.delta.revenuePercent ?? 0}
                absolute={summary?.delta.revenueAbsolute ?? 0}
                formatAbsolute={formatSignedCurrency}
              />
              <DeltaLabel
                label="Ticket"
                percent={summary?.delta.ticketPercent ?? 0}
                absolute={summary?.delta.ticketAbsolute ?? 0}
                formatAbsolute={formatSignedCurrency}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const MetricCard = ({
  title,
  value,
}: {
  title: string;
  value: string;
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
};

const OwnerReportsCard = ({
  initialRange,
  isAdmin,
  initialBarbershopId,
  barbershopOptions,
}: OwnerReportsCardProps) => {
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => buildYearOptions(currentYear), [currentYear]);

  const [range, setRange] = useState<ReportRange>(initialRange);
  const [selectedYear, setSelectedYear] = useState<number>(yearOptions[0] ?? currentYear);
  const [selectedBarbershopId, setSelectedBarbershopId] = useState(
    initialBarbershopId ?? "",
  );
  const [summaryByPeriod, setSummaryByPeriod] = useState<
    Record<KpiPeriod, ReportSummaryData | null>
  >({
    WEEK: null,
    MONTH: null,
    YEAR: null,
  });
  const [chartData, setChartData] = useState<ChartPoint[]>(() =>
    createChartFallbackData(yearOptions[0] ?? currentYear),
  );
  const [isSummaryPending, setIsSummaryPending] = useState(false);
  const [isMonthlySummaryPending, setIsMonthlySummaryPending] = useState(false);
  const [summaryErrorMessage, setSummaryErrorMessage] = useState<string | null>(null);
  const [chartErrorMessage, setChartErrorMessage] = useState<string | null>(null);

  const { executeAsync } = useAction(getOwnerReport);

  const canLoadReport = !isAdmin || selectedBarbershopId.length > 0;
  const errorMessage = summaryErrorMessage ?? chartErrorMessage;

  const fetchReportWindow = useCallback(
    async ({
      range: reportRange,
      window,
      onIssue,
    }: {
      range: ReportRange;
      window: ReportWindow;
      onIssue: (message: string, details?: unknown) => void;
    }): Promise<OwnerReportData | null> => {
      try {
        const result = await executeAsync({
          range: reportRange,
          barbershopId: selectedBarbershopId || undefined,
          from: window.from,
          to: window.to,
        });

        const validationErrorMessage = getValidationErrorMessage(result.validationErrors);

        if (validationErrorMessage) {
          onIssue(validationErrorMessage, result.validationErrors);
          return null;
        }

        if (result.serverError || !result.data) {
          onIssue("Falha ao carregar dados de relatorio.", result.serverError);
          return null;
        }

        if (!hasOwnerReportDataShape(result.data)) {
          onIssue("O formato de dados de relatorio retornou inesperado.", result.data);
          return null;
        }

        return result.data;
      } catch (error) {
        onIssue("Falha ao carregar dados de relatorio.", error);
        return null;
      }
    },
    [executeAsync, selectedBarbershopId],
  );

  const selectedBarbershopName = useMemo(() => {
    if (!isAdmin) {
      return null;
    }

    const selectedBarbershop = barbershopOptions.find(
      (barbershop) => barbershop.id === selectedBarbershopId,
    );

    return selectedBarbershop?.name ?? null;
  }, [barbershopOptions, isAdmin, selectedBarbershopId]);

  useEffect(() => {
    if (!canLoadReport) {
      setSummaryByPeriod({
        WEEK: null,
        MONTH: null,
        YEAR: null,
      });
      setIsSummaryPending(false);
      setSummaryErrorMessage(null);
      return;
    }

    let isCancelled = false;

    const loadKpiSummaries = async () => {
      setIsSummaryPending(true);

      try {
        const warnings = new Set<string>();
        const now = new Date();

        const onIssue = (message: string, details?: unknown) => {
          warnings.add(message);
          warnInDevelopment(message, details);
        };

        const weekCurrentWindow = buildRollingWindow(now, 7);
        const weekPreviousWindow = shiftWindowByDays(weekCurrentWindow, 7);

        const monthCurrentWindow = buildRollingWindow(now, 30);
        const monthPreviousWindow = shiftWindowByDays(monthCurrentWindow, 30);

        const yearCurrentWindow = buildYearToDateWindow(now);
        const yearPreviousWindow = shiftWindowByYears(yearCurrentWindow, 1);

        const [
          weekCurrentReport,
          weekPreviousReport,
          monthCurrentReport,
          monthPreviousReport,
          yearCurrentReport,
          yearPreviousReport,
        ] = await Promise.all([
          fetchReportWindow({
            range: "WEEK",
            window: weekCurrentWindow,
            onIssue,
          }),
          fetchReportWindow({
            range: "WEEK",
            window: weekPreviousWindow,
            onIssue,
          }),
          fetchReportWindow({
            range: "MONTH",
            window: monthCurrentWindow,
            onIssue,
          }),
          fetchReportWindow({
            range: "MONTH",
            window: monthPreviousWindow,
            onIssue,
          }),
          fetchReportWindow({
            range: "MONTH",
            window: yearCurrentWindow,
            onIssue,
          }),
          fetchReportWindow({
            range: "MONTH",
            window: yearPreviousWindow,
            onIssue,
          }),
        ]);

        if (isCancelled) {
          return;
        }

        setSummaryByPeriod({
          WEEK: buildSummary({
            currentReport: weekCurrentReport,
            previousReport: weekPreviousReport,
            currentWindow: weekCurrentWindow,
            previousWindow: weekPreviousWindow,
          }),
          MONTH: buildSummary({
            currentReport: monthCurrentReport,
            previousReport: monthPreviousReport,
            currentWindow: monthCurrentWindow,
            previousWindow: monthPreviousWindow,
          }),
          YEAR: buildSummary({
            currentReport: yearCurrentReport,
            previousReport: yearPreviousReport,
            currentWindow: yearCurrentWindow,
            previousWindow: yearPreviousWindow,
          }),
        });
        setSummaryErrorMessage(
          warnings.size > 0
            ? "Alguns indicadores podem estar incompletos no momento."
            : null,
        );
      } catch (error) {
        if (isCancelled) {
          return;
        }

        warnInDevelopment("Falha ao atualizar KPIs de relatorio.", error);
        setSummaryByPeriod({
          WEEK: null,
          MONTH: null,
          YEAR: null,
        });
        setSummaryErrorMessage("Nao foi possivel carregar os indicadores agora.");
      } finally {
        if (!isCancelled) {
          setIsSummaryPending(false);
        }
      }
    };

    void loadKpiSummaries();

    return () => {
      isCancelled = true;
    };
  }, [canLoadReport, fetchReportWindow]);

  useEffect(() => {
    if (!canLoadReport) {
      setChartData(createChartFallbackData(selectedYear));
      setIsMonthlySummaryPending(false);
      setChartErrorMessage(null);
      return;
    }

    let isCancelled = false;

    const loadMonthlySummary = async () => {
      setIsMonthlySummaryPending(true);

      try {
        const warnings = new Set<string>();
        const now = new Date();
        const isCurrentChartYear = selectedYear === now.getFullYear();

        const onIssue = (message: string, details?: unknown) => {
          warnings.add(message);
          warnInDevelopment(message, details);
        };

        const monthlyChartData = await Promise.all(
          monthLabels.map(async (label, index) => {
            const month = index + 1;
            const isFutureMonth = isCurrentChartYear && index > now.getMonth();

            if (isFutureMonth) {
              return {
                month,
                label,
                totalBookings: 0,
                revenue: 0,
                avgTicket: 0,
                isFutureMonth,
                revenuePast: null,
                revenueFuture: 0,
              } satisfies ChartPoint;
            }

            const from = new Date(selectedYear, index, 1, 0, 0, 0, 0);
            const to =
              isCurrentChartYear && index === now.getMonth()
                ? now
                : new Date(selectedYear, index + 1, 0, 23, 59, 59, 999);

            const monthReport = await fetchReportWindow({
              range: "MONTH",
              window: {
                from,
                to,
              },
              onIssue,
            });

            const totalBookings = monthReport?.totalOrders ?? 0;
            const revenue = monthReport?.revenueInCents ?? 0;
            const avgTicket =
              monthReport?.averageTicketInCents ??
              calculateAverageTicket(revenue, totalBookings);

            return {
              month,
              label,
              totalBookings,
              revenue,
              avgTicket,
              isFutureMonth,
              revenuePast: revenue,
              revenueFuture: null,
            } satisfies ChartPoint;
          }),
        );

        if (isCancelled) {
          return;
        }

        setChartData(monthlyChartData);
        setChartErrorMessage(
          warnings.size > 0
            ? "Alguns dados do grafico anual podem estar incompletos."
            : null,
        );
      } catch (error) {
        if (isCancelled) {
          return;
        }

        warnInDevelopment("Falha ao atualizar grafico anual.", error);
        setChartData(createChartFallbackData(selectedYear));
        setChartErrorMessage("Nao foi possivel carregar o grafico anual agora.");
      } finally {
        if (!isCancelled) {
          setIsMonthlySummaryPending(false);
        }
      }
    };

    void loadMonthlySummary();

    return () => {
      isCancelled = true;
    };
  }, [canLoadReport, fetchReportWindow, selectedYear]);

  const selectedSummary = useMemo(() => {
    if (range === "WEEK") {
      return summaryByPeriod.WEEK;
    }

    return summaryByPeriod.MONTH;
  }, [range, summaryByPeriod.MONTH, summaryByPeriod.WEEK]);

  const metricValues = useMemo(() => {
    return {
      totalOrders: (selectedSummary?.current.totalBookings ?? 0).toLocaleString("pt-BR"),
      revenue: formatCurrency(selectedSummary?.current.revenue ?? 0),
      averageTicket: formatCurrency(selectedSummary?.current.avgTicket ?? 0),
    };
  }, [selectedSummary]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Relatorio</CardTitle>
        <CardDescription>
          Analise pedidos e faturamento por periodo para acompanhar o desempenho da
          barbearia.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label htmlFor="owner-report-range" className="text-sm font-medium">
              Periodo
            </label>
            <select
              id="owner-report-range"
              value={range}
              onChange={(event) => setRange(event.target.value as ReportRange)}
              disabled={isSummaryPending}
              className="bg-background border-input h-9 w-full rounded-md border px-3 text-sm"
            >
              {rangeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="owner-report-year" className="text-sm font-medium">
              Ano do grafico
            </label>
            <select
              id="owner-report-year"
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              disabled={isMonthlySummaryPending}
              className="bg-background border-input h-9 w-full rounded-md border px-3 text-sm"
            >
              {yearOptions.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </div>

          {isAdmin ? (
            <div className="space-y-2">
              <label
                htmlFor="owner-report-barbershop"
                className="text-sm font-medium"
              >
                Barbearia
              </label>
              <select
                id="owner-report-barbershop"
                value={selectedBarbershopId}
                onChange={(event) => setSelectedBarbershopId(event.target.value)}
                disabled={isSummaryPending || isMonthlySummaryPending}
                className="bg-background border-input h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="">Selecione uma barbearia</option>
                {barbershopOptions.map((barbershop) => (
                  <option key={barbershop.id} value={barbershop.id}>
                    {barbershop.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {!canLoadReport ? (
          <p className="text-muted-foreground text-sm">
            Selecione uma barbearia para visualizar o relatorio.
          </p>
        ) : null}

        {errorMessage ? (
          <Card className="border-destructive/30">
            <CardContent>
              <p className="text-sm font-medium">{errorMessage}</p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <KpiCard
            title="Semanal"
            summary={summaryByPeriod.WEEK}
            isPending={isSummaryPending}
            comparisonLabel={kpiComparisonLabels.WEEK}
          />
          <KpiCard
            title="Mensal"
            summary={summaryByPeriod.MONTH}
            isPending={isSummaryPending}
            comparisonLabel={kpiComparisonLabels.MONTH}
          />
          <KpiCard
            title="Anual"
            summary={summaryByPeriod.YEAR}
            isPending={isSummaryPending}
            comparisonLabel={kpiComparisonLabels.YEAR}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolucao anual ({selectedYear})</CardTitle>
            <CardDescription>
              Faturamento de janeiro a dezembro com detalhamento por mes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isMonthlySummaryPending ? (
              <div className="bg-muted h-[18rem] animate-pulse rounded-md" />
            ) : (
              <ReportsAnnualChart chartData={chartData} />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard title="Pedidos" value={metricValues.totalOrders} />
          <MetricCard title="Faturamento" value={metricValues.revenue} />
          <MetricCard title="Ticket medio" value={metricValues.averageTicket} />
        </div>

        {isSummaryPending ? (
          <p className="text-muted-foreground text-sm">Atualizando relatorio...</p>
        ) : null}

        {selectedSummary ? (
          <p className="text-muted-foreground text-sm">
            Periodo analisado ({range === "WEEK" ? "semanal" : "mensal"}):{" "}
            {formatDateLabel(selectedSummary.current.from)} ate{" "}
            {formatDateLabel(selectedSummary.current.to)}
            {selectedBarbershopName ? ` - ${selectedBarbershopName}` : ""}
          </p>
        ) : null}

        {selectedSummary &&
        !isSummaryPending &&
        selectedSummary.current.totalBookings === 0 ? (
          <Card>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Nenhum pedido confirmado encontrado no periodo selecionado.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default OwnerReportsCard;

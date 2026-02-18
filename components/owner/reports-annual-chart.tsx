"use client";

import { memo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

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

interface ReportsAnnualChartProps {
  chartData: ChartPoint[];
}

const compactCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const AnnualChartTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: ChartPoint;
  }>;
}) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const chartPoint = payload[0]?.payload;

  if (!chartPoint) {
    return null;
  }

  return (
    <Card className="border-border min-w-[11rem] border shadow-sm">
      <CardContent className="space-y-1 py-3">
        <p className="text-sm font-semibold">{chartPoint.label}</p>
        <p className="text-muted-foreground text-xs">
          Reservas: {chartPoint.totalBookings.toLocaleString("pt-BR")}
        </p>
        <p className="text-muted-foreground text-xs">
          Faturamento: {formatCurrency(chartPoint.revenue)}
        </p>
        <p className="text-muted-foreground text-xs">
          Ticket medio: {formatCurrency(chartPoint.avgTicket)}
        </p>
      </CardContent>
    </Card>
  );
};

const ReportsAnnualChart = memo(({ chartData }: ReportsAnnualChartProps) => {
  return (
    <div className="h-[20rem] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" />
          <YAxis
            tickFormatter={(value: number) =>
              compactCurrencyFormatter.format((value ?? 0) / 100)
            }
          />
          <Tooltip
            cursor={{
              stroke: "var(--color-border)",
              strokeWidth: 1,
            }}
            content={({ active, payload }) => (
              <AnnualChartTooltip
                active={active}
                payload={
                  payload as Array<{
                    payload: ChartPoint;
                  }>
                }
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="revenuePast"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            dot={{
              r: 3,
              fill: "var(--color-chart-1)",
            }}
            activeDot={{
              r: 5,
            }}
          />
          <Line
            type="monotone"
            dataKey="revenueFuture"
            stroke="var(--color-muted-foreground)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={{
              r: 3,
              fill: "var(--color-muted-foreground)",
            }}
            activeDot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

ReportsAnnualChart.displayName = "ReportsAnnualChart";

export default ReportsAnnualChart;

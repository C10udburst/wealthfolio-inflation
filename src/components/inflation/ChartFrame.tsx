import type { ReactNode } from 'react';
import {
  CartesianGrid,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  ComposedChart,
  XAxis,
  YAxis,
} from '@wealthfolio/ui/chart';
import { inflationChartConfig } from './chartConfig';
import { formatPeriodLabel } from './formatters';

type ChartFrameProps<T> = {
  data: T[];
  yAxisId: string;
  yAxisWidth: number;
  yAxisFormatter: (value: number) => string;
  tooltipFormatter: (value: number, name: string) => [string, string];
  children: ReactNode;
};

export default function ChartFrame<T>({
  data,
  yAxisId,
  yAxisWidth,
  yAxisFormatter,
  tooltipFormatter,
  children,
}: ChartFrameProps<T>) {
  return (
    <ChartContainer config={inflationChartConfig} className="h-[360px]">
      <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="period" tickFormatter={formatPeriodLabel} minTickGap={24} />
        <YAxis
          yAxisId={yAxisId}
          tickFormatter={(value) => yAxisFormatter(Number(value))}
          width={yAxisWidth}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) =>
                tooltipFormatter(Number(value), String(name))
              }
              labelFormatter={(label) => `Period: ${formatPeriodLabel(String(label))}`}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {children}
      </ComposedChart>
    </ChartContainer>
  );
}

import { Area } from '@wealthfolio/ui/chart';
import ChartFrame from './ChartFrame';
import type { ComparisonPoint } from './types';

type ComparisonChartProps = {
  data: ComparisonPoint[];
  currencyFormatter: Intl.NumberFormat;
};

export default function ComparisonChart({
  data,
  currencyFormatter,
}: ComparisonChartProps) {
  return (
    <ChartFrame
      data={data}
      yAxisId="value"
      yAxisWidth={80}
      yAxisFormatter={(value) => currencyFormatter.format(value)}
      tooltipFormatter={(value, name) => [
        currencyFormatter.format(value),
        name === 'real' ? 'Inflation-adjusted value' : 'Nominal value',
      ]}
    >
      <Area
        yAxisId="value"
        dataKey="nominal"
        stroke="var(--color-nominal)"
        fill="var(--color-nominal)"
        fillOpacity={0.15}
      />
      <Area
        yAxisId="value"
        dataKey="real"
        stroke="var(--color-real)"
        fill="var(--color-real)"
        fillOpacity={0.2}
      />
    </ChartFrame>
  );
}

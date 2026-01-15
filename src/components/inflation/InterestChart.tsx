import { Area } from '@wealthfolio/ui/chart';
import ChartFrame from './ChartFrame';
import type { InterestPoint } from './types';

type InterestChartProps = {
  data: InterestPoint[];
  percentFormatter: Intl.NumberFormat;
};

export default function InterestChart({
  data,
  percentFormatter,
}: InterestChartProps) {
  return (
    <ChartFrame
      data={data}
      yAxisId="loss"
      yAxisWidth={72}
      yAxisFormatter={(value) => percentFormatter.format(value / 100)}
      tooltipFormatter={(value, name) => [
        percentFormatter.format(value / 100),
        name === 'interest' ? 'Interest on money' : 'Inflation change',
      ]}
    >
      <Area
        yAxisId="loss"
        dataKey="interest"
        stroke="var(--color-interest)"
        fill="var(--color-interest)"
        fillOpacity={0.15}
      />
      <Area
        yAxisId="loss"
        dataKey="inflation"
        stroke="var(--color-inflation)"
        fill="var(--color-inflation)"
        fillOpacity={0.15}
      />
    </ChartFrame>
  );
}

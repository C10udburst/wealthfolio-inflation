import { Line } from '@wealthfolio/ui/chart';
import ChartFrame from './ChartFrame';
import type { LossPoint } from './types';

type ExcessChartProps = {
  data: LossPoint[];
  percentFormatter: Intl.NumberFormat;
};

export default function ExcessChart({ data, percentFormatter }: ExcessChartProps) {
  return (
    <ChartFrame
      data={data}
      yAxisId="loss"
      yAxisWidth={72}
      yAxisFormatter={(value) => percentFormatter.format(value / 100)}
      tooltipFormatter={(value) => [
        percentFormatter.format(value / 100),
        'Excess return',
      ]}
    >
      <Line
        yAxisId="loss"
        dataKey="outperformance"
        stroke="var(--color-outperformance)"
        strokeWidth={2}
        dot={false}
      />
    </ChartFrame>
  );
}

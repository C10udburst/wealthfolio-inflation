import type { ComparisonPoint, InterestPoint, LossPoint } from './types';

const buildPercentPoint = (
  point: ComparisonPoint,
  baseNominal: number,
  baseInflation: number,
) => {
  const capital = point.netContribution || baseNominal || 1;
  const profitPercent =
    capital !== 0 ? ((point.nominal - point.netContribution) / capital) * 100 : 0;
  const inflationPercent = baseInflation
    ? ((point.inflationIndex - baseInflation) / baseInflation) * 100
    : 0;

  return { profitPercent, inflationPercent };
};

export const buildLossSeries = (chartData: ComparisonPoint[]): LossPoint[] => {
  if (chartData.length === 0) {
    return [];
  }

  const baseNominal = chartData[0].nominal;
  const baseInflation = chartData[0].inflationIndex;

  return chartData.map((point) => {
    const { profitPercent, inflationPercent } = buildPercentPoint(
      point,
      baseNominal,
      baseInflation,
    );
    return {
      period: point.period,
      outperformance: profitPercent - inflationPercent,
    };
  });
};

export const buildInterestSeries = (chartData: ComparisonPoint[]): InterestPoint[] => {
  if (chartData.length === 0) {
    return [];
  }

  const baseNominal = chartData[0].nominal;
  const baseInflation = chartData[0].inflationIndex;

  return chartData.map((point) => {
    const { profitPercent, inflationPercent } = buildPercentPoint(
      point,
      baseNominal,
      baseInflation,
    );
    return {
      period: point.period,
      interest: profitPercent,
      inflation: inflationPercent,
    };
  });
};

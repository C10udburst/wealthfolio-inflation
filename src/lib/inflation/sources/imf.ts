import { buildProxiedUrl, sortInflationPoints } from '../common';
import type { InflationMetricDefinition, InflationPoint } from '../types';

export const IMF_METRICS: InflationMetricDefinition[] = [
  {
    id: 'PCPIPCH',
    label: 'Inflation rate, average consumer prices (annual %)',
    type: 'percent',
    source: 'imf',
    frequency: 'M',
    notes: 'Interpolated monthly using average and end-of-period inflation.',
  },
  {
    id: 'PCPIEPCH',
    label: 'Inflation rate, end of period consumer prices (annual %)',
    type: 'percent',
    source: 'imf',
    frequency: 'M',
    notes: 'Interpolated monthly using average and end-of-period inflation.',
  },
];

const IMF_AVERAGE_INDICATOR = 'PCPIPCH';
const IMF_END_OF_PERIOD_INDICATOR = 'PCPIEPCH';
const IMF_MONTH_STEPS = 12;
const IMF_MONTHLY_T = Array.from({ length: IMF_MONTH_STEPS }, (_, index) =>
  (index + 1) / IMF_MONTH_STEPS,
);
const IMF_MONTHLY_T_MEAN =
  IMF_MONTHLY_T.reduce((sum, value) => sum + value, 0) / IMF_MONTH_STEPS;
const IMF_MONTHLY_T_VARIANCE =
  IMF_MONTHLY_T.reduce((sum, value) => sum + value * (1 - value), 0) / IMF_MONTH_STEPS;

const interpolateMonthlyIndexes = (
  startIndex: number,
  endIndex: number,
  averageIndex: number,
): number[] => {
  if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex)) {
    return [];
  }
  if (!Number.isFinite(averageIndex) || startIndex === endIndex) {
    return Array(IMF_MONTH_STEPS).fill(startIndex);
  }

  const delta = endIndex - startIndex;
  if (delta === 0) {
    return Array(IMF_MONTH_STEPS).fill(startIndex);
  }

  const targetMean = (averageIndex - startIndex) / delta;
  const useCurvature = Number.isFinite(targetMean) && IMF_MONTHLY_T_VARIANCE;
  const curvature = useCurvature
    ? (targetMean - IMF_MONTHLY_T_MEAN) / IMF_MONTHLY_T_VARIANCE
    : 0;

  return IMF_MONTHLY_T.map((t) => {
    const adjusted = t + curvature * t * (1 - t);
    return startIndex + delta * adjusted;
  });
};

const extractImfValues = (
  payload: unknown,
  indicator: string,
  country: string,
): Map<number, number> => {
  const rawValues =
    (payload as { values?: Record<string, Record<string, Record<string, number>>> })
      ?.values?.[indicator]?.[country] ?? null;
  if (!rawValues || typeof rawValues !== 'object') {
    return new Map();
  }

  const entries = Object.entries(rawValues)
    .map(([year, value]) => [Number(year), Number(value)] as const)
    .filter(([year, value]) => Number.isFinite(year) && Number.isFinite(value));

  return new Map(entries);
};

const buildImfPeriodsParam = (startYear?: number, endYear?: number): string | null => {
  if (!startYear || !endYear || endYear < startYear) {
    return null;
  }
  const years: number[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }
  return years.join(',');
};

const fetchImfIndicator = async (args: {
  indicator: string;
  country: string;
  startYear?: number;
  endYear?: number;
  proxyBase?: string;
  signal?: AbortSignal;
}): Promise<Map<number, number>> => {
  const { indicator, country, startYear, endYear, proxyBase, signal } = args;
  const url = new URL(
    `https://www.imf.org/external/datamapper/api/v1/${indicator}/${country}`,
  );
  const periods = buildImfPeriodsParam(startYear, endYear);
  if (periods) {
    url.searchParams.set('periods', periods);
  }

  const response = await fetch(buildProxiedUrl(url.toString(), proxyBase), { signal });
  if (!response.ok) {
    throw new Error(`IMF request failed (${response.status})`);
  }

  const payload = await response.json();
  return extractImfValues(payload, indicator, country);
};

const buildImfMonthlySeries = (
  averageValues: Map<number, number>,
  endOfPeriodValues: Map<number, number>,
): InflationPoint[] => {
  const years = Array.from(averageValues.keys())
    .filter((year) => endOfPeriodValues.has(year))
    .sort((a, b) => a - b);

  if (years.length === 0) {
    return [];
  }

  let averageIndexPrev = 100;
  let endIndexPrev = 100;
  let lastIndex = endIndexPrev;
  const points: InflationPoint[] = [];

  for (const year of years) {
    const averageRate = averageValues.get(year);
    const endRate = endOfPeriodValues.get(year);
    if (!Number.isFinite(averageRate) || !Number.isFinite(endRate)) {
      continue;
    }

    const averageIndex = averageIndexPrev * (1 + averageRate / 100);
    const endIndex = endIndexPrev * (1 + endRate / 100);
    const monthlyIndexes = interpolateMonthlyIndexes(
      endIndexPrev,
      endIndex,
      averageIndex,
    );

    for (let month = 1; month <= IMF_MONTH_STEPS; month += 1) {
      const indexValue = monthlyIndexes[month - 1] ?? lastIndex;
      const changePercent =
        lastIndex !== 0 ? ((indexValue - lastIndex) / lastIndex) * 100 : 0;
      points.push({
        date: `${year}-${String(month).padStart(2, '0')}`,
        value: changePercent,
      });
      lastIndex = indexValue;
    }

    averageIndexPrev = averageIndex;
    endIndexPrev = endIndex;
  }

  return points;
};

export async function fetchImfSeries(args: {
  country: string;
  indicator: string;
  startYear?: number;
  endYear?: number;
  proxyBase?: string;
  signal?: AbortSignal;
}): Promise<InflationPoint[]> {
  const { country, indicator, startYear, endYear, proxyBase, signal } = args;
  const shouldInterpolate =
    indicator === IMF_AVERAGE_INDICATOR || indicator === IMF_END_OF_PERIOD_INDICATOR;

  if (shouldInterpolate) {
    const [averageValues, endOfPeriodValues] = await Promise.all([
      fetchImfIndicator({
        indicator: IMF_AVERAGE_INDICATOR,
        country,
        startYear,
        endYear,
        proxyBase,
        signal,
      }),
      fetchImfIndicator({
        indicator: IMF_END_OF_PERIOD_INDICATOR,
        country,
        startYear,
        endYear,
        proxyBase,
        signal,
      }),
    ]);
    const interpolated = buildImfMonthlySeries(averageValues, endOfPeriodValues);
    if (interpolated.length > 0) {
      return sortInflationPoints(interpolated);
    }
  }

  const values = await fetchImfIndicator({
    indicator,
    country,
    startYear,
    endYear,
    proxyBase,
    signal,
  });

  const points = Array.from(values.entries()).map(([year, value]) => ({
    date: String(year),
    value,
  }));

  return sortInflationPoints(points);
}

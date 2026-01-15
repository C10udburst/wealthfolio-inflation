import { buildProxiedUrl, sortInflationPoints } from '../common';
import type { InflationMetricDefinition, InflationPoint } from '../types';

export const WORLD_BANK_METRICS: InflationMetricDefinition[] = [
  {
    id: 'FP.CPI.TOTL.ZG',
    label: 'Inflation, consumer prices (annual %)',
    type: 'percent',
    source: 'worldBank',
  },
  {
    id: 'FP.CPI.TOTL',
    label: 'Consumer price index (2010 = 100)',
    type: 'index',
    source: 'worldBank',
  },
  {
    id: 'NY.GDP.DEFL.KD.ZG',
    label: 'Inflation, GDP deflator (annual %)',
    type: 'percent',
    source: 'worldBank',
  },
  {
    id: 'FP.WPI.TOTL',
    label: 'Wholesale price index (2010 = 100)',
    type: 'index',
    source: 'worldBank',
  },
];

export async function fetchWorldBankSeries(args: {
  country: string;
  indicator: string;
  startYear?: number;
  endYear?: number;
  proxyBase?: string;
  signal?: AbortSignal;
}): Promise<InflationPoint[]> {
  const { country, indicator, startYear, endYear, proxyBase, signal } = args;
  const url = new URL(
    `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}`,
  );
  url.searchParams.set('format', 'json');
  url.searchParams.set('per_page', '20000');
  if (startYear && endYear) {
    url.searchParams.set('date', `${startYear}:${endYear}`);
  }

  const response = await fetch(buildProxiedUrl(url.toString(), proxyBase), { signal });
  if (!response.ok) {
    throw new Error(`World Bank request failed (${response.status})`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) {
    return [];
  }

  const points = payload[1]
    .filter((row: { value: number | null }) => row?.value !== null)
    .map((row: { date: string; value: number }) => ({
      date: String(row.date),
      value: Number(row.value),
    }));

  return sortInflationPoints(points);
}

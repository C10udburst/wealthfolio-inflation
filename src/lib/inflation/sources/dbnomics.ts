import { buildProxiedUrl, sortInflationPoints } from '../common';
import type {
  InflationFrequency,
  InflationMetricDefinition,
  InflationPoint,
} from '../types';

export const DBNOMICS_METRICS: InflationMetricDefinition[] = [
  {
    id: 'PCPI_IX',
    label: 'Consumer price index (index)',
    type: 'index',
    source: 'dbnomics',
  },
  {
    id: 'PCPI_PC_CP_A_PT',
    label: 'Consumer price inflation (annual %)',
    type: 'percent',
    source: 'dbnomics',
    frequency: 'A',
  },
  {
    id: 'PPPI_IX',
    label: 'Producer price index (index)',
    type: 'index',
    source: 'dbnomics',
  },
];

export async function fetchDbnomicsSeries(args: {
  country: string;
  indicator: string;
  frequency: InflationFrequency;
  startYear?: number;
  endYear?: number;
  proxyBase?: string;
  signal?: AbortSignal;
}): Promise<InflationPoint[]> {
  const { country, indicator, frequency, startYear, endYear, proxyBase, signal } = args;
  const seriesKey = `${frequency}.${country}.${indicator}`;
  const url = new URL(
    `https://api.db.nomics.world/v22/series/IMF/IFS/${seriesKey}`,
  );
  url.searchParams.set('observations', '1');

  const response = await fetch(buildProxiedUrl(url.toString(), proxyBase), { signal });
  if (!response.ok) {
    throw new Error(`DBnomics request failed (${response.status})`);
  }

  const payload = await response.json();
  const doc = payload?.series?.docs?.[0];
  if (!doc) {
    return [];
  }

  const periods = Array.isArray(doc.period_start_day)
    ? doc.period_start_day
    : Array.isArray(doc.period)
      ? doc.period
      : [];
  const values = Array.isArray(doc.value) ? doc.value : [];
  const size = Math.min(periods.length, values.length);
  const points: InflationPoint[] = [];

  for (let index = 0; index < size; index += 1) {
    const period = String(periods[index]);
    const year = Number(period.slice(0, 4));
    if (Number.isFinite(year)) {
      if (startYear && year < startYear) {
        continue;
      }
      if (endYear && year > endYear) {
        continue;
      }
    }
    const value = Number(values[index]);
    if (!Number.isFinite(value)) {
      continue;
    }
    points.push({ date: period, value });
  }

  return sortInflationPoints(points);
}

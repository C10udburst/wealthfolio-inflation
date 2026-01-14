export type InflationSource = 'worldBank' | 'imf';
export type InflationValueType = 'index' | 'percent';
export type InflationFrequency = 'A' | 'M';
export type InflationGranularity = 'year' | 'month';

export interface InflationMetricDefinition {
  id: string;
  label: string;
  type: InflationValueType;
  source: InflationSource;
  frequency?: InflationFrequency;
  notes?: string;
}

export interface InflationPoint {
  date: string;
  value: number;
}

export const WORLD_BANK_METRICS: InflationMetricDefinition[] = [
  {
    id: 'FP.CPI.TOTL.ZG',
    label: 'CPI inflation (annual %)',
    type: 'percent',
    source: 'worldBank',
  },
  {
    id: 'NY.GDP.DEFL.KD.ZG',
    label: 'GDP deflator (annual %)',
    type: 'percent',
    source: 'worldBank',
  },
  {
    id: 'FP.CPI.TOTL',
    label: 'CPI index (2010=100)',
    type: 'index',
    source: 'worldBank',
  },
  {
    id: 'FP.CPI.FOOD',
    label: 'Food CPI index (2010=100)',
    type: 'index',
    source: 'worldBank',
  },
];

export const IMF_METRICS: InflationMetricDefinition[] = [
  {
    id: 'PCPI_IX',
    label: 'Consumer price index (index)',
    type: 'index',
    source: 'imf',
    frequency: 'M',
  },
  {
    id: 'PCPI_PC',
    label: 'Consumer price inflation (% change)',
    type: 'percent',
    source: 'imf',
    frequency: 'M',
  },
  {
    id: 'PPPI_IX',
    label: 'Producer price index (index)',
    type: 'index',
    source: 'imf',
    frequency: 'M',
  },
  {
    id: 'PPPI_PC',
    label: 'Producer price inflation (% change)',
    type: 'percent',
    source: 'imf',
    frequency: 'M',
  },
];

export function toPeriodKey(value: string, granularity: InflationGranularity): string {
  if (granularity === 'year') {
    return value.length >= 4 ? value.slice(0, 4) : value;
  }

  if (value.length >= 7) {
    return value.slice(0, 7);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  return `${parsed.getUTCFullYear()}-${month}`;
}

export function buildInflationIndex(
  points: InflationPoint[],
  valueType: InflationValueType,
): InflationPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) {
    return [];
  }

  if (valueType === 'index') {
    const base = sorted[0].value || 1;
    return sorted.map((point) => ({
      date: point.date,
      value: (point.value / base) * 100,
    }));
  }

  let index = 100;
  return sorted.map((point) => {
    index *= 1 + point.value / 100;
    return {
      date: point.date,
      value: index,
    };
  });
}

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

  return payload[1]
    .filter((row: { value: number | null }) => row?.value !== null)
    .map((row: { date: string; value: number }) => ({
      date: String(row.date),
      value: Number(row.value),
    }))
    .filter((point: InflationPoint) => Number.isFinite(point.value))
    .sort((a: InflationPoint, b: InflationPoint) => a.date.localeCompare(b.date));
}

export async function fetchImfSeries(args: {
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
    `https://dataservices.imf.org/REST/SDMX_JSON.svc/CompactData/IFS/${seriesKey}`,
  );
  if (startYear) {
    url.searchParams.set('startPeriod', String(startYear));
  }
  if (endYear) {
    url.searchParams.set('endPeriod', String(endYear));
  }

  const response = await fetch(buildProxiedUrl(url.toString(), proxyBase), { signal });
  if (!response.ok) {
    throw new Error(`IMF request failed (${response.status})`);
  }

  const payload = await response.json();
  const series = payload?.CompactData?.DataSet?.Series;
  if (!series) {
    return [];
  }

  const seriesList = Array.isArray(series) ? series : [series];
  const observations = seriesList[0]?.Obs ?? [];
  const obsList = Array.isArray(observations) ? observations : [observations];

  return obsList
    .map((obs: { '@TIME_PERIOD': string; '@OBS_VALUE': string }) => ({
      date: String(obs['@TIME_PERIOD']),
      value: Number(obs['@OBS_VALUE']),
    }))
    .filter((point: InflationPoint) => Number.isFinite(point.value))
    .sort((a: InflationPoint, b: InflationPoint) => a.date.localeCompare(b.date));
}

export function buildProxiedUrl(targetUrl: string, proxyBase?: string): string {
  const trimmed = proxyBase?.trim();
  if (!trimmed) {
    throw new Error('CORS proxy not configured.');
  }

  if (trimmed.includes('{urlEncoded}')) {
    return trimmed.replace('{urlEncoded}', encodeURIComponent(targetUrl));
  }

  if (trimmed.includes('{url}')) {
    return trimmed.replace('{url}', targetUrl);
  }

  return `${trimmed}${encodeURIComponent(targetUrl)}`;
}

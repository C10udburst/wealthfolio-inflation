import type { InflationGranularity, InflationPoint, InflationValueType } from './types';

export function toPeriodKey(
  value: string,
  granularity: InflationGranularity,
): string {
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

export function sortInflationPoints(points: InflationPoint[]): InflationPoint[] {
  return points
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => a.date.localeCompare(b.date));
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

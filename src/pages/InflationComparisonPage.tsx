import React, { useEffect, useMemo, useState } from 'react';
import type { Account, AccountValuation, AddonContext } from '@wealthfolio/addon-sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyPlaceholder,
  Input,
  Label,
  Page,
  PageContent,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
} from '@wealthfolio/ui';
import { AmountDisplay } from '@wealthfolio/ui';
import {
  Area,
  CartesianGrid,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from '@wealthfolio/ui/chart';
import { Icons } from '@wealthfolio/ui';
import {
  buildInflationIndex,
  fetchImfSeries,
  fetchWorldBankSeries,
  IMF_METRICS,
  WORLD_BANK_METRICS,
  toPeriodKey,
  type InflationFrequency,
  type InflationGranularity,
  type InflationMetricDefinition,
  type InflationPoint,
  type InflationSource,
  type InflationValueType,
} from '../lib/inflation';

type PlotType = 'comparison' | 'loss';
type RangeOption = '1Y' | '3Y' | '5Y' | '10Y' | 'ALL';

const RANGE_OPTIONS: { value: RangeOption; label: string }[] = [
  { value: '1Y', label: '1 year' },
  { value: '3Y', label: '3 years' },
  { value: '5Y', label: '5 years' },
  { value: '10Y', label: '10 years' },
  { value: 'ALL', label: 'All history' },
];

const COUNTRY_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'PL', label: 'Poland' },
  { value: 'JP', label: 'Japan' },
  { value: 'AU', label: 'Australia' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'SE', label: 'Sweden' },
  { value: 'NO', label: 'Norway' },
  { value: 'BR', label: 'Brazil' },
  { value: 'IN', label: 'India' },
  { value: 'CN', label: 'China' },
  { value: 'MX', label: 'Mexico' },
  { value: 'ZA', label: 'South Africa' },
];

const CHART_CONFIG = {
  nominal: {
    label: 'Nominal value',
    color: '#2563eb',
  },
  real: {
    label: 'Inflation-adjusted value',
    color: '#16a34a',
  },
  outperformance: {
    label: 'Excess return',
    color: '#f97316',
  },
};

type SeriesPoint = {
  date: string;
  totalValue: number;
  netContribution: number;
};

type ComparisonPoint = {
  period: string;
  nominal: number;
  real: number;
  inflationIndex: number;
  netContribution: number;
};

const toMonthKey = (value: string) => {
  if (value.length >= 7) {
    return value.slice(0, 7);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  return `${parsed.getUTCFullYear()}-${month}`;
};

const parseIsoDate = (value: string) => {
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day));
};

const parseMonthKey = (monthKey: string) => {
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }
  return { year, month };
};

const getDaysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const expandInflationIndexToMonthly = (series: InflationPoint[]): InflationPoint[] => {
  if (series.length === 0) {
    return [];
  }

  const yearlyPoints = series.every((point) => point.date.length <= 4);
  if (!yearlyPoints) {
    return series;
  }

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const expanded: InflationPoint[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const year = Number(current.date);
    if (!Number.isFinite(year)) {
      continue;
    }

    for (let month = 1; month <= 12; month += 1) {
      const ratio = next ? (month - 1) / 12 : 0;
      const value = next
        ? current.value + (next.value - current.value) * ratio
        : current.value;
      expanded.push({
        date: `${year}-${String(month).padStart(2, '0')}`,
        value,
      });
    }
  }

  return expanded;
};

const toIsoDate = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDayKey = (value: string) => {
  if (value.length >= 10) {
    return value.slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 10);
};

const buildDailyPortfolioSeries = (
  valuations: AccountValuation[],
): SeriesPoint[] => {
  if (valuations.length === 0) {
    return [];
  }

  const dailyValues = new Map<string, SeriesPoint>();
  for (const valuation of valuations) {
    const dayKey = toDayKey(String(valuation.valuationDate));
    dailyValues.set(dayKey, {
      date: dayKey,
      totalValue: valuation.totalValue,
      netContribution: valuation.netContribution ?? 0,
    });
  }

  const sortedKeys = Array.from(dailyValues.keys()).sort((a, b) => a.localeCompare(b));
  if (sortedKeys.length === 0) {
    return [];
  }

  const startDate = parseIsoDate(sortedKeys[0]);
  const endDate = parseIsoDate(sortedKeys[sortedKeys.length - 1]);
  if (!startDate || !endDate) {
    return sortedKeys.map(
      (date) =>
        dailyValues.get(date) ?? {
          date,
          totalValue: 0,
          netContribution: 0,
        },
    );
  }

  const series: SeriesPoint[] = [];
  let current = new Date(startDate.getTime());
  let lastValue: number | null = null;
  let lastContribution: number | null = null;
  const dayMs = 24 * 60 * 60 * 1000;

  while (current.getTime() <= endDate.getTime()) {
    const key = toIsoDate(current);
    if (dailyValues.has(key)) {
      const point = dailyValues.get(key);
      lastValue = point?.totalValue ?? null;
      lastContribution = point?.netContribution ?? 0;
    }
    if (lastValue !== null && lastValue !== undefined) {
      series.push({
        date: key,
        totalValue: lastValue,
        netContribution: lastContribution ?? 0,
      });
    }
    current = new Date(current.getTime() + dayMs);
  }

  return series;
};

const buildMonthlyPortfolioSeries = (
  dailySeries: SeriesPoint[],
): SeriesPoint[] => {
  const byMonth = new Map<string, SeriesPoint>();
  for (const point of dailySeries) {
    const monthKey = toMonthKey(point.date);
    byMonth.set(monthKey, {
      date: monthKey,
      totalValue: point.totalValue,
      netContribution: point.netContribution,
    });
  }

  return Array.from(byMonth.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const normalizeInflationSeries = (
  series: InflationPoint[],
  granularity: InflationGranularity,
): InflationPoint[] => {
  const byPeriod = new Map<string, InflationPoint>();
  for (const point of series) {
    const periodKey = toPeriodKey(point.date, granularity);
    byPeriod.set(periodKey, { date: periodKey, value: point.value });
  }

  return Array.from(byPeriod.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const formatPeriodLabel = (value: string) => {
  if (value.length === 10) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: '2-digit',
      }).format(parsed);
    }
  }

  if (value.length === 7) {
    const parsed = new Date(`${value}-01T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        year: '2-digit',
      }).format(parsed);
    }
  }

  return value;
};

const expandInflationIndexToDaily = (series: InflationPoint[]): InflationPoint[] => {
  if (series.length === 0) {
    return [];
  }

  const monthlySeries = expandInflationIndexToMonthly(series);
  if (monthlySeries.length === 0) {
    return [];
  }

  const sorted = [...monthlySeries].sort((a, b) => a.date.localeCompare(b.date));
  const expanded: InflationPoint[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const currentKey = parseMonthKey(current.date);
    if (!currentKey) {
      continue;
    }

    const { year, month } = currentKey;
    const daysInMonth = getDaysInMonth(year, month);
    const currentStart = new Date(Date.UTC(year, month - 1, 1));
    const nextValue = next?.value ?? current.value;

    for (let day = 0; day < daysInMonth; day += 1) {
      const ratio = next ? day / daysInMonth : 0;
      const value = current.value + (nextValue - current.value) * ratio;
      const date = new Date(currentStart.getTime() + day * 24 * 60 * 60 * 1000);
      expanded.push({
        date: toIsoDate(date),
        value,
      });
    }
  }

  return expanded;
};

export default function InflationComparisonPage({ ctx }: { ctx: AddonContext }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portfolioSeries, setPortfolioSeries] = useState<SeriesPoint[]>([]);
  const [inflationSeries, setInflationSeries] = useState<InflationPoint[]>([]);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const [accountId, setAccountId] = useState('all');
  const [countryChoice, setCountryChoice] = useState('US');
  const [customCountry, setCustomCountry] = useState('');
  const [source, setSource] = useState<InflationSource>('worldBank');
  const [metricId, setMetricId] = useState(WORLD_BANK_METRICS[0].id);
  const [customMetricId, setCustomMetricId] = useState('');
  const [customMetricType, setCustomMetricType] =
    useState<InflationValueType>('percent');
  const [plotType, setPlotType] = useState<PlotType>('comparison');
  const [resolution, setResolution] = useState<'monthly' | 'daily'>('monthly');
  const [range, setRange] = useState<RangeOption>('5Y');
  const [imfFrequency, setImfFrequency] = useState<InflationFrequency>('M');
  const [proxyBase, setProxyBase] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const displayCurrency = useMemo(() => {
    if (accountId === 'all') {
      return baseCurrency;
    }

    const account = accounts.find((item) => item.id === accountId);
    return account?.currency ?? baseCurrency;
  }, [accountId, accounts, baseCurrency]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem('wealthfolio-inflation-proxy');
    if (stored) {
      setProxyBase(stored);
    }

    const storedSource = window.localStorage.getItem('wealthfolio-inflation-source');
    if (storedSource === 'worldBank' || storedSource === 'imf') {
      setSource(storedSource);
    }

    const storedCountryChoice = window.localStorage.getItem(
      'wealthfolio-inflation-country-choice',
    );
    if (storedCountryChoice) {
      setCountryChoice(storedCountryChoice);
    }

    const storedCustomCountry = window.localStorage.getItem(
      'wealthfolio-inflation-country-custom',
    );
    if (storedCustomCountry) {
      setCustomCountry(storedCustomCountry);
    }

    const storedMetricId = window.localStorage.getItem('wealthfolio-inflation-metric-id');
    if (storedMetricId) {
      setMetricId(storedMetricId);
    }

    const storedCustomMetric = window.localStorage.getItem(
      'wealthfolio-inflation-metric-custom',
    );
    if (storedCustomMetric) {
      setCustomMetricId(storedCustomMetric);
    }

    const storedMetricType = window.localStorage.getItem(
      'wealthfolio-inflation-metric-type',
    );
    if (storedMetricType === 'percent' || storedMetricType === 'index') {
      setCustomMetricType(storedMetricType);
    }

    const storedRange = window.localStorage.getItem('wealthfolio-inflation-range');
    if (storedRange && RANGE_OPTIONS.some((option) => option.value === storedRange)) {
      setRange(storedRange as RangeOption);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('wealthfolio-inflation-proxy', proxyBase);
  }, [proxyBase]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('wealthfolio-inflation-source', source);
  }, [source]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('wealthfolio-inflation-country-choice', countryChoice);
  }, [countryChoice]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('wealthfolio-inflation-country-custom', customCountry);
  }, [customCountry]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('wealthfolio-inflation-metric-id', metricId);
  }, [metricId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('wealthfolio-inflation-metric-custom', customMetricId);
  }, [customMetricId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('wealthfolio-inflation-metric-type', customMetricType);
  }, [customMetricType]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('wealthfolio-inflation-range', range);
  }, [range]);

  useEffect(() => {
    let isActive = true;
    setAccountsLoading(true);
    Promise.all([ctx.api.accounts.getAll(), ctx.api.settings.get()])
      .then(([accountsData, settings]) => {
        if (!isActive) {
          return;
        }
        setAccounts(accountsData);
        setBaseCurrency(settings.baseCurrency || 'USD');
      })
      .catch((err) => {
        if (!isActive) {
          return;
        }
        ctx.api.logger.error(`Failed to load accounts: ${String(err)}`);
        setError('Unable to load accounts or settings.');
      })
      .finally(() => {
        if (!isActive) {
          return;
        }
        setAccountsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [ctx]);

  useEffect(() => {
    const metrics = source === 'worldBank' ? WORLD_BANK_METRICS : IMF_METRICS;
    const hasMetric = metrics.some((metric) => metric.id === metricId);

    if (!hasMetric && metricId !== 'custom') {
      if (metrics[0]) {
        setMetricId(metrics[0].id);
        setImfFrequency(metrics[0].frequency ?? 'M');
      } else {
        setMetricId('custom');
      }
      return;
    }

    if (metricId !== 'custom') {
      const selected = metrics.find((metric) => metric.id === metricId);
      if (selected?.frequency) {
        setImfFrequency(selected.frequency);
      }
    }
  }, [source, metricId]);

  const metrics = useMemo(
    () => (source === 'worldBank' ? WORLD_BANK_METRICS : IMF_METRICS),
    [source],
  );

  const selectedCountry =
    countryChoice === 'custom' ? customCountry.trim() : countryChoice;

  const selectedMetric: InflationMetricDefinition | null = useMemo(() => {
    if (metricId === 'custom') {
      const trimmedId = customMetricId.trim();
      if (!trimmedId) {
        return null;
      }

      return {
        id: trimmedId,
        label: 'Custom indicator',
        type: customMetricType,
        source,
        frequency: source === 'imf' ? imfFrequency : 'A',
      };
    }

    return metrics.find((metric) => metric.id === metricId) ?? metrics[0] ?? null;
  }, [metricId, customMetricId, customMetricType, metrics, source, imfFrequency]);

  const rangeSpec = useMemo(() => {
    if (range === 'ALL') {
      return {
        startDate: undefined,
        endDate: undefined,
        startYear: undefined,
        endYear: undefined,
      };
    }

    const years = Number(range.replace('Y', ''));
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()),
    );
    return {
      startDate: toIsoDate(start),
      endDate: toIsoDate(now),
      startYear: start.getUTCFullYear(),
      endYear: now.getUTCFullYear(),
    };
  }, [range]);

  const inflationGranularity: InflationGranularity =
    source === 'imf' && imfFrequency === 'M' ? 'month' : 'year';

  useEffect(() => {
    if (!selectedCountry || !selectedMetric) {
      setDataLoading(false);
      return;
    }

    if (!proxyBase.trim()) {
      setError('Set a CORS proxy to fetch inflation data.');
      setDataLoading(false);
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    setDataLoading(true);
    setError(null);

    const requestedAccountId = accountId === 'all' ? 'TOTAL' : accountId;
    const countryCode =
      source === 'worldBank' ? selectedCountry.toLowerCase() : selectedCountry.toUpperCase();

    const fetchData = async () => {
      const valuationPromise = ctx.api.portfolio.getHistoricalValuations(
        requestedAccountId,
        rangeSpec.startDate,
        rangeSpec.endDate,
      );

      const inflationPromise =
        source === 'worldBank'
          ? fetchWorldBankSeries({
              country: countryCode,
              indicator: selectedMetric.id,
              startYear: rangeSpec.startYear,
              endYear: rangeSpec.endYear,
              proxyBase,
              signal: controller.signal,
            })
          : fetchImfSeries({
              country: countryCode,
              indicator: selectedMetric.id,
              frequency: imfFrequency,
              startYear: rangeSpec.startYear,
              endYear: rangeSpec.endYear,
              proxyBase,
              signal: controller.signal,
            });

      const [valuations, inflation] = await Promise.all([
        valuationPromise,
        inflationPromise,
      ]);

      if (!isActive) {
        return;
      }

      const dailySeries = buildDailyPortfolioSeries(valuations);
      const resolvedSeries =
        resolution === 'daily' ? dailySeries : buildMonthlyPortfolioSeries(dailySeries);
      setPortfolioSeries(resolvedSeries);
      setInflationSeries(normalizeInflationSeries(inflation, inflationGranularity));
    };

    fetchData()
      .catch((err) => {
        if (!isActive) {
          return;
        }
        ctx.api.logger.error(`Inflation data fetch failed: ${String(err)}`);
        setError('Unable to load inflation or valuation data.');
      })
      .finally(() => {
        if (!isActive) {
          return;
        }
        setDataLoading(false);
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [
    accountId,
    ctx,
    inflationGranularity,
    imfFrequency,
    rangeSpec,
    resolution,
    selectedCountry,
    selectedMetric,
    source,
    proxyBase,
    refreshIndex,
  ]);

  const inflationIndexSeries = useMemo(() => {
    if (!selectedMetric) {
      return [];
    }
    return buildInflationIndex(inflationSeries, selectedMetric.type);
  }, [inflationSeries, selectedMetric]);

  const monthlyInflationIndex = useMemo(
    () => expandInflationIndexToMonthly(inflationIndexSeries),
    [inflationIndexSeries],
  );

  const resolvedInflationIndex = useMemo(
    () =>
      resolution === 'daily'
        ? expandInflationIndexToDaily(monthlyInflationIndex)
        : monthlyInflationIndex,
    [monthlyInflationIndex, resolution],
  );

  const chartData = useMemo<ComparisonPoint[]>(() => {
    if (portfolioSeries.length === 0 || resolvedInflationIndex.length === 0) {
      return [];
    }

    const inflationMap = new Map(
      resolvedInflationIndex.map((point) => [point.date, point.value]),
    );
    const sortedPortfolio = [...portfolioSeries].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    let baseInflation: number | null = null;
    let lastInflation: number | null = null;
    const data: ComparisonPoint[] = [];

    for (const point of sortedPortfolio) {
      if (inflationMap.has(point.date)) {
        lastInflation = inflationMap.get(point.date) ?? null;
      }

      if (lastInflation === null || lastInflation === undefined) {
        continue;
      }

      if (baseInflation === null) {
        baseInflation = lastInflation;
      }

      const inflationIndex = baseInflation ? (lastInflation / baseInflation) * 100 : 100;
      const deflator = inflationIndex / 100;
      const real = deflator ? point.totalValue / deflator : point.totalValue;
      data.push({
        period: point.date,
        nominal: point.totalValue,
        real,
        inflationIndex,
        netContribution: point.netContribution,
      });
    }

    return data;
  }, [portfolioSeries, resolvedInflationIndex]);

  const lossData = useMemo(() => {
    if (chartData.length === 0) {
      return [];
    }

    const baseNominal = chartData[0].nominal;
    const baseInflation = chartData[0].inflationIndex;
    return chartData.map((point) => {
      const capital = point.netContribution || baseNominal || 1;
      const profitPercent =
        capital !== 0
          ? ((point.nominal - point.netContribution) / capital) * 100
          : 0;
      const inflationPercent = baseInflation
        ? ((point.inflationIndex - baseInflation) / baseInflation) * 100
        : 0;
      return {
        period: point.period,
        outperformance: profitPercent - inflationPercent,
      };
    });
  }, [chartData]);

  const stats = useMemo(() => {
    if (chartData.length < 2) {
      return null;
    }

    const first = chartData[0];
    const last = chartData[chartData.length - 1];

    const nominalChange = first.nominal
      ? ((last.nominal - first.nominal) / first.nominal) * 100
      : 0;
    const realChange = first.real ? ((last.real - first.real) / first.real) * 100 : 0;
    const inflationChange = first.inflationIndex
      ? ((last.inflationIndex - first.inflationIndex) / first.inflationIndex) * 100
      : 0;

    return {
      nominalChange,
      realChange,
      inflationChange,
      latestNominal: last.nominal,
      latestReal: last.real,
      latestInflationIndex: last.inflationIndex,
    };
  }, [chartData]);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: displayCurrency,
        maximumFractionDigits: 0,
      }),
    [displayCurrency],
  );

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'percent',
        maximumFractionDigits: 1,
      }),
    [],
  );

  const indexFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 1,
      }),
    [],
  );

  return (
    <Page className="flex flex-col">
      <PageHeader
        heading="Inflation vs. portfolio value"
        text="Compare nominal value to inflation-adjusted purchasing power by country."
        actions={
          <div className="flex items-center gap-2">
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Proxy settings">
                  <Icons.Settings className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Proxy settings</p>
                    <p className="text-xs text-muted-foreground">
                      Configure the CORS proxy used for inflation data.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="proxy-input">CORS proxy</Label>
                    <Input
                      id="proxy-input"
                      placeholder="https://proxy.example.com/?url="
                      value={proxyBase}
                      onChange={(event) => setProxyBase(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use a proxy prefix that accepts an encoded URL, or include `{'{url}'}` for
                      raw URLs or `{'{urlEncoded}'}` for encoded URLs.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="source-select-settings">Inflation data source</Label>
                    <Select
                      value={source}
                      onValueChange={(value) => setSource(value as InflationSource)}
                    >
                      <SelectTrigger id="source-select-settings">
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="worldBank">World Bank Indicators</SelectItem>
                        <SelectItem value="imf">IMF Data Portal (IFS)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshIndex((prev) => prev + 1)}
              disabled={dataLoading || accountsLoading}
            >
              Refresh data
            </Button>
          </div>
        }
      />
      <PageContent withPadding className="flex-1">
        {error && (
          <Alert variant="error">
            <Icons.AlertTriangle className="h-4 w-4" />
            <AlertTitle>Data unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4">
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Comparison inputs</CardTitle>
                <CardDescription>Pick portfolio scope and inflation series.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account-select">Portfolio scope</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="account-select">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="country-select">Country</Label>
                <Select value={countryChoice} onValueChange={setCountryChoice}>
                  <SelectTrigger id="country-select">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((country) => (
                      <SelectItem key={country.value} value={country.value}>
                        {country.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom ISO code</SelectItem>
                  </SelectContent>
                </Select>
                {countryChoice === 'custom' && (
                  <Input
                    placeholder="e.g. US, CA, GB"
                    value={customCountry}
                    onChange={(event) => setCustomCountry(event.target.value.toUpperCase())}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="metric-select">Inflation metric</Label>
                <Select value={metricId} onValueChange={setMetricId}>
                  <SelectTrigger id="metric-select">
                    <SelectValue placeholder="Select metric" />
                  </SelectTrigger>
                  <SelectContent>
                    {metrics.map((metric) => (
                      <SelectItem key={metric.id} value={metric.id}>
                        {metric.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom indicator</SelectItem>
                  </SelectContent>
                </Select>
                {metricId === 'custom' && (
                  <div className="space-y-2">
                    <Input
                      placeholder="Indicator code"
                      value={customMetricId}
                      onChange={(event) => setCustomMetricId(event.target.value)}
                    />
                    <Select
                      value={customMetricType}
                      onValueChange={(value) => setCustomMetricType(value as InflationValueType)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Metric type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Percent change</SelectItem>
                        <SelectItem value="index">Index level</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {source === 'imf' && (
                <div className="space-y-2">
                  <Label htmlFor="frequency-select">Frequency</Label>
                  <Select
                    value={imfFrequency}
                    onValueChange={(value) => setImfFrequency(value as InflationFrequency)}
                  >
                    <SelectTrigger id="frequency-select">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Monthly</SelectItem>
                      <SelectItem value="A">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="range-select">Date range</Label>
                <Select value={range} onValueChange={(value) => setRange(value as RangeOption)}>
                  <SelectTrigger id="range-select">
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Resolution</Label>
                <ToggleGroup
                  type="single"
                  value={resolution}
                  onValueChange={(value) => value && setResolution(value as 'monthly' | 'daily')}
                  className="flex flex-wrap"
                >
                  <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
                  <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Plot type</Label>
                <ToggleGroup
                  type="single"
                  value={plotType}
                  onValueChange={(value) => value && setPlotType(value as PlotType)}
                  className="flex flex-wrap"
                >
                  <ToggleGroupItem value="comparison">Comparison</ToggleGroupItem>
                  <ToggleGroupItem value="loss">Excess</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">
                  {accountId === 'all'
                    ? `Base currency: ${baseCurrency}`
                    : `Account currency: ${displayCurrency}`}
                </Badge>
                <Badge variant="outline">
                  {source === 'worldBank' ? 'World Bank' : 'IMF Data Portal'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Interpretation</CardTitle>
                <CardDescription>How the comparison is calculated.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Portfolio values are compared against an inflation index rebased to 100 at the
                  start of the selected period.
                </p>
                <p>
                  Inflation-adjusted value represents purchasing power relative to the chosen
                  inflation metric.
                </p>
              </CardContent>
            </Card>

            <Card>
                <CardHeader>
                <CardTitle>Key metrics</CardTitle>
                <CardDescription>Nominal vs. inflation-adjusted performance.</CardDescription>
                </CardHeader>
                <CardContent>
                {dataLoading || accountsLoading ? (
                  <div className="grid gap-4">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                  </div>
                ) : stats ? (
                  <div className="grid gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Latest nominal value</p>
                    <AmountDisplay
                    value={stats.latestNominal}
                    currency={displayCurrency}
                    className="text-xl font-semibold"
                    />
                    <p className="text-xs text-muted-foreground">
                    {percentFormatter.format(stats.nominalChange / 100)} since start
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Inflation-adjusted value</p>
                    <AmountDisplay
                    value={stats.latestReal}
                    currency={displayCurrency}
                    className="text-xl font-semibold"
                    />
                    <p className="text-xs text-muted-foreground">
                    {percentFormatter.format(stats.realChange / 100)} since start
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Inflation change</p>
                    <p className="text-xl font-semibold">
                    {percentFormatter.format(stats.inflationChange / 100)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                    Index at {indexFormatter.format(stats.latestInflationIndex)}
                    </p>
                  </div>
                  </div>
                ) : (
                  <EmptyPlaceholder
                  icon={<Icons.InfoCircle className="h-5 w-5" />}
                  title="No data yet"
                  description="Choose a country and metric to load comparison data."
                  />
                )}
                </CardContent>
            </Card>
          </div>
        </div>

          <Card>
            <CardHeader>
              <CardTitle>Inflation comparison</CardTitle>
              <CardDescription>
                {plotType === 'comparison'
                  ? 'Nominal and inflation-adjusted values rebased to the start of the range.'
                  : 'Excess return (above zero beats inflation, net of contributions).'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dataLoading || accountsLoading ? (
                <Skeleton className="h-[320px]" />
              ) : chartData.length === 0 ? (
                <EmptyPlaceholder
                  icon={<Icons.ChartBar className="h-5 w-5" />}
                  title="No overlapping data"
                  description="Adjust the date range or select a different metric."
                />
              ) : (
                <ChartContainer config={CHART_CONFIG} className="h-[360px]">
                  <ComposedChart
                    data={plotType === 'comparison' ? chartData : lossData}
                    margin={{ top: 10, right: 20, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tickFormatter={formatPeriodLabel} minTickGap={24} />
                    {plotType === 'comparison' ? (
                      <YAxis
                        yAxisId="value"
                        tickFormatter={(value) => currencyFormatter.format(Number(value))}
                        width={80}
                      />
                    ) : (
                      <YAxis
                        yAxisId="loss"
                        tickFormatter={(value) =>
                          percentFormatter.format(Number(value) / 100)
                        }
                        width={72}
                      />
                    )}
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => {
                            const numeric = Number(value);
                            if (plotType === 'comparison') {
                              return [
                                currencyFormatter.format(numeric),
                                name === 'real' ? 'Inflation-adjusted value' : 'Nominal value',
                              ];
                            }
                            return [percentFormatter.format(numeric / 100), 'Excess return'];
                          }}
                          labelFormatter={(label) =>
                            `Period: ${formatPeriodLabel(String(label))}`
                          }
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />

                    {plotType === 'comparison' ? (
                      <>
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
                      </>
                    ) : (
                      <Line
                        yAxisId="loss"
                        dataKey="outperformance"
                        stroke="var(--color-outperformance)"
                        strokeWidth={2}
                        dot={false}
                      />
                    )}
                  </ComposedChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </Page>
  );
}

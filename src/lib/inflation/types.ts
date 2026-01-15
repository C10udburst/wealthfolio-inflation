export type InflationSource = 'worldBank' | 'dbnomics' | 'imf';
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

export type ComparisonPoint = {
  period: string;
  nominal: number;
  real: number;
  inflationIndex: number;
  netContribution: number;
};

export type LossPoint = {
  period: string;
  outperformance: number;
};

export type InterestPoint = {
  period: string;
  interest: number;
  inflation: number;
};

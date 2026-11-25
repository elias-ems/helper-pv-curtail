export type ForecastWindow = {
  start: number;
  tomorrow: number;
  end: number;
};

export type HomePriceForecast = {
  window: ForecastWindow;
  points: {
    start: number;
    end: number;
    market: number;
    import: number | null;
    export: number | null;
    verified: boolean;
    label: string;
  }[];
  issue: string | null;
};

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
    price: number;
    verified: boolean;
    label: string;
  }[];
  issue: string | null;
};

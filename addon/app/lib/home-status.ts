export type HomeDevice = {
  key: string;
  title: string;
  entityId: string;
  kind: "Grid" | "PV array" | "Battery" | "EV charger";
  reading: number | boolean | null;
  canLimit?: boolean;
  limitPercent?: number;
};

export type SentLimit = {
  seq: number;
  sentAt: string;
  timeLabel: string;
  title: string;
  percent: number;
  watts: number;
  released: boolean;
};

export type HomeStatus = {
  running: boolean;
  devices: HomeDevice[];
  limits: SentLimit[];
  connectionError: string | null;
};

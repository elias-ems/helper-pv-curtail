import {
  DEFAULT_PRICE_CONFIG,
  normalizePriceConfig,
  type PriceConfig,
} from "./prices";
import { readJson, writeJson } from "./store.server";

const FILE_NAME = "prices.json";

export async function readPriceConfig(): Promise<PriceConfig> {
  return normalizePriceConfig(
    await readJson<Partial<PriceConfig>>(FILE_NAME, DEFAULT_PRICE_CONFIG),
  );
}

export async function savePriceConfig(config: PriceConfig): Promise<void> {
  await writeJson(FILE_NAME, config);
}

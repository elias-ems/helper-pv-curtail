import { readHomePriceForecast } from "../lib/price-source.server";

export function loader() {
  return readHomePriceForecast();
}

import { readHomeStatus } from "../lib/home-status.server";

export function loader() {
  return readHomeStatus();
}

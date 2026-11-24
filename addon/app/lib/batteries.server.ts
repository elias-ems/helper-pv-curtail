import type { BatteryFields } from "./batteries";
import { createJsonCollection } from "./store.server";

const collection = createJsonCollection<BatteryFields>("batteries.json");
export const {
  list: listBatteries,
  add: addBattery,
  update: updateBattery,
  remove: removeBattery,
} = collection;

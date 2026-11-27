import {
  NO_CURTAILABLE_ARRAY_ERROR,
  NO_GRID_ERROR,
  NO_PRICES_ERROR,
} from "./curtailment";
import { type Grid, isGridConfigured } from "./grid";
import { isPriceConfigured, type PriceConfig } from "./prices";
import {
  isCurtailable,
  type PvEntity,
  pvLimitEventType,
  pvSlug,
} from "./pv-entities";

export const PV_REVIEW_ERROR =
  "Complete the setup review for all curtailable arrays before enabling.";

export function missingPvSetup(
  {
    grid,
    prices,
    pvEntities,
  }: {
    grid: Grid;
    prices: PriceConfig;
    pvEntities: PvEntity[];
  },
  checkStepLimit = true,
) {
  const arrays = pvEntities.filter(isCurtailable);
  return [
    !isGridConfigured(grid) && NO_GRID_ERROR,
    arrays.length === 0 && NO_CURTAILABLE_ARRAY_ERROR,
    !isPriceConfigured(prices) && NO_PRICES_ERROR,
    checkStepLimit &&
      arrays.some(
        (array) =>
          array.controlMode === "stepped" && array.stepLimitPercent === null,
      ) &&
      "Set a fixed limit for each stepped inverter.",
  ].filter((message): message is string => Boolean(message));
}

export function pvActivationError(
  settings: Parameters<typeof missingPvSetup>[0],
  review: FormDataEntryValue | null,
  alreadyEnabled: boolean,
) {
  const missing = missingPvSetup(settings, !alreadyEnabled);
  return (
    missing[0] ??
    (!alreadyEnabled && review !== pvReviewKey(settings.pvEntities)
      ? PV_REVIEW_ERROR
      : undefined)
  );
}

export function pvReviewKey(arrays: PvEntity[]) {
  return JSON.stringify(
    arrays
      .filter(isCurtailable)
      .map((array) => [
        array.id,
        pvLimitEventType(pvSlug(array)),
        array.powerEntityId,
        array.ratedPowerW,
        array.controlMode,
        array.stepLimitPercent,
      ]),
  );
}

export function pvAutomationYaml(array: PvEntity) {
  const eventType = pvLimitEventType(pvSlug(array));
  return `alias: ${JSON.stringify(`${array.title} PV curtailment`)}
triggers:
  - trigger: event
    event_type: ${eventType}
actions:
  - if:
      - condition: template
        value_template: "{{ trigger.event.data.released }}"
    then:
      - action: number.set_value
        target:
          entity_id: number.replace_with_inverter_limit
        data:
          value: 100
    else:
      - action: number.set_value
        target:
          entity_id: number.replace_with_inverter_limit
        data:
          value: "{{ trigger.event.data.limit_percent }}"
`;
}

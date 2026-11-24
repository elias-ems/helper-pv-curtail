# Helper PV Curtail

A standalone Home Assistant app for price-based solar curtailment.

Helper PV Curtail uses the grid meter, PV power readings, and your export tariff to decide how much your arrays should generate. It keeps the curtailment strategies, modulating and stepped inverter modes, optional battery and EV inputs, and decision logs from [elias-ems](https://github.com/elias-ems/elias-ems).

## Install

1. In Home Assistant, add `https://github.com/elias-ems/helper-pv-curtail` to the app store repositories.
2. Install **Helper PV Curtail**, start it, and open its web UI. Home Assistant builds the image locally on amd64 or aarch64.
3. In **Settings**, choose a signed grid power sensor in watts (positive for import), then add each PV array's current power sensor. For arrays you want to limit, enable curtailment on the array and enter its inverter's rated AC output in watts.
4. Choose a supported Home Assistant price forecast entity with `raw_today` or `data` attributes. Check the production formula against your export tariff. A threshold of zero curtails when exporting costs money.
5. Connect each curtailable array's event to a Home Assistant automation, then enable PV curtailment. Use **Status** to check decisions and event delivery.

If you migrate an array from elias-ems, disable its old curtailment first, then update the automation's event trigger to the new name shown in Settings. Renaming an array can change that name.

## Inverter automation

The app emits a Home Assistant event for each array. Your automation translates it into the command supported by your inverter. This example uses an inverter entity that takes a percentage and accepts 100% to release the limit.

```yaml
alias: South roof PV limit
triggers:
  - trigger: event
    event_type: helper_pv_curtail_south_roof_pv_limit
actions:
  - action: number.set_value
    target:
      entity_id: number.inverter_generation_limit
    data:
      value: "{{ trigger.event.data.limit_percent }}"
```

The event also carries `slug`, `array_id`, `title`, `limit_w`, `rated_power_w`, and `released`. Use `released` if your inverter has a separate action to clear its limit. The app attempts to release arrays on disable and graceful shutdown. An abrupt power loss can leave the last limit in force.

Battery and EV inputs are optional. Battery sensors use signed watts, positive while charging and negative while discharging. If PV and the battery share an inverter, verify how its PV limit affects charging.

## Development

Use the Node version in `.node-version` and run these commands from `addon/`.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run start:ingress
```

The integration suite runs the production web server behind a mock Home Assistant ingress proxy. The manual stack prints the ingress URL and stores its settings in `addon/data/`.

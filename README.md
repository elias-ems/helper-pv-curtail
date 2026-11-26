# Elias-ems PV Curtailment

A standalone Home Assistant app for price-based solar curtailment.

Elias-ems PV Curtailment uses the grid meter, PV power readings, and your export tariff to decide how much your arrays should generate. It keeps the curtailment strategies, modulating and stepped inverter modes, optional battery and EV inputs, and decision logs from [elias-ems](https://github.com/elias-ems/elias-ems).

## Install

1. In Home Assistant, add `https://github.com/elias-ems/helper-pv-curtail` to the app store repositories.
2. Install **Elias-ems PV Curtailment**, start it, and open its web UI. Home Assistant builds the image locally on amd64 or aarch64.
3. In **Settings**, choose a signed grid power sensor in watts (positive for import), then add each PV array's current power sensor. For arrays you want to limit, enable curtailment on the array and enter its inverter's rated AC output in watts.
4. Select **EPEX Predictor**, choose your country or bidding zone, and enter your grid import and export formulas. Check the export formula against your tariff. A threshold of zero curtails when exporting costs money.
5. Connect each curtailable array's event to a Home Assistant automation, then enable PV curtailment. Use **Diagnostics** to check decisions and event delivery.

If you migrate an array from elias-ems, disable its old curtailment first, then update the automation's event trigger to the new name shown in Settings. Renaming an array can change that name. If you already use the standalone app, update any inverter automation listening for the previous `helper_pv_curtail_` prefix as part of the upgrade.

## Price source

The app requests quarter-hour prices in EUR/kWh from [EPEX Predictor](https://epexpredictor.batzill.com/docs). It checks each slot against published day-ahead prices from [Energy-Charts](https://api.energy-charts.info/) before applying your formulas. If publication cannot be verified for the current slot, the app releases PV limits and shows the reason in diagnostics.

Prices refresh at startup and roughly hourly, with an earlier refresh when verified coverage runs out and a five-minute retry when coverage or a provider is unavailable. Slot changes trigger a decision independently of meter updates. Home shows today and tomorrow in one chart. Switch between market, export and import prices, and point to a bar to see its price. The chart distinguishes published prices from forecasts and remembers the selected price type in your browser.

If you previously used a Home Assistant price sensor, select EPEX Predictor and your zone after upgrading. Your saved import and export formulas are carried forward.

## Home dashboard

Home shows the readings from linked grid, PV, battery, and EV sensors. The PV Curtailment card lists the last 20 events accepted by Home Assistant since the app started, including releases.

## Inverter automation

The app emits a Home Assistant event for each array. Your automation translates it into the command supported by your inverter. This example uses an inverter entity that takes a percentage and accepts 100% to release the limit.

```yaml
alias: South roof PV limit
triggers:
  - trigger: event
    event_type: elias_ems_pv_curtail_south_roof_pv_limit
actions:
  - action: number.set_value
    target:
      entity_id: number.inverter_generation_limit
    data:
      value: "{{ trigger.event.data.limit_percent }}"
```

The event also carries `slug`, `array_id`, `title`, `limit_w`, `rated_power_w`, and `released`. Use `released` if your inverter has a separate action to clear its limit. The app attempts to release arrays on disable and graceful shutdown. An abrupt power loss can leave the last limit in force.

Battery and EV inputs are optional. Battery sensors use signed watts, positive while charging and negative while discharging. If PV and the battery share an inverter, verify how its PV limit affects charging.

## Back up settings

Open **Settings → Back up or restore settings** and download a JSON file before
experimenting. It contains PV arrays, grid and battery sensors, prices and
curtailment settings. Home Assistant credentials, automations and runtime
history stay in their original locations.

To restore, choose a file, select **Preview backup**, then review the changes
before selecting **Apply backup**. Applying may release existing PV limits and
start curtailment with the restored settings. Check that the entity IDs and
inverter automations match the Home Assistant installation receiving the backup.
Use a Home Assistant backup if you need to roll back the app version and its
data together.

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

Append `/playground` to the app’s URL to preview the components with sample data.

## HA-MCP onboarding

The [PV onboarding runbook](docs/ha-mcp-pv-onboarding.md) covers preview, apply, and stale-revision checks through Home Assistant ingress.

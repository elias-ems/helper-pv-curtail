# Set up PV curtailment with HA-MCP

Use [community HA-MCP](https://homeassistant-ai.github.io/ha-mcp/tools/) with the Home Assistant installation where you run Elias-ems PV Curtailment. Leave PV curtailment off while setting up the inverter.

## Read, preview, and apply

Use your PV power sensor, the inverter's rated AC output, and a write mode that matches how the inverter handles limit changes. The example uses a stepped inverter with a fixed 25% limit. Use your own limit for stepped mode and omit `stepLimitPercent` for modulating mode. The proposed automation uses a Home Assistant `number.*` entity that accepts a 0–100% generation limit and releases the limit at 100%.

Run the calls in order. Replace `SLUG` with the app slug from `ha_get_app`, `REV` with the revision from the settings read, and `TOKEN` with the preview token. Replace the example inverter values in both requests. For an existing array, include its `arrayId` in both requests and send only the fields you want to edit.

```text
ha_get_app       {"source":"installed"}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/settings","method":"GET"}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/onboarding/pv-curtailment","method":"GET"}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/onboarding/pv-curtailment/preview","method":"POST","body":{"revision":"REV","limitEntityId":"number.inverter_generation_limit","fields":{"title":"South roof","powerEntityId":"sensor.inverter_power","ratedPowerW":4000,"controlMode":"stepped","stepLimitPercent":25}}}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/settings","method":"GET"}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/onboarding/pv-curtailment/apply","method":"POST","body":{"revision":"REV","previewToken":"TOKEN","limitEntityId":"number.inverter_generation_limit","fields":{"title":"South roof","powerEntityId":"sensor.inverter_power","ratedPowerW":4000,"controlMode":"stepped","stepLimitPercent":25}}}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/settings","method":"GET"}
```

Review the diff, exact event name, and proposed automation before applying. Apply saves the array in the app with curtailment disabled for new arrays. The final settings read confirms what was saved. If Settings changed after preview, read the latest revision and preview again.

## Finish setup in Settings

Set the signed grid power sensor and EPEX Predictor bidding zone and check your export formula in Settings. Use the automation from preview as a starting point in Home Assistant. Adapt its target and release action to your inverter, then verify both limit and release on the inverter before enabling curtailment. Follow the PV curtailment setup checklist in the app to complete activation.

## Verify the API on a test installation

Use a disposable Home Assistant OS instance with a mock PV power sensor and a mock 0–100% number entity such as `number.mock_inverter_limit`. Keep curtailment disabled. In Home Assistant's event listener, subscribe to `*` before running the calls above with your mock entity IDs. Check for zero `elias_ems_pv_curtail_*_pv_limit` events and zero `call_service` events targeting the mock inverter. Verify that preview leaves Settings unchanged and that apply saves the array with `curtailable: false`.

Use the returned array ID and the latest revision to test a partial update. After preview, save a distinct grid power entity in **Elias-ems PV Curtailment → Settings**, then apply the old request:

```text
ha_manage_app    {"slug":"SLUG","path":"/api/v1/onboarding/pv-curtailment/preview","method":"POST","body":{"arrayId":"ID","revision":"NEW_REV","limitEntityId":"number.mock_inverter_limit","fields":{"ratedPowerW":4200}}}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/onboarding/pv-curtailment/apply","method":"POST","body":{"arrayId":"ID","revision":"NEW_REV","previewToken":"NEW_TOKEN","limitEntityId":"number.mock_inverter_limit","fields":{"ratedPowerW":4200}}}
ha_manage_app    {"slug":"SLUG","path":"/api/v1/settings","method":"GET"}
```

Expect HTTP 409 from apply, the new grid sensor, and the original 4000 W rating. Preview again after any Settings change or app restart. For local verification, run `npm run test:integration` from `addon/`. The onboarding test checks the mock Home Assistant event log for zero commands.
